export interface OAuthProviderConfig {
  id: string;
  name: string;
  authorizeEndpoint: string;
  tokenEndpoint: string;
  redirectUri: string;
  clientId: string;
  scopes: string[];
  flowType: 'pkce' | 'device-code';
}

export { anthropicProvider } from './anthropic';
export { openaiCodexProvider } from './openai-codex';
export { githubCopilotProvider } from './github-copilot';
export { googleGeminiProvider } from './google-gemini';
export { googleAntigravityProvider } from './google-antigravity';
