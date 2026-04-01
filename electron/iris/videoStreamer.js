'use strict';

const crypto = require('crypto');
const http = require('http');
const net = require('net');

const JPEG_SOI = Buffer.from([0xff, 0xd8]);
const JPEG_EOI = Buffer.from([0xff, 0xd9]);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_BUFFER_BYTES = 8 * 1024 * 1024;
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function createWebSocketAccept(key) {
  return crypto.createHash('sha1').update(`${key}${WS_GUID}`).digest('base64');
}

function encodeWebSocketFrame(payload) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload));
  const size = body.length;

  if (size < 126) {
    return Buffer.concat([Buffer.from([0x81, size]), body]);
  }

  if (size < 65536) {
    const header = Buffer.allocUnsafe(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(size, 2);
    return Buffer.concat([header, body]);
  }

  const header = Buffer.allocUnsafe(10);
  header[0] = 0x81;
  header[1] = 127;
  header.writeBigUInt64BE(BigInt(size), 2);
  return Buffer.concat([header, body]);
}

function findNextJpegFrame(buffer) {
  const start = buffer.indexOf(JPEG_SOI);
  if (start === -1) return null;

  const end = buffer.indexOf(JPEG_EOI, start + JPEG_SOI.length);
  if (end === -1) return null;

  return {
    mimeType: 'image/jpeg',
    frame: buffer.subarray(start, end + JPEG_EOI.length),
    remaining: buffer.subarray(end + JPEG_EOI.length),
  };
}

function findNextPngFrame(buffer) {
  const start = buffer.indexOf(PNG_SIGNATURE);
  if (start === -1) return null;

  let offset = start + PNG_SIGNATURE.length;
  while (offset + 8 <= buffer.length) {
    const chunkLength = buffer.readUInt32BE(offset);
    const chunkType = buffer.toString('ascii', offset + 4, offset + 8);
    const chunkEnd = offset + 12 + chunkLength;

    if (chunkEnd > buffer.length) {
      return null;
    }

    offset = chunkEnd;

    if (chunkType === 'IEND') {
      return {
        mimeType: 'image/png',
        frame: buffer.subarray(start, offset),
        remaining: buffer.subarray(offset),
      };
    }
  }

  return null;
}

function parseTextFrame(line, fallbackCameraId) {
  const trimmed = line.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('{')) {
    try {
      const payload = JSON.parse(trimmed);
      const image = typeof payload.image === 'string'
        ? payload.image
        : typeof payload.base64 === 'string'
          ? payload.base64
          : null;

      if (!image) return null;

      return {
        cameraId: payload.cameraId ?? fallbackCameraId,
        mimeType: typeof payload.mimeType === 'string' ? payload.mimeType : 'image/jpeg',
        image,
      };
    } catch {
      return null;
    }
  }

  if (/^[A-Za-z0-9+/=]+$/.test(trimmed)) {
    return {
      cameraId: fallbackCameraId,
      mimeType: 'image/jpeg',
      image: trimmed,
    };
  }

  return null;
}

function looksLikeTextFrameLine(lineBuffer) {
  const trimmed = lineBuffer.toString('utf8').trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('{')) return true;
  return trimmed.length > 128 && /^[A-Za-z0-9+/=]+$/.test(trimmed);
}

function trimBuffer(buffer) {
  if (buffer.length <= MAX_BUFFER_BYTES) return buffer;

  const jpegStart = buffer.lastIndexOf(JPEG_SOI);
  const pngStart = buffer.lastIndexOf(PNG_SIGNATURE);
  const keepStart = Math.max(jpegStart, pngStart);

  if (keepStart >= 0) {
    return buffer.subarray(keepStart);
  }

  return Buffer.alloc(0);
}

function closeServer(server) {
  return new Promise((resolve) => {
    try {
      server.close(() => resolve());
    } catch {
      resolve();
    }
  });
}

class VideoStreamer {
  constructor() {
    this.httpServer = null;
    this.wsClients = new Set();
    this.pipeServers = [];
    this.pipeSockets = new Set();
    this.port = null;
  }

  async start(pipeNames) {
    if (this.httpServer || this.pipeServers.length > 0) {
      await this.stop();
    }

    await this.startWebSocketServer();
    await Promise.all(pipeNames.map((pipeName, cameraId) => this.startVideoPipe(pipeName, cameraId)));

    return this.port;
  }

