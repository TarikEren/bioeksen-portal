import { exportJWK, generateKeyPair } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppError } from "@/lib/errors";

import { JwksCache } from "./jwks";

async function codeOf(action: Promise<unknown>): Promise<string | null> {
  try {
    await action;
    return null;
  } catch (error) {
    return error instanceof AppError ? error.code : "not an AppError";
  }
}

async function publicJwk(kid: string): Promise<{ kty: string; kid: string; n: string; e: string }> {
  const { publicKey } = await generateKeyPair("RS256", { extractable: true });
  const jwk = await exportJWK(publicKey);
  return { kty: "RSA", kid, n: jwk.n ?? "", e: jwk.e ?? "" };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// Source: sds-auth/references/credentials.md (Rotation and revocation); code-prefixes.md steps 5 and 6;
// review 1, R-003.
describe("JwksCache", () => {
  const options = { uri: "http://127.0.0.1:1/keys", maxAgeSeconds: 3600 };

  it("gives a key that the key set holds, and does not fetch again while the keys are fresh", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(Response.json({ keys: [] })));
    const body = { keys: [await publicJwk("a")] };
    fetchMock.mockImplementation(() => Promise.resolve(Response.json(body)));
    vi.stubGlobal("fetch", fetchMock);
    const cache = new JwksCache(options);

    await cache.resolve("a");
    await cache.resolve("a");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives AUTH-4101 for a kid that the key set does not hold", async () => {
    const body = { keys: [await publicJwk("a")] };
    vi.stubGlobal("fetch", () => Promise.resolve(Response.json(body)));

    expect(await codeOf(new JwksCache(options).resolve("other"))).toBe("AUTH-4101");
  });

  it("gives AUTH-5500 while the fetch fails, also after the budget of fetches is spent", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("fetch failed")));
    const cache = new JwksCache(options);

    const codes: (string | null)[] = [];
    for (let attempt = 0; attempt < 9; attempt += 1) {
      codes.push(await codeOf(cache.resolve(`kid-${String(attempt)}`)));
    }

    expect(codes).toEqual(Array.from({ length: 9 }, () => "AUTH-5500"));
  });

  it("gives AUTH-4101 for an unknown kid once the budget is spent and the last fetch worked", async () => {
    const body = { keys: [await publicJwk("a")] };
    const fetchMock = vi.fn(() => Promise.resolve(Response.json(body)));
    vi.stubGlobal("fetch", fetchMock);
    const cache = new JwksCache(options);

    for (let attempt = 0; attempt < 8; attempt += 1) {
      expect(await codeOf(cache.resolve(`junk-${String(attempt)}`))).toBe("AUTH-4101");
    }

    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(6);
  });

  it("keeps a key that it holds when a refresh fails", async () => {
    const body = { keys: [await publicJwk("a")] };
    let up = true;
    vi.stubGlobal("fetch", () => (up ? Promise.resolve(Response.json(body)) : Promise.reject(new TypeError("down"))));
    const cache = new JwksCache({ ...options, maxAgeSeconds: 1 });
    await cache.resolve("a");
    up = false;
    await new Promise((resolve) => setTimeout(resolve, 1100));

    expect(await codeOf(cache.resolve("a"))).toBeNull();
  });
});
