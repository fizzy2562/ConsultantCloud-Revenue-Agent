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

export interface ObligationRecord {
  id: string;
  name: string | null;
  description: string | null;
  status: string | null;
  party: string | null;
  otherPartyAccountId: string | null;
  assigneeUserId: string | null;
  referenceObjectId: string | null;
  startDate: string | null;
  endDate: string | null;
  state: string | null;
  statusChangeReason: string | null;
  type: string | null;
  referenceContractId: string | null;
}

export interface GetContractObligationsMeta {
  requestId: string;
  durationMs: number;
  source: "salesforce";
}

export interface GetContractObligationsSuccess {
  ok: true;
  data: ObligationRecord[];
  meta: GetContractObligationsMeta;
}

export interface GetContractObligationsFailure {
  ok: false;
  error: { code: string; message: string; retryable: boolean };
  meta: GetContractObligationsMeta;
}

export type getContractObligationsResult = GetContractObligationsSuccess | GetContractObligationsFailure;

export const getContractObligationsTool = {
  name: "get_contract_obligations",
  title: "Get Contract Obligations",
  description: "Lists Obligation records where ReferenceContractId matches the given contractId. Read-only.",
  kind: "read" as const,
  inputSchema: {
    type: "object",
    properties: {
      contractId: { type: "string", description: "The Id of the contract whose obligations should be listed." },
    },
    required: ["contractId"],
  },
};

export async function getContractObligationsHandler(conn: Connection, input: { contractId: string }): Promise<getContractObligationsResult> {
  try {
    const records = await conn.query<any>(`SELECT Id, Name, Description, Status, Party, OtherPartyAccountId, AssigneeUserId, ReferenceObjectId, StartDate, EndDate, State, StatusChangeReason, Type, ReferenceContractId FROM Obligation WHERE ReferenceContractId = '${escapeSoql(input.contractId)}' ORDER BY StartDate ASC NULLS LAST`);
    const data: ObligationRecord[] = records.records.map((r: any) => ({
      id: r.Id,
      name: r.Name ?? null,
      description: r.Description ?? null,
      status: r.Status ?? null,
      party: r.Party ?? null,
      otherPartyAccountId: r.OtherPartyAccountId ?? null,
      assigneeUserId: r.AssigneeUserId ?? null,
      referenceObjectId: r.ReferenceObjectId ?? null,
      startDate: r.StartDate ?? null,
      endDate: r.EndDate ?? null,
      state: r.State ?? null,
      statusChangeReason: r.StatusChangeReason ?? null,
      type: r.Type ?? null,
      referenceContractId: r.ReferenceContractId ?? null,
    }));
    return { ok: true, data, meta: meta() };
  } catch (err) {
    return { ok: false, error: { code: "SALESFORCE_ERROR", message: String(err), retryable: true }, meta: meta() };
  }
}
