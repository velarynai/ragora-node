import { describe, it, expect } from 'vitest';
import {
  RagoraError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  RateLimitError,
  ServerError,
} from '../src/errors.js';

describe('RagoraError', () => {
  it('stores message and statusCode', () => {
    const err = new RagoraError('something failed', 400);
    expect(err.message).toBe('something failed');
    expect(err.statusCode).toBe(400);
    expect(err.name).toBe('RagoraError');
  });

  it('stores optional error and requestId', () => {
    const apiError = { code: 'bad_request', message: 'bad', details: [] };
    const err = new RagoraError('fail', 400, apiError, 'req-123');
    expect(err.error).toEqual(apiError);
    expect(err.requestId).toBe('req-123');
  });

  it('isRetryable for 429 and 5xx', () => {
    expect(new RagoraError('', 429).isRetryable).toBe(true);
    expect(new RagoraError('', 500).isRetryable).toBe(true);
    expect(new RagoraError('', 502).isRetryable).toBe(true);
    expect(new RagoraError('', 503).isRetryable).toBe(true);
    expect(new RagoraError('', 504).isRetryable).toBe(true);
    expect(new RagoraError('', 400).isRetryable).toBe(false);
    expect(new RagoraError('', 404).isRetryable).toBe(false);
  });

  it('isRateLimited only for 429', () => {
    expect(new RagoraError('', 429).isRateLimited).toBe(true);
    expect(new RagoraError('', 500).isRateLimited).toBe(false);
  });

  it('isAuthError for 401 and 403', () => {
    expect(new RagoraError('', 401).isAuthError).toBe(true);
    expect(new RagoraError('', 403).isAuthError).toBe(true);
    expect(new RagoraError('', 400).isAuthError).toBe(false);
  });

  it('toString includes status code and message', () => {
    const err = new RagoraError('not found', 404, undefined, 'req-abc');
    expect(err.toString()).toBe('[404] not found (Request ID: req-abc)');
  });

  it('toString without requestId', () => {
    const err = new RagoraError('bad request', 400);
    expect(err.toString()).toBe('[400] bad request');
  });
});

describe('AuthenticationError', () => {
  it('has status 401', () => {
    const err = new AuthenticationError('unauthorized');
    expect(err.statusCode).toBe(401);
    expect(err.name).toBe('AuthenticationError');
    expect(err).toBeInstanceOf(RagoraError);
  });
});

describe('AuthorizationError', () => {
  it('has status 403', () => {
    const err = new AuthorizationError('forbidden');
    expect(err.statusCode).toBe(403);
    expect(err.name).toBe('AuthorizationError');
    expect(err).toBeInstanceOf(RagoraError);
  });
});

describe('NotFoundError', () => {
  it('has status 404', () => {
    const err = new NotFoundError('not found');
    expect(err.statusCode).toBe(404);
    expect(err.name).toBe('NotFoundError');
    expect(err).toBeInstanceOf(RagoraError);
  });
});

describe('RateLimitError', () => {
  it('has status 429 and retryAfter', () => {
    const err = new RateLimitError('slow down', undefined, undefined, 30);
    expect(err.statusCode).toBe(429);
    expect(err.retryAfter).toBe(30);
    expect(err.name).toBe('RateLimitError');
    expect(err).toBeInstanceOf(RagoraError);
  });
});

describe('ServerError', () => {
  it('stores custom 5xx status', () => {
    const err = new ServerError('internal', 503);
    expect(err.statusCode).toBe(503);
    expect(err.name).toBe('ServerError');
    expect(err).toBeInstanceOf(RagoraError);
  });
});
