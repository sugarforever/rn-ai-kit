import * as WebBrowser from 'expo-web-browser';
import * as Crypto from 'expo-crypto';
import type { LoopbackBackend } from './LoopbackBackend';

export interface AuthUrlParams {
  authorizeEndpoint: string;
  redirectUri: string;
  clientId: string;
  scopes: string[];
  codeChallenge: string;
  state?: string;
  extraParams?: Record<string, string>;
}

export interface OAuthMobileAdapterOptions {
  /**
   * Optional loopback HTTP backend used to capture OAuth callbacks for
   * loopback-redirect providers (OpenAI Codex, Google Gemini,
   * Google Antigravity). When omitted, the adapter falls back to the
   * legacy manual-paste flow for those providers.
   */
  loopback?: LoopbackBackend;
  /**
   * Hard ceiling on how long the loopback listener stays bound waiting
   * for a callback. Defaults to 5 minutes.
   */
  loopbackTimeoutMs?: number;
  /**
   * Time to wait for the listener to settle after the browser is dismissed,
   * to recover the race where the redirect fires just before the user
   * closes the in-app sheet. Defaults to 500 ms.
   */
  loopbackGracePeriodMs?: number;
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_GRACE_MS = 500;

export class OAuthMobileAdapter {
  private readonly loopback?: LoopbackBackend;
  private readonly timeoutMs: number;
  private readonly graceMs: number;

  constructor(options: OAuthMobileAdapterOptions = {}) {
    this.loopback = options.loopback;
    this.timeoutMs = options.loopbackTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.graceMs = options.loopbackGracePeriodMs ?? DEFAULT_GRACE_MS;
  }

  buildAuthUrl(params: AuthUrlParams): string {
    const url = new URL(params.authorizeEndpoint);
    url.searchParams.set('client_id', params.clientId);
    url.searchParams.set('redirect_uri', params.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', params.scopes.join(' '));
    url.searchParams.set('code_challenge', params.codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    if (params.state) url.searchParams.set('state', params.state);
    if (params.extraParams) {
      for (const [k, v] of Object.entries(params.extraParams)) {
        url.searchParams.set(k, v);
      }
    }
    return url.toString();
  }

  /**
   * Open the auth URL and capture the OAuth `code`.
   *
   * For non-loopback redirects (HTTPS, custom schemes), uses
   * `openAuthSessionAsync` to intercept the redirect automatically.
   *
   * For loopback redirects (`http://localhost:*`, `http://127.0.0.1:*`):
   * - if a `loopback` backend was injected, it races the listener against
   *   the browser flow; the listener captures the redirect automatically
   *   and the browser is dismissed.
   * - otherwise, falls back to opening a plain browser and asking the
   *   user to paste the redirected URL via `onNeedManualCode`.
   */
  async authorize(
    authUrl: string,
    redirectUri: string,
    onNeedManualCode?: () => Promise<string | null>,
  ): Promise<string | null> {
    const isLoopbackRedirect =
      redirectUri.startsWith('http://localhost') ||
      redirectUri.startsWith('http://127.0.0.1');

    if (isLoopbackRedirect && this.loopback) {
      return this.authorizeWithLoopback(authUrl, redirectUri, onNeedManualCode);
    }

    if (isLoopbackRedirect) {
      await WebBrowser.openBrowserAsync(authUrl);
      return runManualPasteFallback(onNeedManualCode);
    }

    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
    if (result.type === 'success' && result.url) {
      return extractCodeFromUrl(result.url);
    }
    if (result.type === 'dismiss') {
      return runManualPasteFallback(onNeedManualCode);
    }
    return null;
  }

  async generatePKCE(): Promise<{ codeVerifier: string; codeChallenge: string }> {
    const bytes = Crypto.getRandomBytes(32);
    const codeVerifier = base64UrlEncode(bytes);
    const hashHex = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      codeVerifier,
    );
    const codeChallenge = hexToBase64Url(hashHex);
    return { codeVerifier, codeChallenge };
  }

  private async authorizeWithLoopback(
    authUrl: string,
    redirectUri: string,
    onNeedManualCode?: () => Promise<string | null>,
  ): Promise<string | null> {
    const { port, path } = parseLoopback(redirectUri);
    const controller = new AbortController();

    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    let listenError: unknown = null;
    const listenPromise = this.loopback!
      .listen({ port, path, signal: controller.signal })
      .catch((err) => { listenError = err; return null; });

    // Open the browser; race resolution is what we care about, not the value.
    // Swallow any rejection so an unhandled-rejection warning doesn't surface
    // when we ignore this promise on success/timeout paths.
    const browserPromise = WebBrowser.openBrowserAsync(authUrl);
    browserPromise.catch(() => {});

    try {
      const winner = await Promise.race([
        listenPromise.then((r) => ({ kind: 'listen' as const, value: r })),
        browserPromise.then((r) => ({ kind: 'browser' as const, value: r })),
      ]);

      // Best case: listener captured the redirect.
      if (winner.kind === 'listen' && winner.value) {
        dismissBrowserSafely();
        return extractCodeFromUrl(winner.value.url);
      }

      // Browser closed first → grace-period wait for listener to settle.
      if (winner.kind === 'browser') {
        const graced = await Promise.race([
          listenPromise,
          new Promise<null>((r) => setTimeout(() => r(null), this.graceMs)),
        ]);
        if (graced && graced.url) {
          return extractCodeFromUrl(graced.url);
        }
      }

      // All remaining paths fall back to manual paste.
      if (listenError) {
        // eslint-disable-next-line no-console
        console.warn(
          '[rn-ai-kit] loopback bind failed; falling back to manual paste:',
          listenError,
        );
      }
      dismissBrowserSafely();
      return runManualPasteFallback(onNeedManualCode);
    } finally {
      clearTimeout(timeoutId);
      controller.abort();
    }
  }
}

function parseLoopback(redirectUri: string): { port: number; path: string } {
  const url = new URL(redirectUri);
  const port = url.port ? parseInt(url.port, 10) : 80;
  return { port, path: url.pathname };
}

function dismissBrowserSafely(): void {
  const dismiss = (WebBrowser as unknown as { dismissBrowser?: () => void }).dismissBrowser;
  if (typeof dismiss === 'function') {
    try { dismiss(); } catch { /* swallow */ }
  }
}

async function runManualPasteFallback(
  onNeedManualCode?: () => Promise<string | null>,
): Promise<string | null> {
  if (!onNeedManualCode) return null;
  const input = await onNeedManualCode();
  if (!input) return null;
  if (input.includes('code=') || input.includes('://')) {
    return extractCodeFromUrl(input);
  }
  return input.split('#')[0];
}

function extractCodeFromUrl(urlString: string): string | null {
  try {
    const url = new URL(urlString);
    return url.searchParams.get('code');
  } catch {
    return null;
  }
}

function hexToBase64Url(hex: string): string {
  const bytes = new Uint8Array(hex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
  return base64UrlEncode(bytes);
}

function base64UrlEncode(buffer: Uint8Array | Buffer): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
