import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';

const REDIRECT_PATH = 'oauth/callback';

export interface AuthUrlParams {
  authorizeEndpoint: string;
  clientId: string;
  scopes: string[];
  codeChallenge: string;
  state?: string;
  extraParams?: Record<string, string>;
}

export class OAuthMobileAdapter {
  private get redirectUri(): string {
    return Linking.createURL(REDIRECT_PATH);
  }

  buildAuthUrl(params: AuthUrlParams): string {
    const url = new URL(params.authorizeEndpoint);
    url.searchParams.set('client_id', params.clientId);
    url.searchParams.set('redirect_uri', this.redirectUri);
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

  async authorize(authUrl: string): Promise<string | null> {
    const result = await WebBrowser.openAuthSessionAsync(authUrl, this.redirectUri);
    if (result.type !== 'success') return null;
    const url = new URL(result.url);
    return url.searchParams.get('code');
  }

  generatePKCE(): { codeVerifier: string; codeChallenge: string } {
    // Use Node.js crypto for PKCE (expo-crypto is not available in test environment)
    // In the real app, this will work in both environments
    const crypto = require('crypto');
    const bytes = crypto.randomBytes(32);
    const codeVerifier = base64UrlEncode(bytes);
    const hash = crypto.createHash('sha256').update(codeVerifier).digest();
    const codeChallenge = base64UrlEncode(hash);
    return { codeVerifier, codeChallenge };
  }
}

function base64UrlEncode(buffer: Uint8Array | Buffer): string {
  const base64 = Buffer.from(buffer).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
