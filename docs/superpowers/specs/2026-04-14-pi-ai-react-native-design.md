# Pi AI React Native — Design Spec

## 1. Overview

An open-source monorepo providing two npm packages for building AI-powered React Native apps, plus a reference mobile app (iOS-first) that demonstrates them. The app is a ChatGPT/Claude-style AI chat interface with support for custom skills — starting with FPL Copilot.

### Goals

- No backend — fully on-device computation, users bring their own API keys or OAuth subscriptions
- Reuse pi-mono's (`@mariozechner/pi-ai`) OAuth layer and unified LLM API
- Sandboxed skill execution — skills can define JS tools that run in isolation
- Ship with FPL Copilot as the first bundled skill

### Non-Goals (v1)

- No user accounts or server-side auth
- No skill marketplace or downloadable skills (bundled only)
- No Android-specific work (Expo makes it possible later, but iOS is the focus)
- No MCP support

---

## 2. Architecture

```
┌─────────────────────────────────────┐
│          Mobile App (Expo)           │
│  Chat UI · Conversation Store       │
│  Skill Manager · Settings           │
├───────────────┬─────────────────────┤
│ @pi-ai-rn/auth│ @pi-ai-rn/skill-engine │
│ OAuth flows   │ WebView sandbox         │
│ Keychain      │ Tool bridge (fetch,     │
│ Token refresh │   sqlite, fs)           │
├───────────────┴─────────────────────┤
│         @mariozechner/pi-ai          │
│  Unified LLM API · Providers        │
│  Model registry · Streaming         │
└─────────────────────────────────────┘
```

- **App** owns UI, conversation persistence, and skill loading
- **@pi-ai-rn/auth** adapts pi-mono's OAuth for mobile (custom URI schemes, Keychain)
- **@pi-ai-rn/skill-engine** runs skill JS tools in an isolated WebView, exposes APIs via postMessage bridge
- **@mariozechner/pi-ai** handles all LLM communication (unchanged)

---

## 3. Monorepo Structure

```
pi-ai-react-native/
├── packages/
│   ├── auth/              → @pi-ai-rn/auth
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── AuthManager.ts
│   │   │   ├── SecureStoreBackend.ts
│   │   │   ├── OAuthMobileAdapter.ts
│   │   │   └── providers/
│   │   │       ├── anthropic.ts
│   │   │       ├── openai-codex.ts
│   │   │       ├── github-copilot.ts
│   │   │       ├── google-gemini.ts
│   │   │       └── google-antigravity.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── skill-engine/      → @pi-ai-rn/skill-engine
│       ├── src/
│       │   ├── index.ts
│       │   ├── SkillEngine.ts
│       │   ├── SandboxWebView.tsx
│       │   ├── bridge/
│       │   │   ├── BridgeHost.ts       # Native side message handler
│       │   │   ├── bridge-runtime.js   # Injected into WebView
│       │   │   ├── FetchProxy.ts
│       │   │   ├── SqliteProxy.ts
│       │   │   └── FsProxy.ts
│       │   └── types.ts
│       ├── package.json
│       └── tsconfig.json
├── apps/
│   └── example/            → Expo demo app
├── package.json            → npm workspaces
├── tsconfig.json
└── LICENSE
```

---

## 4. @pi-ai-rn/auth

Adapts pi-mono's `OAuthProviderInterface` and `AuthStorageBackend` for mobile.

### OAuth Flow on Mobile

```
User taps "Sign in with Claude"
  → App opens SFSafariViewController via expo-web-browser
  → Provider authorization page loads
  → User approves
  → Redirect to pi-ai-rn://oauth/callback?code=xxx
  → App catches via expo-linking deep link handler
  → Exchange code for tokens (PKCE)
  → Store credentials in iOS Keychain via expo-secure-store
```

### Adaptations from Pi-mono

