# CLAUDE.md

Context for Claude Code sessions working on this repo. Read this first.

## What this repo is

**rn-ai-kit** — a React Native / Expo monorepo for integrating AI providers into mobile apps.

Two published packages + one shipping app:

- **`@rn-ai-kit/auth`** — OAuth and API key management for 5 AI providers (Anthropic, OpenAI Codex, Google Gemini, GitHub Copilot, Google Antigravity). Handles PKCE, device-code flow, token refresh, SecureStore persistence.
- **`@rn-ai-kit/chatgpt-provider`** — AI SDK `LanguageModelV1` provider for ChatGPT subscription OAuth tokens. Routes through `chatgpt.com/backend-api/codex/responses` (not the standard OpenAI API).
- **`apps/orla`** — **Orla** (heyorla.app), an Expo chat app built on both packages. Not a throwaway example — ships regularly to the App Store and doubles as the canonical reference for how to use the library.

## History (rename)

This repo was originally named `pi-ai-react-native` with packages scoped `@pi-ai-rn/*`. Renamed to `rn-ai-kit` / `@rn-ai-kit/*` on 2026-04-18. Historical docs in `docs/superpowers/` still reference the old name — leave them alone unless specifically asked.

An earlier phase included a `@pi-ai-rn/skill-engine` package with sandboxed WebView tool execution. That package was deleted in favor of AI SDK's native tool support. The skill-engine approach required JS-in-strings and limited the library's audience to developers comfortable writing sandboxed tool code. Do not resurrect it.

## Architecture

```
rn-ai-kit/
├── packages/
│   ├── auth/                      → @rn-ai-kit/auth
│   └── chatgpt-provider/          → @rn-ai-kit/chatgpt-provider
├── apps/
│   └── orla/                      → Orla (heyorla.app) — shipping iOS chat app
├── docs/superpowers/              → design specs + plans (historical)
└── .worktrees/phase1-packages/    → active development worktree
```

### @rn-ai-kit/auth

- `AuthManager.ts` — orchestrates login/logout/getApiKey, token refresh, OAuth flows
- `OAuthMobileAdapter.ts` — mobile PKCE + browser-based authorization via `expo-web-browser`. Uses `openBrowserAsync` for localhost redirects (like OpenAI Codex), `openAuthSessionAsync` for HTTPS redirects.
- `SecureStoreBackend.ts` — credential storage via `expo-secure-store`. Accepts a `{ namespace }` option (default `'rn-ai-kit'`); keys become `{namespace}.cred.*`. Orla passes `namespace: 'orla'`.
- `providers/registry.ts` — single source of truth for 5 provider configs (client IDs, endpoints, scopes, flow type)
- Client IDs reuse well-known CLI OAuth apps (Claude Code, Codex CLI, Gemini CLI, GitHub Copilot CLI)
- Deep link scheme is app-defined. Orla uses `orla://`. The auth package does not depend on any specific scheme — all OAuth redirects are HTTPS or localhost callbacks registered on the upstream CLI client IDs.

### @rn-ai-kit/chatgpt-provider

- `chatgpt-language-model.ts` — implements `LanguageModelV1` from `@ai-sdk/provider` v1.1.x
- `convert-to-responses-api.ts` — maps AI SDK `LanguageModelV1Prompt` → OpenAI Responses API input format (function_call, function_call_output, message items)
- `map-sse-stream.ts` — parses SSE events from the backend into AI SDK stream parts (text-delta, tool-call-delta, tool-call, finish, error)
- Extracts `chatgpt-account-id` from JWT token; sends `originator: rn-ai-kit`, `OpenAI-Beta: responses=experimental`
- Zero runtime deps except `@ai-sdk/provider` (types only); `fetch` injected by caller

### Orla (apps/orla)

- Expo Router, Expo SDK 55, React Native 0.83
- Bundle ID: `app.heyorla`. Scheme: `orla://`. Domain: heyorla.app.
- Single `streamText()` path for all providers (no branching in `chat.ts`)
- Warm editorial design aesthetic — off-white `#FAFAF7`, dark charcoal user bubbles `#2C2C2E`, accent bar on assistant messages with Markdown rendering via `react-native-marked`
- No tools, no skill engine — system prompt only

## Critical technical decisions (do not reverse)

