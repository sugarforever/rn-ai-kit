type Listener = (chunk: Buffer | string) => void;

interface FakeSocket {
  on: jest.Mock;
  write: jest.Mock;
  end: jest.Mock;
  destroy: jest.Mock;
  __emit: (event: string, payload?: unknown) => void;
}

interface FakeServer {
  listen: jest.Mock;
  close: jest.Mock;
  on: jest.Mock;
  __emit: (event: string, payload?: unknown) => void;
  __triggerConnection: (socket: FakeSocket) => void;
}

const servers: FakeServer[] = [];

function makeFakeSocket(): FakeSocket {
  const handlers: Record<string, Listener> = {};
  const sock: FakeSocket = {
    on: jest.fn((event: string, h: Listener) => { handlers[event] = h; return sock; }),
    write: jest.fn(),
    end: jest.fn(),
    destroy: jest.fn(),
    __emit: (event, payload) => handlers[event]?.(payload as never),
  };
  return sock;
}

function makeFakeServer(connHandler: (s: FakeSocket) => void): FakeServer {
  const handlers: Record<string, (...args: unknown[]) => void> = {};
  const srv: FakeServer = {
    listen: jest.fn(),
    close: jest.fn((cb?: () => void) => { cb?.(); }),
    on: jest.fn((event: string, h: (...args: unknown[]) => void) => { handlers[event] = h; return srv; }),
    __emit: (event, payload) => handlers[event]?.(payload as never),
    __triggerConnection: (sock) => connHandler(sock),
  };
  servers.push(srv);
  return srv;
}

jest.mock('react-native-tcp-socket', () => ({
  __esModule: true,
  default: {
    createServer: jest.fn((handler: (s: FakeSocket) => void) => makeFakeServer(handler)),
  },
}));

import { createTcpLoopback } from '../../src/loopback/createTcpLoopback';

beforeEach(() => {
  servers.length = 0;
});

describe('createTcpLoopback', () => {
  function lastServer() {
    return servers[servers.length - 1];
  }

  it('binds to 127.0.0.1 on the requested port', async () => {
    const backend = createTcpLoopback();
    const controller = new AbortController();
    const promise = backend.listen({ port: 1455, path: '/auth/callback', signal: controller.signal });
    expect(lastServer().listen).toHaveBeenCalledWith({ port: 1455, host: '127.0.0.1' });
    controller.abort();
    await expect(promise).resolves.toBeNull();
  });

  it('resolves with the full URL when a matching GET arrives', async () => {
    const backend = createTcpLoopback();
    const controller = new AbortController();
    const promise = backend.listen({ port: 1455, path: '/auth/callback', signal: controller.signal });
    const sock = makeFakeSocket();
    lastServer().__triggerConnection(sock);
    sock.__emit('data', Buffer.from(
      'GET /auth/callback?code=abc&state=xyz HTTP/1.1\r\nHost: localhost:1455\r\n\r\n',
    ));
    await expect(promise).resolves.toEqual({
      url: 'http://localhost:1455/auth/callback?code=abc&state=xyz',
    });
    expect(sock.write).toHaveBeenCalledWith(expect.stringContaining('200 OK'));
    expect(sock.end).toHaveBeenCalled();
  });

  it('returns 404 for non-matching paths and keeps listening', async () => {
    const backend = createTcpLoopback();
    const controller = new AbortController();
    const promise = backend.listen({ port: 1455, path: '/auth/callback', signal: controller.signal });
    const probe = makeFakeSocket();
    lastServer().__triggerConnection(probe);
    probe.__emit('data', Buffer.from('GET /favicon.ico HTTP/1.1\r\n\r\n'));
    expect(probe.write).toHaveBeenCalledWith(expect.stringContaining('404'));
    expect(probe.end).toHaveBeenCalled();

    const real = makeFakeSocket();
    lastServer().__triggerConnection(real);
    real.__emit('data', Buffer.from('GET /auth/callback?code=Z HTTP/1.1\r\n\r\n'));
    await expect(promise).resolves.toEqual({
      url: 'http://localhost:1455/auth/callback?code=Z',
    });
  });

  it('rejects when the server emits a bind error', async () => {
    const backend = createTcpLoopback();
    const controller = new AbortController();
    const promise = backend.listen({ port: 1455, path: '/auth/callback', signal: controller.signal });
    lastServer().__emit('error', new Error('EADDRINUSE'));
    await expect(promise).rejects.toThrow('EADDRINUSE');
  });

  it('resolves with null when aborted', async () => {
    const backend = createTcpLoopback();
    const controller = new AbortController();
    const promise = backend.listen({ port: 1455, path: '/auth/callback', signal: controller.signal });
    controller.abort();
    await expect(promise).resolves.toBeNull();
    expect(lastServer().close).toHaveBeenCalled();
  });

  it('400s and closes a socket whose headers exceed 8 KiB', async () => {
    const backend = createTcpLoopback();
    const controller = new AbortController();
    const promise = backend.listen({ port: 1455, path: '/auth/callback', signal: controller.signal });
    const flood = makeFakeSocket();
    lastServer().__triggerConnection(flood);
    flood.__emit('data', Buffer.from('A'.repeat(9000)));
    expect(flood.write).toHaveBeenCalledWith(expect.stringContaining('400'));
    expect(flood.end).toHaveBeenCalled();
    controller.abort();
    await expect(promise).resolves.toBeNull();
  });
});