| Pi-mono (desktop) | @pi-ai-rn/auth (mobile) |
|---|---|
| `localhost:1455` callback server | Custom URI scheme `pi-ai-rn://oauth/callback` via `expo-linking` |
| `exec("open url")` | `expo-web-browser` (SFSafariViewController) |
| `~/.pi/agent/auth.json` (file) | `expo-secure-store` (iOS Keychain / Android Keystore) |
| `proper-lockfile` for concurrent refresh | In-memory mutex (single process on mobile) |
| Manual code paste fallback | Not needed — deep link handles redirect |

### Public API

```typescript
import { AuthManager } from '@pi-ai-rn/auth';

const auth = new AuthManager();

// OAuth login — opens browser, returns on redirect
await auth.login('anthropic');
await auth.login('openai-codex');

// Get API key for pi-ai provider
const key = auth.getApiKey('anthropic');

// Logout — clears credentials from Keychain
await auth.logout('anthropic');

// List available OAuth providers
auth.listProviders();
// → [{ id: 'anthropic', name: 'Claude (Anthropic)' }, ...]

// Raw API key entry (fallback for any provider)
await auth.setApiKey('groq', 'gsk_...');
```

### Supported Providers

All 5 from pi-mono, plus raw API key fallback:

| Provider | OAuth Flow | Notes |
|----------|-----------|-------|
| Anthropic (Claude Pro/Max) | PKCE + deep link redirect | Scopes: `org:create_api_key user:profile user:inference` |
| OpenAI Codex (ChatGPT Plus/Pro) | OAuth + deep link redirect | Replaces localhost callback server |
| GitHub Copilot | Device code flow | User enters code at github.com/login/device |
| Google Gemini CLI | OAuth 2.0 + deep link redirect | Cloud Code Assist |
| Google Antigravity | OAuth 2.0 + deep link redirect | Gemini/Claude/GPT via Google Cloud |
| Any (raw API key) | Manual entry | Stored in Keychain, for Groq/Together/Ollama/etc. |

### Dependencies

- `expo-secure-store` — credential storage
- `expo-web-browser` — in-app browser for OAuth
- `expo-linking` — deep link handling
- `@mariozechner/pi-ai` (peer dependency)

---

## 5. @pi-ai-rn/skill-engine

Runs skill-defined JS tools in an isolated WebView sandbox.

### Skill Definition Format

```typescript
export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;   // Markdown instructions for the LLM
  tools: SkillTool[];
}

export interface SkillTool {
  name: string;
  description: string;
  parameters: JSONSchema;  // JSON Schema for tool parameters
  execute: string;         // JS function body — runs in WebView sandbox
}
```

Example (FPL Copilot tool):

```typescript
{
  name: 'sync_bootstrap',
  description: 'Fetch latest FPL player/team/gameweek data',
  parameters: {
    type: 'object',
    properties: {
      force: { type: 'boolean', description: 'Bypass freshness check' }
    }
  },
  execute: `async ({ force }) => {
    const res = await fetch('https://fantasy.premierleague.com/api/bootstrap-static/');
    const data = await res.json();
    await sqlite.exec('INSERT OR REPLACE INTO teams ...');
    return { synced: data.teams.length };
  }`
}
```

### Sandbox Architecture

```
┌─────────────────────┐     postMessage      ┌──────────────────────┐
│     React Native     │◄───────────────────►│   Hidden WebView      │
│                      │                      │                       │
│  SkillEngine class   │  ① tool call req     │  Skill JS executes    │
│  - loadSkill()       │  ─────────────►     │  in isolated context  │
│  - executeTool()     │                      │                       │
│  - unloadSkill()     │  ② bridge API calls  │  Bridged APIs:        │
│                      │  ◄─────────────      │  - fetch() → native   │
│  Bridge handlers:    │  ③ bridge response   │  - sqlite.exec()      │
│  - FetchProxy       │  ─────────────►     │  - sqlite.query()     │
│  - SqliteProxy      │                      │  - fs.read/write()    │
│  - FsProxy          │  ④ tool result       │                       │
│                      │  ◄─────────────      │                       │
└─────────────────────┘                      └──────────────────────┘
```

