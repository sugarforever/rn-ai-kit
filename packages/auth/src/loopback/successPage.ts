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

/**
 * Build a complete HTTP/1.1 response (headers + body) for the OAuth-callback
 * success page. Returned as a single string ready to write to the socket.
 */
export function successResponse(): string {
  const contentLength = Buffer.byteLength(BODY, 'utf8');
  return [
    'HTTP/1.1 200 OK',
    'Content-Type: text/html; charset=utf-8',
    `Content-Length: ${contentLength}`,
    'Connection: close',
    '',
    BODY,
  ].join('\r\n');
}
