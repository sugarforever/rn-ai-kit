import * as SecureStore from 'expo-secure-store';

export interface SecureStoreBackendOptions {
  /**
   * Namespace for keychain keys. Defaults to 'rn-ai-kit'.
   * Credentials are stored as `{namespace}.cred.{providerId}`,
   * and the provider index at `{namespace}.cred-index`.
   */
  namespace?: string;
}

export interface StoredCredential {
  apiKey: string;
  expiresAt: string | null;
  refreshToken?: string;
  tokenType?: string;
}

export class SecureStoreBackend {
  private readonly keyPrefix: string;
  private readonly indexKey: string;

  constructor(options: SecureStoreBackendOptions = {}) {
    const namespace = options.namespace ?? 'rn-ai-kit';
    this.keyPrefix = `${namespace}.cred.`;
    this.indexKey = `${namespace}.cred-index`;
  }

  async get(providerId: string): Promise<StoredCredential | null> {
    const raw = await SecureStore.getItemAsync(`${this.keyPrefix}${providerId}`);
    if (!raw) return null;
    return JSON.parse(raw) as StoredCredential;
  }

  async set(providerId: string, credential: StoredCredential): Promise<void> {
    await SecureStore.setItemAsync(
      `${this.keyPrefix}${providerId}`,
      JSON.stringify(credential),
    );
    await this.addToIndex(providerId);
  }

  async delete(providerId: string): Promise<void> {
    await SecureStore.deleteItemAsync(`${this.keyPrefix}${providerId}`);
    await this.removeFromIndex(providerId);
  }

  async listProviderIds(): Promise<string[]> {
    const raw = await SecureStore.getItemAsync(this.indexKey);
    if (!raw) return [];
    return JSON.parse(raw) as string[];
  }

  private async addToIndex(providerId: string): Promise<void> {
    const ids = await this.listProviderIds();
    if (!ids.includes(providerId)) {
      ids.push(providerId);
      await SecureStore.setItemAsync(this.indexKey, JSON.stringify(ids));
    }
  }

  private async removeFromIndex(providerId: string): Promise<void> {
    const ids = await this.listProviderIds();
    const filtered = ids.filter((id) => id !== providerId);
    await SecureStore.setItemAsync(this.indexKey, JSON.stringify(filtered));
  }
}
