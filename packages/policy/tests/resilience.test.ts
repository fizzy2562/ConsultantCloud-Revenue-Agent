import { describe, expect, it, vi } from "vitest";
import { CircuitBreaker, CircuitOpenError, withRetry } from "../src/resilience.js";

describe("withRetry", () => {
  it("succeeds on the first attempt", async () => {
    const fn = vi.fn(async () => "success");

    await expect(withRetry(fn)).resolves.toBe("success");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries failures and returns the eventual result", async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls += 1;
      if (calls < 3) {
        throw new Error(`failure ${calls}`);
      }
      return "recovered";
    });

    await expect(withRetry(fn, { maxAttempts: 3, baseDelayMs: 1 })).resolves.toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("rethrows the last error after exhausting maxAttempts", async () => {
    const firstError = new Error("first failure");
    const lastError = new Error("last failure");
    const fn = vi
      .fn<() => Promise<never>>()
      .mockRejectedValueOnce(firstError)
      .mockRejectedValue(lastError);

    await expect(withRetry(fn, { maxAttempts: 2, baseDelayMs: 1 })).rejects.toBe(lastError);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe("CircuitBreaker", () => {
  it("passes calls through and resets its failure count after a success", async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 2 });

    await expect(breaker.execute(async () => Promise.reject(new Error("failure")))).rejects.toThrow(
      "failure"
    );
    await expect(breaker.execute(async () => "success")).resolves.toBe("success");
    await expect(
      breaker.execute(async () => Promise.reject(new Error("another failure")))
    ).rejects.toThrow("another failure");

    const fn = vi.fn(async () => "still closed");
    await expect(breaker.execute(fn)).resolves.toBe("still closed");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("opens after consecutive failures and rejects calls without invoking them", async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 1_000 });
    const failingFn = vi.fn(async () => Promise.reject(new Error("failure")));

    await expect(breaker.execute(failingFn)).rejects.toThrow("failure");
    await expect(breaker.execute(failingFn)).rejects.toThrow("failure");

    const blockedFn = vi.fn(async () => "unexpected");
    await expect(breaker.execute(blockedFn)).rejects.toBeInstanceOf(CircuitOpenError);
    expect(blockedFn).not.toHaveBeenCalled();
  });

  it("allows a trial call after the cooldown elapses", async () => {
    vi.useFakeTimers();
    try {
      const breaker = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 10 });
      await expect(breaker.execute(async () => Promise.reject(new Error("failure")))).rejects.toThrow(
        "failure"
      );

      vi.advanceTimersByTime(10);

      const trialFn = vi.fn(async () => "recovered");
      await expect(breaker.execute(trialFn)).resolves.toBe("recovered");
      expect(trialFn).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
