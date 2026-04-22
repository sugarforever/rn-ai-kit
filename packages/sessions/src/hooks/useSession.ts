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
