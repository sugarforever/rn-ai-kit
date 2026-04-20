# Sessions persistence for rn-ai-kit

**Date:** 2026-04-20
**Status:** Design
**Package:** `@rn-ai-kit/sessions` (new)

## Context

The kit currently has two published packages (`@rn-ai-kit/auth`, `@rn-ai-kit/chatgpt-provider`) and an example app whose chat state lives in pure React `useState`. Every app kill loses the conversation. Adding persistence is the next piece needed before the example app can credibly stand as a developer showcase.

This spec defines a new package, `@rn-ai-kit/sessions`, that persists multi-turn conversations with pluggable storage.

## Goals

- Persist multiple named conversations ("sessions"), not just one rolling chat.
- Rehydrate sessions losslessly — if a session had a tool call, it shows up again on reload.
- Ship a working SQLite-backed store and a React hooks layer so consumers don't rewrite the load/append dance for each app.
- Keep the storage backend pluggable so tests, remote sync, or other native stores (MMKV, WatermelonDB) can substitute.

## Non-goals (v1)

- Cloud sync, export/import, full-text search over message bodies.
- Pagination of messages within a session. All messages for a session load at once.
- Regenerate-last-response UX. The store exposes `deleteMessage` so consumers can build it; the example app doesn't.
- Persisting partial assistant messages during streaming. Only finished turns are persisted.
- Auto-generated titles via LLM. A helper truncates the first user message; consumers who want LLM-based titling wire it themselves.

## Architecture

New package `@rn-ai-kit/sessions`. Peer deps: `react`, `expo-sqlite`. Runtime deps: none beyond those. Types import `UIMessage` / `UIMessagePart` from `ai`.

```
packages/sessions/src/
├── types.ts                  Session, PersistedMessage, SessionStore, errors
├── SqliteSessionStore.ts     default impl (expo-sqlite)
├── InMemorySessionStore.ts   testing impl, also public export
├── hooks/
│   ├── useSessions.ts        list + create + delete + rename
│   └── useSession.ts         one session's messages + appendMessage
├── SessionStoreProvider.tsx  React context carrying the store instance
├── message-mapping.ts        toUIMessage / fromUIMessage helpers
└── index.ts
```

Consumers instantiate the store once (typically at app root), pass it through `<SessionStoreProvider store={store}>`, and hooks read it from context. This keeps the store injectable for tests and swappable for consumers who bring their own backend.

**Assumed defaults:**

1. Store generates session and message IDs (UUID v4 via `expo-crypto.randomUUID()`). Callers may supply a message `id` to support idempotent retries; session IDs are always store-generated.
2. Messages persist only after the stream finishes. A crash mid-stream loses the partial assistant reply.
3. Titles default to `"New chat"`. Helper `titleFromFirstMessage(text)` truncates to ~50 chars.
4. All messages for a session load at once. No pagination in v1.
5. Single-process assumption. SQLite's default locking is sufficient for a mobile app.
6. Active-session tracking is the consumer's job.

## Data model

```typescript
import type { UIMessage, UIMessagePart } from 'ai';

export interface Session {
  id: string;
  title: string;
  providerId: string | null;
  modelId: string | null;
  createdAt: string;                  // ISO 8601
  updatedAt: string;                  // ISO 8601
  metadata: Record<string, unknown>;  // free-form extension bag
}

export interface PersistedMessage {
  id: string;
  sessionId: string;
  role: UIMessage['role'];            // 'user' | 'assistant' | 'system'
  parts: UIMessagePart[];             // AI SDK parts array, stored verbatim as JSON
  createdAt: string;                  // ISO 8601
}
```

**Rationale:**

- `providerId` / `modelId` are nullable because a session may exist before the first message. Set them via `updateSession` before the first `appendMessage`.
- `metadata` is the forward-compat seam. Folders, pin flags, user IDs — anything consumer-specific goes here without schema change.
- `PersistedMessage` peels `role` + `parts` off AI SDK's `UIMessage` and adds our `id`, `sessionId`, `createdAt`. This keeps the stored shape stable when AI SDK grows new top-level fields on `UIMessage` — we ignore them, round-tripping only the parts. `toUIMessage` / `fromUIMessage` helpers handle the translation.

