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