### Bridge APIs

APIs are proxied through native to enforce security and access platform capabilities:

| Bridge API | Why proxied |
|-----------|-------------|
| `fetch(url, opts)` | Avoid CORS restrictions, enforce domain allowlists |
| `sqlite.exec(sql)` | WebView has no SQLite; native `expo-sqlite` does |
| `sqlite.query(sql)` | Read-only queries, returns rows as JSON |
| `fs.read(path)` | Scoped to skill's data directory only |
| `fs.write(path, content)` | Scoped to skill's data directory only |

### Public API

```typescript
import { SkillEngine } from '@pi-ai-rn/skill-engine';

const engine = new SkillEngine();

// Load a skill — spins up a hidden WebView
await engine.loadSkill(fplCopilotSkill);

// Execute a tool — called when LLM returns a tool_call
const result = await engine.executeTool('fpl-copilot', 'sync_bootstrap', { force: true });

// Get system prompt to prepend to LLM messages
const prompt = engine.getSystemPrompt('fpl-copilot');

// Cleanup — destroys the WebView
await engine.unloadSkill('fpl-copilot');
```

### Security Boundaries

- Each skill gets its own WebView instance — skills cannot access each other
- SQLite databases are per-skill (e.g., `<app-data>/skills/fpl-copilot/fplcopilot.db`)
- `fetch` proxy can enforce domain allowlists per skill definition
- No access to app credentials, conversation data, or other skills' storage
- `fs` is scoped to the skill's own data directory

### Dependencies

- `react-native-webview` — sandbox runtime
- `expo-sqlite` — database access for bridge
- `expo-file-system` — file access for bridge

---

## 6. Mobile App

### Screen Structure

```
├── Home (skill cards)
│   └── Tap skill → New conversation with that skill
├── Chat (main interaction)
│   ├── Message list (markdown rendering)
│   ├── Input bar (text)
│   └── Streaming responses with tool call indicators
├── Conversations (history list)
│   └── Tap → Resume conversation
└── Settings
    ├── Providers (OAuth login/logout, API key entry)
    └── Skills (installed skills list)
```

### Conversation Flow

```
User opens app
  → Home screen shows "FPL Copilot" skill card
  → Tap → New conversation created in SQLite
  → Skill engine loads FPL Copilot (system prompt + tools)
  → User types message
  → App sends: system prompt + history + tool definitions → pi-ai
  → LLM streams response
  → If tool call: engine.executeTool() in sandbox → result back to LLM
  → Multi-step loops (maxSteps) until LLM produces final text
  → Message saved to SQLite
```

### Conversation SQLite Schema

```sql
CREATE TABLE conversations (
  id          TEXT PRIMARY KEY,
  skill_id    TEXT,            -- which skill, nullable for general chat
  title       TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  role            TEXT NOT NULL,  -- user, assistant, tool
  content         TEXT NOT NULL,  -- markdown text or JSON for tool results
  tool_calls      TEXT,           -- JSON array of tool calls (if assistant)
  created_at      TEXT NOT NULL
);
```

### UI Approach

- Minimal, clean design (similar to Claude mobile app)
- Component architecture supports incremental additions: model picker, conversation sidebar, attachments, voice input
- Markdown rendering for assistant messages
- Tool call execution shown as collapsible status indicators

### Key Dependencies

| Package | Purpose |
|---------|---------|
| `expo` + `expo-router` | App framework + navigation |
| `expo-sqlite` | Conversation storage + skill data |
| `expo-secure-store` | Credential storage |
| `expo-web-browser` | OAuth browser flows |
| `expo-linking` | Deep link callbacks |
| `react-native-webview` | Skill sandbox |
| `react-native-markdown-display` | Message rendering |
| `@mariozechner/pi-ai` | LLM communication |
| `@pi-ai-rn/auth` | Provider authentication |
| `@pi-ai-rn/skill-engine` | Skill execution |

---

## 7. FPL Copilot — Mobile Adaptation