## SessionStore interface

```typescript
export interface SessionStore {
  init(): Promise<void>;

  // Sessions
  listSessions(options?: { limit?: number; offset?: number }): Promise<Session[]>;
  getSession(id: string): Promise<Session | null>;
  createSession(
    input?: Partial<Pick<Session, 'title' | 'providerId' | 'modelId' | 'metadata'>>,
  ): Promise<Session>;
  updateSession(
    id: string,
    patch: Partial<Pick<Session, 'title' | 'providerId' | 'modelId' | 'metadata'>>,
  ): Promise<Session>;
  deleteSession(id: string): Promise<void>;

  // Messages
  listMessages(sessionId: string): Promise<PersistedMessage[]>;
  appendMessage(
    sessionId: string,
    input: Omit<PersistedMessage, 'id' | 'sessionId' | 'createdAt'> & { id?: string },
  ): Promise<PersistedMessage>;
  deleteMessage(id: string): Promise<void>;

  // Observability
  subscribe(
    event: 'sessions-changed' | 'messages-changed',
    listener: (payload: { sessionId?: string }) => void,
  ): () => void;
}
```

**Contract notes:**

- `init()` is explicit. Consumers call it once before use. SQLite impl runs migrations here; failures propagate so the app can surface them.
- `listSessions()` always orders by `updatedAt DESC`. No sort parameter — if a consumer wants a different order they sort the returned array.
- `appendMessage` bumps the parent session's `updatedAt` in the same transaction as the insert.
- `subscribe` returns an unsubscribe function. `messages-changed` events carry the `sessionId` of the affected session so listeners can filter.
- No bulk `appendMessages` in v1. Add if a real use case surfaces.

## SqliteSessionStore

**Schema (migration v1):**

```sql
CREATE TABLE IF NOT EXISTS sessions (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL DEFAULT 'New chat',
  provider_id  TEXT,
  model_id     TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  metadata     TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON sessions(updated_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role        TEXT NOT NULL,
  parts       TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_session_created ON messages(session_id, created_at);

CREATE TABLE IF NOT EXISTS schema_meta (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);
```

**Implementation notes:**

- Uses `expo-sqlite`'s async API (`openDatabaseAsync`, `execAsync`, `runAsync`, `getAllAsync`, `withTransactionAsync`).
- DB filename: `rn-ai-kit-sessions.db`, located in Expo's default SQLite directory (inside the app sandbox, backed up by iOS iCloud / Android auto-backup by default).
- `init()` opens the DB, reads `schema_meta.version`, runs pending migrations in order, writes the new version, runs `PRAGMA foreign_keys = ON`.
- Migrations are functions in an array indexed by target version. Adding a migration means appending to the array and bumping a constant.
- IDs: `Crypto.randomUUID()` from `expo-crypto`.
- `appendMessage` wraps the message insert and the `sessions.updated_at` bump in a single `withTransactionAsync`.
- `ON DELETE CASCADE` means `deleteSession` wipes messages automatically.
- `parts` and `metadata` are TEXT columns holding JSON. Parsed on read. No `json_extract` queries in v1.
- `subscribe` is in-memory pub/sub (a `Map<event, Set<listener>>`). Emits fire synchronously after the SQL write resolves. Two `SqliteSessionStore` instances against the same DB file will not see each other's events — single-instance-per-app is a documented constraint.

## InMemorySessionStore

Ships as a public export for consumer tests and for the package's own hook tests. Same interface as `SqliteSessionStore`, Map-backed. `init()` is a no-op. Same event pub/sub semantics.

## Hooks API

