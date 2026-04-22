# rn-ai-kit

A React Native toolkit for integrating AI providers into Expo apps — with OAuth subscription support.

> Status: early development. APIs may change before 1.0.

## Packages

| Package | Description |
|---|---|
| [`@rn-ai-kit/auth`](./packages/auth) | OAuth and API key management for 5 AI providers (Anthropic, OpenAI Codex, Google Gemini, GitHub Copilot, Google Antigravity). PKCE + device-code flows, token refresh, SecureStore persistence. |
| [`@rn-ai-kit/chatgpt-provider`](./packages/chatgpt-provider) | Vercel AI SDK `LanguageModelV1` provider for ChatGPT subscription OAuth tokens. Routes through the ChatGPT backend API (`chatgpt.com/backend-api`). Supports image input and image generation via the built-in `image_generation` tool. |
| [`@rn-ai-kit/sessions`](./packages/sessions) | On-device conversation persistence with a pluggable `SessionStore` interface. Ships with `SqliteSessionStore` (expo-sqlite) and `InMemorySessionStore`, plus React hooks (`useSessions`, `useSession`). |

## What it solves

- Sign in to Claude Pro, ChatGPT Plus, Gemini, or GitHub Copilot directly from a React Native app — reuses well-known CLI OAuth client IDs (Claude Code, Codex CLI, Gemini CLI, GitHub Copilot CLI).
- Use your ChatGPT subscription token with the Vercel AI SDK — not just the standard OpenAI API.
- Generate images via gpt-image-2 through the Responses API's built-in `image_generation` tool, with photo attachments handled inline.
- Persist multi-turn conversations on-device and rehydrate them across app restarts.
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
- OAuth sign-in for all 5 providers, API key entry fallback
- Streaming chat with Markdown rendering
- Session list with rename/delete, persistent across app relaunches
- Photo attachments and in-chat image generation (ChatGPT OAuth)
- Warm editorial design aesthetic

## Notes

- **Deep link scheme:** `rn-ai-kit://` — add to your `app.json` `scheme` if you plan to redistribute.
- **SecureStore on iOS/Android:** credentials persist across app reinstalls. Use `authManager.logout(providerId)` to remove them.
- **Why a custom OpenAI provider?** ChatGPT subscription JWTs target `chatgpt.com/backend-api/codex/responses` (Responses API format), not `api.openai.com/v1`. `@ai-sdk/openai` won't work with these tokens.
- **ChatGPT backend accepted params:** the Responses API takes `reasoning`, `include`, `text.verbosity`, `prompt_cache_key`, and the `image_generation` built-in tool. It rejects legacy chat-completions params (`temperature`, `maxTokens`, `topP`) — the provider silently omits them.
- **gpt-5.x needs reasoning:** without `reasoning.effort`, gpt-5.x models fall into a chat-like mode and won't invoke tools. The provider sets `reasoning: { effort: "medium", summary: "auto" }` automatically for any `gpt-5*` model id.
- **Image generation is OAuth-only:** the built-in `image_generation` tool is gated on ChatGPT OAuth tokens — opt in via `chatgptTools.imageGeneration()` and include it in `streamText`'s `tools`. Generated images arrive as AI SDK `file` stream parts with base64 data.

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

MIT — see [LICENSE](./LICENSE).
