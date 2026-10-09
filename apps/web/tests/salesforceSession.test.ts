import { afterEach, describe, expect, it, vi } from "vitest";
import { envCredentialsAllowed, openCookie, sealCookie } from "../lib/salesforceSession";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("session cookies", () => {
  const session = { instanceUrl: "https://example.my.salesforce.com", accessToken: "00Dxx!secret", refreshToken: "5Aep-refresh" };

  it("round-trips, and never holds a readable token", () => {
    vi.stubEnv("SESSION_SECRET", "test-secret");
    const sealed = sealCookie(session);
    expect(openCookie(sealed)).toEqual(session);
    expect(Buffer.from(sealed, "base64url").toString("utf8")).not.toContain("secret");
    expect(sealed).not.toContain("00Dxx");
  });

  it("rejects a tampered cookie", () => {
    vi.stubEnv("SESSION_SECRET", "test-secret");
    const data = Buffer.from(sealCookie(session), "base64url");
    data.writeUInt8(data.readUInt8(data.length - 1) ^ 1, data.length - 1);
    expect(openCookie(data.toString("base64url"))).toBeNull();
  });

  it("rejects a cookie sealed with another secret, or an old plain-text cookie", () => {
    vi.stubEnv("SESSION_SECRET", "one");
    const sealed = sealCookie(session);
    vi.stubEnv("SESSION_SECRET", "two");
    expect(openCookie(sealed)).toBeNull();
    expect(openCookie(Buffer.from(JSON.stringify(session)).toString("base64url"))).toBeNull();
  });

  it("refuses to sign anyone in on a hosted deployment without SESSION_SECRET", () => {
    vi.stubEnv("SESSION_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => sealCookie(session)).toThrow(/SESSION_SECRET/);
  });
});

describe("the deployment's own Salesforce tokens", () => {
  it("serve visitors who haven't signed in when running locally", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(envCredentialsAllowed()).toBe(true);
  });

  it("don't serve them on a hosted deployment, unless the deployer opts in", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_ANONYMOUS_ORG_ACCESS", "");
    expect(envCredentialsAllowed()).toBe(false);
    vi.stubEnv("ALLOW_ANONYMOUS_ORG_ACCESS", "true");
    expect(envCredentialsAllowed()).toBe(true);
  });
});
