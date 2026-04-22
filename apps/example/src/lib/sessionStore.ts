import { SqliteSessionStore } from '@rn-ai-kit/sessions';

export const sessionStore = new SqliteSessionStore();

let initPromise: Promise<void> | null = null;
export function initSessionStore(): Promise<void> {
  if (!initPromise) initPromise = sessionStore.init();
  return initPromise;
}
