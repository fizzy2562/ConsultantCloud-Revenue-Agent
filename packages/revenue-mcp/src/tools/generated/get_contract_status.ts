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

export interface ContractLine {
  id: string;
  productId: string | null;
  quantity: number | null;
  unitPrice: number | null;
}

export interface ContractStatusData {
  id: string;
  accountId: string | null;
  status: string | null;
  startDate: string | null;
  endDate: string | null;
  contractTerm: number | null;
  sourceQuoteId: string | null;
  sourceOrderId: string | null;
}

export interface ContractStatusMeta {
  requestId: string;
  durationMs: number;
  source: "salesforce";
}

export interface ContractStatusSuccess {
  ok: true;
  data: ContractStatusData;
  meta: ContractStatusMeta;
}

export interface ContractStatusFailure {
  ok: false;
  error: { code: string; message: string; retryable: boolean };
  meta: ContractStatusMeta;
}

export type getContractStatusResult = ContractStatusSuccess | ContractStatusFailure;

export const getContractStatusTool = {
  name: "get_contract_status",
  title: "Get Contract Status",
  description: "Looks up a Contract by contractId or accountId (most recent), returning status and source transaction links. Read-only.",
  kind: "read" as const,
  inputSchema: {
    type: "object",
    properties: {
      contractId: { type: "string", description: "The Contract Id to look up directly." },
      accountId: { type: "string", description: "The Account Id; the most recent Contract for that account is returned." },
    },
    required: [],
  },
};

export async function getContractStatusHandler(
  conn: Connection,
  input: { contractId?: string; accountId?: string }
): Promise<getContractStatusResult> {
  if (!input.contractId && !input.accountId) {
    return { ok: false, error: { code: "INVALID_INPUT", message: "contractId or accountId is required", retryable: false }, meta: meta() };
  }

  try {
    const filter = input.contractId
      ? `Id = '${escapeSoql(input.contractId)}'`
      : `AccountId = '${escapeSoql(input.accountId!)}' ORDER BY StartDate DESC NULLS LAST LIMIT 1`;

    const contractQuery = `SELECT Id, AccountId, Status, StartDate, EndDate, ContractTerm, SourceQuoteId, SourceOrderId FROM Contract WHERE ${filter}`;
    const contractRecords = await conn.query<any>(contractQuery);
    const contract = contractRecords.records[0];
    if (!contract) {
      return { ok: false, error: { code: "NOT_FOUND", message: "Contract not found", retryable: false }, meta: meta() };
    }

    const data: ContractStatusData = {
      id: contract.Id,
      accountId: contract.AccountId ?? null,
      status: contract.Status ?? null,
      startDate: contract.StartDate ?? null,
      endDate: contract.EndDate ?? null,
      contractTerm: contract.ContractTerm ?? null,
      sourceQuoteId: contract.SourceQuoteId ?? null,
      sourceOrderId: contract.SourceOrderId ?? null,
    };

    return { ok: true, data, meta: meta() };
  } catch (err) {
    return { ok: false, error: { code: "SALESFORCE_ERROR", message: String(err), retryable: true }, meta: meta() };
  }
}
