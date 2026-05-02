import TcpSocket from 'react-native-tcp-socket';
import type { LoopbackBackend } from '../LoopbackBackend';
import { parseRequestLine } from './parseRequestLine';
import { successResponse } from './successPage';

const MAX_HEADER_BYTES = 8192;
const HEADER_TERMINATOR = '\r\n\r\n';

const RESPONSE_404 = 'HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n';
const RESPONSE_400 = 'HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\nConnection: close\r\n\r\n';

/**
 * Build a `LoopbackBackend` backed by `react-native-tcp-socket`.
 *
 * Binds a single-shot HTTP listener on `127.0.0.1:<port>`. Resolves with
 * `{ url }` on the first matching `GET <path>` request, or `null` if the
 * provided `signal` aborts before any matching request arrives. Rejects on
 * bind error.
 */
export function createTcpLoopback(): LoopbackBackend {
  return {
    listen: ({ port, path, signal }) =>
      new Promise<{ url: string } | null>((resolve, reject) => {
        let settled = false;
        const settle = (value: { url: string } | null) => {
          if (settled) return;
          settled = true;
          server.close(() => resolve(value));
        };

        const server = TcpSocket.createServer((socket) => {
          let buf = '';
          socket.on('data', (chunk: Buffer | string) => {
            if (settled) {
              socket.end();
              return;
            }
            buf += typeof chunk === 'string' ? chunk : chunk.toString('utf8');

            const headerEnd = buf.indexOf(HEADER_TERMINATOR);
            if (headerEnd === -1) {
              if (buf.length >= MAX_HEADER_BYTES) {
                socket.write(RESPONSE_400);
                socket.end();
              }
              return;
            }

            const requestLine = buf.split('\r\n', 1)[0] ?? '';
            const url = parseRequestLine(requestLine, port);
            if (!url) {
              socket.write(RESPONSE_400);
              socket.end();
              return;
            }

            let parsed: URL;
            try {
              parsed = new URL(url);
            } catch {
              socket.write(RESPONSE_400);
              socket.end();
              return;
            }

            if (parsed.pathname !== path) {
              socket.write(RESPONSE_404);
              socket.end();
              return;
            }

            socket.write(successResponse());
            socket.end();
            settle({ url });
          });
          socket.on('error', () => socket.destroy());
        });

        server.on('error', (err: Error) => {
          if (settled) return;
          settled = true;
          reject(err);
        });

        server.listen({ port, host: '127.0.0.1' });

        const onAbort = () => settle(null);
        if (signal.aborted) {
          onAbort();
        } else {
          signal.addEventListener('abort', onAbort, { once: true });
        }
      }),
  };
}
