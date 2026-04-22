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
