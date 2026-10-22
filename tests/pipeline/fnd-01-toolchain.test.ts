/**
 * FND-01 Repository and toolchain: AC1, the commands on a clean copy.
 *
 * The copy holds what a clean checkout holds (tests/support/repo-copy.ts): no
 * `node_modules`, no `.next`, no `.env`. The commands run in the order of the
 * criterion, so each test needs the one before it.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type RepositoryCopy, copyRepository, tail } from "../support/repo-copy";

let copy: RepositoryCopy;

beforeAll(() => {
  copy = copyRepository({ linkNodeModules: false });
});

afterAll(() => {
  copy.remove();
});

describe("FND-01 toolchain on a clean checkout", () => {
  /** On a clean checkout, pnpm install --frozen-lockfile exits 0. */
  it("FND-01.AC1: pnpm install --frozen-lockfile exits 0 on a clean checkout", async () => {
    const result = await copy.pnpm(["install", "--frozen-lockfile"]);

    expect(result.code, tail(result)).toBe(0);
  });

  /** After the install, pnpm run typecheck exits 0. */
  it("FND-01.AC1: pnpm run typecheck exits 0 on a clean checkout", async () => {
    const result = await copy.pnpm(["run", "typecheck"]);

    expect(result.code, tail(result)).toBe(0);
  });

  /** After the install, pnpm run lint exits 0. */
  it("FND-01.AC1: pnpm run lint exits 0 on a clean checkout", async () => {
    const result = await copy.pnpm(["run", "lint"]);

    expect(result.code, tail(result)).toBe(0);
  });

  /** After the install, pnpm run build exits 0. */
  it("FND-01.AC1: pnpm run build exits 0 on a clean checkout", async () => {
    const result = await copy.pnpm(["run", "build"]);

    expect(result.code, tail(result)).toBe(0);
  });
});
