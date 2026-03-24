'use strict';

const net = require('net');
const { WebSocketServer, OPEN } = require('ws');

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
    this.pipeServer = null;
    this.wsServer = null;
    this.pipeStreams = new Set();
  }

  async start(pipeName) {
    await this.stop();

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

    wsServer.on('connection', (socket) => {
      socket.on('error', (err) => {
        console.error('[video-streamer] websocket client error:', err.message);
      });
    });

    try {
      const pipeServer = await new Promise((resolve, reject) => {
        const server = net.createServer((stream) => {
          this.pipeStreams.add(stream);
          console.log(`[video-streamer] IRIS video pipe connected: ${pipeName}`);

          stream.on('data', (chunk) => {
            for (const client of wsServer.clients) {
              if (client.readyState !== OPEN) {
                continue;
              }

              if (client.bufferedAmount > 8 * 1024 * 1024) {
                client.terminate();
                continue;
              }

              try {
                client.send(chunk, { binary: true, compress: false });
              } catch (err) {
                console.error('[video-streamer] websocket send failed:', err.message);
                client.terminate();
              }
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

      this.wsServer = wsServer;
      this.pipeServer = pipeServer;

      const address = wsServer.address();
      if (!address || typeof address === 'string') {
        throw new Error('Unable to determine websocket port');
      }

      console.log(`[video-streamer] websocket listening on ws://127.0.0.1:${address.port}`);
      console.log(`[video-streamer] waiting for IRIS video pipe on ${pipeName}`);

      return address.port;
    } catch (err) {
      await closeServer(wsServer);
      throw err;
    }
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

    const pipeServer = this.pipeServer;
    const wsServer = this.wsServer;

    this.pipeServer = null;
    this.wsServer = null;

    await Promise.all([
      closeServer(pipeServer),
      closeServer(wsServer),
    ]);
  }
}

module.exports = { VideoStreamer };
