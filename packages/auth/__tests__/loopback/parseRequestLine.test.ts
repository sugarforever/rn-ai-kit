import { parseRequestLine } from '../../src/loopback/parseRequestLine';

describe('parseRequestLine', () => {
  const port = 1455;

  it('parses well-formed GET request-line', () => {
    const url = parseRequestLine('GET /auth/callback?code=abc&state=xyz HTTP/1.1', port);
    expect(url).toBe('http://localhost:1455/auth/callback?code=abc&state=xyz');
  });

  it('returns null for non-GET methods', () => {
    expect(parseRequestLine('POST /auth/callback HTTP/1.1', port)).toBeNull();
    expect(parseRequestLine('OPTIONS /auth/callback HTTP/1.1', port)).toBeNull();
  });

  it('returns null for malformed request-lines', () => {
    expect(parseRequestLine('', port)).toBeNull();
    expect(parseRequestLine('GET', port)).toBeNull();
    expect(parseRequestLine('GET /path', port)).toBeNull();
    expect(parseRequestLine('NOT-A-METHOD /path HTTP/1.1', port)).toBeNull();
  });

  it('handles request-target with no query string', () => {
    expect(parseRequestLine('GET /auth/callback HTTP/1.1', port)).toBe(
      'http://localhost:1455/auth/callback',
    );
  });

  it('handles HTTP/1.0', () => {
    expect(parseRequestLine('GET /auth/callback?code=x HTTP/1.0', port)).toBe(
      'http://localhost:1455/auth/callback?code=x',
    );
  });

  it('rejects absolute-URI request-target (RFC 7230 §5.3.2)', () => {
    expect(parseRequestLine('GET http://localhost:1455/auth/callback HTTP/1.1', port)).toBeNull();
  });

  it('rejects request-target that does not start with /', () => {
    expect(parseRequestLine('GET auth/callback HTTP/1.1', port)).toBeNull();
  });

  it('rejects path traversal', () => {
    expect(parseRequestLine('GET /auth/../secret HTTP/1.1', port)).toBeNull();
  });
});
