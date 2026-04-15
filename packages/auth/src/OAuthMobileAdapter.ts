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
   * Open the auth URL in an in-app browser.
   *
   * For providers with custom-scheme or HTTPS redirect URIs,
   * ASWebAuthenticationSession intercepts the redirect automatically.
   *
   * For providers with localhost redirect URIs (OpenAI, Google),
   * the browser will fail to load localhost. The user needs to copy
   * the URL from the browser address bar and paste it back.
   * In that case, `onNeedManualCode` is called to prompt the user.
   */
  async authorize(
    authUrl: string,
    redirectUri: string,
    onNeedManualCode?: () => Promise<string | null>,
  ): Promise<string | null> {
    const isLocalhostRedirect = redirectUri.startsWith('http://localhost') ||
      redirectUri.startsWith('http://127.0.0.1');

    if (isLocalhostRedirect) {
      // For localhost redirects, use a plain browser (not openAuthSessionAsync).
      // openAuthSessionAsync extracts the URL scheme for redirect detection —
      // with "http" as the scheme, it can intercept internal auth-flow
      // redirects before the sign-in page even loads.
      // openBrowserAsync just opens the page and lets the user sign in.
      // After auth, the browser redirects to localhost (which fails),
      // the user copies the URL and pastes it back.
      await WebBrowser.openBrowserAsync(authUrl);

      // Browser closed — prompt for the redirect URL
      if (onNeedManualCode) {
        const input = await onNeedManualCode();
        if (!input) return null;
        if (input.includes('code=') || input.includes('://')) {
          return extractCodeFromUrl(input);
        }
        return input.split('#')[0];
      }
      return null;
    }

    // For non-localhost redirects, use openAuthSessionAsync which
    // intercepts the redirect automatically (custom schemes, HTTPS)
    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);

    if (result.type === 'success' && result.url) {
      return extractCodeFromUrl(result.url);
    }

    // Browser dismissed without successful redirect — try manual fallback
    if (result.type === 'dismiss' && onNeedManualCode) {
      const input = await onNeedManualCode();
      if (!input) return null;
      if (input.includes('code=') || input.includes('://')) {
        return extractCodeFromUrl(input);
      }
      return input.split('#')[0];
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
