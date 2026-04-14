import type { OAuthProviderConfig } from './index';
export const githubCopilotProvider: OAuthProviderConfig = {
  id: 'github-copilot', name: 'GitHub Copilot',
  authorizeEndpoint: 'https://github.com/login/device/code',
  tokenEndpoint: 'https://github.com/login/oauth/access_token',
  clientId: 'pi-ai-rn', scopes: ['copilot'], flowType: 'device-code',
};
