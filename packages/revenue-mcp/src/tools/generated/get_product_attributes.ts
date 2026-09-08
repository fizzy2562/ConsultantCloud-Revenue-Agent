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

export interface ProductAttribute {
  id: string;
  productId: string;
  attributeDefinitionId: string;
  label: string | null;
  dataType: string | null;
  code: string | null;
  developerName: string | null;
  nameOverride: string | null;
  defaultValue: string | null;
  valueDescription: string | null;
  isRequired: boolean;
  isReadOnly: boolean;
  isPriceImpacting: boolean;
  sequence: number | null;
  attributeCategoryId: string | null;
  minimumValue: number | null;
  maximumValue: number | null;
  displayType: string | null;
}

export interface ProductAttributesMeta {
  requestId: string;
  durationMs: number;
  source: "salesforce";
}

export interface ProductAttributesSuccess {
  ok: true;
  data: ProductAttribute[];
  meta: ProductAttributesMeta;
}

export interface ProductAttributesFailure {
  ok: false;
  error: { code: string; message: string; retryable: boolean };
  meta: ProductAttributesMeta;
}

export type getProductAttributesResult = ProductAttributesSuccess | ProductAttributesFailure;

export const getProductAttributesTool = {
  name: "get_product_attributes",
  title: "Get Product Attributes",
  description: "Lists a product's attribute definitions (with overrides, requiredness, min/max, display type) joined with each attribute definition's label and data type. Read-only.",
  kind: "read" as const,
  inputSchema: {
    type: "object",
    properties: {
      productId: { type: "string", description: "The Id of the Product2 whose attributes should be listed." },
    },
    required: ["productId"],
  },
};

export async function getProductAttributesHandler(conn: Connection, input: { productId: string }): Promise<getProductAttributesResult> {
  try {
    const soql = `SELECT Id, Product2Id, AttributeDefinitionId, AttributeNameOverride, DefaultValue, ValueDescription, IsRequired, IsReadOnly, IsPriceImpacting, Sequence, AttributeCategoryId, MinimumValue, MaximumValue, DisplayType, AttributeDefinition.Label, AttributeDefinition.DataType, AttributeDefinition.Code, AttributeDefinition.DeveloperName, AttributeDefinition.IsActive, AttributeDefinition.DefaultValue FROM ProductAttributeDefinition WHERE Product2Id = '${escapeSoql(input.productId)}' ORDER BY Sequence ASC NULLS LAST`;
    const records = await conn.query<any>(soql);
    const data: ProductAttribute[] = records.records.map((r: any) => ({
      id: r.Id,
      productId: r.Product2Id,
      attributeDefinitionId: r.AttributeDefinitionId,
      label: r.AttributeDefinition?.Label ?? null,
      dataType: r.AttributeDefinition?.DataType ?? null,
      code: r.AttributeDefinition?.Code ?? null,
      developerName: r.AttributeDefinition?.DeveloperName ?? null,
      nameOverride: r.AttributeNameOverride ?? null,
      defaultValue: r.DefaultValue ?? null,
      valueDescription: r.ValueDescription ?? null,
      isRequired: r.IsRequired ?? false,
      isReadOnly: r.IsReadOnly ?? false,
      isPriceImpacting: r.IsPriceImpacting ?? false,
      sequence: r.Sequence ?? null,
      attributeCategoryId: r.AttributeCategoryId ?? null,
      minimumValue: r.MinimumValue ?? null,
      maximumValue: r.MaximumValue ?? null,
      displayType: r.DisplayType ?? null,
    }));
    return { ok: true, data, meta: meta() };
  } catch (err) {
    return { ok: false, error: { code: "SALESFORCE_ERROR", message: String(err), retryable: true }, meta: meta() };
  }
}
