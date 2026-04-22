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

describe('useSession', () => {
  it('returns null session and [] messages when sessionId is null', async () => {
    const store = new InMemorySessionStore();
    await store.init();
    const renders: Array<ReturnType<typeof useSession>> = [];
    render(
      <SessionStoreProvider store={store}>
        <Probe sessionId={null} onRender={(v) => renders.push(v)} />
      </SessionStoreProvider>,
    );
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
    await act(async () => {
      await store.appendMessage(b.id, {
        role: 'user', parts: [{ type: 'text', text: 'x' } as any],
      });
    });
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
