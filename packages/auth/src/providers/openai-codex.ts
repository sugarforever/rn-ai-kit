import type { OAuthProviderConfig } from './index';
export const openaiCodexProvider: OAuthProviderConfig = {
  id: 'openai-codex', name: 'ChatGPT (OpenAI)',
  authorizeEndpoint: 'https://auth.openai.com/authorize',
  tokenEndpoint: 'https://auth.openai.com/oauth/token',
  clientId: 'pi-ai-rn', scopes: ['openai.public'], flowType: 'pkce',
};
