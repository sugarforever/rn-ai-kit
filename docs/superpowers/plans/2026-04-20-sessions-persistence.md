# Sessions Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@rn-ai-kit/sessions` — a pluggable session persistence package — and wire it into the example app so conversations survive app kills.

**Architecture:** New workspace package with a `SessionStore` interface, two implementations (SQLite default + in-memory for tests), a React context provider, and two hooks (`useSessions`, `useSession`). Storage shape matches the spec: `Session` rows + `PersistedMessage` rows whose `parts` column holds AI SDK `UIMessagePart[]` as JSON.

**Tech Stack:** TypeScript, `expo-sqlite` (async API), `expo-crypto`, React 19 hooks, Jest with ts-jest, `better-sqlite3` as the `expo-sqlite` mock for node-env tests, `@testing-library/react` + jsdom for hook tests.

**Spec reference:** `docs/superpowers/specs/2026-04-20-sessions-persistence-design.md`

**Spec deviation:** The spec says hook tests use `@testing-library/react-native`. Hooks in this package contain zero React Native primitives — they're pure React (`useContext`/`useEffect`/`useState`). We use `@testing-library/react` + `jest-environment-jsdom` instead. This avoids wiring the Metro/Expo babel preset into the package's jest config just to import a renderer that renders nothing visible.

**Pre-flight:** Create a worktree before starting. From repo root:

```bash
git worktree add .worktrees/sessions -b feature/sessions
cd .worktrees/sessions
npm install
```

All implementation work happens inside the worktree.

---

## File Structure

```
packages/sessions/
├── package.json                      # workspace package manifest
├── tsconfig.json                     # extends root
├── __mocks__/
│   ├── expo-crypto.ts                # Node crypto shim (copy of auth/'s)
│   └── expo-sqlite.ts                # better-sqlite3 wrapped in expo's async API
└── src/
    ├── types.ts                      # Session, PersistedMessage, SessionStore, errors
    ├── pubsub.ts                     # tiny typed event emitter (internal)
    ├── message-mapping.ts            # toUIMessage / fromUIMessage / titleFromFirstMessage
    ├── InMemorySessionStore.ts       # Map-backed reference impl, public export
    ├── SqliteSessionStore.ts         # expo-sqlite default impl
    ├── SessionStoreProvider.tsx      # React context carrying the store
    ├── hooks/
    │   ├── useSessions.ts            # list + create + delete + rename
    │   └── useSession.ts             # one session's messages + appendMessage
    └── index.ts                      # public barrel
packages/sessions/__tests__/
├── contractTests.ts                  # shared suite, runs against any SessionStore
├── message-mapping.test.ts
├── pubsub.test.ts
├── InMemorySessionStore.test.ts      # applies contractTests
├── SqliteSessionStore.test.ts        # applies contractTests + SQLite-specific
├── useSessions.test.tsx              # @jest-environment jsdom
└── useSession.test.tsx               # @jest-environment jsdom
apps/example/src/
├── lib/sessionStore.ts               # SqliteSessionStore singleton
├── app/_layout.tsx                   # wrap with SessionStoreProvider (modify)
├── app/index.tsx                     # useSession, persist turns (modify)
├── app/sessions.tsx                  # session list screen (create)
└── lib/chat.ts                       # reshape onDone to pass parts (modify)
```

---

## Task 1: Package scaffolding

**Files:**
- Create: `packages/sessions/package.json`
- Create: `packages/sessions/tsconfig.json`
- Modify: `tsconfig.json` (root) — add paths entry

- [ ] **Step 1: Create the package manifest**

Write `packages/sessions/package.json`:

```json
{
  "name": "@rn-ai-kit/sessions",
  "version": "0.1.0",
  "private": true,
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "test": "jest",
    "typecheck": "tsc --noEmit"
  },
  "peerDependencies": {
    "ai": "^4.0.0",
    "expo-crypto": "~55.0.14",
    "expo-sqlite": "~15.0.0",
    "react": ">=18.0.0"
  },
  "devDependencies": {
    "@testing-library/react": "^16.0.0",
    "@types/better-sqlite3": "^7.6.0",
    "@types/jest": "^29.0.0",
    "@types/react": "^19.0.0",
    "better-sqlite3": "^11.0.0",
    "jest": "^29.0.0",
    "jest-environment-jsdom": "^29.0.0",
    "react": "^19.2.5",
    "react-dom": "^19.2.5",
    "ts-jest": "^29.0.0",
    "typescript": "^5.4.0"
  },
  "jest": {
    "preset": "ts-jest",
    "testEnvironment": "node",
    "roots": ["<rootDir>/__tests__"],
    "moduleNameMapper": {
      "^expo-crypto$": "<rootDir>/__mocks__/expo-crypto.ts",
      "^expo-sqlite$": "<rootDir>/__mocks__/expo-sqlite.ts"
    }
  }
}
```

- [ ] **Step 2: Create the TypeScript config**

Write `packages/sessions/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": ".",
    "typeRoots": ["../../node_modules/@types"]
  },
  "include": ["src", "__tests__"]
}
```

- [ ] **Step 3: Register the package path in the root tsconfig**

Open `tsconfig.json` at the repo root. Inside `compilerOptions.paths`, add the sessions entry. The file should look like:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "baseUrl": ".",
    "paths": {
      "@rn-ai-kit/auth": ["packages/auth/src"],
      "@rn-ai-kit/chatgpt-provider": ["packages/chatgpt-provider/src"],
      "@rn-ai-kit/sessions": ["packages/sessions/src"]
    }
  },
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 4: Create the empty src directory with a stub index**

Write `packages/sessions/src/index.ts`:

```typescript
// Public surface populated in later tasks.
export {};
```

- [ ] **Step 5: Install dependencies**

Run: `npm install` from the repo root.

Expected: completes without error; `packages/sessions/node_modules` is populated or (more likely in a workspace) deps hoist to root.

- [ ] **Step 6: Verify typecheck passes**

Run: `cd packages/sessions && npx tsc --noEmit`

Expected: no output, exit code 0.

- [ ] **Step 7: Commit**

```bash
git add packages/sessions tsconfig.json package-lock.json
git commit -m "Scaffold @rn-ai-kit/sessions package"
```

---

## Task 2: Types module

**Files:**
- Create: `packages/sessions/src/types.ts`

- [ ] **Step 1: Write the types file**

Write `packages/sessions/src/types.ts`:

```typescript
import type { UIMessage } from 'ai';

type UIMessagePart = UIMessage['parts'][number];

export interface Session {
  id: string;
  title: string;
  providerId: string | null;
  modelId: string | null;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
}

export interface PersistedMessage {
  id: string;
  sessionId: string;
  role: UIMessage['role'];
  parts: UIMessagePart[];
  createdAt: string;
}

export type SessionCreateInput = Partial<
  Pick<Session, 'title' | 'providerId' | 'modelId' | 'metadata'>
>;

export type SessionUpdateInput = Partial<
  Pick<Session, 'title' | 'providerId' | 'modelId' | 'metadata'>
>;

export type AppendMessageInput =
  Omit<PersistedMessage, 'id' | 'sessionId' | 'createdAt'> & { id?: string };

export type StoreEvent = 'sessions-changed' | 'messages-changed';

export interface StoreEventPayload {
  sessionId?: string;
}

export type StoreEventListener = (payload: StoreEventPayload) => void;

export interface SessionStore {
  init(): Promise<void>;
  listSessions(options?: { limit?: number; offset?: number }): Promise<Session[]>;
  getSession(id: string): Promise<Session | null>;
  createSession(input?: SessionCreateInput): Promise<Session>;
  updateSession(id: string, patch: SessionUpdateInput): Promise<Session>;
  deleteSession(id: string): Promise<void>;
  listMessages(sessionId: string): Promise<PersistedMessage[]>;
  appendMessage(sessionId: string, input: AppendMessageInput): Promise<PersistedMessage>;
  deleteMessage(id: string): Promise<void>;
  subscribe(event: StoreEvent, listener: StoreEventListener): () => void;
}

export class SessionNotFoundError extends Error {
  readonly sessionId: string;
  constructor(sessionId: string) {
    super(`Session not found: ${sessionId}`);
    this.name = 'SessionNotFoundError';
    this.sessionId = sessionId;
  }
}

export class CorruptMessageError extends Error {
  readonly messageId: string;
  readonly cause: unknown;
  constructor(messageId: string, cause: unknown) {
    super(`Corrupt message: ${messageId}`);
    this.name = 'CorruptMessageError';
    this.messageId = messageId;
    this.cause = cause;
  }
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd packages/sessions && npx tsc --noEmit`

Expected: no output, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add packages/sessions/src/types.ts
git commit -m "Add SessionStore types and error classes"
```

---

## Task 3: message-mapping helpers

**Files:**
- Create: `packages/sessions/src/message-mapping.ts`
- Create: `packages/sessions/__tests__/message-mapping.test.ts`

- [ ] **Step 1: Write the failing test file**

Write `packages/sessions/__tests__/message-mapping.test.ts`:

```typescript
import type { UIMessage } from 'ai';
import type { PersistedMessage } from '../src/types';
import {
  toUIMessage,
  fromUIMessage,
  titleFromFirstMessage,
} from '../src/message-mapping';

