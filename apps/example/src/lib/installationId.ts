import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

const KEY = 'rn-ai-kit.installation-id';

let cached: string | null = null;

export async function getInstallationId(): Promise<string> {
  if (cached) return cached;
  const existing = await SecureStore.getItemAsync(KEY);
  if (existing) {
    cached = existing;
    return existing;
  }
  const fresh = Crypto.randomUUID();
  await SecureStore.setItemAsync(KEY, fresh);
  cached = fresh;
  return fresh;
}
