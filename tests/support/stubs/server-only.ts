/**
 * Replaces the package `server-only` in the tests. The package throws when a
 * module that is not a server component imports it, and a test is not one.
 * The build still enforces the boundary (`sds-nextjs-backend` §1).
 */
export {};
