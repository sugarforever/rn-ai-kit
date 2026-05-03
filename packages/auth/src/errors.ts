export class LoopbackUnavailableError extends Error {
  readonly code = 'loopback_unavailable' as const;
  constructor(message: string) {
    super(message);
    this.name = 'LoopbackUnavailableError';
  }
}

export class LoopbackTimeoutError extends Error {
  readonly code = 'loopback_timeout' as const;
  constructor(message = 'Loopback callback listener timed out') {
    super(message);
    this.name = 'LoopbackTimeoutError';
  }
}

export class AuthCancelledError extends Error {
  readonly code = 'auth_cancelled' as const;
  constructor(message = 'Authorization was cancelled') {
    super(message);
    this.name = 'AuthCancelledError';
  }
}
