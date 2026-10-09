import type { Connection } from "jsforce";
import { CircuitBreaker, withRetry } from "@consultantcloud/policy";
import {
  RevenueGateway,
  FindAccountInput,
  AccountSummary,
  AccountIdInput,
  AccountAsset,
  ProductSearchInput,
  ProductSummary,
  CreateInitialQuoteInput,
  CreateRenewalQuoteInput,
  CreateAmendmentQuoteInput,
  QuoteResult,
  AddQuoteLineInput,
  QuoteLineResult,
  RemoveQuoteLineInput,
  RemoveQuoteLineResult,
  UpdateQuoteLineInput,
  UpdateQuoteLineResult,
  ApplyDiscountInput,
  DiscountResult,
  QuoteIdInput,
  QuoteSummary,
  ToolResult,
  CreateProductInput, UpdateProductInput, ProductResult, SetProductPriceInput, ProductPriceResult,
  BundleIdInput, BundleStructure, AddBundleComponentInput, BundleComponentResult,
  RemoveBundleComponentInput, RemoveBundleComponentResult, UpdateBundleComponentInput,
} from "@consultantcloud/shared";

export const SALESFORCE_CAPABILITIES = {
  objects: ["Account", "Asset", "Product2", "PricebookEntry", "Opportunity", "Quote", "QuoteLineItem", "ProductRelatedComponent"],
  flowActions: [
    "quotingAI__getAccountAssets",
    "quotingAI__createInitialQuoteOnOpp",
    "quotingAI__createRenewalQuote",
    "quotingAI__createAmendmentQuote",
    "quotingAI__getProdtSellModelForPrdct",
    "quotingAI__addQuoteLineItemToQuote",
    "quotingAI__applyDiscountToQuoteLine",
  ],
} as const;

const flowActionBreaker = new CircuitBreaker();

async function invokeFlowAction<T = Record<string, unknown>>(
  conn: Connection,
  actionName: string,
  input: Record<string, unknown>
): Promise<{ isSuccess: boolean; outputValues: T | null }> {
  return flowActionBreaker.execute(() =>
    withRetry(async () => {
      const response = await conn.requestPost<
        Array<{ isSuccess: boolean; outputValues: T | null; errors: unknown }>
      >(`/services/data/v62.0/actions/custom/flow/${actionName}`, { inputs: [input] });
      const result = response[0];
      if (!result) {
        return { isSuccess: false, outputValues: null };
      }
      // The action can run (result.isSuccess) while the flow inside reports failure in its own
      // outputs (outputValues.isSuccess === false, with errorMessage). Both must hold, or a failed
      // change would be reported as done.
      const flowFailed = (result.outputValues as { isSuccess?: unknown } | null)?.isSuccess === false;
      return { isSuccess: result.isSuccess && !flowFailed, outputValues: result.outputValues };
    })
  );
}

function meta(source: "salesforce" = "salesforce") {
  return { requestId: crypto.randomUUID(), durationMs: 0, source };
}

