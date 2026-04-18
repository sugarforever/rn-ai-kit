/**
 * OAuth provider registry.
 *
 * All provider configurations in one place — client IDs, endpoints,
 * redirect URIs, and scopes. These client IDs are the same ones used
 * by the official CLI tools (Claude Code, Codex CLI, Gemini CLI, etc.)
 * and shared across the ecosystem (pi-ai, OpenClaw, etc.).
 *
 * They are public OAuth clients (PKCE, no client secret).
 */
import type { OAuthProviderConfig } from './index';

// ---------------------------------------------------------------------------
// Anthropic — Claude Pro/Max subscription
// Client ID from Claude Code CLI
// ---------------------------------------------------------------------------
export const anthropicProvider: OAuthProviderConfig = {
  id: 'anthropic',
  name: 'Claude (Anthropic)',
  authorizeEndpoint: 'https://claude.ai/oauth/authorize',
  tokenEndpoint: 'https://console.anthropic.com/v1/oauth/token',
  redirectUri: 'https://console.anthropic.com/oauth/code/callback',
  clientId: '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
  scopes: ['org:create_api_key', 'user:profile', 'user:inference'],
  flowType: 'pkce',
  extraAuthParams: { code: 'true' },
};

// ---------------------------------------------------------------------------
// OpenAI — ChatGPT Plus/Pro subscription
// Client ID from Codex CLI
// ---------------------------------------------------------------------------
export const openaiCodexProvider: OAuthProviderConfig = {
  id: 'openai-codex',
  name: 'ChatGPT (OpenAI)',
  authorizeEndpoint: 'https://auth.openai.com/oauth/authorize',
  tokenEndpoint: 'https://auth.openai.com/oauth/token',
  redirectUri: 'http://localhost:1455/auth/callback',
  clientId: 'app_EMoamEEZ73f0CkXaXp7hrann',
  scopes: ['openid', 'profile', 'email', 'offline_access'],
  flowType: 'pkce',
  extraAuthParams: {
    id_token_add_organizations: 'true',
    codex_cli_simplified_flow: 'true',
    originator: 'rn-ai-kit',
  },
};

// ---------------------------------------------------------------------------
// GitHub Copilot — device code flow
// Client ID from GitHub Copilot CLI
// ---------------------------------------------------------------------------
export const githubCopilotProvider: OAuthProviderConfig = {
  id: 'github-copilot',
  name: 'GitHub Copilot',
  authorizeEndpoint: 'https://github.com/login/device/code',
  tokenEndpoint: 'https://github.com/login/oauth/access_token',
  redirectUri: '', // Device code flow — no redirect URI
  clientId: 'Iv1.b507a08c87ecfe98',
  scopes: ['copilot'],
  flowType: 'device-code',
};

// ---------------------------------------------------------------------------
// Google Gemini — via Gemini CLI / Cloud Code Assist
// Client ID from Gemini CLI
// ---------------------------------------------------------------------------
export const googleGeminiProvider: OAuthProviderConfig = {
  id: 'google-gemini',
  name: 'Google Gemini',
  authorizeEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  redirectUri: 'http://localhost:8085/oauth2callback',
  clientId: '681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com',
  scopes: [
    'https://www.googleapis.com/auth/cloud-platform',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
  ],
  flowType: 'pkce',
};

// ---------------------------------------------------------------------------
// Google Antigravity — Gemini/Claude/GPT via Google Cloud
// Client ID from Antigravity CLI
// ---------------------------------------------------------------------------
export const googleAntigravityProvider: OAuthProviderConfig = {
  id: 'google-antigravity',
  name: 'Google Antigravity',
  authorizeEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  redirectUri: 'http://localhost:51121/oauth-callback',
  clientId: '1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com',
  scopes: [
    'https://www.googleapis.com/auth/cloud-platform',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/cclog',
    'https://www.googleapis.com/auth/experimentsandconfigs',
  ],
  flowType: 'pkce',
};
