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

export interface PriceRuleCondition {
  id: string;
  ruleId: string | null;
  object: string | null;
  field: string | null;
  operator: string | null;
  filterType: string | null;
  value: string | null;
  index: number | null;
}

export interface PriceRuleAction {
  id: string;
  ruleId: string | null;
  targetObject: string | null;
  field: string | null;
  value: string | null;
  order: number | null;
}

export interface PriceRuleSummary {
  id: string;
  name: string;
  active: boolean;
  conditionsMet: string | null;
  evaluationEvent: string | null;
  targetObject: string | null;
  product: string | null;
  conditions: PriceRuleCondition[];
  actions: PriceRuleAction[];
}

export interface InspectPriceRulesData {
  priceRules: PriceRuleSummary[];
}

export type InspectPriceRulesResult =
  | { ok: true; data: InspectPriceRulesData; meta: { requestId: string; durationMs: number; source: "salesforce" } }
  | { ok: false; error: { code: string; message: string; retryable: boolean }; meta: { requestId: string; durationMs: number; source: "salesforce" } };

export const inspectPriceRulesTool = {
  name: "inspect_price_rules",
  title: "Inspect Price Rules",
  description: "Inventories SBQQ CPQ Price Rules with their conditions and actions, for migration-readiness analysis. Read-only.",
  kind: "read" as const,
  inputSchema: {
    type: "object",
    properties: {
      activeOnly: { type: "boolean", description: "When true (the default), only include Price Rules where SBQQ__Active__c = true." },
    },
    required: [],
  },
};

export async function inspectPriceRulesHandler(conn: Connection, input: { activeOnly?: boolean }): Promise<InspectPriceRulesResult> {
  try {
    const activeOnly = input.activeOnly ?? true;

    const whereClause = activeOnly ? " WHERE SBQQ__Active__c = true" : "";
    const rulesQuery = `SELECT Id, Name, SBQQ__Active__c, SBQQ__ConditionsMet__c, SBQQ__EvaluationEvent__c, SBQQ__TargetObject__c, SBQQ__Product__c FROM SBQQ__PriceRule__c${whereClause} ORDER BY Name ASC LIMIT 50`;
    const rulesResult = await conn.query<any>(rulesQuery);
    const ruleRows = rulesResult.records;

    const ruleIds = ruleRows.map((r) => r.Id);

    let conditionRows: any[] = [];
    let actionRows: any[] = [];

    if (ruleIds.length > 0) {
      const inClause = `IN ('${ruleIds.join("','")}')`;

      const conditionsQuery = `SELECT Id, SBQQ__Rule__c, SBQQ__Object__c, SBQQ__Field__c, SBQQ__Operator__c, SBQQ__FilterType__c, SBQQ__Value__c, SBQQ__Index__c FROM SBQQ__PriceCondition__c WHERE SBQQ__Rule__c ${inClause} ORDER BY SBQQ__Index__c ASC NULLS LAST`;
      const conditionsResult = await conn.query<any>(conditionsQuery);
      conditionRows = conditionsResult.records;

      const actionsQuery = `SELECT Id, SBQQ__Rule__c, SBQQ__TargetObject__c, SBQQ__Field__c, SBQQ__Value__c, SBQQ__Order__c FROM SBQQ__PriceAction__c WHERE SBQQ__Rule__c ${inClause} ORDER BY SBQQ__Order__c ASC NULLS LAST`;
      const actionsResult = await conn.query<any>(actionsQuery);
      actionRows = actionsResult.records;
    }

    const priceRules: PriceRuleSummary[] = ruleRows.map((rule) => {
      const conditions: PriceRuleCondition[] = conditionRows
        .filter((c) => c.SBQQ__Rule__c === rule.Id)
        .map((c) => ({
          id: c.Id,
          ruleId: c.SBQQ__Rule__c ?? null,
          object: c.SBQQ__Object__c ?? null,
          field: c.SBQQ__Field__c ?? null,
          operator: c.SBQQ__Operator__c ?? null,
          filterType: c.SBQQ__FilterType__c ?? null,
          value: c.SBQQ__Value__c ?? null,
          index: c.SBQQ__Index__c ?? null,
        }));

      const actions: PriceRuleAction[] = actionRows
        .filter((a) => a.SBQQ__Rule__c === rule.Id)
        .map((a) => ({
          id: a.Id,
          ruleId: a.SBQQ__Rule__c ?? null,
          targetObject: a.SBQQ__TargetObject__c ?? null,
          field: a.SBQQ__Field__c ?? null,
          value: a.SBQQ__Value__c ?? null,
          order: a.SBQQ__Order__c ?? null,
        }));

      return {
        id: rule.Id,
        name: rule.Name,
        active: rule.SBQQ__Active__c ?? false,
        conditionsMet: rule.SBQQ__ConditionsMet__c ?? null,
        evaluationEvent: rule.SBQQ__EvaluationEvent__c ?? null,
        targetObject: rule.SBQQ__TargetObject__c ?? null,
        product: rule.SBQQ__Product__c ?? null,
        conditions,
        actions,
      };
    });

    const data: InspectPriceRulesData = { priceRules };

    return { ok: true, data, meta: meta() };
  } catch (err) {
    return { ok: false, error: { code: "SALESFORCE_ERROR", message: String(err), retryable: true }, meta: meta() };
  }
}
