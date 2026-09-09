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

export interface TwinFieldPair {
  sourceObject: string;
  destinationObject: string;
  fieldName: string;
  fieldType: string;
  fieldLabel: string;
}

export interface DetectTwinFieldsData {
  twinFieldPairs: TwinFieldPair[];
}

export type DetectTwinFieldsResult =
  | { ok: true; data: DetectTwinFieldsData; meta: { requestId: string; durationMs: number; source: "salesforce" } }
  | { ok: false; error: { code: string; message: string; retryable: boolean }; meta: { requestId: string; durationMs: number; source: "salesforce" } };

export const detectTwinFieldsTool = {
  name: "detect_twin_fields",
  title: "Detect Twin Fields",
  description: "Describe-based detection of 'twin field' pairs: custom (non-managed) fields with matching API name and type present on both a CPQ source object (Product2, Product Option, Configuration Attribute) and a destination object (Quote Line, Subscription), indicating implicit name-based automation that Revenue Cloud will not preserve. Read-only, no SOQL.",
  kind: "read" as const,
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
  },
};

export async function detectTwinFieldsHandler(conn: Connection, input: Record<string, never>): Promise<DetectTwinFieldsResult> {
  try {
    // Quote Line is both a documented Twin Field destination (from Product2/Product Option/
    // Configuration Attribute) and, in practice, a source in its own right (e.g. Quote Line ->
    // Subscription during subscription creation, as used for committed-quantity enforcement).
    const sourceObjects = ["Product2", "SBQQ__ProductOption__c", "SBQQ__ConfigurationAttribute__c", "SBQQ__QuoteLine__c"];
    const destinationObjects = ["SBQQ__QuoteLine__c", "SBQQ__Subscription__c"];

    const allObjects = [...sourceObjects, ...destinationObjects];
    const describes = await Promise.all(
      allObjects.map(async (objName) => {
        const describeResult = (await conn.describe(objName)) as { fields: Array<{ name: string; type: string; label: string }> };
        return { objName, fields: describeResult.fields };
      })
    );

    const fieldMaps = new Map<string, Map<string, { type: string; label: string }>>();
    for (const { objName, fields } of describes) {
      const fieldMap = new Map<string, { type: string; label: string }>();
      for (const field of fields) {
        if (field.name.endsWith("__c") && !field.name.startsWith("SBQQ__")) {
          fieldMap.set(field.name, { type: field.type, label: field.label });
        }
      }
      fieldMaps.set(objName, fieldMap);
    }

    const twinFieldPairs: TwinFieldPair[] = [];
    for (const sourceObject of sourceObjects) {
      const sourceMap = fieldMaps.get(sourceObject)!;
      for (const destinationObject of destinationObjects) {
        if (destinationObject === sourceObject) continue;
        const destMap = fieldMaps.get(destinationObject)!;
        for (const [fieldName, sourceField] of sourceMap) {
          const destField = destMap.get(fieldName);
          if (destField && destField.type === sourceField.type) {
            twinFieldPairs.push({
              sourceObject,
              destinationObject,
              fieldName,
              fieldType: sourceField.type,
              fieldLabel: sourceField.label,
            });
          }
        }
      }
    }

    const data: DetectTwinFieldsData = { twinFieldPairs };
    return { ok: true, data, meta: meta() };
  } catch (err) {
    return { ok: false, error: { code: "SALESFORCE_ERROR", message: String(err), retryable: true }, meta: meta() };
  }
}
