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
