import type { OAuthProviderConfig } from './index';
export const googleGeminiProvider: OAuthProviderConfig = {
  id: 'google-gemini', name: 'Google Gemini',
  authorizeEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  redirectUri: 'http://localhost:8085/oauth2callback',
  clientId: '681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com',
  scopes: [
    'https://www.googleapis.com/auth/cloud-platform',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
  ], flowType: 'pkce',
};
