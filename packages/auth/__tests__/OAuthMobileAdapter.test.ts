import { OAuthMobileAdapter } from '../src/OAuthMobileAdapter';

jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(),
}));

jest.mock('expo-linking', () => ({
  createURL: jest.fn((path: string) => `pi-ai-rn://${path}`),
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
import * as Linking from 'expo-linking';

describe('OAuthMobileAdapter', () => {
  const adapter = new OAuthMobileAdapter();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('builds authorization URL with PKCE params', () => {
    const url = adapter.buildAuthUrl({
      authorizeEndpoint: 'https://auth.example.com/authorize',
      clientId: 'test-client',
      scopes: ['read', 'write'],
      codeChallenge: 'abc123',
    });

    expect(url).toContain('https://auth.example.com/authorize');
    expect(url).toContain('client_id=test-client');
    expect(url).toContain('scope=read+write');
    expect(url).toContain('code_challenge=abc123');
    expect(url).toContain('redirect_uri=pi-ai-rn%3A%2F%2Foauth%2Fcallback');
  });

  it('opens browser and extracts authorization code from redirect', async () => {
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
      type: 'success',
      url: 'pi-ai-rn://oauth/callback?code=auth-code-xyz',
    });

    const code = await adapter.authorize('https://auth.example.com/authorize?client_id=test');
    expect(code).toBe('auth-code-xyz');
    expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalledWith(
      'https://auth.example.com/authorize?client_id=test',
      'pi-ai-rn://oauth/callback',
    );
  });

  it('returns null when user cancels', async () => {
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
      type: 'cancel',
    });

    const code = await adapter.authorize('https://auth.example.com/authorize');
    expect(code).toBeNull();
  });

  it('generates PKCE code verifier and challenge', async () => {
    const { codeVerifier, codeChallenge } = await adapter.generatePKCE();
    expect(codeVerifier).toBeDefined();
    expect(codeVerifier.length).toBeGreaterThanOrEqual(43);
    expect(codeChallenge).toBeDefined();
    expect(codeChallenge.length).toBeGreaterThan(0);
  });

  it('exposes redirectUri as a public getter', () => {
    expect(adapter.redirectUri).toBe('pi-ai-rn://oauth/callback');
  });
});
