# rn-ai-kit

A React Native toolkit for integrating AI providers into Expo apps — with OAuth subscription support.

> Status: early development. APIs may change before 1.0.

## Packages

| Package | Description |
|---|---|
| [`@rn-ai-kit/auth`](./packages/auth) | OAuth and API key management for AI provider subscriptions. Claude Pro (Anthropic) and ChatGPT Plus/Pro (OpenAI Codex) enabled by default; provider configs for Gemini, GitHub Copilot, and Google Antigravity ship in the registry but are commented out pending re-enable. PKCE + device-code flows, token refresh, configurable SecureStore namespace. |
| [`@rn-ai-kit/chatgpt-provider`](./packages/chatgpt-provider) | Vercel AI SDK `LanguageModelV1` provider for ChatGPT subscription OAuth tokens. Routes through the ChatGPT backend API (`chatgpt.com/backend-api`). Supports image input and image generation via the built-in `image_generation` tool. |
| [`@rn-ai-kit/sessions`](./packages/sessions) | On-device conversation persistence with a pluggable `SessionStore` interface. Ships with `SqliteSessionStore` (expo-sqlite) and `InMemorySessionStore`, plus React hooks (`useSessions`, `useSession`). |

## What it solves

- Sign in to Claude Pro or ChatGPT Plus/Pro directly from a React Native app — reuses the well-known Claude Code and Codex CLI OAuth client IDs.
- Use your ChatGPT subscription token with the Vercel AI SDK — not just the standard OpenAI API.
- Generate images via gpt-image-2 through the Responses API's built-in `image_generation` tool, with photo attachments handled inline.
- Persist multi-turn conversations on-device and rehydrate them across app restarts.
- Works with Expo SDK 55+ and React Native's new architecture.

## Quick start

```bash
npm install @rn-ai-kit/auth @rn-ai-kit/chatgpt-provider @rn-ai-kit/sessions ai
```

Auth — Claude OAuth is a one-liner:

```ts
import { AuthManager, SecureStoreBackend } from '@rn-ai-kit/auth';

// Pass an app-specific namespace so your credentials don't collide with
// other apps that also use @rn-ai-kit/auth on the same device.
const auth = new AuthManager(
  new SecureStoreBackend({ namespace: 'myapp' }),
);

// Opens an in-app browser; OpenAI returns to a localhost URL, Anthropic
// returns to console.anthropic.com — both are handled internally.
await auth.login('anthropic');

// Or save a raw API key instead of OAuth:
await auth.setApiKey('anthropic', 'sk-ant-...');

// Later:
const token = await auth.getApiKey('anthropic');
```

Auth — `openai-codex` needs a paste-back callback. OpenAI's ChatGPT OAuth app uses a `http://localhost:1455/auth/callback` redirect URI that mobile browsers can't follow (they show "This site can't be reached"). The user has to copy the URL from the browser address bar and paste it back. The SDK invokes the `onNeedManualCode` callback you provide to collect it:

```ts
import { Alert } from 'react-native';
import { AuthManager } from '@rn-ai-kit/auth';

const auth = new AuthManager();

await auth.login('openai-codex', () =>
  new Promise<string | null>((resolve) => {
    Alert.prompt(
      'Paste authorization URL',
      'After signing in, the browser will show an error page. Copy the full URL from the address bar and paste it here.',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
        { text: 'Submit', onPress: (text) => resolve(text ?? null) },
      ],
      'plain-text',
    );
  }),
);
```

(See `apps/orla/src/app/settings.tsx` for the complete pattern Orla ships with.)

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

Sessions — persist conversations on device:

```tsx
import {
  SqliteSessionStore,
  SessionStoreProvider,
  useSessions,
  useSession,
} from '@rn-ai-kit/sessions';

// Create the store once and init the schema before mounting the provider.
const sessionStore = new SqliteSessionStore();

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    sessionStore.init().then(() => setReady(true));
  }, []);
  if (!ready) return null;
  return (
    <SessionStoreProvider store={sessionStore}>{children}</SessionStoreProvider>
  );
}

// Somewhere inside the provider tree:
function SessionList() {
  const { sessions, createSession, deleteSession } = useSessions();
  // …
}

function Chat({ sessionId }: { sessionId: string | null }) {
  const { messages, appendMessage } = useSession(sessionId);
  // append a user message, stream assistant reply, then:
  // await appendMessage({ role: 'assistant', parts: [...] });
}
```

## Orla (reference app)

[Orla](https://heyorla.app) is the reference app built on these packages — a warm, editorial chat client for Claude and ChatGPT subscriptions. It ships from `apps/orla` and is the best worked example of the library in practice.

```bash
git clone https://github.com/sugarforever/rn-ai-kit.git
cd rn-ai-kit
npm install
cd apps/orla
npx expo start --clear
```

Orla demonstrates:
- OAuth sign-in for Claude Pro and ChatGPT Plus/Pro; API key fallback
- Streaming chat with Markdown rendering
- Session list with rename/delete, persistent across app relaunches
- Photo attachments and in-chat image generation (ChatGPT OAuth)
- Warm editorial design aesthetic

## Notes

- **Deep link scheme:** pick any `scheme` that suits your app's `app.json` — `@rn-ai-kit/auth` doesn't depend on a specific scheme. OAuth flows redirect to HTTPS (Anthropic) or `http://localhost` (OpenAI Codex), so the app scheme is never on the OAuth critical path.
- **SecureStore namespace:** pass `new SecureStoreBackend({ namespace: '<your-app>' })` to `AuthManager`. Keys are stored as `{namespace}.cred.{providerId}`. If you change the namespace later, existing credentials are orphaned and users need to sign in again.
- **SecureStore persistence:** on iOS the keychain survives app reinstalls by default; on Android credentials live in EncryptedSharedPreferences and are removed on uninstall. Use `authManager.logout(providerId)` for explicit removal.
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
cd packages/sessions && npx jest

# Typecheck the whole repo
npx tsc --noEmit
```

Releases are handled through the `release.yml` GitHub Actions workflow — tag push (`git tag vX.Y.Z && git push origin vX.Y.Z`) publishes all three packages to npm. Use the **Actions → Release packages → Run workflow → Dry run** path for pre-tag validation.

## License

MIT — see [LICENSE](./LICENSE).
