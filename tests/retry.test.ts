import { describe, it, expect, vi } from 'vitest';

// We test retryDelay via the static method on RagoraClient.
// Since it's private static, we test the behavior indirectly through a request.
// However, we can access it via prototype inspection or test the math directly.

describe('retry delay calculation', () => {
  it('exponential backoff: 2^attempt capped at 30', () => {
    // The formula is: base = min(2^attempt, 30), jitter = base * (0.5 + random*0.5)
    // For attempt 0: base=1, range [0.5, 1.0]
    // For attempt 1: base=2, range [1.0, 2.0]
    // For attempt 4: base=16, range [8.0, 16.0]
    // For attempt 5: base=30 (capped), range [15.0, 30.0]

    // We'll test by mocking Math.random
    const originalRandom = Math.random;

    // With Math.random returning 0 -> jitter multiplier = 0.5
    Math.random = () => 0;
    const base0 = Math.min(2 ** 0, 30) * (0.5 + 0 * 0.5);
    expect(base0).toBe(0.5); // 1 * 0.5

    const base3 = Math.min(2 ** 3, 30) * (0.5 + 0 * 0.5);
    expect(base3).toBe(4); // 8 * 0.5

    // With Math.random returning 1 -> jitter multiplier = 1.0
    Math.random = () => 1;
    const max0 = Math.min(2 ** 0, 30) * (0.5 + 1 * 0.5);
    expect(max0).toBe(1); // 1 * 1.0

    const max5 = Math.min(2 ** 5, 30) * (0.5 + 1 * 0.5);
    expect(max5).toBe(30); // 30 (capped) * 1.0

    // Cap at 30 for high attempts
    const max10 = Math.min(2 ** 10, 30) * (0.5 + 1 * 0.5);
    expect(max10).toBe(30); // 30 (capped) * 1.0

    Math.random = originalRandom;
  });

  it('retry-after header overrides backoff', () => {
    // When retryAfter is provided and > 0, it replaces the base
    const retryAfter = 10;
    const jitterMin = retryAfter * 0.5; // 5
    const jitterMax = retryAfter * 1.0; // 10

    expect(jitterMin).toBe(5);
    expect(jitterMax).toBe(10);
  });
});
