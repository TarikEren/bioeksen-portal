/**
 * Setup of the Vitest project `component`: the DOM matchers of Testing Library,
 * and the cleanup of the rendered trees after each test.
 */
import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
