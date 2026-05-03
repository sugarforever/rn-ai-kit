/**
 * Contract between `OAuthMobileAdapter` and any loopback HTTP backend.
 *
 * Implementations must:
 * - Bind a TCP listener on `127.0.0.1:<port>` (loopback only).
 * - Accept connections, parse a single HTTP request, and resolve when one
 *   matches the configured `path` (`GET <path>?...`).
 * - Resolve with `{ url }` carrying the full request URL
 *   (e.g. `http://localhost:1455/auth/callback?code=...&state=...`).
 * - Resolve with `null` if `signal` aborts before a request arrives.
 * - Reject if the listener cannot bind. The adapter treats rejection as
 *   "loopback unavailable, fall back to manual paste."
 */
export interface LoopbackBackend {
  listen(opts: {
    port: number;
    path: string;
    signal: AbortSignal;
  }): Promise<{ url: string } | null>;
}
