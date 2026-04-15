import type { OAuthProviderConfig } from './index';
export const anthropicProvider: OAuthProviderConfig = {
  id: 'anthropic', name: 'Claude (Anthropic)',
  authorizeEndpoint: 'https://claude.ai/oauth/authorize',
  tokenEndpoint: 'https://console.anthropic.com/v1/oauth/token',
  clientId: '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
  scopes: ['org:create_api_key', 'user:profile', 'user:inference'], flowType: 'pkce',
};
