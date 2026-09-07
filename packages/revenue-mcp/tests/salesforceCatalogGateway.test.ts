import { describe, it, expect, vi } from "vitest";
import type { Connection } from "jsforce";
import { SalesforceRevenueGateway } from "../src/salesforce/salesforceGateway.js";

function connection() {
  const create = vi.fn(); const update = vi.fn(); const destroy = vi.fn();
  const conn = { query: vi.fn(), sobject: vi.fn(() => ({ create, update, destroy })) } as unknown as Connection;
  return { gateway: new SalesforceRevenueGateway(conn), conn: conn as any, create, update, destroy };
}
const controls = { confirmedByUser: true, idempotencyKey: "key" };

describe("Salesforce catalog gateway", () => {
  it("creates and partially updates Product2 using only provided fields", async () => {
    const f = connection(); f.create.mockResolvedValue({ id: "01tNEW" });
    await f.gateway.createProduct({ name: "Laptop", family: "Hardware", ...controls });
    expect(f.conn.sobject).toHaveBeenCalledWith("Product2"); expect(f.create).toHaveBeenCalledWith({ Name: "Laptop", Family: "Hardware" });
    f.update.mockResolvedValue({ success: true }); f.conn.query.mockResolvedValue({ records: [{ Name: "Laptop Pro" }] });
    await f.gateway.updateProduct({ productId: "01tNEW", name: "Laptop Pro", isActive: false, ...controls });
    expect(f.update).toHaveBeenCalledWith({ Id: "01tNEW", Name: "Laptop Pro", IsActive: false });
  });

  it("updates an existing standard price and inserts one when absent", async () => {
    const f = connection();
    f.conn.query
      .mockResolvedValueOnce({ records: [{ Id: "01sQy00000L8ec5IAB" }] })
      .mockResolvedValueOnce({ records: [{ Id: "01uOLD" }] });
    f.update.mockResolvedValue({ success: true });
    expect((await f.gateway.setProductPrice({ productId: "01tP", unitPrice: 99, ...controls }) as any).data.pricebookEntryId).toBe("01uOLD");
    expect(f.update).toHaveBeenCalledWith({ Id: "01uOLD", UnitPrice: 99 });
    f.conn.query.mockResolvedValueOnce({ records: [] }); f.create.mockResolvedValue({ id: "01uNEW" });
    await f.gateway.setProductPrice({ productId: "01tP", unitPrice: 120, ...controls });
    expect(f.create).toHaveBeenCalledWith({ Pricebook2Id: "01sQy00000L8ec5IAB", Product2Id: "01tP", UnitPrice: 120, IsActive: true });
    expect(f.conn.query.mock.calls.filter(([query]: [string]) => query.includes("FROM Pricebook2"))).toHaveLength(1);
  });

  it("resolves and caches the bundle relationship type and maps bundle structure", async () => {
    const f = connection(); f.create.mockResolvedValue({ id: "0dSNEW" });
    f.conn.query.mockResolvedValueOnce({ records: [{ Id: "0yoQy000000NafVIAS" }] });
    await f.gateway.addBundleComponent({ parentProductId: "01tB", childProductId: "01tC", quantity: 2, ...controls });
    expect(f.create).toHaveBeenCalledWith(expect.objectContaining({ ParentProductId: "01tB", ChildProductId: "01tC", ProductRelationshipTypeId: "0yoQy000000NafVIAS", Quantity: 2 }));
    await f.gateway.addBundleComponent({ parentProductId: "01tB", childProductId: "01tC", quantity: 3, ...controls });
    expect(f.conn.query.mock.calls.filter(([query]: [string]) => query.includes("FROM ProductRelationshipType"))).toHaveLength(1);
    f.conn.query.mockResolvedValue({ records: [{ Id: "0dSNEW", ParentProductId: "01tB", ChildProductId: "01tC", ChildProduct: { Name: "Monitor", ProductCode: "MON" }, Quantity: 2, IsComponentRequired: true, IsDefaultComponent: false }] });
    const result: any = await f.gateway.getBundleStructure({ productId: "01tB" });
    expect(result.data.components[0]).toMatchObject({ componentId: "0dSNEW", childName: "Monitor", childProductCode: "MON", quantity: 2, isComponentRequired: true });
  });

  it("returns clear errors when required org metadata is missing", async () => {
    const price = connection(); price.conn.query.mockResolvedValue({ records: [] });
    await expect(price.gateway.setProductPrice({ productId: "01tP", unitPrice: 99, ...controls })).resolves.toMatchObject({ ok: false, error: { code: "NO_STANDARD_PRICEBOOK", retryable: false } });
    expect(price.create).not.toHaveBeenCalled();

    const bundle = connection(); bundle.conn.query.mockResolvedValue({ records: [] });
    await expect(bundle.gateway.addBundleComponent({ parentProductId: "01tB", childProductId: "01tC", ...controls })).resolves.toMatchObject({ ok: false, error: { code: "NO_BUNDLE_RELATIONSHIP_TYPE", retryable: false } });
    expect(bundle.create).not.toHaveBeenCalled();
  });
});
