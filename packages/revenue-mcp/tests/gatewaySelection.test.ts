import { afterEach, describe, expect, it, vi } from "vitest";
import { MockRevenueGateway } from "@consultantcloud/shared";
import { createRevenueGateway } from "../src/server.js";
import { SalesforceRevenueGateway } from "../src/salesforce/salesforceGateway.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("createRevenueGateway", () => {
  it("uses the signed-in session first", () => {
    expect(createRevenueGateway({ instanceUrl: "https://a.my.salesforce.com", accessToken: "t" }, { useEnvironment: false }))
      .toBeInstanceOf(SalesforceRevenueGateway);
  });

  it("falls back to the environment's token by default", () => {
    vi.stubEnv("SF_INSTANCE_URL", "https://env.my.salesforce.com");
    vi.stubEnv("SF_ACCESS_TOKEN", "env-token");
    expect(createRevenueGateway()).toBeInstanceOf(SalesforceRevenueGateway);
  });

  it("ignores the environment's token when told to, and serves the demo data", () => {
    vi.stubEnv("SF_INSTANCE_URL", "https://env.my.salesforce.com");
    vi.stubEnv("SF_ACCESS_TOKEN", "env-token");
    expect(createRevenueGateway(undefined, { useEnvironment: false })).toBeInstanceOf(MockRevenueGateway);
  });
});
