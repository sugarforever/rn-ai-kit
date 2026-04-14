import { SecureStoreBackend, type StoredCredential } from './SecureStoreBackend';
import { OAuthMobileAdapter } from './OAuthMobileAdapter';
import {
  type OAuthProviderConfig,
  anthropicProvider, openaiCodexProvider, githubCopilotProvider,
  googleGeminiProvider, googleAntigravityProvider,
} from './providers';

const PROVIDERS: OAuthProviderConfig[] = [
  anthropicProvider, openaiCodexProvider, githubCopilotProvider,
  googleGeminiProvider, googleAntigravityProvider,
];

const DEVICE_CODE_MAX_POLLS = 60; // ~5 minutes at 5s intervals

export class AuthManager {
  private backend: SecureStoreBackend;
  private oauth: OAuthMobileAdapter;
  private refreshLocks = new Map<string, Promise<void>>();

  constructor(
    backend: SecureStoreBackend = new SecureStoreBackend(),
    oauth: OAuthMobileAdapter = new OAuthMobileAdapter(),
  ) {
    this.backend = backend;
    this.oauth = oauth;
  }

  listProviders(): { id: string; name: string }[] {
    return PROVIDERS.map((p) => ({ id: p.id, name: p.name }));
  }

  async getApiKey(providerId: string): Promise<string | null> {
    const cred = await this.backend.get(providerId);
    if (!cred) return null;
    if (cred.expiresAt && new Date(cred.expiresAt) < new Date()) {
      if (cred.refreshToken) {
        await this.refreshToken(providerId, cred);
        const refreshed = await this.backend.get(providerId);
        return refreshed?.apiKey ?? null;
      }
      return null;
    }
    return cred.apiKey;
  }

  async setApiKey(providerId: string, apiKey: string): Promise<void> {
    await this.backend.set(providerId, { apiKey, expiresAt: null });
  }

  async login(providerId: string): Promise<boolean> {
    const provider = PROVIDERS.find((p) => p.id === providerId);
    if (!provider) throw new Error(`Unknown provider: ${providerId}`);

    if (provider.flowType === 'device-code') {
      return this.loginDeviceCode(provider);
    }

    const { codeVerifier, codeChallenge } = await this.oauth.generatePKCE();
    const authUrl = this.oauth.buildAuthUrl({
      authorizeEndpoint: provider.authorizeEndpoint,
      clientId: provider.clientId,
      scopes: provider.scopes,
      codeChallenge,
    });

    const code = await this.oauth.authorize(authUrl);
    if (!code) return false;

    const tokens = await this.exchangeCode(provider, code, codeVerifier);
    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;

    await this.backend.set(providerId, {
      apiKey: tokens.access_token,
      expiresAt,
      refreshToken: tokens.refresh_token,
      tokenType: tokens.token_type,
    });

    return true;
  }

  async logout(providerId: string): Promise<void> {
    await this.backend.delete(providerId);
  }

  private async exchangeCode(
    provider: OAuthProviderConfig, code: string, codeVerifier: string,
  ): Promise<TokenResponse> {
    const res = await fetch(provider.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code', code, redirect_uri: this.oauth.redirectUri,
        client_id: provider.clientId, code_verifier: codeVerifier,
      }).toString(),
    });
    if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
    return res.json();
  }

  private async refreshToken(providerId: string, cred: StoredCredential): Promise<void> {
    if (this.refreshLocks.has(providerId)) {
      await this.refreshLocks.get(providerId);
      return;
    }
    const provider = PROVIDERS.find((p) => p.id === providerId);
    if (!provider || !cred.refreshToken) return;

    const promise = (async () => {
      const res = await fetch(provider.tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token', refresh_token: cred.refreshToken!,
          client_id: provider.clientId,
        }).toString(),
      });
      if (!res.ok) { await this.backend.delete(providerId); return; }
      const tokens: TokenResponse = await res.json();
      const expiresAt = tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : null;
      await this.backend.set(providerId, {
        apiKey: tokens.access_token, expiresAt,
        refreshToken: tokens.refresh_token ?? cred.refreshToken,
        tokenType: tokens.token_type,
      });
    })();

    this.refreshLocks.set(providerId, promise);
    try { await promise; } finally { this.refreshLocks.delete(providerId); }
  }

  private async loginDeviceCode(
    provider: OAuthProviderConfig,
  ): Promise<boolean> {
    const codeRes = await fetch(provider.authorizeEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ client_id: provider.clientId, scope: provider.scopes.join(' ') }),
    });
    if (!codeRes.ok) throw new Error('Device code request failed');
    const { device_code, verification_uri, interval } = await codeRes.json();

    const { openBrowserAsync } = await import('expo-web-browser');
    await openBrowserAsync(verification_uri);

    let pollInterval = (interval ?? 5) * 1000;
    for (let attempt = 0; attempt < DEVICE_CODE_MAX_POLLS; attempt++) {
      await new Promise((r) => setTimeout(r, pollInterval));
      const tokenRes = await fetch(provider.tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          client_id: provider.clientId, device_code,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }),
      });
      const data = await tokenRes.json();
      if (data.access_token) {
        await this.backend.set(provider.id, {
          apiKey: data.access_token,
          expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : null,
          refreshToken: data.refresh_token, tokenType: data.token_type,
        });
        return true;
      }
      if (data.error === 'expired_token' || data.error === 'access_denied') return false;
      if (data.error === 'slow_down') pollInterval += 5000;
    }

    return false; // Timed out
  }
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
}
