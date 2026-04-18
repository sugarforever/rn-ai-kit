# Pi-AI React Native — Simplification Design

**Date:** 2026-04-16
**Status:** Approved
**Supersedes:** Skill engine portions of 2026-04-14-pi-ai-react-native-design.md

## Context

The initial monorepo shipped three concerns: `@pi-ai-rn/auth` (OAuth), `@pi-ai-rn/skill-engine` (sandboxed WebView tool execution), and an example app. The skill engine required tools to be written as JavaScript strings executed inside a hidden WebView sandbox with a bridge layer (postMessage, FsProxy, SqliteProxy, FetchProxy). This added significant complexity and limited the audience to developers comfortable writing JavaScript tool implementations.

After evaluation, the skill engine is being removed in favor of AI SDK's native tool support (`tool()` with `execute` functions, `maxSteps` for automatic tool loops). The existing custom ChatGPT backend streaming client (`chatgpt-provider.ts`) is being promoted to a proper AI SDK provider package so all providers go through a single `streamText()` code path.

## Monorepo Structure

```
pi-ai-react-native/
├── packages/
│   ├── auth/                        # @pi-ai-rn/auth (unchanged)
│   └── chatgpt-provider/           # @pi-ai-rn/chatgpt-provider (new)
├── apps/
│   └── example/                     # Minimal chat app
├── package.json                     # Workspace root
└── tsconfig.json
```

### Removed

- `packages/skill-engine/` — entire package deleted
- `apps/example/src/lib/chatgpt-provider.ts` — replaced by `@pi-ai-rn/chatgpt-provider`
- `apps/example/src/lib/skills.ts` — deleted
- WebView/sandbox/bridge wiring in example app — deleted
- Dependencies no longer needed: `react-native-webview`, `expo-sqlite`, `expo-file-system`

## Package: `@pi-ai-rn/chatgpt-provider`

### Purpose

A drop-in AI SDK provider that routes requests through `chatgpt.com/backend-api/codex/responses` using ChatGPT subscription OAuth tokens (JWTs from `auth.openai.com`). Implements the AI SDK language model interface so it works with `streamText()`, `generateText()`, `maxSteps`, and all other AI SDK features identically to `@ai-sdk/openai` or `@ai-sdk/anthropic`.

### Public API

```typescript
import { createChatGPT } from '@pi-ai-rn/chatgpt-provider';

const chatgpt = createChatGPT({ apiKey: '<oauth-jwt-token>' });
const model = chatgpt('gpt-5.4');

// Works with any AI SDK function — identical to other providers
const result = await streamText({
  model,
  system: 'You are a helpful assistant.',
  messages: [{ role: 'user', content: 'Hello' }],
  maxSteps: 8,
  tools: { ... },
});
```

### Internal Structure

```
packages/chatgpt-provider/
├── src/
│   ├── index.ts                    # createChatGPT() factory, re-exports
│   ├── chatgpt-provider.ts         # Provider class — creates model instances
│   ├── chatgpt-language-model.ts   # LanguageModel implementation (doStream, doGenerate)
│   ├── convert-to-responses-api.ts # Maps AI SDK prompt → Responses API input format
│   └── map-sse-stream.ts           # Parses SSE → AI SDK stream parts
├── package.json
└── tsconfig.json
```

### Key Responsibilities

**`chatgpt-language-model.ts`** implements the AI SDK language model interface:

- `doStream()`: POSTs to `/codex/responses` with `stream: true`, parses SSE events, emits AI SDK stream parts
- `doGenerate()`: Same POST but non-streaming, returns complete result
- Extracts `chatgpt-account-id` from the JWT for the required header
- Accepts a configurable `fetch` function (defaults to `expo/fetch` for React Native streaming support)
- 30s timeout with AbortController

**`convert-to-responses-api.ts`** translates AI SDK prompt format to Responses API input:

