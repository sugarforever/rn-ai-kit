import { OAuthMobileAdapter } from '../src/OAuthMobileAdapter';

jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(),
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

  it('extracts code when browser intercepts redirect', async () => {
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
      type: 'success',
      url: 'http://localhost:1455/auth/callback?code=auth-code-xyz&state=abc',
    });

    const code = await adapter.authorize(
      'https://auth.example.com/authorize?client_id=test',
      'http://localhost:1455/auth/callback',
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
});
