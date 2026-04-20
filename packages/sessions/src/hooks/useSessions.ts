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
