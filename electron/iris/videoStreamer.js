'use strict';

const net = require('net');
const { parse: parseUrl } = require('url');
const { WebSocketServer, OPEN } = require('ws');

const IPC_MAGIC = 0x49524953;
const HEADER_SIZE = 40; // sizeof(IpcFrameHeader) — packed, no padding
const MAX_PAYLOAD_SIZE = 4 * 1024 * 1024; // 4MB sanity cap for MPEG-TS chunks

function closeServer(server) {
  return new Promise((resolve) => {
    if (!server) {
      resolve();
      return;
    }

    try {
      server.close(() => resolve());
    } catch {
      resolve();
    }
  });
}

class VideoStreamer {
  constructor() {
    // Array of net.Server — one per camera pipe
    this.pipeServers = [];
    this.wsServer = null;
    this.pipeStreams = new Set();
    // Map<cameraId, Set<WebSocket>> — per-camera subscriber lists
    this.cameraClients = new Map();
  }

  _getOrCreateCameraSet(cameraId) {
    let clients = this.cameraClients.get(cameraId);
    if (!clients) {
      clients = new Set();
      this.cameraClients.set(cameraId, clients);
    }
    return clients;
  }

  _broadcastToCamera(cameraId, payload) {
    const clients = this.cameraClients.get(cameraId);
    if (!clients || clients.size === 0) return;

    for (const client of clients) {
      if (client.readyState !== OPEN) {
        continue;
      }

      if (client.bufferedAmount > 512 * 1024) {
        client.terminate();
        continue;
      }

      try {
        client.send(payload, { binary: true, compress: false });
      } catch (err) {
        console.error('[video-streamer] websocket send failed:', err.message);
        client.terminate();
      }
    }
  }

  async start(pipeNames) {
    await this.stop();

    // Normalize to array for backward compat (single string → array of one)
    const pipes = Array.isArray(pipeNames) ? pipeNames : [pipeNames];

    const wsServer = await new Promise((resolve, reject) => {
      const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });

      const handleError = (err) => {
        server.off('listening', handleListening);
        reject(err);
      };

      const handleListening = () => {
        server.off('error', handleError);
        resolve(server);
      };

      server.once('error', handleError);
      server.once('listening', handleListening);
    });

    // Route clients to per-camera sets based on URL path: /camera/{id}
    wsServer.on('connection', (socket, req) => {
      const parsed = parseUrl(req.url || '');
      const match = (parsed.pathname || '').match(/^\/camera\/(\d+)$/);
      const cameraId = match ? parseInt(match[1], 10) : null;

      if (cameraId === null) {
        console.warn('[video-streamer] WS client connected without /camera/{id} path, closing');
        socket.close(1008, 'Missing /camera/{id} path');
        return;
      }

      const clients = this._getOrCreateCameraSet(cameraId);
      clients.add(socket);
      console.log(`[video-streamer] WS client subscribed to camera ${cameraId}`);

      socket.on('error', (err) => {
        console.error('[video-streamer] websocket client error:', err.message);
      });

      socket.on('close', () => {
        clients.delete(socket);
      });
    });

    try {
      const pipeServers = await Promise.all(pipes.map((pipeName) => this._createPipeServer(pipeName)));

      this.wsServer = wsServer;
      this.pipeServers = pipeServers;

      const address = wsServer.address();
      if (!address || typeof address === 'string') {
        throw new Error('Unable to determine websocket port');
      }

      console.log(`[video-streamer] websocket listening on ws://127.0.0.1:${address.port}`);
      for (const p of pipes) {
        console.log(`[video-streamer] waiting for IRIS video pipe on ${p}`);
      }

      return address.port;
    } catch (err) {
      await closeServer(wsServer);
      throw err;
    }
  }

  _createPipeServer(pipeName) {
    return new Promise((resolve, reject) => {
      const server = net.createServer((stream) => {
        this.pipeStreams.add(stream);
        console.log(`[video-streamer] IRIS video pipe connected: ${pipeName}`);

        let accumulator = Buffer.alloc(0);

        stream.on('data', (chunk) => {
          accumulator = Buffer.concat([accumulator, chunk]);

          while (accumulator.length >= HEADER_SIZE) {
            const magic = accumulator.readUInt32LE(0);
            if (magic !== IPC_MAGIC) {
              // Lost sync — scan forward for next magic marker
              let found = false;
              for (let i = 1; i <= accumulator.length - 4; i++) {
                if (accumulator.readUInt32LE(i) === IPC_MAGIC) {
                  console.warn(`[video-streamer] resync: skipped ${i} bytes`);
                  accumulator = accumulator.subarray(i);
                  found = true;
                  break;
                }
              }
              if (!found) {
                accumulator = accumulator.subarray(accumulator.length - 3);
                break;
              }
              continue;
            }

            const cameraId = accumulator.readUInt32LE(4);
            const payloadSize = accumulator.readUInt32LE(36);
            const frameSize = HEADER_SIZE + payloadSize;

            if (payloadSize > MAX_PAYLOAD_SIZE) {
              console.error(`[video-streamer] payload too large (${payloadSize} bytes), resyncing`);
              accumulator = accumulator.subarray(4);
              continue;
            }

            if (accumulator.length < frameSize) {
              break; // Wait for more data
            }

            // Extract MPEG-TS payload (skip header) and route to camera subscribers
            const tsPayload = accumulator.subarray(HEADER_SIZE, frameSize);
            accumulator = accumulator.subarray(frameSize);

            this._broadcastToCamera(cameraId, tsPayload);
          }
        });

        const cleanupStream = () => {
          this.pipeStreams.delete(stream);
        };

        stream.on('end', cleanupStream);
        stream.on('close', cleanupStream);
        stream.on('error', (err) => {
          cleanupStream();
          console.error('[video-streamer] pipe stream error:', err.message);
        });
      });

      const handleError = (err) => {
        server.off('listening', handleListening);
        reject(err);
      };

      const handleListening = () => {
        server.off('error', handleError);
        resolve(server);
      };

      server.once('error', handleError);
      server.once('listening', handleListening);
      server.listen(pipeName);
    });
  }

  async stop() {
    for (const stream of this.pipeStreams) {
      try {
        stream.destroy();
      } catch {
        // Ignore stream teardown failures during cleanup.
      }
    }
    this.pipeStreams.clear();

    if (this.wsServer) {
      for (const client of this.wsServer.clients) {
        try {
          client.terminate();
        } catch {
          // Ignore websocket teardown failures during cleanup.
        }
      }
    }

    this.cameraClients.clear();

    const pipeServers = this.pipeServers;
    const wsServer = this.wsServer;

    this.pipeServers = [];
    this.wsServer = null;

    await Promise.all([
      ...pipeServers.map((s) => closeServer(s)),
      closeServer(wsServer),
    ]);
  }
}

module.exports = { VideoStreamer };