describe('toUIMessage', () => {
  it('builds a UIMessage with the persisted id, role, and parts', () => {
    const persisted: PersistedMessage = {
      id: 'msg-1',
      sessionId: 'sess-1',
      role: 'user',
      parts: [{ type: 'text', text: 'hello' }],
      createdAt: '2026-04-20T10:00:00.000Z',
    };
    const ui = toUIMessage(persisted);
    expect(ui).toEqual({
      id: 'msg-1',
      role: 'user',
      parts: [{ type: 'text', text: 'hello' }],
    });
  });
});

describe('fromUIMessage', () => {
  it('strips id and returns role + parts only', () => {
    const ui: UIMessage = {
      id: 'tmp',
      role: 'assistant',
      parts: [{ type: 'text', text: 'hi' }],
    };
    const result = fromUIMessage(ui);
    expect(result).toEqual({
      role: 'assistant',
      parts: [{ type: 'text', text: 'hi' }],
    });
  });
});

describe('titleFromFirstMessage', () => {
  it('returns the text verbatim when under 50 chars', () => {
    expect(titleFromFirstMessage('Short question')).toBe('Short question');
  });

  it('truncates at 47 chars + ellipsis when over 50', () => {
    const long = 'a'.repeat(100);
    const title = titleFromFirstMessage(long);
    expect(title).toHaveLength(50);
    expect(title.endsWith('...')).toBe(true);
  });

  it('collapses newlines and excess whitespace to single spaces', () => {
    expect(titleFromFirstMessage('hello\n\n  world')).toBe('hello world');
  });

  it('returns "New chat" for empty or whitespace-only input', () => {
    expect(titleFromFirstMessage('')).toBe('New chat');
    expect(titleFromFirstMessage('   \n  ')).toBe('New chat');
  });
});
```

- [ ] **Step 2: Run the test — verify it fails**

Run: `cd packages/sessions && npx jest message-mapping`

Expected: FAIL — "Cannot find module '../src/message-mapping'".

- [ ] **Step 3: Write the implementation**

Write `packages/sessions/src/message-mapping.ts`:

```typescript
import type { UIMessage } from 'ai';
import type { PersistedMessage, AppendMessageInput } from './types';

export function toUIMessage(persisted: PersistedMessage): UIMessage {
  return {
    id: persisted.id,
    role: persisted.role,
    parts: persisted.parts,
  } as UIMessage;
}

export function fromUIMessage(
  message: UIMessage,
): Pick<AppendMessageInput, 'role' | 'parts'> {
  return {
    role: message.role,
    parts: message.parts,
  };
}

export function titleFromFirstMessage(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (!collapsed) return 'New chat';
  if (collapsed.length <= 50) return collapsed;
  return collapsed.slice(0, 47) + '...';
}
```

- [ ] **Step 4: Run the tests — verify they pass**

Run: `cd packages/sessions && npx jest message-mapping`

Expected: PASS — 4 tests (one describe has 1 test, another has 1, last has 4 = 6 tests total). If Jest reports a different count, ensure all `it` blocks ran.

- [ ] **Step 5: Commit**

```bash
git add packages/sessions/src/message-mapping.ts packages/sessions/__tests__/message-mapping.test.ts
git commit -m "Add message-mapping helpers (toUIMessage, fromUIMessage, titleFromFirstMessage)"
```

---

## Task 4: Internal pubsub

**Files:**
- Create: `packages/sessions/src/pubsub.ts`
- Create: `packages/sessions/__tests__/pubsub.test.ts`

This is the internal event emitter used by both store implementations to back `subscribe()`. Not exported from the package index.

- [ ] **Step 1: Write the failing test**

Write `packages/sessions/__tests__/pubsub.test.ts`:

```typescript
import { PubSub } from '../src/pubsub';
import type { StoreEvent, StoreEventPayload } from '../src/types';

