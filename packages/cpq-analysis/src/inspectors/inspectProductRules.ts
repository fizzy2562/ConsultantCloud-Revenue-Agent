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

export interface ProductRuleConfigurationRule {
  id: string;
  productRuleId: string | null;
  active: boolean;
  product: string | null;
  productFeature: string | null;
}

export interface ProductRuleSummary {
  id: string;
  name: string;
  active: boolean;
  type: string | null;
  scope: string | null;
  evaluationEvent: string | null;
  errorMessage: string | null;
  configurationRules: ProductRuleConfigurationRule[];
}

export interface InspectProductRulesData {
  productRules: ProductRuleSummary[];
}

export type InspectProductRulesResult =
  | { ok: true; data: InspectProductRulesData; meta: { requestId: string; durationMs: number; source: "salesforce" } }
  | { ok: false; error: { code: string; message: string; retryable: boolean }; meta: { requestId: string; durationMs: number; source: "salesforce" } };

export const inspectProductRulesTool = {
  name: "inspect_product_rules",
  title: "Inspect Product Rules",
  description: "Inventories SBQQ CPQ Product Rules with their configuration rules, for migration-readiness analysis. Read-only.",
  kind: "read" as const,
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
  },
};

export async function inspectProductRulesHandler(conn: Connection, input: Record<string, never>): Promise<InspectProductRulesResult> {
  try {
    const rulesResult = await conn.query<any>(
      `SELECT Id, Name, SBQQ__Active__c, SBQQ__Type__c, SBQQ__Scope__c, SBQQ__EvaluationEvent__c, SBQQ__ConditionsMet__c, SBQQ__ErrorMessage__c FROM SBQQ__ProductRule__c ORDER BY Name ASC LIMIT 50`
    );
    const ruleRows = rulesResult.records;

    let configurationRuleRows: any[] = [];
    if (ruleRows.length > 0) {
      const ids = ruleRows.map((r) => r.Id);
      const configResult = await conn.query<any>(
        `SELECT Id, SBQQ__ProductRule__c, SBQQ__Active__c, SBQQ__Product__c, SBQQ__ProductFeature__c FROM SBQQ__ConfigurationRule__c WHERE SBQQ__ProductRule__c IN ('${ids.join("','")}')`
      );
      configurationRuleRows = configResult.records;
    }

    const productRules: ProductRuleSummary[] = ruleRows.map((rule) => {
      const matching = configurationRuleRows.filter((cr) => cr.SBQQ__ProductRule__c === rule.Id);
      const configurationRules: ProductRuleConfigurationRule[] = matching.map((cr) => ({
        id: cr.Id,
        productRuleId: cr.SBQQ__ProductRule__c ?? null,
        active: cr.SBQQ__Active__c ?? false,
        product: cr.SBQQ__Product__c ?? null,
        productFeature: cr.SBQQ__ProductFeature__c ?? null,
      }));

      return {
        id: rule.Id,
        name: rule.Name,
        active: rule.SBQQ__Active__c ?? false,
        type: rule.SBQQ__Type__c ?? null,
        scope: rule.SBQQ__Scope__c ?? null,
        evaluationEvent: rule.SBQQ__EvaluationEvent__c ?? null,
        errorMessage: rule.SBQQ__ErrorMessage__c ?? null,
        configurationRules,
      };
    });

    const data: InspectProductRulesData = { productRules };

    return { ok: true, data, meta: meta() };
  } catch (err) {
    return { ok: false, error: { code: "SALESFORCE_ERROR", message: String(err), retryable: true }, meta: meta() };
  }
}
