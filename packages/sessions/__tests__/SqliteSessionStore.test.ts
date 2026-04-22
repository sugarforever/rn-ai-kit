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
