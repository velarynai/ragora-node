/**
 * Custom error class for Ragora API errors.
 */

import type { APIError } from './types.js';

export class RagoraError extends Error {
  /** HTTP status code */
  readonly statusCode: number;
  /** Structured error from API */
  readonly error?: APIError;
  /** Request ID for debugging */
  readonly requestId?: string;

  constructor(
    message: string,
    statusCode: number,
    error?: APIError,
    requestId?: string
  ) {
    super(message);
    this.name = 'RagoraError';
    this.statusCode = statusCode;
    this.error = error;
    this.requestId = requestId;

    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RagoraError);
    }
  }

  /** Check if this is a rate limit error */
  get isRateLimited(): boolean {
    return this.statusCode === 429;
  }

  /** Check if this is an authentication error */
  get isAuthError(): boolean {
    return this.statusCode === 401 || this.statusCode === 403;
  }

  /** Check if this error is worth retrying */
  get isRetryable(): boolean {
    return [429, 500, 502, 503, 504].includes(this.statusCode);
  }

  override toString(): string {
    const parts = [`[${this.statusCode}] ${this.message}`];
    if (this.requestId) {
      parts.push(`(Request ID: ${this.requestId})`);
    }
    return parts.join(' ');
  }
}

export class AuthenticationError extends RagoraError {
  constructor(message: string, error?: APIError, requestId?: string) {
    super(message, 401, error, requestId);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends RagoraError {
  constructor(message: string, error?: APIError, requestId?: string) {
    super(message, 403, error, requestId);
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends RagoraError {
  constructor(message: string, error?: APIError, requestId?: string) {
    super(message, 404, error, requestId);
    this.name = 'NotFoundError';
  }
}

export class RateLimitError extends RagoraError {
  readonly retryAfter?: number;

  constructor(
    message: string,
    error?: APIError,
    requestId?: string,
    retryAfter?: number
  ) {
    super(message, 429, error, requestId);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

export class ServerError extends RagoraError {
  constructor(
    message: string,
    statusCode: number,
    error?: APIError,
    requestId?: string
  ) {
    super(message, statusCode, error, requestId);
    this.name = 'ServerError';
  }
}
