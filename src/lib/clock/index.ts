/**
 * The clock of the app (stage B1 contract, **Redis**). Every service that
 * needs the time calls `now()`, never `Date.now()` or `new Date()`, so that
 * the test seam can move the clock in the test phase.
 */

/** The current time. */
export function now(): Date {
  return new Date();
}
