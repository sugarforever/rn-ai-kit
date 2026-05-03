/**
 * Parse an HTTP request-line and reconstruct the full URL.
 *
 * Returns `null` for any input that isn't a well-formed `GET <abs-path> HTTP/1.x`.
 * Loopback OAuth callback handling only ever needs to handle GET requests with
 * an absolute-path request-target (per RFC 7230 §5.3.1) — anything fancier is
 * either malformed or out of scope, and rejecting it keeps the surface tight.
 */
export function parseRequestLine(requestLine: string, port: number): string | null {
  const parts = requestLine.split(' ');
  if (parts.length !== 3) return null;

  const [method, target, version] = parts;
  if (method !== 'GET') return null;
  if (!version.startsWith('HTTP/1.')) return null;

  if (!target.startsWith('/')) return null;

  if (target.includes('/../') || target.endsWith('/..')) return null;

  return `http://localhost:${port}${target}`;
}
