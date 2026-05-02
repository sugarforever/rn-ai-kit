import { OAuthMobileAdapter } from '../src/OAuthMobileAdapter';

jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(),
  openBrowserAsync: jest.fn().mockResolvedValue({ type: 'dismiss' }),
  dismissBrowser: jest.fn(),
}));

jest.mock('expo-crypto', () => ({
  getRandomBytes: jest.fn((size: number) => {
    const crypto = require('crypto');
    return new Uint8Array(crypto.randomBytes(size));
  }),
  digestStringAsync: jest.fn(async (_algo: string, data: string) => {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(data).digest('hex');
  }),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
}));

import * as WebBrowser from 'expo-web-browser';

describe('OAuthMobileAdapter', () => {
  const adapter = new OAuthMobileAdapter();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('builds authorization URL with provider redirect URI', () => {
    const url = adapter.buildAuthUrl({
      authorizeEndpoint: 'https://auth.example.com/authorize',
      redirectUri: 'http://localhost:1455/auth/callback',
      clientId: 'test-client',
      scopes: ['read', 'write'],
      codeChallenge: 'abc123',
    });

    expect(url).toContain('https://auth.example.com/authorize');
    expect(url).toContain('client_id=test-client');
    expect(url).toContain('scope=read+write');
    expect(url).toContain('code_challenge=abc123');
    expect(url).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fauth%2Fcallback');
  });

  it('extracts code when browser intercepts non-localhost redirect', async () => {
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
      type: 'success',
      url: 'https://example.com/oauth/callback?code=auth-code-xyz&state=abc',
    });

    const code = await adapter.authorize(
      'https://auth.example.com/authorize?client_id=test',
      'https://example.com/oauth/callback',
    );
    expect(code).toBe('auth-code-xyz');
  });

  it('prompts for manual code on localhost redirect when browser is dismissed', async () => {
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
      type: 'dismiss',
    });

    const mockPrompt = jest.fn().mockResolvedValue(
      'http://localhost:1455/auth/callback?code=manual-code-123&state=xyz',
    );

    const code = await adapter.authorize(
      'https://auth.example.com/authorize',
      'http://localhost:1455/auth/callback',
      mockPrompt,
    );
    expect(mockPrompt).toHaveBeenCalled();
    expect(code).toBe('manual-code-123');
  });

  it('accepts raw authorization code from manual input', async () => {
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
      type: 'dismiss',
    });

    const mockPrompt = jest.fn().mockResolvedValue('raw-code-456');

    const code = await adapter.authorize(
      'https://auth.example.com/authorize',
      'http://localhost:1455/auth/callback',
      mockPrompt,
    );
    expect(code).toBe('raw-code-456');
  });

  it('returns null when user cancels manual input', async () => {
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
      type: 'dismiss',
    });

    const mockPrompt = jest.fn().mockResolvedValue(null);

    const code = await adapter.authorize(
      'https://auth.example.com/authorize',
      'http://localhost:1455/auth/callback',
      mockPrompt,
    );
    expect(code).toBeNull();
  });

  it('returns null on cancel without manual prompt for non-localhost', async () => {
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
      type: 'cancel',
    });

    const code = await adapter.authorize(
      'https://auth.example.com/authorize',
      'https://example.com/oauth/callback',
    );
    expect(code).toBeNull();
  });

  it('generates PKCE code verifier and challenge', async () => {
    const { codeVerifier, codeChallenge } = await adapter.generatePKCE();
    expect(codeVerifier).toBeDefined();
    expect(codeVerifier.length).toBeGreaterThanOrEqual(43);
    expect(codeChallenge).toBeDefined();
    expect(codeChallenge.length).toBeGreaterThan(0);
  });

  describe('with loopback backend', () => {
    function makeBackend(impl: jest.Mock) {
      return { listen: impl } as const;
    }

    it('uses the listener for loopback redirects and dismisses the browser', async () => {
      const listen = jest.fn().mockResolvedValue({
        url: 'http://localhost:1455/auth/callback?code=loop-code-1&state=ok',
      });
      (WebBrowser.openBrowserAsync as jest.Mock).mockImplementation(
        () => new Promise((r) => setTimeout(() => r({ type: 'dismiss' }), 50)),
      );
      const dismiss = WebBrowser.dismissBrowser as jest.Mock;

      const loopAdapter = new OAuthMobileAdapter({ loopback: makeBackend(listen) });
      const code = await loopAdapter.authorize(
        'https://auth.example.com/authorize',
        'http://localhost:1455/auth/callback',
      );

      expect(code).toBe('loop-code-1');
      expect(listen).toHaveBeenCalledWith({
        port: 1455,
        path: '/auth/callback',
        signal: expect.any(AbortSignal),
      });
      expect(dismiss).toHaveBeenCalled();
    });

    it('falls back to manual paste when the listener fails to bind', async () => {
      const listen = jest.fn().mockRejectedValue(new Error('EADDRINUSE'));
      (WebBrowser.openBrowserAsync as jest.Mock).mockResolvedValue({ type: 'dismiss' });
      const prompt = jest.fn().mockResolvedValue('raw-code');
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const loopAdapter = new OAuthMobileAdapter({ loopback: makeBackend(listen) });
      const code = await loopAdapter.authorize(
        'https://auth.example.com/authorize',
        'http://localhost:1455/auth/callback',
        prompt,
      );

      expect(code).toBe('raw-code');
      expect(prompt).toHaveBeenCalled();
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });

    it('grants a 500ms grace window before falling back when browser closes first', async () => {
      let listenResolve!: (v: { url: string }) => void;
      const listen = jest.fn().mockImplementation(
        () => new Promise((r) => { listenResolve = r; }),
      );
      (WebBrowser.openBrowserAsync as jest.Mock).mockResolvedValue({ type: 'dismiss' });
      const prompt = jest.fn();

      const loopAdapter = new OAuthMobileAdapter({ loopback: makeBackend(listen) });
      const codePromise = loopAdapter.authorize(
        'https://auth.example.com/authorize',
        'http://localhost:1455/auth/callback',
        prompt,
      );

      setTimeout(() => listenResolve({ url: 'http://localhost:1455/auth/callback?code=grace-ok' }), 100);

      await expect(codePromise).resolves.toBe('grace-ok');
      expect(prompt).not.toHaveBeenCalled();
    });

    it('prompts for manual paste after the grace window expires', async () => {
      const listen = jest.fn().mockImplementation(
        ({ signal }: { signal: AbortSignal }) =>
          new Promise<null>((r) => signal.addEventListener('abort', () => r(null))),
      );
      (WebBrowser.openBrowserAsync as jest.Mock).mockResolvedValue({ type: 'dismiss' });
      const prompt = jest.fn().mockResolvedValue('pasted');

      const loopAdapter = new OAuthMobileAdapter({
        loopback: makeBackend(listen),
        loopbackTimeoutMs: 60_000,
        loopbackGracePeriodMs: 50,
      });
      const code = await loopAdapter.authorize(
        'https://auth.example.com/authorize',
        'http://localhost:1455/auth/callback',
        prompt,
      );

      expect(code).toBe('pasted');
      expect(prompt).toHaveBeenCalled();
    });

    it('aborts the listener and prompts for manual paste on hard timeout', async () => {
      const listen = jest.fn().mockImplementation(
        ({ signal }: { signal: AbortSignal }) =>
          new Promise<null>((r) => signal.addEventListener('abort', () => r(null))),
      );
      (WebBrowser.openBrowserAsync as jest.Mock).mockImplementation(
        () => new Promise(() => { /* never */ }),
      );
      const prompt = jest.fn().mockResolvedValue(null);
      const dismiss = WebBrowser.dismissBrowser as jest.Mock;

      const loopAdapter = new OAuthMobileAdapter({
        loopback: makeBackend(listen),
        loopbackTimeoutMs: 80,
        loopbackGracePeriodMs: 50,
      });
      const code = await loopAdapter.authorize(
        'https://auth.example.com/authorize',
        'http://localhost:1455/auth/callback',
        prompt,
      );

      expect(code).toBeNull();
      expect(prompt).toHaveBeenCalled();
      expect(dismiss).toHaveBeenCalled();
    });

    it('does not use the loopback backend for non-loopback redirects', async () => {
      const listen = jest.fn();
      (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
        type: 'success',
        url: 'https://example.com/oauth/callback?code=non-loop-code',
      });

      const loopAdapter = new OAuthMobileAdapter({ loopback: makeBackend(listen) });
      const code = await loopAdapter.authorize(
        'https://auth.example.com/authorize',
        'https://example.com/oauth/callback',
      );

      expect(code).toBe('non-loop-code');
      expect(listen).not.toHaveBeenCalled();
    });
  });
});
