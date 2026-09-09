import type { Connection } from "jsforce";

function meta(source: "salesforce" = "salesforce") {
  return { requestId: crypto.randomUUID(), durationMs: 0, source };
}

function escapeSoql(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function escapeSoqlLike(value: string): string {
  return escapeSoql(value).replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export interface CatalogProductSummary {
  id: string;
  name: string;
  productCode: string | null;
  family: string | null;
  isActive: boolean;
}

export interface CatalogProductOption {
  id: string;
  name: string;
  configuredSku: string | null;
  optionalSku: string | null;
  feature: string | null;
  type: string | null;
  required: boolean;
  minQuantity: number | null;
  maxQuantity: number | null;
}

export interface CatalogProductFeature {
  id: string;
  name: string;
  configuredSku: string | null;
  minOptionCount: number | null;
  maxOptionCount: number | null;
  optionSelectionMethod: string | null;
}

export interface CatalogAttributeSet {
  id: string;
  name: string;
}

export interface CatalogConfigurationAttribute {
  id: string;
  name: string;
  product: string | null;
  feature: string | null;
  required: boolean;
  hidden: boolean;
  defaultField: string | null;
}

export interface InspectCatalogStructureData {
  products: CatalogProductSummary[];
  productOptions: CatalogProductOption[];
  productFeatures: CatalogProductFeature[];
  attributeSets: CatalogAttributeSet[];
  configurationAttributes: CatalogConfigurationAttribute[];
}

export type InspectCatalogStructureResult =
  | { ok: true; data: InspectCatalogStructureData; meta: { requestId: string; durationMs: number; source: "salesforce" } }
  | { ok: false; error: { code: string; message: string; retryable: boolean }; meta: { requestId: string; durationMs: number; source: "salesforce" } };

export const inspectCatalogStructureTool = {
  name: "inspect_catalog_structure",
  title: "Inspect Catalog Structure",
  description: "Inventories the SBQQ CPQ product catalog structure — active products, product options, product features, attribute sets, and configuration attributes — for migration-readiness analysis. Read-only.",
  kind: "read" as const,
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
  },
};

export async function inspectCatalogStructureHandler(conn: Connection, input: Record<string, never>): Promise<InspectCatalogStructureResult> {
  try {
    const [productsRes, productOptionsRes, productFeaturesRes, attributeSetsRes, configurationAttributesRes] = await Promise.all([
      conn.query<any>(`SELECT Id, Name, ProductCode, Family, IsActive FROM Product2 WHERE IsActive = true ORDER BY Name ASC LIMIT 100`),
      conn.query<any>(`SELECT Id, Name, SBQQ__ConfiguredSKU__c, SBQQ__OptionalSKU__c, SBQQ__Feature__c, SBQQ__Type__c, SBQQ__Required__c, SBQQ__MinQuantity__c, SBQQ__MaxQuantity__c FROM SBQQ__ProductOption__c ORDER BY Name ASC LIMIT 200`),
      conn.query<any>(`SELECT Id, Name, SBQQ__ConfiguredSKU__c, SBQQ__MinOptionCount__c, SBQQ__MaxOptionCount__c, SBQQ__OptionSelectionMethod__c FROM SBQQ__ProductFeature__c ORDER BY Name ASC LIMIT 100`),
      conn.query<any>(`SELECT Id, Name FROM SBQQ__AttributeSet__c ORDER BY Name ASC LIMIT 50`),
      conn.query<any>(`SELECT Id, Name, SBQQ__Product__c, SBQQ__Feature__c, SBQQ__Required__c, SBQQ__Hidden__c, SBQQ__DefaultField__c FROM SBQQ__ConfigurationAttribute__c ORDER BY Name ASC LIMIT 100`),
    ]);

    const products: CatalogProductSummary[] = productsRes.records.map((r: any) => ({
      id: r.Id,
      name: r.Name,
      productCode: r.ProductCode ?? null,
      family: r.Family ?? null,
      isActive: r.IsActive ?? false,
    }));

    const productOptions: CatalogProductOption[] = productOptionsRes.records.map((r: any) => ({
      id: r.Id,
      name: r.Name,
      configuredSku: r.SBQQ__ConfiguredSKU__c ?? null,
      optionalSku: r.SBQQ__OptionalSKU__c ?? null,
      feature: r.SBQQ__Feature__c ?? null,
      type: r.SBQQ__Type__c ?? null,
      required: r.SBQQ__Required__c ?? false,
      minQuantity: r.SBQQ__MinQuantity__c ?? null,
      maxQuantity: r.SBQQ__MaxQuantity__c ?? null,
    }));

    const productFeatures: CatalogProductFeature[] = productFeaturesRes.records.map((r: any) => ({
      id: r.Id,
      name: r.Name,
      configuredSku: r.SBQQ__ConfiguredSKU__c ?? null,
      minOptionCount: r.SBQQ__MinOptionCount__c ?? null,
      maxOptionCount: r.SBQQ__MaxOptionCount__c ?? null,
      optionSelectionMethod: r.SBQQ__OptionSelectionMethod__c ?? null,
    }));

    const attributeSets: CatalogAttributeSet[] = attributeSetsRes.records.map((r: any) => ({
      id: r.Id,
      name: r.Name,
    }));

    const configurationAttributes: CatalogConfigurationAttribute[] = configurationAttributesRes.records.map((r: any) => ({
      id: r.Id,
      name: r.Name,
      product: r.SBQQ__Product__c ?? null,
      feature: r.SBQQ__Feature__c ?? null,
      required: r.SBQQ__Required__c ?? false,
      hidden: r.SBQQ__Hidden__c ?? false,
      defaultField: r.SBQQ__DefaultField__c ?? null,
    }));

    const data: InspectCatalogStructureData = {
      products,
      productOptions,
      productFeatures,
      attributeSets,
      configurationAttributes,
    };

    return { ok: true, data, meta: meta() };
  } catch (err) {
    return { ok: false, error: { code: "SALESFORCE_ERROR", message: String(err), retryable: true }, meta: meta() };
  }
}
