import type { OAuthProviderConfig } from './index';
export const googleGeminiProvider: OAuthProviderConfig = {
  id: 'google-gemini', name: 'Google Gemini',
  authorizeEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  clientId: 'pi-ai-rn', scopes: ['https://www.googleapis.com/auth/cloud-platform'], flowType: 'pkce',
};
