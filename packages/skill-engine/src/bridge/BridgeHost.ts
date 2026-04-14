import type { BridgeMessage, BridgeResponse } from '../types';
import { FetchProxy } from './FetchProxy';
import { SqliteProxy } from './SqliteProxy';
import { FsProxy } from './FsProxy';

export interface BridgeHostConfig {
  skillId: string;
  allowedDomains: string[];
  sendToWebView: (response: BridgeResponse) => void;
  db?: any;
  dataDir?: string;
}

export class BridgeHost {
  private fetchProxy: FetchProxy;
  private sqliteProxy: SqliteProxy | null;
  private fsProxy: FsProxy | null;
  private sendToWebView: (response: BridgeResponse) => void;

  constructor(config: BridgeHostConfig) {
    this.fetchProxy = new FetchProxy(config.allowedDomains);
    this.sqliteProxy = config.db ? new SqliteProxy(config.db) : null;
    this.fsProxy = config.dataDir ? new FsProxy(config.dataDir) : null;
    this.sendToWebView = config.sendToWebView;
  }

  async handleMessage(msg: BridgeMessage): Promise<void> {
    let response: BridgeResponse;

    try {
      switch (msg.type) {
        case 'fetch': {
          const data = await this.fetchProxy.handle(msg.payload as any);
          response = { id: msg.id, success: true, data };
          break;
        }
        case 'sqlite-exec': {
          if (!this.sqliteProxy) throw new Error('SQLite not configured');
          await this.sqliteProxy.exec(msg.payload as any);
          response = { id: msg.id, success: true };
          break;
        }
        case 'sqlite-query': {
          if (!this.sqliteProxy) throw new Error('SQLite not configured');
          const rows = await this.sqliteProxy.query(msg.payload as any);
          response = { id: msg.id, success: true, data: rows };
          break;
        }
        case 'fs-read': {
          if (!this.fsProxy) throw new Error('Filesystem not configured');
          const content = await this.fsProxy.read(msg.payload as any);
          response = { id: msg.id, success: true, data: content };
          break;
        }
        case 'fs-write': {
          if (!this.fsProxy) throw new Error('Filesystem not configured');
          await this.fsProxy.write(msg.payload as any);
          response = { id: msg.id, success: true };
          break;
        }
        default:
          response = { id: msg.id, success: false, error: `Unknown message type: ${msg.type}` };
      }
    } catch (err: any) {
      response = { id: msg.id, success: false, error: err.message };
    }

    this.sendToWebView(response);
  }
}
