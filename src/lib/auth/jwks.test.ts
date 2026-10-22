import { exportJWK, generateKeyPair } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "@/lib/errors";

const logged: string[] = [];

vi.mock("@/lib/logging", () => ({
  logger: {
    failure: (code: string) => {
      logged.push(code);
    },
    write: (entry: { message: string; tail?: Record<string, string> }) => {
      logged.push(`${entry.message} ${entry.tail?.["breaker"] ?? ""}`.trim());
    },
  },
}));

const { JwksCache } = await import("./jwks");

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

/** A clock that only the test moves, a wait that moves it and notes the time, and a fixed random source. */
function clock() {
  const state: { now: number; waits: number[] } = { now: 1_000_000, waits: [] };
  return {
    state,
    options: {
      now: () => state.now,
      wait: (milliseconds: number) => {
        state.waits.push(milliseconds);
        state.now += milliseconds;
        return Promise.resolve();
      },
      random: () => 0.5,
    },
  };
}

const location = { uri: "http://127.0.0.1:1/keys", maxAgeSeconds: 3600 };

function failingFetch() {
  return vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed"));
}

beforeEach(() => {
  logged.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// Source: sds-auth/references/credentials.md (Rotation and revocation); code-prefixes.md steps 5 and 6;
// service-calls.md; review 1 R-003 and R-015; review 2 R-030 and R-033.
describe("JwksCache", () => {
  it("gives a key that the key set holds, and does not fetch again while the keys are fresh", async () => {
    const body = { keys: [await publicJwk("a")] };
    const fetchMock = vi.fn(() => Promise.resolve(Response.json(body)));
    vi.stubGlobal("fetch", fetchMock);
    const { options } = clock();
    const cache = new JwksCache({ ...location, ...options });

    await cache.resolve("a");
    await cache.resolve("a");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives AUTH-4101 for a kid that the key set does not hold", async () => {
    const body = { keys: [await publicJwk("a")] };
    vi.stubGlobal("fetch", () => Promise.resolve(Response.json(body)));
    const { options } = clock();

    expect(await codeOf(new JwksCache({ ...location, ...options }).resolve("other"))).toBe("AUTH-4101");
  });

  it("gives AUTH-5500 while the fetch fails, also after the budget of fetches is spent", async () => {
    vi.stubGlobal("fetch", failingFetch());
    const { options } = clock();
    const cache = new JwksCache({ ...location, ...options });

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
    const { options } = clock();
    const cache = new JwksCache({ ...location, ...options });

    for (let attempt = 0; attempt < 8; attempt += 1) {
      expect(await codeOf(cache.resolve(`junk-${String(attempt)}`))).toBe("AUTH-4101");
    }

    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(6);
  });

  it("keeps a key that it holds when a refresh fails", async () => {
    const body = { keys: [await publicJwk("a")] };
    let up = true;
    vi.stubGlobal("fetch", () => (up ? Promise.resolve(Response.json(body)) : Promise.reject(new TypeError("down"))));
    const { state, options } = clock();
    const cache = new JwksCache({ ...location, maxAgeSeconds: 1, ...options });
    await cache.resolve("a");
    up = false;
    state.now += 2_000;

    expect(await codeOf(cache.resolve("a"))).toBeNull();
  });

  describe("the retry", () => {
    it("retries once after a connection failure, and gets the keys", async () => {
      const body = { keys: [await publicJwk("a")] };
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockRejectedValueOnce(new TypeError("fetch failed"))
        .mockResolvedValue(Response.json(body));
      vi.stubGlobal("fetch", fetchMock);
      const { options } = clock();

      expect(await codeOf(new JwksCache({ ...location, ...options }).resolve("a"))).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("waits a random time from 0 to 200 ms before the retry (full jitter)", async () => {
      const body = { keys: [await publicJwk("a")] };
      const once = () => vi.fn<typeof fetch>().mockRejectedValueOnce(new TypeError("x")).mockResolvedValue(Response.json(body));
      const { state, options } = clock();

      vi.stubGlobal("fetch", once());
      await new JwksCache({ ...location, ...options, random: () => 0.25 }).resolve("a");
      expect(state.waits).toEqual([50]);

      state.waits.length = 0;
      vi.stubGlobal("fetch", once());
      await new JwksCache({ ...location, ...options, random: () => 0 }).resolve("a");
      expect(state.waits).toEqual([0]);
    });

    it("retries once after a 503, and not after a 404", async () => {
      const body = { keys: [await publicJwk("a")] };
      const afterOutage = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(new Response("", { status: 503 }))
        .mockResolvedValue(Response.json(body));
      vi.stubGlobal("fetch", afterOutage);
      const { options } = clock();
      expect(await codeOf(new JwksCache({ ...location, ...options }).resolve("a"))).toBeNull();
      expect(afterOutage).toHaveBeenCalledTimes(2);

      const missing = vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 404 }));
      vi.stubGlobal("fetch", missing);
      expect(await codeOf(new JwksCache({ ...location, ...options }).resolve("a"))).toBe("AUTH-5500");
      expect(missing).toHaveBeenCalledTimes(1);
    });

    it("makes at most two attempts for one fetch", async () => {
      const fetchMock = failingFetch();
      vi.stubGlobal("fetch", fetchMock);
      const { options } = clock();

      expect(await codeOf(new JwksCache({ ...location, ...options }).resolve("a"))).toBe("AUTH-5500");
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("stops retrying when the retry budget is spent: 3 retries, and 10% of 3 successes is 0", async () => {
      const body = { keys: [await publicJwk("a")] };
      // Each fetch fails once and then works, until the fourth, which only fails: it needs a fourth retry.
      let call = 0;
      const fetchMock = vi.fn<typeof fetch>(() => {
        call += 1;
        return call % 2 === 0 ? Promise.resolve(Response.json(body)) : Promise.reject(new TypeError("fetch failed"));
      });
      vi.stubGlobal("fetch", fetchMock);
      const { options } = clock();
      const cache = new JwksCache({ ...location, ...options });

      for (const kid of ["k1", "k2", "k3"]) {
        await codeOf(cache.resolve(kid));
      }
      expect(fetchMock).toHaveBeenCalledTimes(6);

      expect(await codeOf(cache.resolve("k4"))).toBe("AUTH-5500");
      expect(fetchMock).toHaveBeenCalledTimes(7);
    });
  });

  describe("the circuit breaker", () => {
    it("opens after 5 consecutive failed attempts, then fails at once without a network attempt", async () => {
      const fetchMock = failingFetch();
      vi.stubGlobal("fetch", fetchMock);
      const { options } = clock();
      const cache = new JwksCache({ ...location, ...options });

      await codeOf(cache.resolve("k1"));
      await codeOf(cache.resolve("k2"));
      await codeOf(cache.resolve("k3"));
      const callsWhenOpen = fetchMock.mock.calls.length;
      const code = await codeOf(cache.resolve("k4"));

      expect(callsWhenOpen).toBe(5);
      expect(fetchMock.mock.calls.length).toBe(callsWhenOpen);
      expect(code).toBe("AUTH-5500");
      expect(logged).toContain("UP-5500");
    });

    it("lets one trial through after 30 seconds, and closes when it works", async () => {
      const body = { keys: [await publicJwk("a")] };
      let up = false;
      const fetchMock = vi.fn<typeof fetch>(() =>
        up ? Promise.resolve(Response.json(body)) : Promise.reject(new TypeError("down")),
      );
      vi.stubGlobal("fetch", fetchMock);
      const { state, options } = clock();
      const cache = new JwksCache({ ...location, ...options });
      for (const kid of ["k1", "k2", "k3"]) {
        await codeOf(cache.resolve(kid));
      }
      expect(await codeOf(cache.resolve("a"))).toBe("AUTH-5500");

      up = true;
      state.now += 30_000;

      expect(await codeOf(cache.resolve("a"))).toBeNull();
      expect(logged).toEqual(["UP-5500", "circuit breaker changed state half-open", "circuit breaker changed state closed"]);
    });

    it("does not trip on an answer that is a 4xx", async () => {
      const fetchMock = vi.fn<typeof fetch>().mockImplementation(() => Promise.resolve(new Response("", { status: 404 })));
      vi.stubGlobal("fetch", fetchMock);
      const { state, options } = clock();
      const cache = new JwksCache({ ...location, ...options });

      for (let index = 0; index < 5; index += 1) {
        state.now += 20_000;
        await codeOf(cache.resolve(`k${String(index)}`));
      }

      expect(fetchMock).toHaveBeenCalledTimes(5);
      expect(logged).toEqual([]);
    });
  });
});
