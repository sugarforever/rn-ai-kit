import type { OAuthProviderConfig } from './index';
export const githubCopilotProvider: OAuthProviderConfig = {
  id: 'github-copilot', name: 'GitHub Copilot',
  authorizeEndpoint: 'https://github.com/login/device/code',
  tokenEndpoint: 'https://github.com/login/oauth/access_token',
  redirectUri: '', // Device code flow — no redirect URI needed
  clientId: 'Iv1.b507a08c87ecfe98',
  scopes: ['copilot'], flowType: 'device-code',
};
