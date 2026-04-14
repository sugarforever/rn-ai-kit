export class SqliteProxy {
  private db: any;

  constructor(db: any) {
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
    if (payload.params?.length) {
      return this.db.getAllSync(payload.sql, ...payload.params);
    }
    return this.db.getAllSync(payload.sql);
  }
}
