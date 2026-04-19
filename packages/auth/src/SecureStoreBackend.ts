import * as SecureStore from 'expo-secure-store';

const KEY_PREFIX = 'rn-ai-kit.cred.';
const INDEX_KEY = 'rn-ai-kit.cred-index';

export interface StoredCredential {
  apiKey: string;
  expiresAt: string | null;
  refreshToken?: string;
  tokenType?: string;
}

export class SecureStoreBackend {
  async get(providerId: string): Promise<StoredCredential | null> {
    const raw = await SecureStore.getItemAsync(`${KEY_PREFIX}${providerId}`);
    if (!raw) return null;
    return JSON.parse(raw) as StoredCredential;
  }

  async set(providerId: string, credential: StoredCredential): Promise<void> {
    await SecureStore.setItemAsync(
      `${KEY_PREFIX}${providerId}`,
      JSON.stringify(credential),
    );
    await this.addToIndex(providerId);
  }

  async delete(providerId: string): Promise<void> {
    await SecureStore.deleteItemAsync(`${KEY_PREFIX}${providerId}`);
    await this.removeFromIndex(providerId);
  }

  async listProviderIds(): Promise<string[]> {
    const raw = await SecureStore.getItemAsync(INDEX_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as string[];
  }

  private async addToIndex(providerId: string): Promise<void> {
    const ids = await this.listProviderIds();
    if (!ids.includes(providerId)) {
      ids.push(providerId);
      await SecureStore.setItemAsync(INDEX_KEY, JSON.stringify(ids));
    }
  }

  private async removeFromIndex(providerId: string): Promise<void> {
    const ids = await this.listProviderIds();
    const filtered = ids.filter((id) => id !== providerId);
    await SecureStore.setItemAsync(INDEX_KEY, JSON.stringify(filtered));
  }
}