1. **Vercel AI SDK for all providers** — earlier attempts with `@mariozechner/pi-ai` failed because it uses Node.js-only imports that break Metro. AI SDK is RN-compatible as long as you pass `expo/fetch` for streaming support.

2. **`expo/fetch` is mandatory for streaming** — React Native's built-in `fetch` returns `response.body === null`, breaking any streaming SDK. Every provider factory in `chat.ts` passes `fetch: expoFetch`.

3. **Custom ChatGPT provider, not `@ai-sdk/openai`** — ChatGPT subscription OAuth tokens target `chatgpt.com/backend-api/codex/responses` (Responses API), NOT `api.openai.com/v1` (Chat Completions API). The shapes are different; the standard OpenAI provider will 401 or 404.

4. **ChatGPT backend does NOT support standard OpenAI parameters** — silently ignore or don't send `temperature`, `maxTokens` (`max_output_tokens`), `topP`, `response_format`, `logprobs`. The backend will reject them with "Unsupported parameter". See `chatgpt-language-model.ts:buildRequestBody`.

5. **Supported ChatGPT model IDs are non-standard** — `gpt-5.4` etc., not `gpt-4o`. The backend rejects standard OpenAI model names.

6. **OAuth `state` param is provider-specific** — OpenAI requires ≥8 char random hex, Anthropic uses the PKCE verifier. Only Anthropic includes `state` in the token exchange body.

7. **OpenAI Codex uses localhost redirect URI** — `http://localhost:1455/auth/callback`. Browser intercepts localhost redirects to "refused to connect" error page, so we use `openBrowserAsync` + manual URL/code paste fallback (see `settings.tsx` `Alert.prompt`). DO NOT switch to `openAuthSessionAsync` for http schemes.

8. **PKCE with `expo-crypto`** — Node's `crypto` module doesn't exist on Hermes. `OAuthMobileAdapter.generatePKCE` is async because it uses `expo-crypto.digestStringAsync`.

9. **`jsonSchema()` for AI SDK tool schemas** — Zod-based tool definitions caused `_def` runtime errors. Use `jsonSchema()` from `ai` package for raw JSON Schema.

10. **Markdown paragraph padding fix** — `react-native-marked` paragraphs default to `paddingVertical: 8`, which misaligns ordered list markers (number above text). Fix: `paragraph: { paddingVertical: 0, marginBottom: 8 }` in the Markdown `styles` prop. See `MessageBubble.tsx`.

## Development workflow

```bash
# Install
npm install

# Run tests (IMPORTANT: must cd into package dir — root jest config is missing)
cd packages/auth && npx jest
cd packages/chatgpt-provider && npx jest

# Typecheck
npx tsc --noEmit

# Start Orla
cd apps/orla && npx expo start --clear
# press i for iOS simulator
```

- **Active branch:** `feature/phase1-packages` (in `.worktrees/phase1-packages/` worktree)
- **Tests:** 29 total (18 auth + 11 chatgpt-provider), all passing
- **Main branch:** pristine, no uncommitted work. All active dev happens in the worktree.

## Known gotchas

- If you add CLAUDE.md changes, make them in the repo root, not the worktree — wait, actually *do* edit in the worktree; it's a normal file like any other. The worktree uses the same working tree.
- Running `jest` from the monorepo root uses `babel-jest` (the Metro/Expo transform) and chokes on `import type`. Always `cd` into a package directory to run its tests.
- SecureStore keys cannot contain `:` — use `.`, `-`, or `_`. Library default namespace is `rn-ai-kit`; Orla overrides with `orla`.
- If the SecureStore namespace changes, existing credentials are orphaned — user must sign in again.

## User preferences learned

- Prefers terse communication, end-of-turn summaries ≤2 sentences
- Prefers direct answers over hedging
- Wants corrected root causes, not symptom fixes
- Uses iOS simulator for testing
- Uses ChatGPT OAuth subscription for LLM testing
- Values design craft — Orla's visual design matters because it's both a shipping product and the library's public showcase

## When starting work

1. Check if you're in the worktree: `git branch --show-current` should be `feature/phase1-packages`. If not, `cd .worktrees/phase1-packages`.
2. Run `npm install` if node_modules missing.
3. Read the most recent commit (`git log -1 --stat`) to understand what was last touched.
4. Check `docs/superpowers/specs/` and `docs/superpowers/plans/` for historical context (but don't assume those docs reflect current state — verify against code).
