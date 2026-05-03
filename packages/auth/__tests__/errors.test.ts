import {
  LoopbackUnavailableError,
  LoopbackTimeoutError,
  AuthCancelledError,
} from '../src/errors';

describe('error classes', () => {
  it('LoopbackUnavailableError carries a stable code', () => {
    const err = new LoopbackUnavailableError('bind failed');
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('loopback_unavailable');
    expect(err.message).toBe('bind failed');
    expect(err.name).toBe('LoopbackUnavailableError');
  });

  it('LoopbackTimeoutError carries a stable code', () => {
    const err = new LoopbackTimeoutError('5 minutes elapsed');
    expect(err.code).toBe('loopback_timeout');
    expect(err.name).toBe('LoopbackTimeoutError');
  });

  it('AuthCancelledError carries a stable code', () => {
    const err = new AuthCancelledError();
    expect(err.code).toBe('auth_cancelled');
    expect(err.name).toBe('AuthCancelledError');
  });
});
