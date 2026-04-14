export interface SQLiteDatabase {
  execSync(sql: string): void;
  runSync(sql: string, ...params: unknown[]): void;
  getAllSync(sql: string, ...params: unknown[]): Record<string, unknown>[];
}

export class SqliteProxy {
  private db: SQLiteDatabase;

  constructor(db: SQLiteDatabase) {
    this.db = db;
  }

  async exec(payload: { sql: string; params?: unknown[] }): Promise<void> {
    if (payload.params?.length) {
      this.db.runSync(payload.sql, ...payload.params);
    } else {
      this.db.execSync(payload.sql);
    }
  }

  async query(payload: {
    sql: string;
    params?: unknown[];
  }): Promise<Record<string, unknown>[]> {
    // Enforce read-only: only SELECT and WITH (CTE) queries are allowed
    const trimmed = payload.sql.trim().toUpperCase();
    if (!trimmed.startsWith('SELECT') && !trimmed.startsWith('WITH')) {
      throw new Error('Only SELECT queries are allowed via query()');
    }

    if (payload.params?.length) {
      return this.db.getAllSync(payload.sql, ...payload.params);
    }
    return this.db.getAllSync(payload.sql);
  }
}
