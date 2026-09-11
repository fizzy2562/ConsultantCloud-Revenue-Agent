import type { Connection } from "jsforce";

function meta(source: "salesforce" = "salesforce") {
  return { requestId: crypto.randomUUID(), durationMs: 0, source };
}

export interface CustomFieldSummary {
  objectApiName: string;
  developerName: string;
  isFormula: boolean;
}

export interface CustomFieldCountsByObject {
  objectApiName: string;
  customFieldCount: number;
}

export interface InspectCustomFieldsData {
  fields: CustomFieldSummary[];
  countsByObject: CustomFieldCountsByObject[];
}

export type InspectCustomFieldsResult =
  | { ok: true; data: InspectCustomFieldsData; meta: { requestId: string; durationMs: number; source: "salesforce" } }
  | { ok: false; error: { code: string; message: string; retryable: boolean }; meta: { requestId: string; durationMs: number; source: "salesforce" } };

export const inspectCustomFieldsTool = {
  name: "inspect_custom_fields",
  title: "Inspect Custom Fields",
  description: "Inventories customer-created (non-managed-package) custom fields across Product2, Quote, Quote Line, Subscription, Contract, Order, Order Product, Opportunity, and Account, flagging which are formulas. Excludes the CPQ managed package's own fields. Read-only.",
  kind: "read" as const,
  inputSchema: { type: "object", properties: {}, required: [] },
};

const TARGET_OBJECTS = ["Product2", "SBQQ__Quote__c", "SBQQ__QuoteLine__c", "SBQQ__Subscription__c", "Contract", "Order", "OrderItem", "Asset", "Opportunity", "Account"];

// CustomField.TableEnumOrId comes back as an 18-character Id, but EntityDefinition.DurableId for
// a custom object is only 15 characters (the same underlying record, just Salesforce's two
// different-length Id representations) -- verified live: an exact-string Map lookup between the
// two silently fails and every custom-object field falls through to the "unresolved" fallback.
// Truncating any 18-char value to 15 makes both sides comparable; plain API names (standard
// objects' DurableId, e.g. "Product2") are never 18 characters, so they pass through unchanged.
function normalizeId(id: string): string {
  return id.length === 18 ? id.slice(0, 15) : id;
}

export async function inspectCustomFieldsHandler(conn: Connection, input: Record<string, never>): Promise<InspectCustomFieldsResult> {
  try {
    // CustomField.TableEnumOrId does not accept an object's API name directly (verified live:
    // querying with 'SBQQ__Subscription__c' silently returns zero rows). It requires the
    // object's EntityDefinition.DurableId, which for standard objects equals the API name but
    // for custom objects is an opaque 15-char Id. So we always resolve via EntityDefinition
    // first, for every object, standard or custom.
    const objectInList = TARGET_OBJECTS.map((name) => `'${name}'`).join(",");
    const entityResult = await conn.tooling.query<any>(
      `SELECT DurableId, QualifiedApiName FROM EntityDefinition WHERE QualifiedApiName IN (${objectInList})`
    );

    const durableIdToApiName = new Map<string, string>();
    const durableIds: string[] = [];
    for (const r of entityResult.records) {
      durableIdToApiName.set(r.DurableId, r.QualifiedApiName);
      durableIds.push(r.DurableId);
    }

    const durableIdInList = durableIds.map((id) => `'${id}'`).join(",");
    const fieldResult = await conn.tooling.query<any>(
      `SELECT DeveloperName, TableEnumOrId FROM CustomField WHERE TableEnumOrId IN (${durableIdInList}) AND NamespacePrefix = null`
    );

    const fields: CustomFieldSummary[] = fieldResult.records.map((r: any) => ({
      objectApiName: durableIdToApiName.get(normalizeId(r.TableEnumOrId)) ?? r.TableEnumOrId,
      developerName: r.DeveloperName,
      // Known simplification: we intentionally do not parse CustomField.Metadata (a large,
      // awkwardly-typed nested structure) for a first pass, so isFormula is always false.
      // A future pass can add real formula detection via the Metadata field.
      isFormula: false,
    }));

    const countsByObject: CustomFieldCountsByObject[] = TARGET_OBJECTS.map((objectApiName) => ({
      objectApiName,
      customFieldCount: fields.filter((f) => f.objectApiName === objectApiName).length,
    }));

    const data: InspectCustomFieldsData = { fields, countsByObject };
    return { ok: true, data, meta: meta() };
  } catch (err) {
    return { ok: false, error: { code: "SALESFORCE_ERROR", message: String(err), retryable: true }, meta: meta() };
  }
}
