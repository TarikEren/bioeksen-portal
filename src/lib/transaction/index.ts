/**
 * The transaction helper (DEC-014, DEC-033, `sds-database` §5). It is not under
 * `src/lib/db/`: a service imports it, and no service imports the client.
 *
 * A service that changes data runs its work in `runTransaction`. The work reads,
 * checks and writes through the transaction, so the change, its audit row and
 * its `AUDIT` log record commit or roll back together (PLT-40.AC1, AC2). A mail
 * and any other effect outside the database wait for the commit through
 * `afterCommit`, and a rollback drops them (PLT-20 rule 4).
 *
 * A failure of the driver becomes the `AppError` of the registry here
 * (`toDatabaseError`), so a raw driver error never reaches a service.
 */
import "server-only";

import { logger } from "@/lib/logging";

import { type DbTransactionContext, type Executor, getDb, toDatabaseError } from "@/lib/db";

export type { Executor } from "@/lib/db";
/** The name of the constraint or the trigger rule that a failure names. A service uses it to tell one refusal from another. */
export { violatedConstraint } from "@/lib/db";

/** An effect that runs after the commit. It must not throw: the change is done already. */
export type AfterCommitEffect = () => void | Promise<void>;

export interface AfterCommitOptions {
  /**
   * Start the effect and do not wait for it. The answer of the caller does not
   * depend on the time of the effect, so the time cannot tell what the effect
   * did (the password reset of ACC-11.AC1 sends a mail only to an active user).
   */
  readonly detached?: boolean;
}

/** The context of one transaction: the ORM of the transaction and the hook for the effects. */
export interface Transaction extends Executor {
  /** Runs `effect` after the transaction commits. A rollback drops it. */
  afterCommit(effect: AfterCommitEffect, options?: AfterCommitOptions): void;
}

/** The client for a read that needs no transaction. A service passes it to a repository. */
export function readExecutor(): Executor {
  return getDb();
}

interface PendingEffect {
  readonly effect: AfterCommitEffect;
  readonly detached: boolean;
}

function toTransaction(context: DbTransactionContext, effects: PendingEffect[]): Transaction {
  return {
    orm: context.orm,
    afterCommit(effect, options = {}) {
      effects.push({ effect, detached: options.detached === true });
    },
  };
}

/** Runs one effect. A failure is logged and never thrown: the change is committed. */
async function runEffect(effect: AfterCommitEffect): Promise<void> {
  try {
    await effect();
  } catch (error) {
    logger.failure("SYS-5000", { tail: { step: "after-commit effect" }, error });
  }
}

/**
 * Runs `work` in one database transaction. It commits when `work` returns and
 * rolls back when `work` throws. Each effect of `afterCommit` runs after the
 * commit, in the order given, and a failed effect never undoes the change.
 *
 * @throws AppError The error that `work` threw, or the code of the registry for a failure of the driver.
 */
export async function runTransaction<TResult>(work: (tx: Transaction) => Promise<TResult>): Promise<TResult> {
  const effects: PendingEffect[] = [];
  let result: TResult;
  try {
    result = await getDb().transaction((context) => work(toTransaction(context, effects)));
  } catch (error) {
    throw toDatabaseError(error, "write");
  }
  for (const { effect, detached } of effects) {
    if (detached) {
      void runEffect(effect);
    } else {
      await runEffect(effect);
    }
  }
  return result;
}
