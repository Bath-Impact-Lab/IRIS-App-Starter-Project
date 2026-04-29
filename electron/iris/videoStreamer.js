'use strict';

const dgram = require('dgram');
const { WebSocketServer, OPEN } = require('ws');

const WS_DROP_BACKPRESSURE_BYTES = 96 * 1024;
const WS_TERMINATE_BACKPRESSURE_BYTES = 384 * 1024;
const EARLY_BUFFER_CAP = 256 * 1024; // 256 KB

function closeServer(server) {
  return new Promise((resolve) => {
    if (!server) { resolve(); return; }
    try { server.close(() => resolve()); } catch { resolve(); }
  });
}

class VideoStreamer {
  constructor() {
    this.udpSockets = [];
    this.wsServer = null;
    this.cameraClients = new Map();
    this._earlyBuffers = new Map(); 
    this._earlyBufferBytes = new Map(); 
    this._slowClientWarnings = new WeakMap();

    // NEW: Batching state for UDP fragmentation
    this._batchBuffers = new Map();
    this._batchTimers = new Map();
  }

  _getOrCreateCameraSet(cameraId) {
    let clients = this.cameraClients.get(cameraId);
    if (!clients) {
      clients = new Set();
      this.cameraClients.set(cameraId, clients);
    }
    return clients;
  }

  // NEW: Accumulate tiny 1316-byte UDP packets and flush them every 5ms
  _handleUdpMessage(cameraId, msg) {
    let bufs = this._batchBuffers.get(cameraId);
    if (!bufs) {
      bufs = [];
      this._batchBuffers.set(cameraId, bufs);
    }
    
    bufs.push(msg);

    // If a timer isn't already running for this camera, start one
    if (!this._batchTimers.has(cameraId)) {
      const timer = setTimeout(() => {
        this._batchTimers.delete(cameraId);
        
        // Combine all tiny packets collected in the last 5ms into one big chunk
        const combinedPayload = Buffer.concat(this._batchBuffers.get(cameraId));
        this._batchBuffers.set(cameraId, []); // Reset for the next batch
        
        // Send the single large chunk to the WebSocket
        this._broadcastToCamera(cameraId, combinedPayload);
      }, 5); // 5ms is enough to catch a full frame's burst of UDP packets
      
      this._batchTimers.set(cameraId, timer);
    }
  }

  _broadcastToCamera(cameraId, payload) {
    const clients = this.cameraClients.get(cameraId);

    if (!clients || clients.size === 0) {
      let totalBytes = this._earlyBufferBytes.get(cameraId) || 0;
      let buf = this._earlyBuffers.get(cameraId);

      if (!buf) {
        buf = [];
        this._earlyBuffers.set(cameraId, buf);
        console.log(`[video-streamer] camera ${cameraId}: buffering early frames`);
      }

      buf.push(payload); // Push the combined payload
      totalBytes += payload.length;

      while (buf.length > 1 && totalBytes > EARLY_BUFFER_CAP) {
        const dropped = buf.shift();
        totalBytes -= dropped ? dropped.length : 0;
      }

      this._earlyBufferBytes.set(cameraId, totalBytes);
      return;
    }

    for (const client of clients) {
      if (client.readyState !== OPEN) continue;

      if (client.bufferedAmount > WS_TERMINATE_BACKPRESSURE_BYTES) {
        client.terminate();
        continue;
      }

      if (client.bufferedAmount > WS_DROP_BACKPRESSURE_BYTES) {
        const now = Date.now();
        const lastWarningAt = this._slowClientWarnings.get(client) || 0;
        if (now - lastWarningAt >= 1000) {
          console.warn(`[video-streamer] dropping late video chunk for camera ${cameraId}`);
          this._slowClientWarnings.set(client, now);
        }
        continue;
      }

      try {
        client.send(payload, { binary: true, compress: false });
      } catch (err) {
        client.terminate();
      }
    }
  }

  async start(udpPorts) {
    await this.stop();
    const ports = Array.isArray(udpPorts) ? udpPorts : [udpPorts];

    const wsServer = await new Promise((resolve, reject) => {
      const server = new WebSocketServer({ host: '127.0.0.1', perMessageDeflate: false, port: 0 });
      server.once('error', reject);
      server.once('listening', () => resolve(server));
    });

    wsServer.on('connection', (socket, req) => {
      socket._socket?.setNoDelay?.(true);
      const match = new URL(req.url || '/', 'ws://127.0.0.1').pathname.match(/^\/camera\/(\d+)$/);
      const cameraId = match ? parseInt(match[1], 10) : null;

      if (cameraId === null) {
        socket.close(1008, 'Missing /camera/{id} path');
        return;
      }

      const clients = this._getOrCreateCameraSet(cameraId);
      clients.add(socket);

      const earlyBuf = this._earlyBuffers.get(cameraId);
      if (earlyBuf && earlyBuf.length > 0) {
        for (const chunk of earlyBuf) {
          try { socket.send(chunk, { binary: true, compress: false }); } 
          catch (err) { break; }
        }
        this._earlyBuffers.delete(cameraId);
        this._earlyBufferBytes.delete(cameraId);
      }

      socket.on('close', () => clients.delete(socket));
    });

    try {
      const udpSockets = await Promise.all(ports.map((port, index) => this._createUdpServer(port, index)));
      this.wsServer = wsServer;
      this.udpSockets = udpSockets;
      return wsServer.address().port;
    } catch (err) {
      await closeServer(wsServer);
      throw err;
    }
  }

  _createUdpServer(port, cameraId) {
    return new Promise((resolve, reject) => {
      const server = dgram.createSocket('udp4');

      server.on('message', (msg) => {
        // Route through the new batching logic instead of broadcasting immediately
        this._handleUdpMessage(cameraId, msg);
      });

      server.once('error', reject);
      server.once('listening', () => {
        console.log(`[video-streamer] UDP server listening on port ${port} for camera ${cameraId}`);
        resolve(server);
      });
      
      server.bind(parseInt(port, 10), '127.0.0.1');
    });
  }

  async stop() {
    // Clean up timers
    for (const timer of this._batchTimers.values()) {
      clearTimeout(timer);
    }
    this._batchTimers.clear();
    this._batchBuffers.clear();

    if (this.wsServer) {
      for (const client of this.wsServer.clients) {
        try { client.terminate(); } catch {}
      }
    }

    this.cameraClients.clear();
    this._earlyBuffers.clear();
    this._earlyBufferBytes.clear();

    const udpSockets = this.udpSockets || [];
    const wsServer = this.wsServer;

    this.udpSockets = [];
    this.wsServer = null;

    await Promise.all([
      ...udpSockets.map(server => closeServer(server)),
      closeServer(wsServer),
    ]);
  }
}

module.exports = { VideoStreamer };
