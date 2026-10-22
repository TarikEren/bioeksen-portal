import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usableEnvironment } from "@/lib/config/usable-environment";

type Authenticate = (header: string | null) => Promise<{ kind: "operator"; subject: string }>;

const environmentBefore = { ...process.env };
const issuer = String(usableEnvironment["ENTRA_ISSUER"]);
const audience = String(usableEnvironment["ENTRA_AUDIENCE"]);
const tenant = String(usableEnvironment["ENTRA_TENANT_ID"]);

async function loadAuthenticate(settings: Record<string, string> = usableEnvironment): Promise<Authenticate> {
  vi.resetModules();
  for (const key of Object.keys(process.env)) {
    Reflect.deleteProperty(process.env, key);
  }
  Object.assign(process.env, settings);
  const loaded = await import(".");
  return loaded.authenticateOperator;
}

async function codeOf(action: Promise<unknown>): Promise<string | null> {
  try {
    await action;
    return null;
  } catch (error) {
    // The modules load again for each test, so the class of the error is another one: read its code.
    const code: unknown = error instanceof Error ? Reflect.get(error, "code") : undefined;
    return typeof code === "string" ? code : "not an AppError";
  }
}

/**
 * Runs an action that waits for the jitter of a retry, on a clock that the test
 * moves, so the test does not wait (`sds-testing`, **Determinism**).
 */
async function withFakeClock<T>(action: Promise<T>): Promise<T> {
  vi.useFakeTimers({ toFake: ["setTimeout"] });
  try {
    // The handler is attached at once, so a rejection that comes while the timers
    // advance is never unhandled. The outcome is raised after the loop.
    const outcome = action.then(
      (value) => ({ failed: false as const, value }),
      (error: unknown) => ({ failed: true as const, error }),
    );
    let settled = false;
    void outcome.then(() => {
      settled = true;
    });
    for (let step = 0; !settled && step < 40; step += 1) {
      await vi.advanceTimersByTimeAsync(250);
    }
    const result = await outcome;
    if (result.failed) {
      throw result.error;
    }
    return result.value;
  } finally {
    vi.useRealTimers();
  }
}

describe("authenticateOperator", () => {
  let authenticate: Authenticate;
  let sign: (claims: Record<string, unknown>, kid?: string) => Promise<string>;
  let keySet: { keys: object[] };
  let providerUp: boolean;

  beforeEach(async () => {
    authenticate = await loadAuthenticate();
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const jwk = await exportJWK(publicKey);
    keySet = { keys: [{ ...jwk, kid: "known" }] };
    providerUp = true;
    vi.stubGlobal("fetch", () =>
      providerUp ? Promise.resolve(Response.json(keySet)) : Promise.reject(new TypeError("fetch failed")),
    );
    sign = (claims, kid = "known") =>
      new SignJWT({ tid: tenant, azp: "client", scp: "operator.access", roles: ["operator"], ...claims })
        .setProtectedHeader({ alg: "RS256", kid })
        .setSubject("person-1")
        .setIssuer(typeof claims["iss"] === "string" ? claims["iss"] : issuer)
        .setAudience(typeof claims["aud"] === "string" ? claims["aud"] : audience)
        .setIssuedAt()
        .setExpirationTime("10m")
        .sign(privateKey);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const key of Object.keys(process.env)) {
      Reflect.deleteProperty(process.env, key);
    }
    Object.assign(process.env, environmentBefore);
  });

  // Source: sds-auth, Validation order; credentials.md, Principal type.
  it("accepts an operator token", async () => {
    expect(await authenticate(`Bearer ${await sign({})}`)).toEqual({ kind: "operator", subject: "person-1" });
  });

  it("gives AUTH-4100 for no header and for another scheme", async () => {
    expect(await codeOf(authenticate(null))).toBe("AUTH-4100");
    expect(await codeOf(authenticate("Basic abc"))).toBe("AUTH-4100");
  });

  it("gives AUTH-4103 for text that is not a token", async () => {
    expect(await codeOf(authenticate("Bearer not-a-jwt"))).toBe("AUTH-4103");
  });

  it("gives PERM-4151 for a token without the operator role", async () => {
    expect(await codeOf(authenticate(`Bearer ${await sign({ roles: [] })}`))).toBe("PERM-4151");
  });

  // Source: code-prefixes.md steps 5 and 6; review 1, R-003.
  it("gives AUTH-4101, not AUTH-5500, for the audience of another app when the provider is down", async () => {
    providerUp = false;
    const token = await sign({ aud: "api://another-app" }, "never-seen");

    expect(await codeOf(withFakeClock(authenticate(`Bearer ${token}`)))).toBe("AUTH-4101");
  });

  it("gives AUTH-4101 for another issuer or tenant when the provider is down", async () => {
    providerUp = false;

    expect(await codeOf(withFakeClock(authenticate(`Bearer ${await sign({ iss: "https://other.example.invalid" }, "never-seen")}`)))).toBe(
      "AUTH-4101",
    );
    expect(await codeOf(withFakeClock(authenticate(`Bearer ${await sign({ tid: "other-tenant" }, "never-seen")}`)))).toBe("AUTH-4101");
  });

  it("gives AUTH-5500 for a token that would be good, with a kid it does not know, when the provider is down", async () => {
    providerUp = false;

    expect(await codeOf(withFakeClock(authenticate(`Bearer ${await sign({}, "never-seen")}`)))).toBe("AUTH-5500");
  });
});

// Source: DEC-135; FND-03.AC5; sds-auth, Validation order, step 6.
describe("authenticateOperator in a demo without an identity provider", () => {
  const demoEnvironment = {
    ...Object.fromEntries(Object.entries(usableEnvironment).filter(([name]) => !name.startsWith("ENTRA_"))),
    APP_ENV: "demo",
    TRUSTED_PROXIES: "127.0.0.1",
    EIFU_IDENTITY_KEYS: `demo-1:${Buffer.alloc(32, 7).toString("base64")}`,
    EIFU_IDENTITY_LOOKUP_PEPPER: "p".repeat(32),
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const key of Object.keys(process.env)) {
      Reflect.deleteProperty(process.env, key);
    }
    Object.assign(process.env, environmentBefore);
  });

  it("gives AUTH-5500 for any header, and fetches no key", async () => {
    const fetchSpy = vi.fn(() => Promise.reject(new TypeError("no network in this test")));
    vi.stubGlobal("fetch", fetchSpy);
    const authenticate = await loadAuthenticate(demoEnvironment);

    expect(await codeOf(authenticate(null))).toBe("AUTH-5500");
    expect(await codeOf(authenticate("Basic abc"))).toBe("AUTH-5500");
    expect(await codeOf(authenticate("Bearer not-a-jwt"))).toBe("AUTH-5500");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("gives AUTH-5500, not AUTH-4101, for a well-formed token", async () => {
    const authenticate = await loadAuthenticate(demoEnvironment);
    const { privateKey } = await generateKeyPair("RS256");
    const token = await new SignJWT({ tid: "tenant-1", azp: "client", scp: "operator.access", roles: ["operator"] })
      .setProtectedHeader({ alg: "RS256", kid: "known" })
      .setSubject("person-1")
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime("10m")
      .sign(privateKey);

    expect(await codeOf(authenticate(`Bearer ${token}`))).toBe("AUTH-5500");
  });
});
