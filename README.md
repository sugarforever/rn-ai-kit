# rn-ai-kit

A React Native toolkit for integrating AI providers into Expo apps — with OAuth subscription support.

> Status: early development. APIs may change before 1.0.

## Packages

| Package | Description |
|---|---|
| [`@rn-ai-kit/auth`](./packages/auth) | OAuth and API key management for 5 AI providers (Anthropic, OpenAI Codex, Google Gemini, GitHub Copilot, Google Antigravity). PKCE + device-code flows, token refresh, SecureStore persistence. |
| [`@rn-ai-kit/chatgpt-provider`](./packages/chatgpt-provider) | Vercel AI SDK `LanguageModelV1` provider for ChatGPT subscription OAuth tokens. Routes through the ChatGPT backend API (`chatgpt.com/backend-api`). |

## What it solves

- Sign in to Claude Pro, ChatGPT Plus, Gemini, or GitHub Copilot directly from a React Native app — reuses well-known CLI OAuth client IDs (Claude Code, Codex CLI, Gemini CLI, GitHub Copilot CLI).
- Use your ChatGPT subscription token with the Vercel AI SDK — not just the standard OpenAI API.
- Works with Expo SDK 55+ and React Native's new architecture.

## Quick start

```bash
npm install @rn-ai-kit/auth @rn-ai-kit/chatgpt-provider ai
```

Auth:

```ts
import { AuthManager } from '@rn-ai-kit/auth';

const auth = new AuthManager();

// Sign in with OAuth
await auth.login('openai-codex', async () => {
  // Optional callback to prompt the user to paste a redirect URL
  // (needed for localhost redirects on some providers)
  return userPastedUrl;
});

// Or save a raw API key
await auth.setApiKey('anthropic', 'sk-ant-...');

// Later
const token = await auth.getApiKey('openai-codex');
```

ChatGPT provider with AI SDK:

```ts
import { streamText } from 'ai';
import { createChatGPT } from '@rn-ai-kit/chatgpt-provider';
import { fetch as expoFetch } from 'expo/fetch';

const chatgpt = createChatGPT({
  apiKey: '<oauth-jwt-token>',
  fetch: expoFetch as unknown as typeof globalThis.fetch, // required for RN streaming
});

const result = streamText({
  model: chatgpt('gpt-5.4'),
  messages: [{ role: 'user', content: 'Hello' }],
});

for await (const chunk of result.textStream) {
  console.log(chunk);
}
```

## Example app

```bash
git clone https://github.com/sugarforever/rn-ai-kit.git
cd rn-ai-kit
npm install
cd apps/example
npx expo start --clear
```

The example demonstrates:
- OAuth sign-in for all 5 providers
- API key entry fallback
- Streaming chat with Markdown rendering
- Warm editorial design aesthetic

## Notes

- **Deep link scheme:** `rn-ai-kit://` — add to your `app.json` `scheme` if you plan to redistribute.
- **SecureStore on iOS/Android:** credentials persist across app reinstalls. Use `authManager.logout(providerId)` to remove them.
- **ChatGPT backend quirks:** the backend API does not accept `temperature`, `maxTokens`, or `topP`. The provider silently omits them.
- **Why custom OpenAI provider?** ChatGPT subscription JWTs target `chatgpt.com/backend-api/codex/responses` (Responses API format), not `api.openai.com/v1`. `@ai-sdk/openai` won't work with these tokens.

## Development

Monorepo using npm workspaces.

```bash
npm install

# Run tests per package (cd required — root jest config is intentionally minimal)
cd packages/auth && npx jest
cd packages/chatgpt-provider && npx jest

# Typecheck all
npx tsc --noEmit
```

## License

TBD