describe('PubSub', () => {
  it('delivers events to subscribed listeners', () => {
    const pubsub = new PubSub();
    const received: StoreEventPayload[] = [];
    pubsub.subscribe('sessions-changed', (payload) => received.push(payload));
    pubsub.emit('sessions-changed', {});
    expect(received).toEqual([{}]);
  });

  it('filters by event name', () => {
    const pubsub = new PubSub();
    const received: StoreEventPayload[] = [];
    pubsub.subscribe('messages-changed', (p) => received.push(p));
    pubsub.emit('sessions-changed', {});
    expect(received).toEqual([]);
  });

  it('returns an unsubscribe function', () => {
    const pubsub = new PubSub();
    let count = 0;
    const unsub = pubsub.subscribe('sessions-changed', () => { count++; });
    pubsub.emit('sessions-changed', {});
    unsub();
    pubsub.emit('sessions-changed', {});
    expect(count).toBe(1);
  });

  it('passes the payload to listeners', () => {
    const pubsub = new PubSub();
    const received: StoreEventPayload[] = [];
    pubsub.subscribe('messages-changed', (p) => received.push(p));
    pubsub.emit('messages-changed', { sessionId: 'abc' });
    expect(received).toEqual([{ sessionId: 'abc' }]);
  });

  it('supports multiple listeners on the same event', () => {
    const pubsub = new PubSub();
    let a = 0;
    let b = 0;
    pubsub.subscribe('sessions-changed', () => { a++; });
    pubsub.subscribe('sessions-changed', () => { b++; });
    pubsub.emit('sessions-changed', {});
    expect(a).toBe(1);
    expect(b).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test — verify it fails**

Run: `cd packages/sessions && npx jest pubsub`

Expected: FAIL — "Cannot find module '../src/pubsub'".

- [ ] **Step 3: Write the implementation**

Write `packages/sessions/src/pubsub.ts`:

```typescript
import type { StoreEvent, StoreEventListener, StoreEventPayload } from './types';

export class PubSub {
  private listeners = new Map<StoreEvent, Set<StoreEventListener>>();

  subscribe(event: StoreEvent, listener: StoreEventListener): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);
    return () => {
      set!.delete(listener);
    };
  }

  emit(event: StoreEvent, payload: StoreEventPayload): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const listener of set) listener(payload);
  }
}
```

- [ ] **Step 4: Run the tests — verify they pass**

Run: `cd packages/sessions && npx jest pubsub`

Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/sessions/src/pubsub.ts packages/sessions/__tests__/pubsub.test.ts
git commit -m "Add internal PubSub for store events"
```

---

## Task 5: InMemorySessionStore

**Files:**
- Create: `packages/sessions/__mocks__/expo-crypto.ts`
- Create: `packages/sessions/src/InMemorySessionStore.ts`
- Create: `packages/sessions/__tests__/contractTests.ts`
- Create: `packages/sessions/__tests__/InMemorySessionStore.test.ts`

Two things happen in this task: the reusable contract-test suite is written, and the in-memory store is implemented and validated against it.

- [ ] **Step 1: Add the expo-crypto mock (copy of auth/'s)**

Write `packages/sessions/__mocks__/expo-crypto.ts`:

```typescript
const nodeCrypto = require('crypto');

module.exports = {
  getRandomBytes: jest.fn((size: number): Uint8Array => {
    return new Uint8Array(nodeCrypto.randomBytes(size));
  }),
  randomUUID: jest.fn((): string => nodeCrypto.randomUUID()),
  digestStringAsync: jest.fn(async (_algo: string, data: string): Promise<string> => {
    return nodeCrypto.createHash('sha256').update(data).digest('hex');
  }),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
};
```

- [ ] **Step 2: Write the shared contract test suite**

Write `packages/sessions/__tests__/contractTests.ts`:

```typescript
import type { SessionStore } from '../src/types';
import { SessionNotFoundError } from '../src/types';

export function runContractTests(
  label: string,
  makeStore: () => Promise<SessionStore>,
) {
  describe(`SessionStore contract: ${label}`, () => {
    let store: SessionStore;

    beforeEach(async () => {
      store = await makeStore();
    });

    describe('sessions', () => {
      it('createSession returns a session with id, timestamps, and defaults', async () => {
        const s = await store.createSession();
        expect(s.id).toBeTruthy();
        expect(s.title).toBe('New chat');
        expect(s.providerId).toBeNull();
        expect(s.modelId).toBeNull();
        expect(s.metadata).toEqual({});
        expect(new Date(s.createdAt).toString()).not.toBe('Invalid Date');
        expect(s.createdAt).toBe(s.updatedAt);
      });

      it('createSession accepts overrides', async () => {
        const s = await store.createSession({
          title: 'Planning session',
          providerId: 'anthropic',
          modelId: 'claude-sonnet-4-6',
          metadata: { pinned: true },
        });
        expect(s.title).toBe('Planning session');
        expect(s.providerId).toBe('anthropic');
        expect(s.modelId).toBe('claude-sonnet-4-6');
        expect(s.metadata).toEqual({ pinned: true });
      });

      it('getSession returns null for unknown ids', async () => {
        expect(await store.getSession('nope')).toBeNull();
      });

      it('getSession returns the session by id', async () => {
        const created = await store.createSession({ title: 'T' });
        const fetched = await store.getSession(created.id);
        expect(fetched).toEqual(created);
      });

      it('listSessions orders by updatedAt DESC', async () => {
        const a = await store.createSession({ title: 'A' });
        await new Promise((r) => setTimeout(r, 5));
        const b = await store.createSession({ title: 'B' });
        const list = await store.listSessions();
        expect(list.map((s) => s.id)).toEqual([b.id, a.id]);
      });

      it('updateSession patches fields and bumps updatedAt', async () => {
        const s = await store.createSession({ title: 'Old' });
        const original = s.updatedAt;
        await new Promise((r) => setTimeout(r, 5));
        const updated = await store.updateSession(s.id, { title: 'New' });
        expect(updated.title).toBe('New');
        expect(updated.updatedAt > original).toBe(true);
      });

      it('updateSession throws SessionNotFoundError for unknown id', async () => {
        await expect(store.updateSession('nope', { title: 'x' })).rejects.toBeInstanceOf(
          SessionNotFoundError,
        );
      });

      it('deleteSession is idempotent on unknown ids', async () => {
        await expect(store.deleteSession('nope')).resolves.toBeUndefined();
      });

      it('deleteSession removes the session from listSessions', async () => {
        const s = await store.createSession();
        await store.deleteSession(s.id);
        const list = await store.listSessions();
        expect(list.find((x) => x.id === s.id)).toBeUndefined();
      });
    });

    describe('messages', () => {
      it('listMessages returns [] for unknown sessionId', async () => {
        expect(await store.listMessages('nope')).toEqual([]);
      });

      it('appendMessage returns persisted message with id and createdAt', async () => {
        const s = await store.createSession();
        const msg = await store.appendMessage(s.id, {
          role: 'user',
          parts: [{ type: 'text', text: 'hi' }],
        });
        expect(msg.id).toBeTruthy();
        expect(msg.sessionId).toBe(s.id);
        expect(msg.role).toBe('user');
        expect(msg.parts).toEqual([{ type: 'text', text: 'hi' }]);
        expect(new Date(msg.createdAt).toString()).not.toBe('Invalid Date');
      });

      it('appendMessage respects a caller-supplied id', async () => {
        const s = await store.createSession();
        const msg = await store.appendMessage(s.id, {
          id: 'caller-chosen-id',
          role: 'user',
          parts: [{ type: 'text', text: 'hi' }],
        });
        expect(msg.id).toBe('caller-chosen-id');
      });

      it('appendMessage throws SessionNotFoundError for unknown sessionId', async () => {
        await expect(
          store.appendMessage('nope', { role: 'user', parts: [{ type: 'text', text: 'x' }] }),
        ).rejects.toBeInstanceOf(SessionNotFoundError);
      });

      it('appendMessage bumps the parent session updatedAt', async () => {
        const s = await store.createSession();
        const before = s.updatedAt;
        await new Promise((r) => setTimeout(r, 5));
        await store.appendMessage(s.id, {
          role: 'user',
          parts: [{ type: 'text', text: 'hi' }],
        });
        const after = await store.getSession(s.id);
        expect(after!.updatedAt > before).toBe(true);
      });

      it('listMessages returns messages in insertion order', async () => {
        const s = await store.createSession();
        const m1 = await store.appendMessage(s.id, {
          role: 'user', parts: [{ type: 'text', text: 'a' }],
        });
        const m2 = await store.appendMessage(s.id, {
          role: 'assistant', parts: [{ type: 'text', text: 'b' }],
        });
        const list = await store.listMessages(s.id);
        expect(list.map((m) => m.id)).toEqual([m1.id, m2.id]);
      });

      it('deleteSession cascades to messages', async () => {
        const s = await store.createSession();
        await store.appendMessage(s.id, {
          role: 'user', parts: [{ type: 'text', text: 'a' }],
        });
        await store.deleteSession(s.id);
        expect(await store.listMessages(s.id)).toEqual([]);
      });

      it('deleteMessage removes a single message', async () => {
        const s = await store.createSession();
        const m1 = await store.appendMessage(s.id, {
          role: 'user', parts: [{ type: 'text', text: 'a' }],
        });
        const m2 = await store.appendMessage(s.id, {
          role: 'assistant', parts: [{ type: 'text', text: 'b' }],
        });
        await store.deleteMessage(m1.id);
        const list = await store.listMessages(s.id);
        expect(list.map((m) => m.id)).toEqual([m2.id]);
      });
    });

    describe('subscribe', () => {
      it('emits sessions-changed on create', async () => {
        const received: unknown[] = [];
        store.subscribe('sessions-changed', (p) => received.push(p));
        await store.createSession();
        expect(received.length).toBe(1);
      });

      it('emits sessions-changed on update and delete', async () => {
        const s = await store.createSession();
        const received: unknown[] = [];
        store.subscribe('sessions-changed', (p) => received.push(p));
        await store.updateSession(s.id, { title: 'x' });
        await store.deleteSession(s.id);
        expect(received.length).toBe(2);
      });

      it('emits messages-changed with sessionId on append', async () => {
        const s = await store.createSession();
        const received: Array<{ sessionId?: string }> = [];
        store.subscribe('messages-changed', (p) => received.push(p));
        await store.appendMessage(s.id, {
          role: 'user', parts: [{ type: 'text', text: 'hi' }],
        });
        expect(received).toEqual([{ sessionId: s.id }]);
      });

      it('unsubscribe stops delivery', async () => {
        const received: unknown[] = [];
        const unsub = store.subscribe('sessions-changed', (p) => received.push(p));
        await store.createSession();
        unsub();
        await store.createSession();
        expect(received.length).toBe(1);
      });
    });
  });
}
```

- [ ] **Step 3: Write the InMemorySessionStore test file**

Write `packages/sessions/__tests__/InMemorySessionStore.test.ts`:

```typescript
import { InMemorySessionStore } from '../src/InMemorySessionStore';
import { runContractTests } from './contractTests';

runContractTests('InMemorySessionStore', async () => {
  const store = new InMemorySessionStore();
  await store.init();
  return store;
});
```

- [ ] **Step 4: Run tests — verify they fail**

Run: `cd packages/sessions && npx jest InMemorySessionStore`

Expected: FAIL — "Cannot find module '../src/InMemorySessionStore'".

- [ ] **Step 5: Implement InMemorySessionStore**

Write `packages/sessions/src/InMemorySessionStore.ts`:

```typescript
import * as Crypto from 'expo-crypto';
import { PubSub } from './pubsub';
import {
  type AppendMessageInput,
  type PersistedMessage,
  type Session,
  type SessionCreateInput,
  type SessionStore,
  type SessionUpdateInput,
  type StoreEvent,
  type StoreEventListener,
  SessionNotFoundError,
} from './types';

export class InMemorySessionStore implements SessionStore {
  private sessions = new Map<string, Session>();
  private messagesBySession = new Map<string, PersistedMessage[]>();
  private pubsub = new PubSub();

  async init(): Promise<void> {
    // no-op
  }

  async listSessions(
    options: { limit?: number; offset?: number } = {},
  ): Promise<Session[]> {
    const all = Array.from(this.sessions.values()).sort((a, b) =>
      a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0,
    );
    const offset = options.offset ?? 0;
    const limit = options.limit ?? all.length;
    return all.slice(offset, offset + limit);
  }

  async getSession(id: string): Promise<Session | null> {
    return this.sessions.get(id) ?? null;
  }

  async createSession(input: SessionCreateInput = {}): Promise<Session> {
    const now = new Date().toISOString();
    const session: Session = {
      id: Crypto.randomUUID(),
      title: input.title ?? 'New chat',
      providerId: input.providerId ?? null,
      modelId: input.modelId ?? null,
      createdAt: now,
      updatedAt: now,
      metadata: input.metadata ?? {},
    };
    this.sessions.set(session.id, session);
    this.messagesBySession.set(session.id, []);
    this.pubsub.emit('sessions-changed', {});
    return session;
  }

  async updateSession(id: string, patch: SessionUpdateInput): Promise<Session> {
    const current = this.sessions.get(id);
    if (!current) throw new SessionNotFoundError(id);
    const updated: Session = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.sessions.set(id, updated);
    this.pubsub.emit('sessions-changed', {});
    return updated;
  }

  async deleteSession(id: string): Promise<void> {
    if (!this.sessions.has(id)) return;
    this.sessions.delete(id);
    this.messagesBySession.delete(id);
    this.pubsub.emit('sessions-changed', {});
  }

  async listMessages(sessionId: string): Promise<PersistedMessage[]> {
    return [...(this.messagesBySession.get(sessionId) ?? [])];
  }

  async appendMessage(
    sessionId: string,
    input: AppendMessageInput,
  ): Promise<PersistedMessage> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new SessionNotFoundError(sessionId);
    const now = new Date().toISOString();
    const message: PersistedMessage = {
      id: input.id ?? Crypto.randomUUID(),
      sessionId,
      role: input.role,
      parts: input.parts,
      createdAt: now,
    };
    this.messagesBySession.get(sessionId)!.push(message);
    this.sessions.set(sessionId, { ...session, updatedAt: now });
    this.pubsub.emit('messages-changed', { sessionId });
    return message;
  }

  async deleteMessage(id: string): Promise<void> {
    for (const [sessionId, list] of this.messagesBySession) {
      const idx = list.findIndex((m) => m.id === id);
      if (idx >= 0) {
        list.splice(idx, 1);
        this.pubsub.emit('messages-changed', { sessionId });
        return;
      }
    }
  }

  subscribe(event: StoreEvent, listener: StoreEventListener): () => void {
    return this.pubsub.subscribe(event, listener);
  }
}
```

- [ ] **Step 6: Run tests — verify they pass**

Run: `cd packages/sessions && npx jest InMemorySessionStore`

Expected: PASS — 20+ contract tests.

- [ ] **Step 7: Commit**

```bash
git add packages/sessions/__mocks__/expo-crypto.ts packages/sessions/src/InMemorySessionStore.ts packages/sessions/__tests__/contractTests.ts packages/sessions/__tests__/InMemorySessionStore.test.ts
git commit -m "Add InMemorySessionStore with shared contract tests"
```

---

## Task 6: expo-sqlite mock

**Files:**
- Create: `packages/sessions/__mocks__/expo-sqlite.ts`

The SQLite implementation calls `expo-sqlite`'s async API. Jest runs in Node, so we shim `expo-sqlite` with `better-sqlite3` wrapped in the async surface we use (`openDatabaseAsync`, `execAsync`, `runAsync`, `getAllAsync`, `getFirstAsync`, `withTransactionAsync`).

- [ ] **Step 1: Write the mock**

Write `packages/sessions/__mocks__/expo-sqlite.ts`:

```typescript
import BetterSqlite3 from 'better-sqlite3';

class SQLiteDatabase {
  constructor(private db: BetterSqlite3.Database) {}

  async execAsync(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  async runAsync(
    sql: string,
    ...params: unknown[]
  ): Promise<{ lastInsertRowId: number; changes: number }> {
    const stmt = this.db.prepare(sql);
    const info = stmt.run(...flattenParams(params));
    return {
      lastInsertRowId: Number(info.lastInsertRowid),
      changes: info.changes,
    };
  }

  async getAllAsync<T = unknown>(sql: string, ...params: unknown[]): Promise<T[]> {
    const stmt = this.db.prepare(sql);
    return stmt.all(...flattenParams(params)) as T[];
  }

  async getFirstAsync<T = unknown>(sql: string, ...params: unknown[]): Promise<T | null> {
    const stmt = this.db.prepare(sql);
    const row = stmt.get(...flattenParams(params));
    return (row ?? null) as T | null;
  }

  async withTransactionAsync(fn: () => Promise<void>): Promise<void> {
    this.db.exec('BEGIN');
    try {
      await fn();
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  async closeAsync(): Promise<void> {
    this.db.close();
  }
}

function flattenParams(params: unknown[]): unknown[] {
  if (params.length === 1 && Array.isArray(params[0])) return params[0] as unknown[];
  return params;
}

export async function openDatabaseAsync(_name: string): Promise<SQLiteDatabase> {
  const db = new BetterSqlite3(':memory:');
  db.pragma('foreign_keys = ON');
  return new SQLiteDatabase(db);
}

export type { SQLiteDatabase };
```

- [ ] **Step 2: Verify no tests break**

Run: `cd packages/sessions && npx jest`

Expected: PASS — same tests as before (no sqlite tests yet).

- [ ] **Step 3: Commit**

```bash
git add packages/sessions/__mocks__/expo-sqlite.ts
git commit -m "Add expo-sqlite mock backed by better-sqlite3"
```

---

## Task 7: SqliteSessionStore

**Files:**
- Create: `packages/sessions/src/SqliteSessionStore.ts`
- Create: `packages/sessions/__tests__/SqliteSessionStore.test.ts`

- [ ] **Step 1: Write the failing test file**

Write `packages/sessions/__tests__/SqliteSessionStore.test.ts`:

```typescript
import { SqliteSessionStore } from '../src/SqliteSessionStore';
import { runContractTests } from './contractTests';

runContractTests('SqliteSessionStore', async () => {
  const store = new SqliteSessionStore();
  await store.init();
  return store;
});

describe('SqliteSessionStore: migrations', () => {
  it('running init twice is safe', async () => {
    const store = new SqliteSessionStore();
    await store.init();
    await expect(store.init()).resolves.toBeUndefined();
  });
});

describe('SqliteSessionStore: metadata JSON round-trip', () => {
  it('preserves nested metadata', async () => {
    const store = new SqliteSessionStore();
    await store.init();
    const s = await store.createSession({
      metadata: { folder: 'work', tags: ['urgent', 'wip'], counts: { a: 1 } },
    });
    const fetched = await store.getSession(s.id);
    expect(fetched!.metadata).toEqual({
      folder: 'work',
      tags: ['urgent', 'wip'],
      counts: { a: 1 },
    });
  });

  it('preserves parts array verbatim including tool parts', async () => {
    const store = new SqliteSessionStore();
    await store.init();
    const s = await store.createSession();
    const complexParts = [
      { type: 'text', text: 'Let me check.' },
      {
        type: 'tool-invocation',
        toolInvocation: {
          toolCallId: 'call_1',
          toolName: 'search',
          state: 'result' as const,
          args: { query: 'weather' },
          result: { temperature: 72 },
        },
      },
      { type: 'text', text: "It's 72 degrees." },
    ];
    await store.appendMessage(s.id, {
      role: 'assistant',
      parts: complexParts as any,
    });
    const msgs = await store.listMessages(s.id);
    expect(msgs[0].parts).toEqual(complexParts);
  });
});
```

- [ ] **Step 2: Run the test — verify it fails**

Run: `cd packages/sessions && npx jest SqliteSessionStore`

Expected: FAIL — "Cannot find module '../src/SqliteSessionStore'".

- [ ] **Step 3: Implement the store**

Write `packages/sessions/src/SqliteSessionStore.ts`:

```typescript
import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';
import { PubSub } from './pubsub';
import {
  type AppendMessageInput,
  type PersistedMessage,
  type Session,
  type SessionCreateInput,
  type SessionStore,
  type SessionUpdateInput,
  type StoreEvent,
  type StoreEventListener,
  SessionNotFoundError,
  CorruptMessageError,
} from './types';

const SCHEMA_VERSION = 1;
const DB_NAME = 'rn-ai-kit-sessions.db';

const MIGRATIONS: Array<(db: SQLite.SQLiteDatabase) => Promise<void>> = [
  async (db) => {
    await db.execAsync(`
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
    `);
  },
];

interface SessionRow {
  id: string;
  title: string;
  provider_id: string | null;
  model_id: string | null;
  created_at: string;
  updated_at: string;
  metadata: string;
}

interface MessageRow {
  id: string;
  session_id: string;
  role: string;
  parts: string;
  created_at: string;
}

export class SqliteSessionStore implements SessionStore {
  private db: SQLite.SQLiteDatabase | null = null;
  private pubsub = new PubSub();

  async init(): Promise<void> {
    if (this.db) return;
    this.db = await SQLite.openDatabaseAsync(DB_NAME);
    await this.db.execAsync('PRAGMA foreign_keys = ON');
    const row = await this.db.getFirstAsync<{ value: string }>(
      "SELECT value FROM schema_meta WHERE key = 'version'",
    ).catch(() => null);
    const currentVersion = row ? parseInt(row.value, 10) : 0;
    for (let v = currentVersion; v < SCHEMA_VERSION; v++) {
      await MIGRATIONS[v](this.db);
    }
    await this.db.runAsync(
      "INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('version', ?)",
      String(SCHEMA_VERSION),
    );
  }

  private requireDb(): SQLite.SQLiteDatabase {
    if (!this.db) throw new Error('SqliteSessionStore.init() must be called before use');
    return this.db;
  }

  async listSessions(
    options: { limit?: number; offset?: number } = {},
  ): Promise<Session[]> {
    const db = this.requireDb();
    const limit = options.limit ?? -1; // SQLite: -1 = no limit
    const offset = options.offset ?? 0;
    const rows = await db.getAllAsync<SessionRow>(
      'SELECT * FROM sessions ORDER BY updated_at DESC LIMIT ? OFFSET ?',
      limit,
      offset,
    );
    return rows.map(rowToSession);
  }

  async getSession(id: string): Promise<Session | null> {
    const db = this.requireDb();
    const row = await db.getFirstAsync<SessionRow>(
      'SELECT * FROM sessions WHERE id = ?',
      id,
    );
    return row ? rowToSession(row) : null;
  }

  async createSession(input: SessionCreateInput = {}): Promise<Session> {
    const db = this.requireDb();
    const now = new Date().toISOString();
    const session: Session = {
      id: Crypto.randomUUID(),
      title: input.title ?? 'New chat',
      providerId: input.providerId ?? null,
      modelId: input.modelId ?? null,
      createdAt: now,
      updatedAt: now,
      metadata: input.metadata ?? {},
    };
    await db.runAsync(
      'INSERT INTO sessions (id, title, provider_id, model_id, created_at, updated_at, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)',
      session.id,
      session.title,
      session.providerId,
      session.modelId,
      session.createdAt,
      session.updatedAt,
      JSON.stringify(session.metadata),
    );
    this.pubsub.emit('sessions-changed', {});
    return session;
  }

  async updateSession(id: string, patch: SessionUpdateInput): Promise<Session> {
    const db = this.requireDb();
    const existing = await this.getSession(id);
    if (!existing) throw new SessionNotFoundError(id);
    const updated: Session = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    await db.runAsync(
      'UPDATE sessions SET title = ?, provider_id = ?, model_id = ?, updated_at = ?, metadata = ? WHERE id = ?',
      updated.title,
      updated.providerId,
      updated.modelId,
      updated.updatedAt,
      JSON.stringify(updated.metadata),
      id,
    );
    this.pubsub.emit('sessions-changed', {});
    return updated;
  }

  async deleteSession(id: string): Promise<void> {
    const db = this.requireDb();
    const result = await db.runAsync('DELETE FROM sessions WHERE id = ?', id);
    if (result.changes > 0) this.pubsub.emit('sessions-changed', {});
  }

  async listMessages(sessionId: string): Promise<PersistedMessage[]> {
    const db = this.requireDb();
    const rows = await db.getAllAsync<MessageRow>(
      'SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC, id ASC',
      sessionId,
    );
    return rows.map(rowToMessage);
  }

  async appendMessage(
    sessionId: string,
    input: AppendMessageInput,
  ): Promise<PersistedMessage> {
    const db = this.requireDb();
    const sessionRow = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM sessions WHERE id = ?',
      sessionId,
    );
    if (!sessionRow) throw new SessionNotFoundError(sessionId);

    const now = new Date().toISOString();
    const message: PersistedMessage = {
      id: input.id ?? Crypto.randomUUID(),
      sessionId,
      role: input.role,
      parts: input.parts,
      createdAt: now,
    };

    await db.withTransactionAsync(async () => {
      await db.runAsync(
        'INSERT INTO messages (id, session_id, role, parts, created_at) VALUES (?, ?, ?, ?, ?)',
        message.id,
        message.sessionId,
        message.role,
        JSON.stringify(message.parts),
        message.createdAt,
      );
      await db.runAsync(
        'UPDATE sessions SET updated_at = ? WHERE id = ?',
        now,
        sessionId,
      );
    });

    this.pubsub.emit('messages-changed', { sessionId });
    return message;
  }

  async deleteMessage(id: string): Promise<void> {
    const db = this.requireDb();
    const row = await db.getFirstAsync<{ session_id: string }>(
      'SELECT session_id FROM messages WHERE id = ?',
      id,
    );
    if (!row) return;
    await db.runAsync('DELETE FROM messages WHERE id = ?', id);
    this.pubsub.emit('messages-changed', { sessionId: row.session_id });
  }

  subscribe(event: StoreEvent, listener: StoreEventListener): () => void {
    return this.pubsub.subscribe(event, listener);
  }
}

function rowToSession(row: SessionRow): Session {
  return {
    id: row.id,
    title: row.title,
    providerId: row.provider_id,
    modelId: row.model_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    metadata: JSON.parse(row.metadata) as Record<string, unknown>,
  };
}

function rowToMessage(row: MessageRow): PersistedMessage {
  let parts: PersistedMessage['parts'];
  try {
    parts = JSON.parse(row.parts);
  } catch (e) {
    throw new CorruptMessageError(row.id, e);
  }
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role as PersistedMessage['role'],
    parts,
    createdAt: row.created_at,
  };
}
```

- [ ] **Step 4: Run tests — verify they pass**

Run: `cd packages/sessions && npx jest SqliteSessionStore`

Expected: PASS — all contract tests plus the 3 SQLite-specific tests (migrations, metadata JSON round-trip, parts array preservation).

- [ ] **Step 5: Commit**

```bash
git add packages/sessions/src/SqliteSessionStore.ts packages/sessions/__tests__/SqliteSessionStore.test.ts
git commit -m "Add SqliteSessionStore with migrations and JSON part storage"
```

---

## Task 8: SessionStoreProvider + useSessions hook

**Files:**
- Create: `packages/sessions/src/SessionStoreProvider.tsx`
- Create: `packages/sessions/src/hooks/useSessions.ts`
- Create: `packages/sessions/__tests__/useSessions.test.tsx`

- [ ] **Step 1: Add jsdom devDep readiness**

Confirm `jest-environment-jsdom` is in `packages/sessions/package.json` devDependencies (added in Task 1). Run `npm ls jest-environment-jsdom` from the repo root. Expected: a version printed. If not, run `npm install` again.

- [ ] **Step 2: Write the SessionStoreProvider**

Write `packages/sessions/src/SessionStoreProvider.tsx`:

```typescript
import React, { createContext, useContext } from 'react';
import type { SessionStore } from './types';

const SessionStoreContext = createContext<SessionStore | null>(null);

export interface SessionStoreProviderProps {
  store: SessionStore;
  children: React.ReactNode;
}

export function SessionStoreProvider({
  store,
  children,
}: SessionStoreProviderProps): React.ReactElement {
  return (
    <SessionStoreContext.Provider value={store}>
      {children}
    </SessionStoreContext.Provider>
  );
}

export function useSessionStore(): SessionStore {
  const store = useContext(SessionStoreContext);
  if (!store) {
    throw new Error(
      'useSessionStore must be used inside a <SessionStoreProvider>',
    );
  }
  return store;
}
```

- [ ] **Step 3: Write the failing test for useSessions**

Write `packages/sessions/__tests__/useSessions.test.tsx`:

```typescript
/**
 * @jest-environment jsdom
 */
import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { InMemorySessionStore } from '../src/InMemorySessionStore';
import { SessionStoreProvider } from '../src/SessionStoreProvider';
import { useSessions } from '../src/hooks/useSessions';

function Probe({ onRender }: { onRender: (v: ReturnType<typeof useSessions>) => void }) {
  const value = useSessions();
  onRender(value);
  return null;
}

async function renderWithStore() {
  const store = new InMemorySessionStore();
  await store.init();
  const renders: Array<ReturnType<typeof useSessions>> = [];
  const onRender = (v: ReturnType<typeof useSessions>) => { renders.push(v); };
  render(
    <SessionStoreProvider store={store}>
      <Probe onRender={onRender} />
    </SessionStoreProvider>,
  );
  return { store, renders };
}

describe('useSessions', () => {
  it('loads an empty list initially then populates from the store', async () => {
    const { store, renders } = await renderWithStore();
    await waitFor(() => {
      expect(renders[renders.length - 1].isLoading).toBe(false);
    });
    expect(renders[renders.length - 1].sessions).toEqual([]);

    await act(async () => {
      await store.createSession({ title: 'A' });
    });

    await waitFor(() => {
      expect(renders[renders.length - 1].sessions.length).toBe(1);
    });
    expect(renders[renders.length - 1].sessions[0].title).toBe('A');
  });

  it('createSession through the hook reflects in the list', async () => {
    const { renders } = await renderWithStore();
    await waitFor(() => {
      expect(renders[renders.length - 1].isLoading).toBe(false);
    });
    await act(async () => {
      await renders[renders.length - 1].createSession({ title: 'B' });
    });
    await waitFor(() => {
      expect(renders[renders.length - 1].sessions.length).toBe(1);
    });
    expect(renders[renders.length - 1].sessions[0].title).toBe('B');
  });

  it('renameSession updates the title via updateSession', async () => {
    const { store, renders } = await renderWithStore();
    const s = await store.createSession({ title: 'Old' });
    await waitFor(() => {
      expect(renders[renders.length - 1].sessions.length).toBe(1);
    });
    await act(async () => {
      await renders[renders.length - 1].renameSession(s.id, 'New');
    });
    await waitFor(() => {
      expect(renders[renders.length - 1].sessions[0].title).toBe('New');
    });
  });

  it('deleteSession removes from the list', async () => {
    const { store, renders } = await renderWithStore();
    const s = await store.createSession({ title: 'A' });
    await waitFor(() => {
      expect(renders[renders.length - 1].sessions.length).toBe(1);
    });
    await act(async () => {
      await renders[renders.length - 1].deleteSession(s.id);
    });
    await waitFor(() => {
      expect(renders[renders.length - 1].sessions.length).toBe(0);
    });
  });
});
```

- [ ] **Step 4: Run the test — verify it fails**

Run: `cd packages/sessions && npx jest useSessions`

Expected: FAIL — "Cannot find module '../src/hooks/useSessions'".

- [ ] **Step 5: Implement useSessions**

Write `packages/sessions/src/hooks/useSessions.ts`:

```typescript
import { useCallback, useEffect, useState } from 'react';
import { useSessionStore } from '../SessionStoreProvider';
import type { Session, SessionCreateInput } from '../types';

export interface UseSessionsResult {
  sessions: Session[];
  isLoading: boolean;
  error: Error | null;
  createSession: (input?: SessionCreateInput) => Promise<Session>;
  deleteSession: (id: string) => Promise<void>;
  renameSession: (id: string, title: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useSessions(): UseSessionsResult {
  const store = useSessionStore();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await store.listSessions();
      setSessions(list);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setIsLoading(false);
    }
  }, [store]);

  useEffect(() => {
    load();
    const unsub = store.subscribe('sessions-changed', () => {
      load();
    });
    return unsub;
  }, [store, load]);

  const createSession = useCallback(
    (input?: SessionCreateInput) => store.createSession(input),
    [store],
  );

  const deleteSession = useCallback(
    (id: string) => store.deleteSession(id),
    [store],
  );

  const renameSession = useCallback(
    async (id: string, title: string) => {
      await store.updateSession(id, { title });
    },
    [store],
  );

  return {
    sessions,
    isLoading,
    error,
    createSession,
    deleteSession,
    renameSession,
    refresh: load,
  };
}
```

- [ ] **Step 6: Run tests — verify they pass**

Run: `cd packages/sessions && npx jest useSessions`

Expected: PASS — 4 tests.

- [ ] **Step 7: Commit**

```bash
git add packages/sessions/src/SessionStoreProvider.tsx packages/sessions/src/hooks/useSessions.ts packages/sessions/__tests__/useSessions.test.tsx
git commit -m "Add SessionStoreProvider and useSessions hook"
```

---

## Task 9: useSession hook

**Files:**
- Create: `packages/sessions/src/hooks/useSession.ts`
- Create: `packages/sessions/__tests__/useSession.test.tsx`

- [ ] **Step 1: Write the failing test**

Write `packages/sessions/__tests__/useSession.test.tsx`:

```typescript
/**
 * @jest-environment jsdom
 */
import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { InMemorySessionStore } from '../src/InMemorySessionStore';
import { SessionStoreProvider } from '../src/SessionStoreProvider';
import { useSession } from '../src/hooks/useSession';

function Probe({
  sessionId,
  onRender,
}: {
  sessionId: string | null;
  onRender: (v: ReturnType<typeof useSession>) => void;
}) {
  const value = useSession(sessionId);
  onRender(value);
  return null;
}

async function renderWithStore(sessionId: string | null) {
  const store = new InMemorySessionStore();
  await store.init();
  const renders: Array<ReturnType<typeof useSession>> = [];
  const onRender = (v: ReturnType<typeof useSession>) => { renders.push(v); };
  const r = render(
    <SessionStoreProvider store={store}>
      <Probe sessionId={sessionId} onRender={onRender} />
    </SessionStoreProvider>,
  );
  return { store, renders, rerender: (id: string | null) => r.rerender(
    <SessionStoreProvider store={store}>
      <Probe sessionId={id} onRender={onRender} />
    </SessionStoreProvider>,
  ) };
}

describe('useSession', () => {
  it('returns null session and [] messages when sessionId is null', async () => {
    const { renders } = await renderWithStore(null);
    await waitFor(() => {
      expect(renders[renders.length - 1].isLoading).toBe(false);
    });
    expect(renders[renders.length - 1].session).toBeNull();
    expect(renders[renders.length - 1].messages).toEqual([]);
  });

  it('loads the session and its messages', async () => {
    const store = new InMemorySessionStore();
    await store.init();
    const s = await store.createSession({ title: 'X' });
    await store.appendMessage(s.id, {
      role: 'user',
      parts: [{ type: 'text', text: 'hi' } as any],
    });
    const renders: Array<ReturnType<typeof useSession>> = [];
    render(
      <SessionStoreProvider store={store}>
        <Probe sessionId={s.id} onRender={(v) => renders.push(v)} />
      </SessionStoreProvider>,
    );
    await waitFor(() => {
      expect(renders[renders.length - 1].isLoading).toBe(false);
    });
    expect(renders[renders.length - 1].session?.title).toBe('X');
    expect(renders[renders.length - 1].messages).toHaveLength(1);
  });

  it('appendMessage from the hook updates messages', async () => {
    const store = new InMemorySessionStore();
    await store.init();
    const s = await store.createSession();
    const renders: Array<ReturnType<typeof useSession>> = [];
    render(
      <SessionStoreProvider store={store}>
        <Probe sessionId={s.id} onRender={(v) => renders.push(v)} />
      </SessionStoreProvider>,
    );
    await waitFor(() => {
      expect(renders[renders.length - 1].isLoading).toBe(false);
    });
    await act(async () => {
      await renders[renders.length - 1].appendMessage({
        role: 'user',
        parts: [{ type: 'text', text: 'hi' } as any],
      });
    });
    await waitFor(() => {
      expect(renders[renders.length - 1].messages).toHaveLength(1);
    });
  });

  it('ignores messages-changed events for other sessions', async () => {
    const store = new InMemorySessionStore();
    await store.init();
    const a = await store.createSession();
    const b = await store.createSession();
    const renders: Array<ReturnType<typeof useSession>> = [];
    render(
      <SessionStoreProvider store={store}>
        <Probe sessionId={a.id} onRender={(v) => renders.push(v)} />
      </SessionStoreProvider>,
    );
    await waitFor(() => {
      expect(renders[renders.length - 1].isLoading).toBe(false);
    });
    const countBefore = renders.length;
    await act(async () => {
      await store.appendMessage(b.id, {
        role: 'user', parts: [{ type: 'text', text: 'x' } as any],
      });
    });
    // Session B's message should not trigger a refetch of session A's messages.
    // We allow at most one extra render from other unrelated state churn.
    expect(renders.length - countBefore).toBeLessThanOrEqual(1);
    expect(renders[renders.length - 1].messages).toEqual([]);
  });

  it('updateSession through the hook patches the session', async () => {
    const store = new InMemorySessionStore();
    await store.init();
    const s = await store.createSession({ title: 'Old' });
    const renders: Array<ReturnType<typeof useSession>> = [];
    render(
      <SessionStoreProvider store={store}>
        <Probe sessionId={s.id} onRender={(v) => renders.push(v)} />
      </SessionStoreProvider>,
    );
    await waitFor(() => {
      expect(renders[renders.length - 1].session?.title).toBe('Old');
    });
    await act(async () => {
      await renders[renders.length - 1].updateSession({ title: 'New' });
    });
    await waitFor(() => {
      expect(renders[renders.length - 1].session?.title).toBe('New');
    });
  });
});
```

- [ ] **Step 2: Run the test — verify it fails**

Run: `cd packages/sessions && npx jest useSession.test`

Expected: FAIL — "Cannot find module '../src/hooks/useSession'".

- [ ] **Step 3: Implement useSession**

Write `packages/sessions/src/hooks/useSession.ts`:

```typescript
import { useCallback, useEffect, useState } from 'react';
import { useSessionStore } from '../SessionStoreProvider';
import type {
  AppendMessageInput,
  PersistedMessage,
  Session,
  SessionUpdateInput,
} from '../types';

export interface UseSessionResult {
  session: Session | null;
  messages: PersistedMessage[];
  isLoading: boolean;
  error: Error | null;
  appendMessage: (input: AppendMessageInput) => Promise<PersistedMessage>;
  updateSession: (patch: SessionUpdateInput) => Promise<void>;
}

export function useSession(sessionId: string | null): UseSessionResult {
  const store = useSessionStore();
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<PersistedMessage[]>([]);
  const [isLoading, setIsLoading] = useState(sessionId !== null);
  const [error, setError] = useState<Error | null>(null);

  const loadSession = useCallback(async () => {
    if (!sessionId) {
      setSession(null);
      return;
    }
    try {
      const s = await store.getSession(sessionId);
      setSession(s);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    }
  }, [store, sessionId]);

  const loadMessages = useCallback(async () => {
    if (!sessionId) {
      setMessages([]);
      return;
    }
    try {
      const list = await store.listMessages(sessionId);
      setMessages(list);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    }
  }, [store, sessionId]);

  useEffect(() => {
    if (!sessionId) {
      setSession(null);
      setMessages([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    (async () => {
      await Promise.all([loadSession(), loadMessages()]);
      setIsLoading(false);
    })();
    const unsubMessages = store.subscribe('messages-changed', (p) => {
      if (p.sessionId === sessionId) loadMessages();
    });
    const unsubSessions = store.subscribe('sessions-changed', () => {
      loadSession();
    });
    return () => {
      unsubMessages();
      unsubSessions();
    };
  }, [store, sessionId, loadSession, loadMessages]);

  const appendMessage = useCallback(
    (input: AppendMessageInput) => {
      if (!sessionId) {
        return Promise.reject(new Error('Cannot append to null session'));
      }
      return store.appendMessage(sessionId, input);
    },
    [store, sessionId],
  );

  const updateSession = useCallback(
    async (patch: SessionUpdateInput) => {
      if (!sessionId) return;
      await store.updateSession(sessionId, patch);
    },
    [store, sessionId],
  );

  return { session, messages, isLoading, error, appendMessage, updateSession };
}
```

- [ ] **Step 4: Run tests — verify they pass**

Run: `cd packages/sessions && npx jest useSession.test`

Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/sessions/src/hooks/useSession.ts packages/sessions/__tests__/useSession.test.tsx
git commit -m "Add useSession hook"
```

---

## Task 10: Public barrel

**Files:**
- Modify: `packages/sessions/src/index.ts`

- [ ] **Step 1: Populate the public surface**

Write `packages/sessions/src/index.ts`:

```typescript
export type {
  Session,
  PersistedMessage,
  SessionStore,
  SessionCreateInput,
  SessionUpdateInput,
  AppendMessageInput,
  StoreEvent,
  StoreEventPayload,
  StoreEventListener,
} from './types';
export { SessionNotFoundError, CorruptMessageError } from './types';

export { InMemorySessionStore } from './InMemorySessionStore';
export { SqliteSessionStore } from './SqliteSessionStore';

export {
  SessionStoreProvider,
  useSessionStore,
} from './SessionStoreProvider';
export type { SessionStoreProviderProps } from './SessionStoreProvider';

export { useSessions } from './hooks/useSessions';
export type { UseSessionsResult } from './hooks/useSessions';
export { useSession } from './hooks/useSession';
export type { UseSessionResult } from './hooks/useSession';

export {
  toUIMessage,
  fromUIMessage,
  titleFromFirstMessage,
} from './message-mapping';
```

- [ ] **Step 2: Run the full test suite**

Run: `cd packages/sessions && npx jest`

Expected: PASS — all tests from prior tasks (~35+ tests total).

- [ ] **Step 3: Typecheck the whole repo**

Run: `npx tsc --noEmit` from the repo root.

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/sessions/src/index.ts
git commit -m "Export @rn-ai-kit/sessions public surface"
```

---

## Task 11: Example app — install package + wire provider

**Files:**
- Modify: `apps/example/package.json`
- Create: `apps/example/src/lib/sessionStore.ts`
- Modify: `apps/example/src/app/_layout.tsx`

- [ ] **Step 1: Add the package to the example app manifest**

Open `apps/example/package.json`. In `dependencies`, add:

```json
"@rn-ai-kit/sessions": "*",
"expo-sqlite": "~15.0.0"
```

Save. Run: `npm install` from the repo root.

Expected: completes cleanly.

- [ ] **Step 2: Create the store singleton**

Write `apps/example/src/lib/sessionStore.ts`:

```typescript
import { SqliteSessionStore } from '@rn-ai-kit/sessions';

export const sessionStore = new SqliteSessionStore();

let initPromise: Promise<void> | null = null;
export function initSessionStore(): Promise<void> {
  if (!initPromise) initPromise = sessionStore.init();
  return initPromise;
}
```

- [ ] **Step 3: Replace the root layout**

Overwrite `apps/example/src/app/_layout.tsx` with the full replacement below. This preserves the existing `<StatusBar>`, `<Stack>` configuration, and the settings header button; it adds store init gating, wraps the tree in `SessionStoreProvider`, registers a `sessions` screen, and adds a sessions header link alongside the existing settings button:

```typescript
import { useEffect, useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SessionStoreProvider } from '@rn-ai-kit/sessions';
import { sessionStore, initSessionStore } from '../lib/sessionStore';

export default function RootLayout() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    initSessionStore().then(() => setReady(true));
  }, []);

  if (!ready) return null;

  return (
    <SessionStoreProvider store={sessionStore}>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#FAFAF7' },
          headerShadowVisible: false,
          headerTintColor: '#1A1A1A',
          headerTitleStyle: {
            fontWeight: '600',
            fontSize: 17,
            letterSpacing: -0.4,
            color: '#1A1A1A',
          },
          contentStyle: { backgroundColor: '#FAFAF7' },
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            title: 'RN AI Kit',
            headerRight: () => (
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <TouchableOpacity onPress={() => router.push('/sessions')} hitSlop={8}>
                  <Ionicons name="list-outline" size={22} color="#8C8577" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => router.push('/settings')} hitSlop={8}>
                  <Ionicons name="ellipsis-horizontal" size={22} color="#8C8577" />
                </TouchableOpacity>
              </View>
            ),
          }}
        />
        <Stack.Screen
          name="sessions"
          options={{
            title: 'Sessions',
            headerBackTitle: 'Chat',
          }}
        />
        <Stack.Screen
          name="settings"
          options={{
            title: 'Settings',
            headerBackTitle: 'Chat',
          }}
        />
      </Stack>
    </SessionStoreProvider>
  );
}
```

- [ ] **Step 4: Typecheck the example app**

Run: `cd apps/example && npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/example/package.json apps/example/src/lib/sessionStore.ts apps/example/src/app/_layout.tsx package-lock.json
git commit -m "Wire SessionStoreProvider into example app"
```

---

## Task 12: Example app — reshape chat.ts to emit parts

**Files:**
- Modify: `apps/example/src/lib/chat.ts`

The chat screen (Task 13) needs the full assistant `UIMessagePart[]` to persist, not just the flattened text. We change `onDone`'s signature to include parts, and track text parts during streaming so the stream-delta view stays working.

- [ ] **Step 1: Modify the callbacks interface and stream handling**

Open `apps/example/src/lib/chat.ts`. Replace the `StreamCallbacks` interface and the `sendMessage` function to track parts:

```typescript
import { streamText } from 'ai';
import type { UIMessage } from 'ai';
type UIMessagePart = UIMessage['parts'][number];
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createChatGPT } from '@rn-ai-kit/chatgpt-provider';
import { fetch as expoFetch } from 'expo/fetch';
import { authManager } from './auth';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

