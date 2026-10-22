import { describe, expect, it } from "vitest";

import { ConfigError, evaluateConfig, inspectConfig, loadConfig } from ".";
import { usableEnvironment } from "./usable-environment";

const valid: Record<string, string> = { ...usableEnvironment };

/** Keys of 32 bytes, in base64. */
const KEY_ONE = Buffer.alloc(32, 1).toString("base64");
const KEY_TWO = Buffer.alloc(32, 2).toString("base64");

const production = {
  ...valid,
  APP_ENV: "production",
  TRUSTED_PROXIES: "10.0.0.1, 10.1.0.0/16",
  EIFU_IDENTITY_KEYS: `k1:${KEY_ONE}`,
  EIFU_IDENTITY_LOOKUP_PEPPER: "p".repeat(32),
};

function without(env: Record<string, string>, ...names: string[]): Record<string, string> {
  return Object.fromEntries(Object.entries(env).filter(([name]) => !names.includes(name)));
}

// Source: FND-03 rules 1 to 4 and AC1 to AC4; sds-config; contract-tests.md, Configuration.
describe("configuration", () => {
  it("types a usable environment and applies the defaults", () => {
    const config = loadConfig(valid);

    expect(config.APP_ENV).toBe("test");
    expect(config.SMTP_PORT).toBe(1025);
    expect(config.LOG_LEVEL).toBe("INFO");
    expect(config.TEST_SEAMS_ENABLED).toBe(false);
    expect(config.AUTH_CLOCK_SKEW_SECONDS).toBe(60);
  });

  it("gives CFG-5000 for a required setting that is not set, and names it", () => {
    const issues = inspectConfig(without(valid, "DATABASE_URL", "ENTRA_ISSUER"));

    expect(issues).toEqual([
      expect.objectContaining({ setting: "DATABASE_URL", code: "CFG-5000" }),
      expect.objectContaining({ setting: "ENTRA_ISSUER", code: "CFG-5000" }),
    ]);
  });

  it("gives CFG-5001 for a value that the app cannot use", () => {
    const issues = inspectConfig({ ...valid, SMTP_PORT: "not-a-port", APP_ENV: "staging" });

    expect(issues.map((issue) => [issue.setting, issue.code])).toEqual([
      ["APP_ENV", "CFG-5001"],
      ["SMTP_PORT", "CFG-5001"],
    ]);
  });

  it("never holds the value of a setting in an issue or in the error", () => {
    const secret = "very-secret-value-4711";
    const env = { ...production, EIFU_IDENTITY_LOOKUP_PEPPER: secret, SMTP_PORT: secret };

    const issues = inspectConfig(env);
    expect(issues.length).toBeGreaterThan(0);
    expect(JSON.stringify(issues)).not.toContain(secret);
    expect(() => loadConfig(env)).toThrow(ConfigError);
    try {
      loadConfig(env);
    } catch (error) {
      expect(String(error instanceof Error ? error.message : error)).not.toContain(secret);
    }
  });

  it("treats an empty value as unusable, not as unset", () => {
    expect(inspectConfig({ ...valid, S3_BUCKET: "" })).toEqual([
      expect.objectContaining({ setting: "S3_BUCKET", code: "CFG-5001" }),
    ]);
  });

  // Source: review 1, R-004 and R-005; FND-03 rule 3 (an empty value cannot be used).
  it("refuses an empty or blank number instead of reading it as 0", () => {
    for (const setting of ["AUTH_CLOCK_SKEW_SECONDS", "EIFU_ACCESS_RECORD_RETENTION_DAYS", "SMTP_PORT", "ENTRA_JWKS_MAX_AGE_SECONDS"]) {
      for (const empty of ["", "   "]) {
        expect(inspectConfig({ ...valid, [setting]: empty }), `${setting} = "${empty}"`).toEqual([
          expect.objectContaining({ setting, code: "CFG-5001" }),
        ]);
      }
    }
  });

  it("refuses a number with a fraction or a letter, and accepts 0 where 0 is a value", () => {
    expect(inspectConfig({ ...valid, AUTH_CLOCK_SKEW_SECONDS: "1.5" })).toHaveLength(1);
    expect(inspectConfig({ ...valid, AUTH_CLOCK_SKEW_SECONDS: "10s" })).toHaveLength(1);
    expect(inspectConfig({ ...valid, AUTH_CLOCK_SKEW_SECONDS: "0", EIFU_ACCESS_RECORD_RETENTION_DAYS: "0" })).toEqual([]);
  });

  it("refuses a key age of more than one day, and accepts one day", () => {
    expect(inspectConfig({ ...valid, ENTRA_JWKS_MAX_AGE_SECONDS: "604800" })).toEqual([
      expect.objectContaining({ setting: "ENTRA_JWKS_MAX_AGE_SECONDS", code: "CFG-5001" }),
    ]);
    expect(inspectConfig({ ...valid, ENTRA_JWKS_MAX_AGE_SECONDS: "86400" })).toEqual([]);
    expect(inspectConfig({ ...valid, ENTRA_JWKS_MAX_AGE_SECONDS: "0" })).toHaveLength(1);
  });

  it("checks the form of the identity keys: id:base64key, comma separated, each key of 32 bytes", () => {
    const short = Buffer.alloc(16, 1).toString("base64");
    const long = Buffer.alloc(33, 1).toString("base64");
    for (const bad of [
      "abc",
      `:${KEY_ONE}`,
      "k1:",
      "k1:not base64!",
      `k1:${KEY_ONE},abc`,
      "k1:c2VjcmV0",
      `k1:${short}`,
      `k1:${long}`,
      `k1:${KEY_ONE.slice(0, -1)}`,
    ]) {
      expect(inspectConfig({ ...production, EIFU_IDENTITY_KEYS: bad }), bad).toEqual([
        expect.objectContaining({ setting: "EIFU_IDENTITY_KEYS", code: "CFG-5001" }),
      ]);
    }
    expect(inspectConfig({ ...production, EIFU_IDENTITY_KEYS: `k1:${KEY_ONE}, k0:${KEY_TWO}` })).toEqual([]);
  });

  // Source: FND-03 (each id once); review 2, R-031.
  it("refuses an id that appears twice, also when its keys differ", () => {
    for (const keys of [`k1:${KEY_ONE},k1:${KEY_ONE}`, `k1:${KEY_ONE},k1:${KEY_TWO}`]) {
      expect(inspectConfig({ ...production, EIFU_IDENTITY_KEYS: keys }), keys).toEqual([
        expect.objectContaining({ setting: "EIFU_IDENTITY_KEYS", code: "CFG-5001" }),
      ]);
    }
  });

  it("never holds the key in the issue", () => {
    expect(JSON.stringify(inspectConfig({ ...production, EIFU_IDENTITY_KEYS: "k1:c2VjcmV0" }))).not.toContain("c2VjcmV0");
  });

  it("requires the settings of production only in production", () => {
    expect(inspectConfig(valid)).toEqual([]);
    expect(inspectConfig(without(production, "TRUSTED_PROXIES", "EIFU_IDENTITY_KEYS", "EIFU_IDENTITY_LOOKUP_PEPPER")).map(
      (issue) => [issue.setting, issue.code],
    )).toEqual([
      ["TRUSTED_PROXIES", "CFG-5000"],
      ["EIFU_IDENTITY_KEYS", "CFG-5000"],
      ["EIFU_IDENTITY_LOOKUP_PEPPER", "CFG-5000"],
    ]);
  });

  it("refuses a pepper of 31 characters in production and accepts 32", () => {
    expect(inspectConfig({ ...production, EIFU_IDENTITY_LOOKUP_PEPPER: "p".repeat(31) })).toEqual([
      expect.objectContaining({ setting: "EIFU_IDENTITY_LOOKUP_PEPPER", code: "CFG-5001" }),
    ]);
    expect(inspectConfig(production)).toEqual([]);
  });

  it("refuses the test seams in production with CFG-5001", () => {
    expect(inspectConfig({ ...production, TEST_SEAMS_ENABLED: "true" })).toEqual([
      expect.objectContaining({ setting: "TEST_SEAMS_ENABLED", code: "CFG-5001" }),
    ]);
    expect(inspectConfig({ ...valid, TEST_SEAMS_ENABLED: "true" })).toEqual([]);
  });

  it("refuses a list of proxies that holds a name that is not an address", () => {
    expect(inspectConfig({ ...production, TRUSTED_PROXIES: "10.0.0.1, proxy.example" })).toEqual([
      expect.objectContaining({ setting: "TRUSTED_PROXIES", code: "CFG-5001" }),
    ]);
  });

  it("needs one client credential of sds-auth", () => {
    expect(inspectConfig(without(valid, "ENTRA_CLIENT_SECRET"))).toEqual([
      expect.objectContaining({ code: "CFG-5000" }),
    ]);
    expect(inspectConfig({ ...without(valid, "ENTRA_CLIENT_SECRET"), ENTRA_CLIENT_CERTIFICATE_PATH: "/run/cert.pem" })).toEqual(
      [],
    );
  });

  it("reports a failed state with the issues, and a ready state with the config", () => {
    expect(evaluateConfig(without(valid, "REDIS_URL")).status).toBe("failed");
    expect(evaluateConfig(valid).status).toBe("ready");
  });
});
