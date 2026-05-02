import { AuthManager, OAuthMobileAdapter, SecureStoreBackend } from '@rn-ai-kit/auth';
import { createTcpLoopback } from '@rn-ai-kit/auth/loopback';

// Orla-scoped keychain namespace → keys are `orla.cred.*` and `orla.cred-index`.
// `createTcpLoopback()` enables automatic OAuth callback capture for
// loopback-redirect providers (OpenAI Codex). Manual paste survives as a
// fallback when the listener can't bind.
export const authManager = new AuthManager(
  new SecureStoreBackend({ namespace: 'orla' }),
  new OAuthMobileAdapter({ loopback: createTcpLoopback() }),
);
