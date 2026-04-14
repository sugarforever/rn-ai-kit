import type { OAuthProviderConfig } from './index';
export const googleAntigravityProvider: OAuthProviderConfig = {
  id: 'google-antigravity', name: 'Google Antigravity',
  authorizeEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  clientId: 'pi-ai-rn-antigravity', scopes: ['https://www.googleapis.com/auth/cloud-platform'], flowType: 'pkce',
};
