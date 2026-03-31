'use strict';

const net = require('net');

function createPipeServer({ pipeName, onFrame }) {
  return new Promise((resolve, reject) => {
    const server = net.createServer((stream) => {
      console.log('[pipe] Client connected to IRIS pipe');

      let buffer = '';

      stream.on('data', (data) => {
        buffer += data.toString('utf8');

        let boundary = buffer.indexOf('\n');
        while (boundary !== -1) {
          const line = buffer.slice(0, boundary).trim();
          buffer = buffer.slice(boundary + 1);

          if (line) {
            try {
              onFrame(JSON.parse(line));
            } catch (err) {
              console.error('[pipe] JSON parse error on stream line:', err.message);
            }
          }

          boundary = buffer.indexOf('\n');
        }
      });

      stream.on('end', () => console.log('[pipe] Client disconnected'));
      stream.on('error', (err) => console.error('[pipe] stream error:', err));
    });

    server.on('error', (err) => {
      console.error('[pipe] Server error:', err);
      reject(err);
    });

    server.listen(pipeName, () => {
      console.log(`[pipe] Server listening on ${pipeName}`);
      resolve(server);
    });
  });
}

module.exports = { createPipeServer };
