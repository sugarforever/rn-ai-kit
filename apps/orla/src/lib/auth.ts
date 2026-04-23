import { AuthManager, SecureStoreBackend } from '@rn-ai-kit/auth';

// Orla-scoped keychain namespace → keys are `orla.cred.*` and `orla.cred-index`.
export const authManager = new AuthManager(
  new SecureStoreBackend({ namespace: 'orla' }),
);
