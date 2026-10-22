import { describe, expect, it } from "vitest";

import { classifyPrincipal } from "./principal";

const scope = "operator.access";

// Source: sds-auth/references/credentials.md, Principal type.
describe("classifyPrincipal", () => {
  it("takes a delegated token with the operator scope and the operator role as an operator", () => {
    expect(classifyPrincipal({ scp: `openid ${scope}`, roles: ["operator"] }, scope)).toBe("operator");
  });

  it("takes a delegated token without the role as a person, not an operator", () => {
    expect(classifyPrincipal({ scp: scope }, scope)).toBe("person");
    expect(classifyPrincipal({ scp: scope, roles: ["other"] }, scope)).toBe("person");
  });

  it("takes a delegated token with the role and another scope as a person", () => {
    expect(classifyPrincipal({ scp: "profile", roles: ["operator"] }, scope)).toBe("person");
  });

  it("takes a token with roles and no scp as an app, whatever its roles", () => {
    expect(classifyPrincipal({ roles: ["logs.write"] }, scope)).toBe("app");
    expect(classifyPrincipal({ roles: ["operator"] }, scope)).toBe("app");
  });

  it("takes a token with neither claim, or with a claim of a wrong form, as none", () => {
    expect(classifyPrincipal({}, scope)).toBe("none");
    expect(classifyPrincipal({ scp: 7 }, scope)).toBe("none");
    expect(classifyPrincipal({ roles: "operator" }, scope)).toBe("none");
  });

  it("does not match a scope by prefix", () => {
    expect(classifyPrincipal({ scp: "operator.access.extra", roles: ["operator"] }, scope)).toBe("person");
  });
});
