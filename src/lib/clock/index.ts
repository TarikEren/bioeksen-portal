/**
 * The clock of the app (stage B1 contract, **Redis**). Every service that
 * needs the time calls `now()`, never `Date.now()` or `new Date()`, so that the
 * test seam can move the clock in the test phase.
 *
 * The seam (`POST /api/test/clock`, FND-03 rule 4) sets an offset, and the clock
 * goes on ticking from the instant it was set. Without the seam the offset is
 * zero and `now()` is the system time. The offset is on `globalThis` under a
 * symbol, because a route handler, a server action and a page can load this
 * module as separate instances; this is the one use of a process-wide holder
 * besides the development cache of the database client, and only the seam writes
 * to it. The clock of the worker is its own: the seam moves the clock of the app.
 */
import { isTestSeamEnabled } from "@/lib/config";
import { AppError } from "@/lib/errors";

const OFFSET_KEY = Symbol.for("bioeksen.clock.offsetMs");

function offsetMs(): number {
  const stored: unknown = Reflect.get(globalThis, OFFSET_KEY);
  return typeof stored === "number" ? stored : 0;
}

/** The current time. */
export function now(): Date {
  return new Date(Date.now() + offsetMs());
}

/**
 * Moves the clock to an instant, or back to the system time with `null`. The
 * clock goes on ticking from the instant.
 *
 * @throws AppError `RES-4200` when the test seams are closed (FND-03 rule 4).
 */
export function setClockForTest(target: Date | null): Date {
  if (!isTestSeamEnabled()) {
    throw new AppError("RES-4200", "Resource does not exist", { reason: "the test seams are closed" });
  }
  Reflect.set(globalThis, OFFSET_KEY, target === null ? 0 : target.getTime() - Date.now());
  return now();
}
