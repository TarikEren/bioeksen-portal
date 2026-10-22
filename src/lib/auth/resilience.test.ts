import { describe, expect, it } from "vitest";

import { CircuitBreaker, type BreakerState, RetryBudget, fullJitter } from "./resilience";

const SECOND = 1000;

// Source: sds-api-design/references/service-calls.md (Retry budget, Circuit breaker, How to retry);
// review 2, R-030.
describe("RetryBudget", () => {
  it("allows 3 retries with no successful request", () => {
    const budget = new RetryBudget();
    let allowed = 0;
    for (let index = 0; index < 6; index += 1) {
      if (budget.allowsRetry(0)) {
        budget.recordRetry(0);
        allowed += 1;
      }
    }

    expect(allowed).toBe(3);
  });

  it("adds one retry for each 10 successful requests of the last 60 seconds", () => {
    const budget = new RetryBudget();
    for (let index = 0; index < 20; index += 1) {
      budget.recordSuccess(0);
    }
    let allowed = 0;
    for (let index = 0; index < 10; index += 1) {
      if (budget.allowsRetry(1 * SECOND)) {
        budget.recordRetry(1 * SECOND);
        allowed += 1;
      }
    }

    expect(allowed).toBe(5);
  });

  it("forgets requests and retries after 60 seconds", () => {
    const budget = new RetryBudget();
    for (let index = 0; index < 3; index += 1) {
      budget.recordRetry(0);
    }

    expect(budget.allowsRetry(59 * SECOND)).toBe(false);
    expect(budget.allowsRetry(60 * SECOND)).toBe(true);
  });
});

describe("CircuitBreaker", () => {
  function breaker(): { breaker: CircuitBreaker; states: BreakerState[] } {
    const states: BreakerState[] = [];
    return { breaker: new CircuitBreaker({ onTransition: (state) => states.push(state) }), states };
  }

  it("stays closed below 5 consecutive failures, and a success resets the count", () => {
    const { breaker: b, states } = breaker();
    for (let index = 0; index < 4; index += 1) {
      b.recordRetryableFailure(0);
    }
    b.recordSuccess();
    for (let index = 0; index < 4; index += 1) {
      b.recordRetryableFailure(0);
    }

    expect(b.currentState).toBe("closed");
    expect(b.allowsCall(0)).toBe(true);
    expect(states).toEqual([]);
  });

  it("opens at 5 consecutive failures and refuses calls at once", () => {
    const { breaker: b, states } = breaker();
    for (let index = 0; index < 5; index += 1) {
      b.recordRetryableFailure(0);
    }

    expect(b.currentState).toBe("open");
    expect(b.allowsCall(29 * SECOND)).toBe(false);
    expect(states).toEqual(["open"]);
  });

  it("is half-open after 30 seconds and allows one trial at a time", () => {
    const { breaker: b } = breaker();
    for (let index = 0; index < 5; index += 1) {
      b.recordRetryableFailure(0);
    }

    expect(b.allowsCall(30 * SECOND)).toBe(true);
    expect(b.currentState).toBe("half-open");
    expect(b.allowsCall(30 * SECOND)).toBe(false);
  });

  it("closes after a successful trial, and logs the changes of state in order", () => {
    const { breaker: b, states } = breaker();
    for (let index = 0; index < 5; index += 1) {
      b.recordRetryableFailure(0);
    }
    b.allowsCall(30 * SECOND);
    b.recordSuccess();

    expect(b.currentState).toBe("closed");
    expect(b.allowsCall(30 * SECOND)).toBe(true);
    expect(states).toEqual(["open", "half-open", "closed"]);
  });

  it("opens again after a failed trial, and doubles the cooldown up to 5 minutes", () => {
    const { breaker: b } = breaker();
    for (let index = 0; index < 5; index += 1) {
      b.recordRetryableFailure(0);
    }
    let now = 0;
    const cooldowns: number[] = [];
    for (let reopen = 0; reopen < 6; reopen += 1) {
      let waited = 0;
      while (!b.allowsCall(now + waited)) {
        waited += SECOND;
      }
      now += waited;
      cooldowns.push(waited / SECOND);
      b.recordRetryableFailure(now);
    }

    expect(cooldowns).toEqual([30, 60, 120, 240, 300, 300]);
  });
});

describe("fullJitter", () => {
  it("is a random time from zero to the delay", () => {
    expect(fullJitter(200, () => 0)).toBe(0);
    expect(fullJitter(200, () => 0.5)).toBe(100);
    expect(fullJitter(200, () => 0.999)).toBe(199);
  });

  it("is not a fixed wait", () => {
    const waits = new Set(Array.from({ length: 50 }, () => fullJitter(200)));

    expect(waits.size).toBeGreaterThan(5);
    expect([...waits].every((wait) => wait >= 0 && wait < 200)).toBe(true);
  });
});
