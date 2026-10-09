import { describe, expect, it, vi } from "vitest";
import type { Connection } from "jsforce";
import { setUpDemoData } from "../lib/demoData";

/** A fake org where every lookup finds a record, and any write would be recorded. */
function orgWithEverything() {
  const writes: string[] = [];
  const conn = {
    query: vi.fn(async (soql: string) => ({ records: [{ Id: `id-for:${soql.slice(0, 40)}` }] })),
    sobject: (name: string) => ({
      create: async () => (writes.push(`create ${name}`), { id: "new" }),
      update: async () => (writes.push(`update ${name}`), { id: "x" }),
    }),
    requestPost: vi.fn(async (url: string) => (writes.push(`action ${url}`), [{ isSuccess: true, outputValues: {} }])),
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
      "Acme: current subscription (assets)",
      "Acme: open quote with a Cloud Pro line",
    ]);
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
