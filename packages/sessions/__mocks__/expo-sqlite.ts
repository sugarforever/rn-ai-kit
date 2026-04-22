import BetterSqlite3 from 'better-sqlite3';

class SQLiteDatabase {
  constructor(private db: BetterSqlite3.Database) {}

  async execAsync(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  async runAsync(
    sql: string,
    ...params: unknown[]
  ): Promise<{ lastInsertRowId: number; changes: number }> {
    const stmt = this.db.prepare(sql);
    const info = stmt.run(...flattenParams(params));
    return {
      lastInsertRowId: Number(info.lastInsertRowid),
      changes: info.changes,
    };
  }

  async getAllAsync<T = unknown>(sql: string, ...params: unknown[]): Promise<T[]> {
    const stmt = this.db.prepare(sql);
    return stmt.all(...flattenParams(params)) as T[];
  }

  async getFirstAsync<T = unknown>(sql: string, ...params: unknown[]): Promise<T | null> {
    const stmt = this.db.prepare(sql);
    const row = stmt.get(...flattenParams(params));
    return (row ?? null) as T | null;
  }

  async withTransactionAsync(fn: () => Promise<void>): Promise<void> {
    this.db.exec('BEGIN');
    try {
      await fn();
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  async closeAsync(): Promise<void> {
    this.db.close();
  }
}

function flattenParams(params: unknown[]): unknown[] {
  if (params.length === 1 && Array.isArray(params[0])) return params[0] as unknown[];
  return params as unknown[];
}

export async function openDatabaseAsync(_name: string): Promise<SQLiteDatabase> {
  const db = new BetterSqlite3(':memory:');
  db.pragma('foreign_keys = ON');
  return new SQLiteDatabase(db);
}

export type { SQLiteDatabase };
