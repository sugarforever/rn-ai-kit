const BODY = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Sign-in complete</title>
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        background: #FAFAF7;
        color: #2C2C2E;
        display: grid;
        place-items: center;
        min-height: 100vh;
        margin: 0;
      }
      main { text-align: center; max-width: 24rem; padding: 2rem; }
      h1 { font-weight: 500; margin: 0 0 0.5rem; }
      p { margin: 0; opacity: 0.7; }
    </style>
  </head>
  <body>
    <main>
      <h1>Sign-in complete</h1>
      <p>You can close this window and return to the app.</p>
    </main>
  </body>
</html>
`;

function utf8ByteLength(s: string): number {
  // `Buffer` is a Node global that doesn't exist in Hermes; `TextEncoder`
  // is universal (RN, Node, browser) and gives the canonical UTF-8 length.
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(s).length;
  }
  // Fallback: count UTF-8 bytes by inspecting code points. Still pure JS,
  // works on any runtime even without TextEncoder.
  let bytes = 0;
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      i++; // skip low surrogate
    } else bytes += 3;
  }
  return bytes;
}

let cachedResponse: string | null = null;

/**
 * Build a complete HTTP/1.1 response (headers + body) for the OAuth-callback
 * success page. Returned as a single string ready to write to the socket.
 *
 * The body is static, so the response is computed once and cached.
 */
export function successResponse(): string {
  if (cachedResponse !== null) return cachedResponse;
  const contentLength = utf8ByteLength(BODY);
  cachedResponse = [
    'HTTP/1.1 200 OK',
    'Content-Type: text/html; charset=utf-8',
    `Content-Length: ${contentLength}`,
    'Connection: close',
    '',
    BODY,
  ].join('\r\n');
  return cachedResponse;
}
