/**
 * The retry budget and the circuit breaker of `service-calls.md`, for the calls
 * that one target receives from this app. They are structural rules of the
 * estate, so an app does not tune them away: the retry is a ratio, and the wait
 * before it has full jitter.
 *
 * Both take their time from the caller, so a test fixes the clock. This file is
 * pure: it logs nothing and calls nothing.
 */

const WINDOW_MS = 60_000;

/**
 * The retry budget (`service-calls.md`, **Retry budget**): at most 10% of the
 * successful requests of the last 60 seconds, plus a free allowance of 3
 * retries, so a caller with little traffic can retry at all.
 */
export class RetryBudget {
  private successes: number[] = [];
  private retries: number[] = [];

  private prune(now: number): void {
    this.successes = this.successes.filter((at) => now - at < WINDOW_MS);
    this.retries = this.retries.filter((at) => now - at < WINDOW_MS);
  }

  recordSuccess(now: number): void {
    this.prune(now);
    this.successes.push(now);
  }

  /** Whether one more retry fits the budget. */
  allowsRetry(now: number): boolean {
    this.prune(now);
    return this.retries.length < 3 + Math.floor(this.successes.length * 0.1);
  }

  recordRetry(now: number): void {
    this.prune(now);
    this.retries.push(now);
  }
}

export type BreakerState = "closed" | "open" | "half-open";

export interface BreakerOptions {
  /** Consecutive retryable failures that open the breaker. Default 5. */
  readonly threshold?: number;
  /** The first cooldown. It doubles on each re-open. Default 30 s. */
  readonly cooldownMs?: number;
  /** The longest cooldown. Default 5 minutes. */
  readonly maxCooldownMs?: number;
  /** Called on each change of state, with the new state. */
  readonly onTransition?: (state: BreakerState) => void;
}

/**
 * The circuit breaker of one target (`service-calls.md`, **Circuit breaker**).
 *
 * - Closed: calls go on, and consecutive retryable failures are counted.
 * - Open: calls fail at once, without a network attempt. After the cooldown the
 *   breaker is half-open.
 * - Half-open: one trial call at a time. A success closes the breaker and resets
 *   the count and the cooldown. A failure opens it again with a doubled cooldown.
 *
 * Only a retryable failure counts: a connection failure, a timeout, a 502, 503
 * or 504. An answer that is not one of these, a 4xx too, is a success for the
 * breaker, because the target answered.
 */
export class CircuitBreaker {
  private readonly threshold: number;
  private readonly baseCooldownMs: number;
  private readonly maxCooldownMs: number;
  private readonly onTransition: ((state: BreakerState) => void) | undefined;

  private state: BreakerState = "closed";
  private failures = 0;
  private cooldownMs: number;
  private openedAt = 0;
  private trialInFlight = false;

  constructor(options: BreakerOptions = {}) {
    this.threshold = options.threshold ?? 5;
    this.baseCooldownMs = options.cooldownMs ?? 30_000;
    this.maxCooldownMs = options.maxCooldownMs ?? 300_000;
    this.cooldownMs = this.baseCooldownMs;
    this.onTransition = options.onTransition;
  }

  get currentState(): BreakerState {
    return this.state;
  }

  private moveTo(next: BreakerState): void {
    if (this.state !== next) {
      this.state = next;
      this.onTransition?.(next);
    }
  }

  /**
   * Whether a call may go to the network now. A `true` in the half-open state is
   * the one trial, and the caller must report its outcome.
   */
  allowsCall(now: number): boolean {
    if (this.state === "open" && now - this.openedAt >= this.cooldownMs) {
      this.moveTo("half-open");
    }
    switch (this.state) {
      case "closed":
        return true;
      case "open":
        return false;
      case "half-open":
        if (this.trialInFlight) {
          return false;
        }
        this.trialInFlight = true;
        return true;
    }
  }

  recordSuccess(): void {
    this.failures = 0;
    this.trialInFlight = false;
    this.cooldownMs = this.baseCooldownMs;
    this.moveTo("closed");
  }

  recordRetryableFailure(now: number): void {
    this.trialInFlight = false;
    if (this.state === "half-open") {
      this.cooldownMs = Math.min(this.cooldownMs * 2, this.maxCooldownMs);
      this.openedAt = now;
      this.moveTo("open");
      return;
    }
    this.failures += 1;
    if (this.state === "closed" && this.failures >= this.threshold) {
      this.openedAt = now;
      this.moveTo("open");
    }
  }
}

/**
 * Full jitter (`service-calls.md`, **How to retry**): the wait is a random value
 * from zero to the computed delay. `random` returns a number in [0, 1).
 */
export function fullJitter(delayMs: number, random: () => number = Math.random): number {
  return Math.floor(random() * delayMs);
}