interface StreamCallbacks {
  onTextDelta: (text: string) => void;
  onDone: (fullText: string, parts: UIMessagePart[]) => void;
  onError: (error: string) => void;
}

const fetch = expoFetch as unknown as typeof globalThis.fetch;

function createModel(providerId: string, modelId: string, apiKey: string) {
  switch (providerId) {
    case 'anthropic':
      return createAnthropic({ apiKey, fetch })(modelId);
    case 'openai':
      return createOpenAI({ apiKey, fetch })(modelId);
    case 'google-gemini':
    case 'google':
      return createGoogleGenerativeAI({ apiKey, fetch })(modelId);
    case 'openai-codex':
      return createChatGPT({ apiKey, fetch })(modelId);
    default:
      return createOpenAI({ apiKey, fetch })(modelId);
  }
}

export async function sendMessage(
  userText: string,
  history: ChatMessage[],
  systemPrompt: string | undefined,
  providerId: string,
  modelId: string,
  callbacks: StreamCallbacks,
): Promise<void> {
  const apiKey = await authManager.getApiKey(providerId);
  if (!apiKey) {
    callbacks.onError('Not signed in. Go to Settings to connect a provider.');
    return;
  }

  const model = createModel(providerId, modelId, apiKey);

  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const m of history) {
    messages.push({ role: m.role, content: m.content });
  }
  messages.push({ role: 'user', content: userText });

  try {
    const result = streamText({ model, system: systemPrompt, messages });

    let fullText = '';
    for await (const part of result.fullStream) {
      switch (part.type) {
        case 'text-delta':
          fullText += part.textDelta;
          callbacks.onTextDelta(part.textDelta);
          break;
        case 'error':
          callbacks.onError(
            part.error instanceof Error ? part.error.message : String(part.error),
          );
          return;
      }
    }

    // v1: text-only providers. Build a single text part from the accumulated delta.
    const parts: UIMessagePart[] = fullText
      ? [{ type: 'text', text: fullText } as UIMessagePart]
      : [];
    callbacks.onDone(fullText, parts);
  } catch (e: any) {
    callbacks.onError(e.message ?? String(e));
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/example && npx tsc --noEmit`

Expected: errors only from `index.tsx` where `onDone` is called with the old signature — we fix that in Task 13.

- [ ] **Step 3: Commit**

```bash
git add apps/example/src/lib/chat.ts
git commit -m "Reshape chat.sendMessage onDone to include parts"
```

---

## Task 13: Example app — chat screen persists messages

**Files:**
- Modify: `apps/example/src/app/index.tsx`

This is a substantial rewrite of the chat screen. The new shape uses `useSession` instead of `useState<ChatMessage[]>`, creates a session on first send, routes by `sessionId` query param, and persists both user and assistant turns after the stream completes.

- [ ] **Step 1: Rewrite the chat screen**

Write `apps/example/src/app/index.tsx`:

```typescript
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  FlatList,
  Text,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  useSession,
  useSessionStore,
  titleFromFirstMessage,
} from '@rn-ai-kit/sessions';
import { MessageBubble } from '../components/MessageBubble';
import { ChatInput } from '../components/ChatInput';
import { sendMessage, type ChatMessage } from '../lib/chat';
import { authManager } from '../lib/auth';

