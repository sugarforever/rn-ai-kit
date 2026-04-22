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
