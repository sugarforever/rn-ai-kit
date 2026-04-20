import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';
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
  CorruptMessageError,
} from './types';

const SCHEMA_VERSION = 1;
const DB_NAME = 'rn-ai-kit-sessions.db';

const MIGRATIONS: Array<(db: SQLite.SQLiteDatabase) => Promise<void>> = [
  async (db) => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS sessions (
        id           TEXT PRIMARY KEY,
        title        TEXT NOT NULL DEFAULT 'New chat',
        provider_id  TEXT,
        model_id     TEXT,
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL,
        metadata     TEXT NOT NULL DEFAULT '{}'
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON sessions(updated_at DESC);
      CREATE TABLE IF NOT EXISTS messages (
        id          TEXT PRIMARY KEY,
        session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        role        TEXT NOT NULL,
        parts       TEXT NOT NULL,
        created_at  TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_messages_session_created ON messages(session_id, created_at);
      CREATE TABLE IF NOT EXISTS schema_meta (
        key    TEXT PRIMARY KEY,
        value  TEXT NOT NULL
      );
    `);
  },
];

interface SessionRow {
  id: string;
  title: string;
  provider_id: string | null;
  model_id: string | null;
  created_at: string;
  updated_at: string;
  metadata: string;
}

interface MessageRow {
  id: string;
  session_id: string;
  role: string;
  parts: string;
  created_at: string;
}

export class SqliteSessionStore implements SessionStore {
  private db: SQLite.SQLiteDatabase | null = null;
  private pubsub = new PubSub();

  async init(): Promise<void> {
    if (this.db) return;
    this.db = await SQLite.openDatabaseAsync(DB_NAME);
    await this.db.execAsync('PRAGMA foreign_keys = ON');
    const row = await this.db.getFirstAsync<{ value: string }>(
      "SELECT value FROM schema_meta WHERE key = 'version'",
    ).catch(() => null);
    const currentVersion = row ? parseInt(row.value, 10) : 0;
    for (let v = currentVersion; v < SCHEMA_VERSION; v++) {
      await MIGRATIONS[v](this.db);
    }
    await this.db.runAsync(
      "INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('version', ?)",
      String(SCHEMA_VERSION),
    );
  }

  private requireDb(): SQLite.SQLiteDatabase {
    if (!this.db) throw new Error('SqliteSessionStore.init() must be called before use');
    return this.db;
  }

  async listSessions(
    options: { limit?: number; offset?: number } = {},
  ): Promise<Session[]> {
    const db = this.requireDb();
    const limit = options.limit ?? -1;
    const offset = options.offset ?? 0;
    const rows = await db.getAllAsync<SessionRow>(
      'SELECT * FROM sessions ORDER BY updated_at DESC LIMIT ? OFFSET ?',
      limit,
      offset,
    );
    return rows.map(rowToSession);
  }

  async getSession(id: string): Promise<Session | null> {
    const db = this.requireDb();
    const row = await db.getFirstAsync<SessionRow>(
      'SELECT * FROM sessions WHERE id = ?',
      id,
    );
    return row ? rowToSession(row) : null;
  }

  async createSession(input: SessionCreateInput = {}): Promise<Session> {
    const db = this.requireDb();
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
    await db.runAsync(
      'INSERT INTO sessions (id, title, provider_id, model_id, created_at, updated_at, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)',
      session.id,
      session.title,
      session.providerId,
      session.modelId,
      session.createdAt,
      session.updatedAt,
      JSON.stringify(session.metadata),
    );
    this.pubsub.emit('sessions-changed', {});
    return session;
  }

  async updateSession(id: string, patch: SessionUpdateInput): Promise<Session> {
    const db = this.requireDb();
    const existing = await this.getSession(id);
    if (!existing) throw new SessionNotFoundError(id);
    const updated: Session = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    await db.runAsync(
      'UPDATE sessions SET title = ?, provider_id = ?, model_id = ?, updated_at = ?, metadata = ? WHERE id = ?',
      updated.title,
      updated.providerId,
      updated.modelId,
      updated.updatedAt,
      JSON.stringify(updated.metadata),
      id,
    );
    this.pubsub.emit('sessions-changed', {});
    return updated;
  }

  async deleteSession(id: string): Promise<void> {
    const db = this.requireDb();
    const result = await db.runAsync('DELETE FROM sessions WHERE id = ?', id);
    if (result.changes > 0) this.pubsub.emit('sessions-changed', {});
  }

  async listMessages(sessionId: string): Promise<PersistedMessage[]> {
    const db = this.requireDb();
    const rows = await db.getAllAsync<MessageRow>(
      'SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC, rowid ASC',
      sessionId,
    );
    return rows.map(rowToMessage);
  }

  async appendMessage(
    sessionId: string,
    input: AppendMessageInput,
  ): Promise<PersistedMessage> {
    const db = this.requireDb();
    const sessionRow = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM sessions WHERE id = ?',
      sessionId,
    );
    if (!sessionRow) throw new SessionNotFoundError(sessionId);

    const now = new Date().toISOString();
    const message: PersistedMessage = {
      id: input.id ?? Crypto.randomUUID(),
      sessionId,
      role: input.role,
      parts: input.parts,
      createdAt: now,
    };

    await db.withTransactionAsync(async () => {
      await db.runAsync(
        'INSERT INTO messages (id, session_id, role, parts, created_at) VALUES (?, ?, ?, ?, ?)',
        message.id,
        message.sessionId,
        message.role,
        JSON.stringify(message.parts),
        message.createdAt,
      );
      await db.runAsync(
        'UPDATE sessions SET updated_at = ? WHERE id = ?',
        now,
        sessionId,
      );
    });

    this.pubsub.emit('messages-changed', { sessionId });
    return message;
  }

  async deleteMessage(id: string): Promise<void> {
    const db = this.requireDb();
    const row = await db.getFirstAsync<{ session_id: string }>(
      'SELECT session_id FROM messages WHERE id = ?',
      id,
    );
    if (!row) return;
    await db.runAsync('DELETE FROM messages WHERE id = ?', id);
    this.pubsub.emit('messages-changed', { sessionId: row.session_id });
  }

  subscribe(event: StoreEvent, listener: StoreEventListener): () => void {
    return this.pubsub.subscribe(event, listener);
  }
}

function rowToSession(row: SessionRow): Session {
  return {
    id: row.id,
    title: row.title,
    providerId: row.provider_id,
    modelId: row.model_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    metadata: JSON.parse(row.metadata) as Record<string, unknown>,
  };
}

function rowToMessage(row: MessageRow): PersistedMessage {
  let parts: PersistedMessage['parts'];
  try {
    parts = JSON.parse(row.parts);
  } catch (e) {
    throw new CorruptMessageError(row.id, e);
  }
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role as PersistedMessage['role'],
    parts,
    createdAt: row.created_at,
  };
}
