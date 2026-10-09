import { describe, expect, it, vi } from "vitest";
import type { Connection } from "jsforce";
import { setUpDemoData } from "../lib/demoData";

/** A fake org where every lookup finds a record, and any write would be recorded. */
function orgWithEverything() {
  const writes: string[] = [];
  const conn = {
    // Price book decision tables synced after the newest demo price: nothing to sync.
    query: vi.fn(async (soql: string) => ({ records: [{ Id: `id-for:${soql.slice(0, 40)}`, LastSyncDate: "2099-01-01T00:00:00Z", LastModifiedDate: "2000-01-01T00:00:00Z" }] })),
    sobject: (name: string) => ({
      create: async () => (writes.push(`create ${name}`), { id: "new" }),
      update: async () => (writes.push(`update ${name}`), { id: "x" }),
    }),
    requestPost: vi.fn(async (url: string) => (writes.push(`action ${url}`), [{ isSuccess: true, outputValues: {} }])),
    requestGet: vi.fn(async (url: string) => (writes.push(`action ${url}`), {})),
  } as unknown as Connection;
  return { conn, writes };
}

describe("demo data setup", () => {
  it("changes nothing when the org already has everything", async () => {
    const { conn, writes } = orgWithEverything();
    const steps = await setUpDemoData(conn);
    expect(writes).toEqual([]);
    expect(steps.every((s) => s.status === "already there")).toBe(true);
    expect(steps.map((s) => s.step)).toEqual([
      "Account: Acme University",
      "Account: Greenfield Health",
      "Product: Cloud Essentials",
      "Product: Cloud Pro",
      "Product: Premium Support",
      "Pricing data sync",
      "Acme: current subscription (assets)",
      "Acme: open quote with a Cloud Pro line",
    ]);
  });

  it("starts a pricing sync when the price book decision tables are older than the demo prices", async () => {
    const { conn, writes } = orgWithEverything();
    (conn.query as ReturnType<typeof vi.fn>).mockImplementation(async (soql: string) => ({
      records: [{ Id: "x", DeveloperName: "Price_Book_Entry_Decision_Table", LastSyncDate: soql.includes("DecisionTable") ? "2026-09-24T09:30:00Z" : null, LastModifiedDate: "2026-10-09T11:00:00Z" }],
    }));
    const steps = await setUpDemoData(conn);
    expect(writes).toContain("action /services/data/v62.0/connect/core-pricing/sync/syncData");
    expect(steps.find((s) => s.step === "Pricing data sync")?.status).toBe("pending");
  });

  it("reports a failed step and carries on with the others", async () => {
    const { conn } = orgWithEverything();
    (conn.query as ReturnType<typeof vi.fn>).mockImplementation(async (soql: string) => {
      if (soql.includes("FROM Account WHERE Name = 'Greenfield Health'")) throw new Error("no access to Account");
      return { records: [{ Id: "x" }] };
    });
    const steps = await setUpDemoData(conn);
    expect(steps.find((s) => s.step === "Account: Greenfield Health")).toMatchObject({ status: "failed", detail: "no access to Account" });
    expect(steps.find((s) => s.step === "Acme: open quote with a Cloud Pro line")?.status).toBe("already there");
  });
});