  async stop() {
    for (const socket of this.wsClients) {
      socket.destroy();
    }
    this.wsClients.clear();

    for (const socket of this.pipeSockets) {
      socket.destroy();
    }
    this.pipeSockets.clear();

    const closePromises = [];

    if (this.httpServer) {
      closePromises.push(closeServer(this.httpServer));
      this.httpServer = null;
    }

    for (const server of this.pipeServers) {
      closePromises.push(closeServer(server));
    }

    this.pipeServers = [];
    this.port = null;

    await Promise.all(closePromises);
  }

  async startWebSocketServer() {
    this.httpServer = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('IRIS video streamer');
    });

    this.httpServer.on('upgrade', (req, socket) => {
      const key = req.headers['sec-websocket-key'];
      const upgrade = typeof req.headers.upgrade === 'string' ? req.headers.upgrade.toLowerCase() : '';

      if (!key || upgrade !== 'websocket') {
        socket.destroy();
        return;
      }

      const acceptKey = createWebSocketAccept(String(key));
      socket.write(
        [
          'HTTP/1.1 101 Switching Protocols',
          'Upgrade: websocket',
          'Connection: Upgrade',
          `Sec-WebSocket-Accept: ${acceptKey}`,
          '',
          '',
        ].join('\r\n'),
      );

      socket.on('close', () => this.wsClients.delete(socket));
      socket.on('error', () => this.wsClients.delete(socket));
      socket.on('data', () => {
        // Renderer-to-main websocket messages are not used.
      });

      this.wsClients.add(socket);
    });

    await new Promise((resolve, reject) => {
      this.httpServer.once('error', reject);
      this.httpServer.listen(0, '127.0.0.1', () => {
        this.httpServer.off('error', reject);
        const address = this.httpServer.address();
        this.port = typeof address === 'object' && address ? address.port : null;
        resolve();
      });
    });
  }

  async startVideoPipe(pipeName, cameraId) {
    const server = net.createServer((stream) => {
      console.log(`[video:${cameraId}] pipe client connected`);
      this.pipeSockets.add(stream);

      let buffer = Buffer.alloc(0);

      const flushFrames = () => {
        while (buffer.length > 0) {
          const imageFrame = findNextJpegFrame(buffer) || findNextPngFrame(buffer);

          if (imageFrame) {
            buffer = imageFrame.remaining;
            this.broadcastFrame({
              cameraId,
              mimeType: imageFrame.mimeType,
              image: imageFrame.frame.toString('base64'),
            });
            continue;
          }

          const newlineIndex = buffer.indexOf(0x0a);
          if (newlineIndex !== -1 && looksLikeTextFrameLine(buffer.subarray(0, newlineIndex))) {
            const line = buffer.subarray(0, newlineIndex).toString('utf8');
            const parsed = parseTextFrame(line, cameraId);
            buffer = buffer.subarray(newlineIndex + 1);

            if (parsed) {
              this.broadcastFrame(parsed);
              continue;
            }
          }

          break;
        }

        buffer = trimBuffer(buffer);
      };

      stream.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        flushFrames();
      });

      stream.on('end', () => {
        console.log(`[video:${cameraId}] pipe client disconnected`);
        this.pipeSockets.delete(stream);
      });

      stream.on('close', () => {
        this.pipeSockets.delete(stream);
      });

      stream.on('error', (err) => {
        this.pipeSockets.delete(stream);
        console.error(`[video:${cameraId}] pipe error`, err);
      });
    });

    server.on('error', (err) => {
      console.error(`[video:${cameraId}] server error`, err);
    });

    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(pipeName, () => {
        server.off('error', reject);
        console.log(`[video:${cameraId}] server listening on ${pipeName}`);
        resolve();
      });
    });

    this.pipeServers.push(server);
  }

  broadcastFrame(frame) {
    if (this.wsClients.size === 0) return;

    const payload = encodeWebSocketFrame(JSON.stringify(frame));

    for (const socket of this.wsClients) {
      if (!socket.writable) {
        this.wsClients.delete(socket);
        continue;
      }

      try {
        socket.write(payload);
      } catch (err) {
        this.wsClients.delete(socket);
        socket.destroy();
        console.error('[video] websocket write failed', err);
      }
    }
  }
}

module.exports = {
  VideoStreamer,
};
