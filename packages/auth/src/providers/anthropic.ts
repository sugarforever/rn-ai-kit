import type { OAuthProviderConfig } from './index';
export const anthropicProvider: OAuthProviderConfig = {
  id: 'anthropic', name: 'Claude (Anthropic)',
  authorizeEndpoint: 'https://console.anthropic.com/oauth/authorize',
  tokenEndpoint: 'https://console.anthropic.com/v1/oauth/token',
  clientId: 'pi-ai-rn', scopes: ['org:create_api_key', 'user:profile', 'user:inference'], flowType: 'pkce',
};