const DEFAULT_MODELS: Record<string, string> = {
  'anthropic': 'claude-sonnet-4-6',
  'openai-codex': 'gpt-5.4',
  'openai': 'gpt-4o',
  'google-gemini': 'gemini-3-flash',
  'github-copilot': 'gpt-4o',
  'google-antigravity': 'claude-sonnet-4-6',
};

const SYSTEM_PROMPT = `You are a helpful assistant. Format your responses using Markdown for readability.`;

function partsToText(parts: Array<{ type: string; text?: string }>): string {
  return parts
    .filter((p) => p.type === 'text' && typeof p.text === 'string')
    .map((p) => p.text as string)
    .join('');
}

export default function ChatScreen() {
  const router = useRouter();
  const store = useSessionStore();
  const params = useLocalSearchParams<{ sessionId?: string }>();
  const sessionId = params.sessionId ?? null;

  const { messages: persisted, appendMessage, updateSession, session } = useSession(sessionId);
  const [activeProvider, setActiveProvider] = useState<{ id: string; model: string } | null>(null);
  const [streamingMessage, setStreamingMessage] = useState<ChatMessage | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    (async () => {
      const providers = authManager.listProviders();
      for (const p of providers) {
        const key = await authManager.getApiKey(p.id);
        if (key) {
          setActiveProvider({ id: p.id, model: DEFAULT_MODELS[p.id] ?? 'gpt-4o' });
          return;
        }
      }
      setActiveProvider(null);
    })();
  }, []);

  const displayMessages = useMemo<ChatMessage[]>(() => {
    const rehydrated: ChatMessage[] = persisted
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: partsToText(m.parts as any),
      }));
    return streamingMessage ? [...rehydrated, streamingMessage] : rehydrated;
  }, [persisted, streamingMessage]);

  const handleSend = useCallback(
    async (text: string) => {
      if (isStreaming) return;
      if (!activeProvider) {
        // No provider — surface inline without persisting
        setStreamingMessage({
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: 'No provider connected. Go to **Settings** to sign in or add an API key.',
        });
        return;
      }

      // Ensure a session exists
      let currentSessionId = sessionId;
      if (!currentSessionId) {
        const s = await store.createSession({
          title: titleFromFirstMessage(text),
          providerId: activeProvider.id,
          modelId: activeProvider.model,
        });
        currentSessionId = s.id;
        router.setParams({ sessionId: s.id });
      } else if (session && !session.providerId) {
        await updateSession({ providerId: activeProvider.id, modelId: activeProvider.model });
      }

      // Persist user turn
      await store.appendMessage(currentSessionId, {
        role: 'user',
        parts: [{ type: 'text', text } as any],
      });

      // Stream the assistant response
      setIsStreaming(true);
      const streamingId = `s-${Date.now()}`;
      let streamedText = '';
      setStreamingMessage({ id: streamingId, role: 'assistant', content: '', isStreaming: true });

      const historyForModel: ChatMessage[] = persisted
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({
          id: m.id,
          role: m.role as 'user' | 'assistant',
          content: partsToText(m.parts as any),
        }));

      await sendMessage(
        text,
        historyForModel,
        SYSTEM_PROMPT,
        activeProvider.id,
        activeProvider.model,
        {
          onTextDelta: (delta) => {
            streamedText += delta;
            setStreamingMessage((prev) =>
              prev && prev.id === streamingId
                ? { ...prev, content: streamedText }
                : prev,
            );
          },
          onDone: async (_fullText, parts) => {
            if (parts.length > 0) {
              await store.appendMessage(currentSessionId!, {
                role: 'assistant',
                parts,
              });
            }
            setStreamingMessage(null);
          },
          onError: (errMsg) => {
            setStreamingMessage({
              id: streamingId,
              role: 'assistant',
              content: `Something went wrong: ${errMsg}`,
            });
          },
        },
      );

      setIsStreaming(false);
    },
    [isStreaming, activeProvider, sessionId, store, session, updateSession, persisted, router],
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <FlatList
          ref={flatListRef}
          data={displayMessages}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => <MessageBubble message={item} />}
          contentContainerStyle={styles.messageList}
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({ animated: true })
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>{'✦'}</Text>
              <Text style={styles.emptyTitle}>RN AI Kit</Text>
              <Text style={styles.emptySubtitle}>
                Multi-provider AI on React Native
              </Text>
              <Text
                style={styles.emptyAction}
                onPress={() => router.push('/settings')}
              >
                {activeProvider
                  ? 'Start a conversation below'
                  : 'Connect a provider in Settings →'}
              </Text>
            </View>
          }
        />

        <ChatInput onSend={handleSend} disabled={isStreaming} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAF7' },
  messageList: { padding: 16, paddingBottom: 8 },
  empty: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 40,
    marginTop: 140,
  },
  emptyIcon: { fontSize: 32, color: '#D4C9A8', marginBottom: 16 },
  emptyTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1A1A1A',
    letterSpacing: -0.8,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#8C8577',
    letterSpacing: -0.2,
    marginBottom: 24,
  },
  emptyAction: {
    fontSize: 15,
    color: '#8B6914',
    fontWeight: '500',
    letterSpacing: -0.2,
  },
});
```

- [ ] **Step 2: Typecheck the example app**

Run: `cd apps/example && npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 3: Smoke test in the iOS simulator**

