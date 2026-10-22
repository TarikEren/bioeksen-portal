/**
 * A stand-in for the database transaction (stage B1, step 2).
 *
 * A service that changes data runs its work in `runMockTransaction`. The audit
 * row and the mail wait in the transaction and take effect after the work
 * returns, so a failed change leaves no audit row and sends no mail (PLT-40.AC2,
 * DEC-033). Stage B1 step 4 replaces this file with the real transaction helper.
 */
import "server-only";

// MOCK: PLT-40
export interface MockTransaction {
  /** Runs `effect` after the work has committed. A rollback drops it. */
  afterCommit(effect: () => void | Promise<void>): void;
}

// MOCK: PLT-40
export async function runMockTransaction<TResult>(work: (tx: MockTransaction) => Promise<TResult>): Promise<TResult> {
  const effects: (() => void | Promise<void>)[] = [];
  const tx: MockTransaction = {
    afterCommit(effect) {
      effects.push(effect);
    },
  };
  const result = await work(tx);
  for (const effect of effects) {
    await effect();
  }
  return result;
}