| AI SDK Format | Responses API Format |
|---|---|
| `{ role: 'user', content: '...' }` | `{ type: 'message', role: 'user', content: [{ type: 'input_text', text: '...' }] }` |
| `{ role: 'assistant', content: '...' }` | `{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '...' }] }` |
| AI SDK tool call | `{ type: 'function_call', call_id, name, arguments }` |
| AI SDK tool result | `{ type: 'function_call_output', call_id, output }` |
| System prompt | `instructions` field on request body |

**`map-sse-stream.ts`** maps SSE events to AI SDK stream parts:

| Responses API SSE Event | AI SDK Stream Part |
|---|---|
| (first event) | `stream-start` |
| `response.output_text.delta` | `text-delta` |
| `response.output_item.added` (function_call) | `tool-input-start` |
| `response.function_call_arguments.delta` | `tool-input-delta` |
| `response.output_item.done` (function_call) | `tool-call` |
| `response.completed` | `finish` |
| `error` / `response.failed` | throw Error |

### Dependencies

- `@ai-sdk/provider` — types only (LanguageModel interface, stream part types)
- Zero other runtime dependencies. The `fetch` function is injected by the caller.

### Caveat

The ChatGPT backend API (`chatgpt.com/backend-api`) is not a public, documented API. It may not support every parameter the standard OpenAI API does (e.g., `response_format`, `logprobs`, image inputs). Unsupported options are silently ignored or produce clear errors. The API could change without notice.

## Package: `@pi-ai-rn/auth`

No changes. OAuth flows, SecureStoreBackend, provider registry (5 providers), PKCE, device-code flow all remain as-is.

## Example App

### Simplified `chat.ts` (~60 lines, down from ~330)

Single code path for all providers:

```typescript
import { streamText } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createChatGPT } from '@pi-ai-rn/chatgpt-provider';
import { fetch as expoFetch } from 'expo/fetch';

function createModel(providerId: string, modelId: string, apiKey: string) {
  const fetch = expoFetch as unknown as typeof globalThis.fetch;
  switch (providerId) {
    case 'anthropic':    return createAnthropic({ apiKey, fetch })(modelId);
    case 'openai':       return createOpenAI({ apiKey, fetch })(modelId);
    case 'google':       return createGoogleGenerativeAI({ apiKey, fetch })(modelId);
    case 'openai-codex': return createChatGPT({ apiKey, fetch })(modelId);
    default:             return createOpenAI({ apiKey, fetch })(modelId);
  }
}

export async function sendMessage(...) {
  const model = createModel(providerId, modelId, apiKey);
  const result = streamText({ model, system: systemPrompt, messages });
  for await (const part of result.fullStream) {
    // handle text-delta, error
  }
}
```

### Simplified `index.tsx`

Removed:
- `SandboxWebView`, `BridgeHost`, `sandboxRef`, `bridgeRef`
- `pendingCalls` map, `globalThis.__onToolResult`
- `skillEngine.setExecutor()`, tool registration timer
- `expo-sqlite`, `expo-file-system` imports

Kept:
- Chat UI, message list, streaming indicator
- Settings navigation, provider auto-detection
- System prompt as a string constant (the "skill")

### Removed Files

- `src/lib/skills.ts`
- `src/lib/chatgpt-provider.ts`

### Removed Dependencies

- `@pi-ai-rn/skill-engine`
- `expo-sqlite`
- `expo-file-system`
- `react-native-webview`

### Unchanged Files

- `src/app/settings.tsx`
- `src/app/_layout.tsx`
- `src/components/ChatInput.tsx`
- `src/components/MessageBubble.tsx`
- `src/lib/auth.ts`

## Summary

| Area | Before | After |
|---|---|---|
| Published packages | `auth`, `skill-engine` | `auth`, `chatgpt-provider` |
| Chat code paths | 2 (AI SDK + custom ChatGPT) | 1 (all AI SDK) |
| Tool execution | WebView sandbox + bridge | AI SDK native `tool({ execute })` |
| Example skill | HN Copilot (JS in sandbox) | Markdown system prompt |
| `chat.ts` | ~330 lines | ~60 lines |
| `index.tsx` | ~290 lines | ~240 lines |
| Hidden WebView | Yes | No |
| Extra deps | expo-sqlite, expo-file-system, react-native-webview | None |
