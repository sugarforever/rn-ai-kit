import { successResponse } from '../../src/loopback/successPage';

describe('successResponse', () => {
  it('returns a complete HTTP/1.1 200 OK response', () => {
    const out = successResponse();
    expect(out.startsWith('HTTP/1.1 200 OK\r\n')).toBe(true);
    expect(out).toContain('Content-Type: text/html; charset=utf-8\r\n');
    expect(out).toContain('Connection: close\r\n');
    expect(out).toMatch(/Content-Length: \d+\r\n/);
    expect(out).toContain('\r\n\r\n');
  });

  it('includes a "you can close this window" body', () => {
    const out = successResponse();
    expect(out.toLowerCase()).toContain('close');
    expect(out).toContain('<html');
  });

  it('declares Content-Length matching the actual body byte length', () => {
    const out = successResponse();
    const headerEnd = out.indexOf('\r\n\r\n');
    const headers = out.slice(0, headerEnd);
    const body = out.slice(headerEnd + 4);
    const match = headers.match(/Content-Length: (\d+)/);
    expect(match).not.toBeNull();
    const declared = parseInt(match![1], 10);
    expect(Buffer.byteLength(body, 'utf8')).toBe(declared);
  });
});
