import { SecureStoreBackend } from '../src/SecureStoreBackend';

// Mock expo-secure-store
const mockStore: Record<string, string> = {};
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn((key: string) => Promise.resolve(mockStore[key] ?? null)),
  setItemAsync: jest.fn((key: string, value: string) => {
    mockStore[key] = value;
    return Promise.resolve();
  }),
  deleteItemAsync: jest.fn((key: string) => {
    delete mockStore[key];
    return Promise.resolve();
  }),
}));

beforeEach(() => {
  Object.keys(mockStore).forEach((k) => delete mockStore[k]);
});

describe('SecureStoreBackend', () => {
  const backend = new SecureStoreBackend();

  it('stores and retrieves a credential', async () => {
    await backend.set('anthropic', { apiKey: 'sk-ant-123', expiresAt: null });
    const result = await backend.get('anthropic');
    expect(result).toEqual({ apiKey: 'sk-ant-123', expiresAt: null });
  });

  it('returns null for missing credential', async () => {
    const result = await backend.get('nonexistent');
    expect(result).toBeNull();
  });

  it('deletes a credential', async () => {
    await backend.set('openai', { apiKey: 'sk-oai-456', expiresAt: null });
    await backend.delete('openai');
    const result = await backend.get('openai');
    expect(result).toBeNull();
  });

  it('lists stored provider IDs', async () => {
    await backend.set('anthropic', { apiKey: 'sk-1', expiresAt: null });
    await backend.set('openai', { apiKey: 'sk-2', expiresAt: null });
    const ids = await backend.listProviderIds();
    expect(ids).toContain('anthropic');
    expect(ids).toContain('openai');
  });
});
