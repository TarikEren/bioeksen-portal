import { describe, expect, it } from "vitest";

import { buildContentSecurityPolicy, generateNonce } from "./csp";
import { SECURITY_HEADERS, applySecurityHeaders } from "./headers";
import { isAllowedOrigin, resolveSourceAddress } from "./origin";

function directive(policy: string, name: string): string[] {
  const found = policy.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name} `));
  return found === undefined ? [] : found.split(" ").slice(1);
}

// Source: FND-07 rules 1 to 3 and AC1, AC2.
describe("the Content Security Policy", () => {
  it("holds 'self' and the nonce in script-src, and neither unsafe-inline nor unsafe-eval", () => {
    const nonce = generateNonce();
    const scripts = directive(buildContentSecurityPolicy(nonce), "script-src");

    expect(scripts).toContain("'self'");
    expect(scripts).toContain(`'nonce-${nonce}'`);
    expect(scripts).not.toContain("'unsafe-inline'");
    expect(scripts).not.toContain("'unsafe-eval'");
  });

  it("allows eval only when the development server asks for it", () => {
    expect(directive(buildContentSecurityPolicy("n", { development: true }), "script-src")).toContain("'unsafe-eval'");
  });

  it("allows inline styles from 'self', and no frame ancestor", () => {
    const policy = buildContentSecurityPolicy(generateNonce());

    expect(directive(policy, "style-src")).toEqual(["'self'", "'unsafe-inline'"]);
    expect(directive(policy, "frame-ancestors")).toEqual(["'none'"]);
  });

  it("makes a new nonce each time", () => {
    const nonces = new Set(Array.from({ length: 50 }, () => generateNonce()));

    expect(nonces.size).toBe(50);
    expect([...nonces].every((nonce) => /^[A-Za-z0-9+/]{22}==$/.test(nonce))).toBe(true);
  });
});

describe("the headers of every answer", () => {
  it("sets Strict-Transport-Security for a year, nosniff and the referrer policy", () => {
    const headers = new Headers();
    applySecurityHeaders(headers);

    expect(headers.get("Strict-Transport-Security")).toBe("max-age=31536000");
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(SECURITY_HEADERS).toHaveLength(3);
  });
});

describe("isAllowedOrigin", () => {
  const base = "https://portal.example.invalid";

  it("allows the origin of PUBLIC_BASE_URL, also when the base URL has a path", () => {
    expect(isAllowedOrigin("https://portal.example.invalid", base)).toBe(true);
    expect(isAllowedOrigin("https://portal.example.invalid", `${base}/app/`)).toBe(true);
  });

  it("refuses another host, another scheme, another port, a missing Origin and the text null", () => {
    expect(isAllowedOrigin("https://evil.example.invalid", base)).toBe(false);
    expect(isAllowedOrigin("http://portal.example.invalid", base)).toBe(false);
    expect(isAllowedOrigin("https://portal.example.invalid:8443", base)).toBe(false);
    expect(isAllowedOrigin(null, base)).toBe(false);
    expect(isAllowedOrigin("null", base)).toBe(false);
  });
});

// Source: DEC-038 and sds-auth, Rate limiting.
describe("resolveSourceAddress", () => {
  const proxies = ["10.0.0.1", "10.0.1.0/24"];

  it("takes the rightmost entry that a trusted proxy did not add", () => {
    expect(resolveSourceAddress("203.0.113.7, 198.51.100.2, 10.0.1.5", "10.0.0.1", proxies)).toBe("198.51.100.2");
  });

  it("never takes the leftmost entry, which the caller chose", () => {
    expect(resolveSourceAddress("1.2.3.4, 203.0.113.7", "10.0.0.1", proxies)).toBe("203.0.113.7");
  });

  it("ignores the header when the connection is not from a trusted proxy", () => {
    expect(resolveSourceAddress("1.2.3.4", "198.51.100.9", proxies)).toBe("198.51.100.9");
  });

  it("gives the connection address when there is no header", () => {
    expect(resolveSourceAddress(null, "198.51.100.9", proxies)).toBe("198.51.100.9");
    expect(resolveSourceAddress(null, "10.0.0.1", proxies)).toBe("10.0.0.1");
  });

  it("knows no address when the connection address is unknown, or the entry is not an address", () => {
    expect(resolveSourceAddress("1.2.3.4", null, proxies)).toBeNull();
    expect(resolveSourceAddress("not-an-address", "10.0.0.1", proxies)).toBeNull();
  });

  it("reads IPv6 addresses and networks", () => {
    expect(resolveSourceAddress("2001:db8::7", "fd00::1", ["fd00::/8"])).toBe("2001:db8::7");
  });
});
