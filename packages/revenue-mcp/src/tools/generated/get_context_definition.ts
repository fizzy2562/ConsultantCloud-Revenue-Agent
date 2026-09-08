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

export interface ContextDefinitionData {
  id: string;
  developerName: string;
  masterLabel: string | null;
  title: string | null;
  description: string | null;
  contextTtl: number | null;
  displayName: string | null;
  contextNodes: unknown[];
  contextAttributes: unknown[];
  contextMappings: unknown[];
}

export type ContextDefinitionMeta = { requestId: string; durationMs: number; source: "salesforce" };

export type ContextDefinitionResult =
  | { ok: true; data: ContextDefinitionData; meta: ContextDefinitionMeta }
  | { ok: false; error: { code: string; message: string; retryable: boolean }; meta: ContextDefinitionMeta };

export const getContextDefinitionTool = {
  name: "get_context_definition",
  title: "Get Context Definition",
  description: "Looks up a ContextDefinition and its active version, nodes, attributes, and mappings. Read-only.",
  kind: "read" as const,
  inputSchema: {
    type: "object",
    properties: {
      developerName: { type: "string", description: "The DeveloperName of the ContextDefinition to look up." },
    },
    required: ["developerName"],
  },
};

export async function getContextDefinitionHandler(conn: Connection, input: { developerName: string }): Promise<ContextDefinitionResult> {
  try {
    const records = await conn.query<any>(`SELECT Id, DeveloperName, MasterLabel, Title, Description, ContextTtl, DisplayName FROM ContextDefinition WHERE DeveloperName = '${escapeSoql(input.developerName)}'`);
    const record = records.records[0];
    if (!record) {
      return { ok: false, error: { code: "NOT_FOUND", message: "Context definition not found", retryable: false }, meta: meta() };
    }
    const versions = await conn.query<any>(`SELECT Id, VersionNumber FROM ContextDefinitionVersion WHERE ContextDefinitionId = '${escapeSoql(record.Id)}' AND IsActive = true ORDER BY VersionNumber DESC LIMIT 1`);
    const version = versions.records[0];
    let contextNodes: any[] = [];
    let contextAttributes: any[] = [];
    let contextMappings: any[] = [];
    if (version) {
      const nodes = await conn.query<any>(`SELECT Id, Title, DisplayName, Description, IsTransposable FROM ContextNode WHERE ContextDefinitionVersionId = '${escapeSoql(version.Id)}'`);
      contextNodes = nodes.records.map((node: any) => ({ id: node.Id, title: node.Title ?? null, displayName: node.DisplayName ?? null, description: node.Description ?? null, isTransposable: node.IsTransposable ?? false }));
      const nodeIds = nodes.records.map((node: any) => node.Id);
      if (nodeIds.length) {
        const ids = nodeIds.map((id: string) => `'${escapeSoql(id)}'`).join(", ");
        const attributes = await conn.query<any>(`SELECT Id, ContextNodeId, Title, DisplayName, Description, DataType, FieldType, IsKey, IsValue FROM ContextAttribute WHERE ContextNodeId IN (${ids})`);
        contextAttributes = attributes.records.map((attribute: any) => ({ id: attribute.Id, contextNodeId: attribute.ContextNodeId, title: attribute.Title ?? null, displayName: attribute.DisplayName ?? null, description: attribute.Description ?? null, dataType: attribute.DataType ?? null, fieldType: attribute.FieldType ?? null, isKey: attribute.IsKey ?? false, isValue: attribute.IsValue ?? false }));
      }
      const mappings = await conn.query<any>(`SELECT Id, Title, Description, IsDefault FROM ContextMapping WHERE ContextDefinitionVersionId = '${escapeSoql(version.Id)}'`);
      contextMappings = mappings.records.map((mapping: any) => ({ id: mapping.Id, title: mapping.Title ?? null, description: mapping.Description ?? null, isDefault: mapping.IsDefault ?? false }));
    }
    return {
      ok: true,
      data: {
        id: record.Id,
        developerName: record.DeveloperName,
        masterLabel: record.MasterLabel ?? null,
        title: record.Title ?? null,
        description: record.Description ?? null,
        contextTtl: record.ContextTtl ?? null,
        displayName: record.DisplayName ?? null,
        contextNodes,
        contextAttributes,
        contextMappings,
      },
      meta: meta(),
    };
  } catch (err) {
    return { ok: false, error: { code: "SALESFORCE_ERROR", message: String(err), retryable: true }, meta: meta() };
  }
}
