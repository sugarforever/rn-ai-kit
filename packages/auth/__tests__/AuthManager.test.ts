import { AuthManager } from '../src/AuthManager';
import type { SecureStoreBackend } from '../src/SecureStoreBackend';
import type { OAuthMobileAdapter } from '../src/OAuthMobileAdapter';

// Mock expo-secure-store (ESM module not supported by Jest/ts-jest)
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

// Mock expo-web-browser (used in device-code flow)
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(),
  openAuthSessionAsync: jest.fn(),
}));

// Mock expo-linking (used by OAuthMobileAdapter)
jest.mock('expo-linking', () => ({
  createURL: jest.fn((path: string) => `pi-ai-rn://${path}`),
}));

// Mock expo-crypto (used by OAuthMobileAdapter.generatePKCE)
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

const mockBackend: jest.Mocked<SecureStoreBackend> = {
  get: jest.fn(), set: jest.fn(), delete: jest.fn(), listProviderIds: jest.fn(),
} as any;

const mockOAuth: jest.Mocked<OAuthMobileAdapter> = {
  buildAuthUrl: jest.fn(),
  authorize: jest.fn(),
  generatePKCE: jest.fn(),
} as any;

global.fetch = jest.fn() as jest.Mock;

describe('AuthManager', () => {
  let auth: AuthManager;

  beforeEach(() => {
    jest.clearAllMocks();
    auth = new AuthManager(mockBackend, mockOAuth);
  });

  it('listProviders returns all available providers', () => {
    const providers = auth.listProviders();
    expect(providers.length).toBe(5);
    expect(providers.map((p) => p.id)).toContain('anthropic');
    expect(providers.map((p) => p.id)).toContain('github-copilot');
  });

  it('getApiKey returns stored key', async () => {
    mockBackend.get.mockResolvedValue({ apiKey: 'sk-ant-123', expiresAt: null });
    const key = await auth.getApiKey('anthropic');
    expect(key).toBe('sk-ant-123');
  });

  it('getApiKey returns null when no credential stored', async () => {
    mockBackend.get.mockResolvedValue(null);
    const key = await auth.getApiKey('anthropic');
    expect(key).toBeNull();
  });

  it('setApiKey stores a raw API key', async () => {
    await auth.setApiKey('groq', 'gsk_abc');
    expect(mockBackend.set).toHaveBeenCalledWith('groq', { apiKey: 'gsk_abc', expiresAt: null });
  });

  it('logout deletes credential', async () => {
    await auth.logout('anthropic');
    expect(mockBackend.delete).toHaveBeenCalledWith('anthropic');
  });

  it('login performs OAuth flow and stores credential', async () => {
    mockOAuth.generatePKCE.mockResolvedValue({ codeVerifier: 'verifier123', codeChallenge: 'challenge123' });
    mockOAuth.buildAuthUrl.mockReturnValue('https://auth.example.com/authorize?...');
    mockOAuth.authorize.mockResolvedValue('auth-code-xyz');
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ access_token: 'access-token-123', refresh_token: 'refresh-token-456', expires_in: 3600 }),
    });

    await auth.login('anthropic');

    expect(mockOAuth.authorize).toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalled();
    expect(mockBackend.set).toHaveBeenCalledWith('anthropic', expect.objectContaining({ apiKey: 'access-token-123' }));
  });

  it('login returns false when user cancels', async () => {
    mockOAuth.generatePKCE.mockResolvedValue({ codeVerifier: 'v', codeChallenge: 'c' });
    mockOAuth.buildAuthUrl.mockReturnValue('https://auth.example.com/authorize');
    mockOAuth.authorize.mockResolvedValue(null);

    const result = await auth.login('anthropic');
    expect(result).toBe(false);
    expect(mockBackend.set).not.toHaveBeenCalled();
  });
});
