import type { OAuthProviderConfig } from './index';
export const openaiCodexProvider: OAuthProviderConfig = {
  id: 'openai-codex', name: 'ChatGPT (OpenAI)',
  authorizeEndpoint: 'https://auth.openai.com/oauth/authorize',
  tokenEndpoint: 'https://auth.openai.com/oauth/token',
  clientId: 'app_EMoamEEZ73f0CkXaXp7hrann',
  scopes: ['openid', 'profile', 'email', 'offline_access'], flowType: 'pkce',
};