Run: `cd apps/example && npx expo start --clear`, press `i`.

Manual verification steps:
1. App opens to chat screen, empty state visible.
2. Connect a provider in Settings (skip if already connected).
3. Return to chat, send "Hello". The message persists and the assistant streams a response.
4. Kill the app completely.
5. Reopen — the conversation is still there, including the assistant reply.

Expected: conversation survives app kill. The URL has `?sessionId=<uuid>` after the first send.

- [ ] **Step 4: Commit**

```bash
git add apps/example/src/app/index.tsx
git commit -m "Persist chat turns via useSession in example app"
```

---

## Task 14: Example app — sessions list screen

**Files:**
- Create: `apps/example/src/app/sessions.tsx`
- Modify: `apps/example/src/app/_layout.tsx` (if header link not already wired)

- [ ] **Step 1: Write the sessions list screen**

Write `apps/example/src/app/sessions.tsx`:

```typescript
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useSessions } from '@rn-ai-kit/sessions';

export default function SessionsScreen() {
  const router = useRouter();
  const { sessions, isLoading, createSession, deleteSession, renameSession } = useSessions();

  const handleNewChat = async () => {
    const s = await createSession();
    router.replace({ pathname: '/', params: { sessionId: s.id } });
  };

  const handleOpen = (id: string) => {
    router.push({ pathname: '/', params: { sessionId: id } });
  };

  const handleLongPress = (id: string, currentTitle: string) => {
    Alert.prompt(
      'Rename session',
      undefined,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Rename',
          onPress: (value) => {
            if (value && value.trim()) renameSession(id, value.trim());
          },
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteSession(id),
        },
      ],
      'plain-text',
      currentTitle,
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Pressable style={styles.newButton} onPress={handleNewChat}>
        <Text style={styles.newButtonText}>+ New chat</Text>
      </Pressable>

      {isLoading ? (
        <Text style={styles.muted}>Loading…</Text>
      ) : sessions.length === 0 ? (
        <Text style={styles.muted}>No sessions yet.</Text>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(s) => s.id}
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => handleOpen(item.id)}
              onLongPress={() => handleLongPress(item.id, item.title)}
            >
              <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
              <Text style={styles.subtitle}>
                {new Date(item.updatedAt).toLocaleString()}
              </Text>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAF7', padding: 16 },
  newButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#2C2C2E',
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
  newButtonText: { color: '#FAFAF7', fontSize: 15, fontWeight: '600' },
  muted: { color: '#8C8577', textAlign: 'center', marginTop: 40 },
  row: {
    paddingVertical: 12,
    borderBottomColor: '#EDE8DC',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1A1A1A',
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 12,
    color: '#8C8577',
    marginTop: 4,
  },
});
```