function escapeSoql(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function escapeSoqlLike(value: string): string {
  return escapeSoql(value).replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export class SalesforceRevenueGateway implements RevenueGateway {
  private standardPricebookId: string | null | undefined;
  private bundleRelationshipTypeId: string | null | undefined;

  constructor(private readonly conn: Connection) {}

  /** Read-only tool implementations use the authenticated connection for SOQL. */
  get readConnection(): Connection {
    return this.conn;
  }

  private async resolveStandardPricebookId(): Promise<string | null> {
    if (this.standardPricebookId !== undefined) return this.standardPricebookId;
    const result = await this.conn.query<{ Id: string }>("SELECT Id FROM Pricebook2 WHERE IsStandard = true LIMIT 1");
    this.standardPricebookId = result.records[0]?.Id ?? null;
    return this.standardPricebookId;
  }

  private async resolveBundleRelationshipTypeId(): Promise<string | null> {
    if (this.bundleRelationshipTypeId !== undefined) return this.bundleRelationshipTypeId;
    const result = await this.conn.query<{ Id: string }>("SELECT Id FROM ProductRelationshipType WHERE Name = 'Bundle to Bundle Component Relationship' LIMIT 1");
    this.bundleRelationshipTypeId = result.records[0]?.Id ?? null;
    return this.bundleRelationshipTypeId;
  }

  async findAccount(input: FindAccountInput): Promise<ToolResult<AccountSummary[]>> {
    try {
      const escaped = escapeSoqlLike(input.name);
      const records = await this.conn.query<{
        Id: string;
        Name: string;
        Industry: string | null;
      }>(
        `SELECT Id, Name, Industry FROM Account WHERE Name LIKE '%${escaped}%' LIMIT 20`
      );
      const data: AccountSummary[] = records.records.map((record) => ({
        id: record.Id,
        name: record.Name,
        industry: record.Industry ?? "Unknown",
        existingDiscountPercent: null,
      }));
      return { ok: true, data, meta: meta() };
    } catch (err) {
      return {
        ok: false,
        error: { code: "SALESFORCE_ERROR", message: String(err), retryable: true },
        meta: meta(),
      };
    }
  }

  async getAccountById(input: AccountIdInput): Promise<ToolResult<AccountSummary>> {
    try {
      const records = await this.conn.query<{
        Id: string;
        Name: string;
        Industry: string | null;
      }>(`SELECT Id, Name, Industry FROM Account WHERE Id = '${escapeSoql(input.accountId)}'`);
      const account = records.records[0];
      if (!account) {
        return {
          ok: false,
          error: { code: "NOT_FOUND", message: "Account not found", retryable: false },
          meta: meta(),
        };
      }
      return {
        ok: true,
        data: {
          id: account.Id,
          name: account.Name,
          industry: account.Industry ?? "Unknown",
          existingDiscountPercent: null,
        },
        meta: meta(),
      };
    } catch (err) {
      return {
        ok: false,
        error: { code: "SALESFORCE_ERROR", message: String(err), retryable: true },
        meta: meta(),
      };
    }
  }

  async getAccountAssets(input: AccountIdInput): Promise<ToolResult<AccountAsset[]>> {
    try {
      const { isSuccess, outputValues } = await invokeFlowAction(this.conn, "quotingAI__getAccountAssets", {
        accountId: input.accountId,
        assetType: "Active",
      });
      if (!isSuccess) {
        return {
          ok: false,
          error: {
            code: "SALESFORCE_ERROR",
            message:
              ((outputValues as { errorMessage?: string }).errorMessage as string) ??
              "Failed to retrieve account assets",
            retryable: true,
          },
          meta: meta(),
        };
      }
      if (outputValues === null) {
        return { ok: true, data: [], meta: meta() };
      }
      const assets = (outputValues as { accountAssets?: unknown[] }).accountAssets ?? [];
      const ids = assets
        .map((a) => (a as { Id?: string }).Id)
        .filter((id): id is string => typeof id === "string" && id.length > 0);
      if (ids.length === 0) {
        return { ok: true, data: [], meta: meta() };
      }
      const idList = ids.map((id) => `'${escapeSoql(id)}'`).join(", ");
      const records = await this.conn.query<{
        Id: string;
        Name: string;
        Quantity: number | null;
        Status: string | null;
        Product2: { Name: string } | null;
        LifecycleStartDate: string | null;
        LifecycleEndDate: string | null;
      }>(`SELECT Id, Name, Quantity, Status, Product2.Name, LifecycleStartDate, LifecycleEndDate FROM Asset WHERE Id IN (${idList})`);
      const data: AccountAsset[] = records.records.map((record) => ({
        id: record.Id,
        productName: record.Product2?.Name ?? null,
        quantity: record.Quantity ?? null,
        status: record.Status ?? null,
        // Resolving the originating/current quote line for an Asset needs a follow-up
        // query against QuoteLineItem (no direct Asset->QuoteLineItem field is queried
        // here yet); left null rather than guessed.
        quoteId: null,
        quoteLineId: null,
        startDate: record.LifecycleStartDate ?? null,
        endDate: record.LifecycleEndDate ?? null,
      }));
      return { ok: true, data, meta: meta() };
    } catch (err) {
      return {
        ok: false,
        error: { code: "SALESFORCE_ERROR", message: String(err), retryable: true },
        meta: meta(),
      };
    }
  }

  async searchProducts(input: ProductSearchInput): Promise<ToolResult<ProductSummary[]>> {
    try {
      let soql = "SELECT Id, Name, ProductCode, Family, Type, IsActive FROM Product2 WHERE IsActive = true";
      if (input.query.length > 0) {
        const escaped = escapeSoqlLike(input.query);
        soql += ` AND Name LIKE '%${escaped}%'`;
      }
      soql += " LIMIT 20";
      const products = await this.conn.query<{ Id: string; Name: string; ProductCode: string | null; Family: string | null; Type: string | null; IsActive: boolean }>(soql);
      if (products.records.length === 0) {
        return { ok: true, data: [], meta: meta() };
      }
      const ids = products.records.map((p) => p.Id);
      const idList = ids.map((id) => `'${escapeSoql(id)}'`).join(", ");
      const priceRecords = await this.conn.query<{ Product2Id: string; UnitPrice: number }>(
        `SELECT Product2Id, UnitPrice FROM PricebookEntry WHERE Product2Id IN (${idList}) AND Pricebook2.IsStandard = true`
      );
      const priceMap = new Map<string, number>();
      for (const pr of priceRecords.records) {
        priceMap.set(pr.Product2Id, pr.UnitPrice);
      }
      const data: ProductSummary[] = products.records.map((p) => ({
        id: p.Id,
        name: p.Name,
        listPrice: priceMap.get(p.Id) ?? null,
        productCode: p.ProductCode ?? null, family: p.Family ?? null, type: p.Type ?? null, isActive: p.IsActive,
      }));
      return { ok: true, data, meta: meta() };
    } catch (err) {
      return {
        ok: false,
        error: { code: "SALESFORCE_ERROR", message: String(err), retryable: true },
        meta: meta(),
      };
    }
  }

  async createProduct(input: CreateProductInput): Promise<ToolResult<ProductResult>> {
    try {
      const fields: Record<string, unknown> = { Name: input.name };
      const mapping = { productCode: "ProductCode", description: "Description", isActive: "IsActive", family: "Family", type: "Type", isSoldOnlyWithOtherProds: "IsSoldOnlyWithOtherProds", quantityUnitOfMeasure: "QuantityUnitOfMeasure", stockKeepingUnit: "StockKeepingUnit" } as const;
      for (const [key, field] of Object.entries(mapping)) if (input[key as keyof typeof mapping] !== undefined) fields[field] = input[key as keyof typeof mapping];
      const created = await this.conn.sobject("Product2").create(fields);
      return { ok: true, data: { productId: created.id as string, name: input.name }, meta: meta() };
    } catch (err) { return { ok: false, error: { code: "SALESFORCE_ERROR", message: String(err), retryable: true }, meta: meta() }; }
  }

  async updateProduct(input: UpdateProductInput): Promise<ToolResult<ProductResult>> {
    try {
      const fields: Record<string, unknown> & { Id: string } = { Id: input.productId };
      const mapping = { name: "Name", productCode: "ProductCode", description: "Description", isActive: "IsActive", family: "Family", type: "Type", isSoldOnlyWithOtherProds: "IsSoldOnlyWithOtherProds", quantityUnitOfMeasure: "QuantityUnitOfMeasure", stockKeepingUnit: "StockKeepingUnit" } as const;
      for (const [key, field] of Object.entries(mapping)) if (input[key as keyof typeof mapping] !== undefined) fields[field] = input[key as keyof typeof mapping];
      await this.conn.sobject("Product2").update(fields);
      const records = await this.conn.query<{ Name: string }>(`SELECT Name FROM Product2 WHERE Id = '${escapeSoql(input.productId)}'`);
      return { ok: true, data: { productId: input.productId, name: records.records[0]?.Name ?? input.name ?? input.productId }, meta: meta() };
    } catch (err) { return { ok: false, error: { code: "SALESFORCE_ERROR", message: String(err), retryable: true }, meta: meta() }; }
  }

  async setProductPrice(input: SetProductPriceInput): Promise<ToolResult<ProductPriceResult>> {
    try {
      const standardPricebookId = await this.resolveStandardPricebookId();
      if (!standardPricebookId) return { ok: false, error: { code: "NO_STANDARD_PRICEBOOK", message: "No standard Salesforce price book was found in this org", retryable: false }, meta: meta() };
      const records = await this.conn.query<{ Id: string }>(`SELECT Id FROM PricebookEntry WHERE Product2Id = '${escapeSoql(input.productId)}' AND Pricebook2Id = '${standardPricebookId}' LIMIT 1`);
      let pricebookEntryId = records.records[0]?.Id;
      if (pricebookEntryId) await this.conn.sobject("PricebookEntry").update({ Id: pricebookEntryId, UnitPrice: input.unitPrice, ...(input.isActive !== undefined ? { IsActive: input.isActive } : {}) });
      else { const created = await this.conn.sobject("PricebookEntry").create({ Pricebook2Id: standardPricebookId, Product2Id: input.productId, UnitPrice: input.unitPrice, IsActive: input.isActive ?? true }); pricebookEntryId = created.id as string; }
      return { ok: true, data: { pricebookEntryId, productId: input.productId, unitPrice: input.unitPrice }, meta: meta() };
    } catch (err) { return { ok: false, error: { code: "SALESFORCE_ERROR", message: String(err), retryable: true }, meta: meta() }; }
  }

  async getBundleStructure(input: BundleIdInput): Promise<ToolResult<BundleStructure>> {
    try {
      const records = await this.conn.query<any>(`SELECT Id, ParentProductId, ChildProductId, ChildProduct.Name, ChildProduct.ProductCode, Quantity, MinQuantity, MaxQuantity, IsComponentRequired, IsDefaultComponent, Sequence, ProductComponentGroupId FROM ProductRelatedComponent WHERE ParentProductId = '${escapeSoql(input.productId)}' ORDER BY Sequence ASC NULLS LAST`);
      return { ok: true, data: { productId: input.productId, components: records.records.map((r: any) => ({ componentId: r.Id, parentProductId: r.ParentProductId, childProductId: r.ChildProductId, childName: r.ChildProduct?.Name ?? "Unknown", childProductCode: r.ChildProduct?.ProductCode ?? null, quantity: r.Quantity ?? null, minQuantity: r.MinQuantity ?? null, maxQuantity: r.MaxQuantity ?? null, isComponentRequired: r.IsComponentRequired ?? false, isDefaultComponent: r.IsDefaultComponent ?? false, sequence: r.Sequence ?? null, productComponentGroupId: r.ProductComponentGroupId ?? null })) }, meta: meta() };
    } catch (err) { return { ok: false, error: { code: "SALESFORCE_ERROR", message: String(err), retryable: true }, meta: meta() }; }
  }

  async addBundleComponent(input: AddBundleComponentInput): Promise<ToolResult<BundleComponentResult>> {
    try {
      const bundleRelationshipTypeId = await this.resolveBundleRelationshipTypeId();
      if (!bundleRelationshipTypeId) return { ok: false, error: { code: "NO_BUNDLE_RELATIONSHIP_TYPE", message: "The Bundle to Bundle Component Relationship type was not found in this org", retryable: false }, meta: meta() };
      const fields: Record<string, unknown> = { ParentProductId: input.parentProductId, ChildProductId: input.childProductId, ProductRelationshipTypeId: bundleRelationshipTypeId };
      const mapping = { quantity: "Quantity", minQuantity: "MinQuantity", maxQuantity: "MaxQuantity", isComponentRequired: "IsComponentRequired", isDefaultComponent: "IsDefaultComponent", sequence: "Sequence", productComponentGroupId: "ProductComponentGroupId" } as const;
      for (const [key, field] of Object.entries(mapping)) if (input[key as keyof typeof mapping] !== undefined) fields[field] = input[key as keyof typeof mapping];
      const created = await this.conn.sobject("ProductRelatedComponent").create(fields);
      return { ok: true, data: { componentId: created.id as string, parentProductId: input.parentProductId, childProductId: input.childProductId }, meta: meta() };
    } catch (err) { return { ok: false, error: { code: "SALESFORCE_ERROR", message: String(err), retryable: true }, meta: meta() }; }
  }

  async removeBundleComponent(input: RemoveBundleComponentInput): Promise<ToolResult<RemoveBundleComponentResult>> {
    try { await this.conn.sobject("ProductRelatedComponent").destroy(input.componentId); return { ok: true, data: { componentId: input.componentId, removed: true }, meta: meta() }; }
    catch (err) { return { ok: false, error: { code: "SALESFORCE_ERROR", message: String(err), retryable: true }, meta: meta() }; }
  }

  async updateBundleComponent(input: UpdateBundleComponentInput): Promise<ToolResult<BundleComponentResult>> {
    try {
      const existing = await this.conn.query<{ ParentProductId: string; ChildProductId: string }>(`SELECT ParentProductId, ChildProductId FROM ProductRelatedComponent WHERE Id = '${escapeSoql(input.componentId)}'`);
      const component = existing.records[0];
      if (!component) return { ok: false, error: { code: "NOT_FOUND", message: "Bundle component not found", retryable: false }, meta: meta() };
      const fields: Record<string, unknown> & { Id: string } = { Id: input.componentId };
      const mapping = { quantity: "Quantity", minQuantity: "MinQuantity", maxQuantity: "MaxQuantity", isComponentRequired: "IsComponentRequired", isDefaultComponent: "IsDefaultComponent", sequence: "Sequence", productComponentGroupId: "ProductComponentGroupId" } as const;
      for (const [key, field] of Object.entries(mapping)) if (input[key as keyof typeof mapping] !== undefined) fields[field] = input[key as keyof typeof mapping];
      await this.conn.sobject("ProductRelatedComponent").update(fields);
      return { ok: true, data: { componentId: input.componentId, parentProductId: component.ParentProductId, childProductId: component.ChildProductId }, meta: meta() };
    } catch (err) { return { ok: false, error: { code: "SALESFORCE_ERROR", message: String(err), retryable: true }, meta: meta() }; }
  }

  async createInitialQuote(input: CreateInitialQuoteInput): Promise<ToolResult<QuoteResult>> {
    try {
      const oppRecords = await this.conn.query<{ Id: string }>(
        `SELECT Id FROM Opportunity WHERE AccountId = '${escapeSoql(input.accountId)}' AND IsClosed = false LIMIT 1`
      );
      let opportunityId: string;
      let createdOpportunity = false;
      const existingOpp = oppRecords.records[0];
      if (existingOpp) {
        opportunityId = existingOpp.Id;
      } else {
        const accountRecords = await this.conn.query<{ Name: string }>(
          `SELECT Name FROM Account WHERE Id = '${escapeSoql(input.accountId)}'`
        );
        const accountName = accountRecords.records[0]?.Name ?? "Account";
        const closeDate = new Date();
        closeDate.setDate(closeDate.getDate() + 30);
        const closeDateStr = closeDate.toISOString().slice(0, 10);
        const created = await this.conn.sobject("Opportunity").create({
          Name: `${accountName} - Initial Deal`,
          AccountId: input.accountId,
          StageName: "Qualification",
          CloseDate: closeDateStr,
        });
        opportunityId = created.id as string;
        createdOpportunity = true;
      }
      let actionResult: Awaited<ReturnType<typeof invokeFlowAction>>;
      try {
        actionResult = await invokeFlowAction(this.conn, "quotingAI__createInitialQuoteOnOpp", {
          opportunityID: opportunityId,
        });
      } catch (err) {
        if (createdOpportunity) {
          try {
            await this.conn.sobject("Opportunity").destroy(opportunityId);
          } catch {
            // Preserve the original quote-creation failure if cleanup also fails.
          }
        }
        throw err;
      }
      const { isSuccess, outputValues } = actionResult;
      const quoteId = (outputValues as { quoteId?: string } | null)?.quoteId;
      if (!isSuccess || !quoteId) {
        if (createdOpportunity) {
          try {
            await this.conn.sobject("Opportunity").destroy(opportunityId);
          } catch {
            // Preserve the original quote-creation failure if cleanup also fails.
          }
        }
        return {
          ok: false,
          error: {
            code: "QUOTE_CREATION_FAILED",
            message: ((outputValues as { errorMessage?: string } | null)?.errorMessage as string) ?? "Failed to create initial quote",
            retryable: false,
          },
          meta: meta(),
        };
      }
      let quoteNumber: string | undefined;
      let quoteStatus: string | undefined;
      try {
        const quoteRecords = await this.conn.query<{ QuoteNumber: string; Status: string }>(
          `SELECT QuoteNumber, Status FROM Quote WHERE Id = '${escapeSoql(quoteId)}'`
        );
        quoteNumber = quoteRecords.records[0]?.QuoteNumber;
        quoteStatus = quoteRecords.records[0]?.Status;
      } catch {
        // Return the quote verification error below.
      }
      if (!quoteNumber || !quoteStatus) {
        return {
          ok: false,
          error: {
            code: "QUOTE_CREATION_FAILED",
            message: "Quote created but could not be verified",
            retryable: true,
          },
          meta: meta(),
        };
      }
      return {
        ok: true,
        data: { quoteId, quoteNumber, status: quoteStatus },
        meta: meta(),
      };
    } catch (err) {
      return {
        ok: false,
        error: { code: "SALESFORCE_ERROR", message: String(err), retryable: true },
        meta: meta(),
      };
    }
  }

  async createRenewalQuote(input: CreateRenewalQuoteInput): Promise<ToolResult<QuoteResult>> {
    try {
      const assetsResult = await this.getAccountAssets({ accountId: input.accountId });
      if (!assetsResult.ok) {
        return {
          ok: false,
          error: { code: "NO_RENEWABLE_ASSETS", message: "No existing assets found for this account to renew", retryable: false },
          meta: meta(),
        };
      }
      const assetIds = (assetsResult.data ?? []).map((a: AccountAsset) => a.id);
      if (assetIds.length === 0) {
        return {
          ok: false,
          error: { code: "NO_RENEWABLE_ASSETS", message: "No existing assets found for this account to renew", retryable: false },
          meta: meta(),
        };
      }
      const start = new Date(`${input.effectiveDate}T00:00:00.000Z`);
      const renewalStartDate = start.toISOString();
      const end = new Date(start);
      end.setUTCMonth(end.getUTCMonth() + input.termMonths);
      const renewalEndDate = end.toISOString();
      const { isSuccess, outputValues } = await invokeFlowAction(this.conn, "quotingAI__createRenewalQuote", {
        assetIds,
        renewalStartDate,
        renewalEndDate,
      });
      const renewalQuoteId = (outputValues as { renewalQuoteId?: string } | null)?.renewalQuoteId;
      if (!isSuccess || !renewalQuoteId) {
        return {
          ok: false,
          error: {
            code: "QUOTE_CREATION_FAILED",
            message: ((outputValues as { errorMessage?: string } | null)?.errorMessage as string) ?? "Failed to create initial quote",
            retryable: false,
          },
          meta: meta(),
        };
      }
      let quoteNumber: string | undefined;
      let quoteStatus: string | undefined;
      try {
        const quoteRecords = await this.conn.query<{ QuoteNumber: string; Status: string }>(
          `SELECT QuoteNumber, Status FROM Quote WHERE Id = '${escapeSoql(renewalQuoteId)}'`
        );
        quoteNumber = quoteRecords.records[0]?.QuoteNumber;
        quoteStatus = quoteRecords.records[0]?.Status;
      } catch {
        // Return the quote verification error below.
      }
      if (!quoteNumber || !quoteStatus) {
        return {
          ok: false,
          error: {
            code: "QUOTE_CREATION_FAILED",
            message: "Quote created but could not be verified",
            retryable: true,
          },
          meta: meta(),
        };
      }
      return {
        ok: true,
        data: { quoteId: renewalQuoteId, quoteNumber, status: quoteStatus },
        meta: meta(),
      };
    } catch (err) {
      return {
        ok: false,
        error: { code: "SALESFORCE_ERROR", message: String(err), retryable: true },
        meta: meta(),
      };
    }
  }

  async createAmendmentQuote(input: CreateAmendmentQuoteInput): Promise<ToolResult<QuoteResult>> {
    try {
      const assetsResult = await this.getAccountAssets({ accountId: input.accountId });
      if (!assetsResult.ok) {
        return {
          ok: false,
          error: { code: "NO_AMENDABLE_ASSETS", message: "No existing assets found for this account to amend", retryable: false },
          meta: meta(),
        };
      }
      const assetIds = (assetsResult.data ?? []).map((a: AccountAsset) => a.id);
      if (assetIds.length === 0) {
        return {
          ok: false,
          error: { code: "NO_AMENDABLE_ASSETS", message: "No existing assets found for this account to amend", retryable: false },
          meta: meta(),
        };
      }
      const { isSuccess, outputValues } = await invokeFlowAction(this.conn, "quotingAI__createAmendmentQuote", {
        assetIds,
      });
      const amendmentQuoteId = (outputValues as { amendmentQuoteId?: string } | null)?.amendmentQuoteId;
      if (!isSuccess || !amendmentQuoteId) {
        return {
          ok: false,
          error: {
            code: "QUOTE_CREATION_FAILED",
            message: ((outputValues as { errorMessage?: string } | null)?.errorMessage as string) ?? "Failed to create amendment quote",
            retryable: false,
          },
          meta: meta(),
        };
      }
      let quoteNumber: string | undefined;
      let quoteStatus: string | undefined;
      try {
        const quoteRecords = await this.conn.query<{ QuoteNumber: string; Status: string }>(
          `SELECT QuoteNumber, Status FROM Quote WHERE Id = '${escapeSoql(amendmentQuoteId)}'`
        );
        quoteNumber = quoteRecords.records[0]?.QuoteNumber;
        quoteStatus = quoteRecords.records[0]?.Status;
      } catch {
        // Return the quote verification error below.
      }
      if (!quoteNumber || !quoteStatus) {
        return {
          ok: false,
          error: {
            code: "QUOTE_CREATION_FAILED",
            message: "Quote created but could not be verified",
            retryable: true,
          },
          meta: meta(),
        };
      }
      return {
        ok: true,
        data: { quoteId: amendmentQuoteId, quoteNumber, status: quoteStatus },
        meta: meta(),
      };
    } catch (err) {
      return {
        ok: false,
        error: { code: "SALESFORCE_ERROR", message: String(err), retryable: true },
        meta: meta(),
      };
    }
  }

  async addQuoteLine(input: AddQuoteLineInput): Promise<ToolResult<QuoteLineResult>> {
    try {
      const { isSuccess, outputValues } = await invokeFlowAction(this.conn, "quotingAI__getProdtSellModelForPrdct", {
        productIds: [input.productId],
      });
      const sellingModelIds = (outputValues as { productSellingModelIds?: string[] } | null)?.productSellingModelIds;
      if (!isSuccess || !sellingModelIds || sellingModelIds.length === 0) {
        return {
          ok: false,
          error: { code: "NO_SELLING_MODEL", message: "Could not resolve a selling model for this product", retryable: false },
          meta: meta(),
        };
      }
      const productSellingModelID = sellingModelIds[0];
      const addResult = await invokeFlowAction(this.conn, "quotingAI__addQuoteLineItemToQuote", {
        quoteId: input.quoteId,
        productId: input.productId,
        quantity: input.quantity,
        productSellingModelID,
      });
      if (!addResult.isSuccess) {
        return {
          ok: false,
          error: {
            code: "ADD_LINE_FAILED",
            message: ((addResult.outputValues as { errorMessage?: string } | null)?.errorMessage as string) ?? "Failed to add quote line",
            retryable: false,
          },
          meta: meta(),
        };
      }
      const lineRecords = await this.conn.query<{ Id: string }>(
        `SELECT Id FROM QuoteLineItem WHERE QuoteId = '${escapeSoql(input.quoteId)}' AND Product2Id = '${escapeSoql(input.productId)}' ORDER BY CreatedDate DESC LIMIT 1`
      );
      const quoteLineId = lineRecords.records[0]?.Id;
      if (!quoteLineId) {
        return {
          ok: false,
          error: {
            code: "ADD_LINE_FAILED",
            message: "Line item was created but could not be located afterward",
            retryable: true,
          },
          meta: meta(),
        };
      }
      return {
        ok: true,
        data: { quoteLineId, quoteId: input.quoteId, productId: input.productId, quantity: input.quantity },
        meta: meta(),
      };
    } catch (err) {
      return {
        ok: false,
        error: { code: "SALESFORCE_ERROR", message: String(err), retryable: true },
        meta: meta(),
      };
    }
  }

  async removeQuoteLine(input: RemoveQuoteLineInput): Promise<ToolResult<RemoveQuoteLineResult>> {
    try {
      await this.conn.sobject("QuoteLineItem").destroy(input.quoteLineId);
      return {
        ok: true,
        data: { quoteLineId: input.quoteLineId, removed: true },
        meta: meta(),
      };
    } catch (err) {
      return {
        ok: false,
        error: { code: "SALESFORCE_ERROR", message: String(err), retryable: true },
        meta: meta(),
      };
    }
  }

  async updateQuoteLine(input: UpdateQuoteLineInput): Promise<ToolResult<UpdateQuoteLineResult>> {
    try {
      await this.conn.sobject("QuoteLineItem").update({ Id: input.quoteLineId, Quantity: input.quantity });
      return {
        ok: true,
        data: { quoteLineId: input.quoteLineId, quantity: input.quantity },
        meta: meta(),
      };
    } catch (err) {
      return {
        ok: false,
        error: { code: "SALESFORCE_ERROR", message: String(err), retryable: true },
        meta: meta(),
      };
    }
  }

  async applyDiscount(input: ApplyDiscountInput): Promise<ToolResult<DiscountResult>> {
    try {
      const { isSuccess, outputValues } = await invokeFlowAction(this.conn, "quotingAI__applyDiscountToQuoteLine", {
        quoteId: input.quoteId,
        quoteLineItemId: input.quoteLineId,
        discountPercentage: input.discountPercent,
      });
      if (!isSuccess) {
        return {
          ok: false,
          error: {
            code: "DISCOUNT_APPLY_FAILED",
            message: ((outputValues as { errorMessage?: string } | null)?.errorMessage as string) ?? "Failed to apply discount",
            retryable: false,
          },
          meta: meta(),
        };
      }
      return {
        ok: true,
        data: { quoteLineId: input.quoteLineId, appliedDiscountPercent: input.discountPercent },
        meta: meta(),
      };
    } catch (err) {
      return {
        ok: false,
        error: { code: "SALESFORCE_ERROR", message: String(err), retryable: true },
        meta: meta(),
      };
    }
  }

  async getQuoteSummary(input: QuoteIdInput): Promise<ToolResult<QuoteSummary>> {
    if (!input.quoteId && !input.quoteNumber) {
      return {
        ok: false,
        error: { code: "INVALID_INPUT", message: "quoteId or quoteNumber is required", retryable: false },
        meta: meta(),
      };
    }
    try {
      const filter = input.quoteId
        ? `Id = '${escapeSoql(input.quoteId)}'`
        : `QuoteNumber = '${escapeSoql(input.quoteNumber!)}'`;
      const quoteRecords = await this.conn.query<{
        Id: string;
        QuoteNumber: string;
        AccountId: string;
        Status: string;
      }>(`SELECT Id, QuoteNumber, AccountId, Status FROM Quote WHERE ${filter}`);
      if (quoteRecords.records.length === 0) {
        return {
          ok: false,
          error: { code: "NOT_FOUND", message: "Quote not found", retryable: false },
          meta: meta(),
        };
      }
      const quote = quoteRecords.records[0];
      if (!quote) {
        return {
          ok: false,
          error: { code: "NOT_FOUND", message: "Quote not found", retryable: false },
          meta: meta(),
        };
      }
      const lineRecords = await this.conn.query<{
        Product2: { Name: string } | null;
        Quantity: number | null;
        Discount: number | null;
        TotalPrice: number | null;
      }>(`SELECT Product2.Name, Quantity, Discount, TotalPrice FROM QuoteLineItem WHERE QuoteId = '${escapeSoql(quote.Id)}'`);
      const lines = lineRecords.records.map((l) => ({
        productName: l.Product2?.Name ?? null,
        quantity: l.Quantity ?? null,
        discountPercent: l.Discount ?? null,
        netPrice: l.TotalPrice ?? null,
      }));
      return {
        ok: true,
        data: {
          quoteId: quote.Id,
          quoteNumber: quote.QuoteNumber,
          accountId: quote.AccountId,
          status: quote.Status,
          termMonths: null,
          lines,
        },
        meta: meta(),
      };
    } catch (err) {
      return {
        ok: false,
        error: { code: "SALESFORCE_ERROR", message: String(err), retryable: true },
        meta: meta(),
      };
    }
  }
}
