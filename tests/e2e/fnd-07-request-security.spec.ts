/**
 * FND-07 Request security: AC1, AC2, AC4.
 *
 * AC4 is here and not in the integration tier of the stage plan: the
 * Next.js origin check of server actions runs in the server, before the
 * action, so only a request to a running app reaches it.
 */
import type { APIResponse } from "@playwright/test";

import { chooseLanguage } from "../support/language";
import { expect, test } from "./fixtures";

/** The directives of a Content-Security-Policy header, by name. */
function directives(header: string): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const part of header.split(";")) {
    const [name, ...values] = part.trim().split(/\s+/);
    if (name !== undefined && name !== "") {
      result.set(name.toLowerCase(), values);
    }
  }
  return result;
}

function nonceOf(scriptSrc: readonly string[]): string | undefined {
  return scriptSrc.find((value) => /^'nonce-[^']+'$/.test(value));
}

/** The pages that answer with HTML: the entry page, and a page that does not exist. */
const HTML_PATHS = ["/", "/qa-no-such-page"];

test.describe("FND-07 headers", () => {
  for (const pagePath of HTML_PATHS) {
    /** Each HTML answer has a CSP: a new script-src nonce, no unsafe-inline or unsafe-eval, frame-ancestors 'none'. */
    test(`FND-07.AC1: the HTML answer of ${pagePath} carries the Content-Security-Policy`, async ({
      request,
      configuredApp,
    }) => {
      const first = await request.get(`${configuredApp.baseUrl}${pagePath}`);
      const second = await request.get(`${configuredApp.baseUrl}${pagePath}`);
      expect(first.headers()["content-type"] ?? "", "precondition: the answer is HTML").toContain("text/html");

      const policies = [first, second].map((response) => response.headers()["content-security-policy"]);
      expect(policies[0], "the first answer carries Content-Security-Policy").toBeDefined();
      expect(policies[1], "the second answer carries Content-Security-Policy").toBeDefined();
      const [firstPolicy, secondPolicy] = policies.map((policy) => directives(policy ?? ""));
      const firstScripts = firstPolicy?.get("script-src") ?? [];
      const secondScripts = secondPolicy?.get("script-src") ?? [];

      expect(nonceOf(firstScripts), `script-src has a nonce: ${firstScripts.join(" ")}`).toBeDefined();
      expect(nonceOf(secondScripts), `script-src has a nonce: ${secondScripts.join(" ")}`).toBeDefined();
      expect(nonceOf(secondScripts), "the nonce differs from the nonce of the previous answer").not.toBe(
        nonceOf(firstScripts),
      );
      expect(firstScripts).not.toContain("'unsafe-inline'");
      expect(firstScripts).not.toContain("'unsafe-eval'");
      expect(firstPolicy?.get("frame-ancestors")).toEqual(["'none'"]);
    });
  }

  /** Every answer carries Strict-Transport-Security with max-age of at least 31536000. */
  test("FND-07.AC2: every answer carries Strict-Transport-Security with max-age of at least 31536000", async ({
    request,
    configuredApp,
  }) => {
    const answers: ReadonlyArray<readonly [string, APIResponse]> = [
      ["the entry page", await request.get(`${configuredApp.baseUrl}/`)],
      ["a page that does not exist", await request.get(`${configuredApp.baseUrl}/qa-no-such-page`)],
      ["a probe", await request.get(`${configuredApp.baseUrl}/api/health/live`)],
      ["a refused request", await request.get(`${configuredApp.baseUrl}/api/health`)],
      ["a static file", await request.get(`${configuredApp.baseUrl}/favicon.ico`)],
    ];
    const missing: string[] = [];
    for (const [label, response] of answers) {
      const header = response.headers()["strict-transport-security"] ?? "";
      const maxAge = Number(/max-age=(\d+)/i.exec(header)?.[1] ?? "-1");
      if (maxAge < 31_536_000) {
        missing.push(`${label} (HTTP ${String(response.status())}): "${header}"`);
      }
    }

    expect(missing, "answers without Strict-Transport-Security max-age >= 31536000").toEqual([]);
  });
});

test.describe("FND-07 server action origin", () => {
  /** A server action call whose Origin does not match the host is refused, and the language cookie does not change. */
  test("FND-07.AC4: a server action call from another origin is refused and changes nothing", async ({
    page,
    playwright,
    configuredApp,
  }) => {
    await page.goto(`${configuredApp.baseUrl}/`);
    const actionCall = page.waitForRequest(
      (request) => request.method() === "POST" && request.headers()["next-action"] !== undefined,
      { timeout: 15_000 },
    );
    await chooseLanguage(page, "tr", "en");
    const captured = await actionCall;
    const headers: Record<string, string> = {};
    for (const [name, value] of Object.entries(await captured.allHeaders())) {
      if (!/^(host|origin|cookie|content-length|connection|referer)$|^sec-|^:/i.test(name)) {
        headers[name] = value;
      }
    }
    const body = captured.postDataBuffer() ?? Buffer.alloc(0);

    const sameOrigin = await playwright.request.newContext();
    const allowed = await sameOrigin.post(captured.url(), {
      headers: { ...headers, origin: configuredApp.baseUrl },
      data: body,
    });
    const allowedCookie = (await sameOrigin.storageState()).cookies.find((cookie) => cookie.name === "bp_lang");
    expect(
      allowedCookie?.value,
      `precondition: the same call from the app's own origin sets bp_lang (HTTP ${String(allowed.status())})`,
    ).toBe("en");
    await sameOrigin.dispose();

    const otherOrigin = await playwright.request.newContext();
    const refused = await otherOrigin.post(captured.url(), {
      headers: { ...headers, origin: "https://attacker.example" },
      data: body,
    });
    const refusedCookie = (await otherOrigin.storageState()).cookies.find((cookie) => cookie.name === "bp_lang");

    expect(refusedCookie, "the call from another origin sets no bp_lang").toBeUndefined();
    expect(refused.status(), "the call from another origin is refused").not.toBe(200);
    await otherOrigin.dispose();
  });
});
