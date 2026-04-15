import * as WebBrowser from 'expo-web-browser';
import * as Crypto from 'expo-crypto';

export interface AuthUrlParams {
  authorizeEndpoint: string;
  redirectUri: string;
  clientId: string;
  scopes: string[];
  codeChallenge: string;
  state?: string;
  extraParams?: Record<string, string>;
}

export class OAuthMobileAdapter {
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
   * Open the auth URL in an in-app browser (ASWebAuthenticationSession on iOS).
   * The session intercepts the redirect URI before it actually loads —
   * this works with localhost, https, and custom scheme redirect URIs.
   */
  async authorize(authUrl: string, redirectUri: string): Promise<string | null> {
    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
    if (result.type !== 'success') return null;
    const url = new URL(result.url);
    return url.searchParams.get('code');
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
