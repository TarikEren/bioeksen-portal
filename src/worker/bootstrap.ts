/**
 * The bootstrap command, `pnpm run bootstrap` (ACC-40).
 *
 * Stage B1 step 4 builds it: it makes the permissions, the roles and their
 * bundles in the database match the registry (ACC-30), and it creates the first
 * Platform Administrator and sends the invitation. This file is a stub of
 * step 2.
 */
import { NotImplemented } from "@/lib/errors";

// MOCK: ACC-40
export function bootstrap(): Promise<void> {
  return Promise.reject(new NotImplemented("worker.bootstrap"));
}
