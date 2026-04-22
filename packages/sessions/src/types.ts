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