```typescript
type SessionCreateInput = Partial<Pick<Session, 'title' | 'providerId' | 'modelId' | 'metadata'>>;

export function useSessions(): {
  sessions: Session[];
  isLoading: boolean;
  error: Error | null;
  createSession: (input?: SessionCreateInput) => Promise<Session>;
  deleteSession: (id: string) => Promise<void>;
  renameSession: (id: string, title: string) => Promise<void>;  // implemented via store.updateSession(id, {title})
  refresh: () => Promise<void>;
};

export function useSession(sessionId: string | null): {
  session: Session | null;
  messages: PersistedMessage[];
  isLoading: boolean;
  error: Error | null;
  appendMessage: (
    input: Omit<PersistedMessage, 'id' | 'sessionId' | 'createdAt'>,
  ) => Promise<PersistedMessage>;
  updateSession: (patch: Partial<Session>) => Promise<void>;
};
```

**Behavior:**

- Both hooks read the store from `SessionStoreProvider` context and subscribe on mount, unsubscribe on unmount.
- `useSessions` listens for `sessions-changed`.
- `useSession` listens for `messages-changed` filtered by its `sessionId`, and for `sessions-changed` (to catch renames on its session).
- `useSession(null)` returns `{session: null, messages: [], isLoading: false}`. Lets the chat screen render before a session is chosen.
- No optimistic updates in v1. Mutations await the store write; the subscribe event drives the refetch. UI lag is one SQLite round-trip (sub-millisecond locally).
- `refresh()` on `useSessions` is an explicit escape hatch. No automatic refetch on focus or timer.

## Error handling

Fail loudly at system boundaries; return nullish at semantic boundaries.

- `getSession(unknownId)` → `null`.
- `listMessages(unknownSessionId)` → `[]`.
- `appendMessage(unknownSessionId, ...)` → throws `SessionNotFoundError`.
- `deleteSession(unknownId)` → resolves (idempotent).
- `init()` failures propagate. No silent half-migrated state.
- SQLite errors propagate unwrapped so consumers can inspect the original.
- JSON parse failure on a `parts` row → throws `CorruptMessageError` with `{ messageId, cause }`.

**Exported error classes:**

```typescript
export class SessionNotFoundError extends Error { sessionId: string }
export class CorruptMessageError extends Error { messageId: string; cause: unknown }
```

Hooks set `error` state rather than throwing from the hook. Mutation functions returned from hooks do throw, so callers can `try/catch` and show their own feedback.

## Testing

- **Contract tests** run against both `InMemorySessionStore` and `SqliteSessionStore`, exercising every interface method. These cover behavior: create → list, append → listMessages, delete cascade, subscribe fires on mutation.
- **SQLite-specific tests** (migrations, foreign key enforcement, transactions) run against `better-sqlite3` via a thin adapter that matches `expo-sqlite`'s async surface. Lives in `__tests__/sqlite-adapter.ts`.
- **Hook tests** use `@testing-library/react-native` with `InMemorySessionStore` wired into `SessionStoreProvider`.
- Tests run via `cd packages/sessions && npx jest` (matches the existing per-package jest pattern).

## Example app integration

**New files:**
- `src/lib/sessionStore.ts` — instantiate `SqliteSessionStore`, export singleton, call `init()` at module load.
- `src/app/sessions.tsx` — session-list view using `useSessions()`. Tap to navigate to `/?sessionId=<id>`; swipe-to-delete; long-press to rename (native `Alert.prompt`).

**Changed files:**
- `src/app/_layout.tsx` — wrap tree in `<SessionStoreProvider>`. Add a header button on the chat screen linking to `/sessions`.
- `src/app/index.tsx` — read `sessionId` query param, call `useSession(sessionId)`, replace local `useState<ChatMessage[]>` with `messages` + `appendMessage`. On first send without a session, call `createSession({providerId, modelId})` and update the route. Persist the user turn before streaming; persist the assistant turn on `onDone`.
- `src/lib/chat.ts` — reshape `onDone` to pass the finished assistant's `UIMessagePart[]` instead of (or alongside) the flattened text, so the chat screen can persist full parts.

## Open questions

None blocking v1. Deferred to future specs if real usage demands:

- Export / import of sessions as JSON files.
- Remote sync backend (HTTP + conflict resolution).
- Message-level search.
- Session archival / soft-delete.