- [ ] **Step 2: Verify the route is registered and reachable**

The sessions route is already registered in `_layout.tsx` (Task 11). The chat screen's `headerRight` already includes a list icon that navigates to `/sessions`. No changes needed here — this step is a checkpoint.

- [ ] **Step 3: Typecheck**

Run: `cd apps/example && npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 4: Smoke test in the iOS simulator**

Run: `cd apps/example && npx expo start --clear`, press `i`.

Manual verification:
1. Tap the list icon in the chat header.
2. See list of prior sessions (from Task 13's smoke test). Most recent first.
3. Tap a row → chat opens with that session's history.
4. Long-press a row → Rename / Delete prompt appears.
5. Rename works; the list updates. Delete works; the row disappears.
6. "+ New chat" creates an empty session and routes to it.

- [ ] **Step 5: Commit**

```bash
git add apps/example/src/app/sessions.tsx
git commit -m "Add sessions list screen to example app"
```

---

## Task 15: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `cd packages/sessions && npx jest`

Expected: all tests pass.

- [ ] **Step 2: Run typecheck across the repo**

Run: `npx tsc --noEmit` from the repo root.

Expected: zero errors.

- [ ] **Step 3: Run the auth package tests (regression check)**

Run: `cd packages/auth && npx jest`

Expected: all 18 existing tests pass (no regressions from workspace dep changes).

- [ ] **Step 4: Run the chatgpt-provider tests (regression check)**

Run: `cd packages/chatgpt-provider && npx jest`

Expected: all 11 existing tests pass.

- [ ] **Step 5: Manual smoke test round-trip**

In the iOS simulator:
1. Send a few messages.
2. Kill the app.
3. Reopen — conversation survives.
4. Create a new chat from the sessions screen.
5. Switch back to the prior chat — content intact.
6. Rename a session — title updates in list and header.
7. Delete a session — gone from list; cannot navigate back to it (router push would show an empty chat — acceptable for v1).

- [ ] **Step 6: Final commit if any fixes needed**

If manual testing surfaced any fixes, commit them with a targeted message (e.g., `Fix session route params on rehydrate`).

---

## Notes for the implementing engineer

- **Working directory.** All work happens in `.worktrees/sessions` on branch `feature/sessions`. Don't commit to `main` directly.
- **Running tests.** Always `cd` into the package dir before `npx jest` — root jest config is intentionally absent, and the Metro/Expo babel transform at the root will reject `import type` if invoked.
- **Don't break the auth package's patterns.** When in doubt about package structure, mirror `packages/auth/`.
- **Don't reach for the deleted skill-engine.** Project history removed it for a reason; see CLAUDE.md "History (rename)".
- **`UIMessagePart` typing.** AI SDK 4.x uses `UIMessagePart` — if you see a type error saying the type doesn't exist, check the AI SDK version in the root `package-lock.json`; you may need `'ai'`'s older `Message['parts']` shape. The `as any` casts in the chat screen's test-free code paths are intentional insulation against minor part-shape churn.
- **Better-sqlite3 install.** Requires Python / build tools on macOS. If `npm install` fails installing it, install Xcode Command Line Tools: `xcode-select --install`.