Same skill, different runtime. The desktop version uses `curl` + `jq` + `sqlite3` CLI; the mobile version ports the logic to JS tools running in the WebView sandbox.

### Tool Mapping

| Desktop (sync.sh) | Mobile (JS in WebView) |
|---|---|
| `curl https://...api/bootstrap-static/` | `fetch('https://...api/bootstrap-static/')` |
| `jq '.teams[] \| [.id, .name, ...]'` | `data.teams.map(t => [t.id, t.name, ...])` |
| `sqlite3 ~/.fplcopilot/fplcopilot.db` | `sqlite.exec(...)` via bridge |
| `sync.sh bootstrap` | `sync_bootstrap` tool |
| `sync.sh fixtures` | `sync_fixtures` tool |
| `sync.sh player 328` | `sync_player` tool |

### Mobile Tools

| Tool | Description |
|------|-------------|
| `sync_bootstrap` | Fetch teams, gameweeks, players from FPL API |
| `sync_fixtures` | Fetch all fixtures |
| `sync_player` | Fetch single player's GW-by-GW history |
| `query` | Run read-only SQL against the FPL database |
| `squad_load` | Read a squad markdown file from skill storage |
| `squad_save` | Write/update a squad markdown file |
| `squad_list` | List all saved squad files |

### What Stays in the System Prompt

Analysis formulas, squad rules, decision frameworks — the LLM uses the `query` tool to run SQL from the system prompt instructions. Same approach as the desktop skill.

### On-Device Storage Layout

```
<app-data>/skills/fpl-copilot/
├── fplcopilot.db          -- SQLite (synced FPL data)
└── squads/
    ├── very-big-woods.md  -- user's squad
    └── daves-team.md      -- friend's squad
```

Same SQLite schema (`references/schema.sql`) and same squad markdown format (`references/squad.md`) as the desktop skill.

---

## 8. AI Provider Integration

### Supported Providers

All 5 OAuth providers from pi-mono, plus raw API key for any OpenAI-compatible endpoint:

- **Anthropic** — Claude 4.x (Claude Pro/Max subscription via OAuth)
- **OpenAI** — GPT-5 series (ChatGPT Plus/Pro subscription via OAuth)
- **GitHub Copilot** — via device code flow
- **Google Gemini** — via Google OAuth
- **Google Antigravity** — Gemini/Claude/GPT via Google Cloud
- **Any OpenAI-compatible** — Groq, Together, Ollama, etc. via raw API key

### LLM Communication

The app uses `@mariozechner/pi-ai` for all provider communication:
- Streaming responses
- Tool call / tool result round-trips
- Multi-step agent loops
- Model selection from authenticated provider's available models

### Reasoning Items Handling

When using OpenAI Responses API, models may return `reasoning` items. The app must:
- Filter out `reasoning` items before sending conversation history back
- Or ensure `reasoning` and `output` items stay paired

---

## 9. Testing Strategy

### Unit Tests

- **@pi-ai-rn/auth** — mock `expo-secure-store`, `expo-web-browser`; verify OAuth flows, token refresh, credential CRUD
- **@pi-ai-rn/skill-engine** — mock WebView postMessage; verify tool execution lifecycle, bridge API proxying, error handling, timeout/cleanup
- **Conversation layer** — SQLite CRUD, message ordering, search

### Integration Tests

- Skill engine + real WebView — load FPL Copilot, execute `sync_bootstrap` against live FPL API, verify data in SQLite
- Auth + pi-ai — full OAuth flow with a test provider, verify credentials resolve to working API key

### Manual Testing (v1)

- Full flow: open app → sign in with OpenAI/Anthropic → start FPL Copilot chat → sync data → ask for squad analysis → verify tool calls execute and responses stream
- Offline: open app with no network → cached conversations load, skill tools fail gracefully with error message
- Token expiry: let OAuth token expire → verify auto-refresh works transparently

### Test Tooling

- Jest + React Native Testing Library for unit/component tests
- Expo dev client for on-device integration testing
