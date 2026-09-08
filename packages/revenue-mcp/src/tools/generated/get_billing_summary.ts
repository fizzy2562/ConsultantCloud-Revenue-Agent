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

export interface BillingAccountSummary {
  id: string;
  name: string;
  accountId: string;
  isDefaultBillingProfile: boolean;
  taxExemptionStatus: string | null;
}

export interface BillingScheduleSummary {
  id: string;
  billingAccountId: string;
  totalAmount: number | null;
  quantity: number | null;
  unitPrice: number | null;
  nextBillingDate: string | null;
  billingScheduleStartDate: string | null;
  billingScheduleEndDate: string | null;
  status: string | null;
  billedAmount: number | null;
  pendingAmount: number | null;
}

export interface InvoiceSummary {
  id: string;
  billingAccountId: string;
  invoiceNumber: string | null;
  totalAmount: number | null;
  totalAmountWithTax: number | null;
  status: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  balance: number | null;
}

export interface BillingSummaryData {
  billingAccounts: BillingAccountSummary[];
  schedules: BillingScheduleSummary[];
  invoices: InvoiceSummary[];
}

export type getBillingSummaryResult =
  | { ok: true; data: BillingSummaryData; meta: { requestId: string; durationMs: number; source: "salesforce" } }
  | { ok: false; error: { code: string; message: string; retryable: boolean }; meta: { requestId: string; durationMs: number; source: "salesforce" } };

export const getBillingSummaryTool = {
  name: "get_billing_summary",
  title: "Get Billing Summary",
  description: "Returns billing account(s), billing schedules, and invoices for a given account. Read-only.",
  kind: "read" as const,
  inputSchema: {
    type: "object",
    properties: {
      accountId: { type: "string", description: "The Salesforce Account Id to summarize billing for." },
    },
    required: ["accountId"],
  },
};

export async function getBillingSummaryHandler(conn: Connection, input: { accountId: string }): Promise<getBillingSummaryResult> {
  try {
    const account = await conn.query<any>(`SELECT Id, Name FROM Account WHERE Id = '${escapeSoql(input.accountId)}'`);
    const accountRow = account.records[0];
    if (!accountRow) return { ok: false, error: { code: "NOT_FOUND", message: "Account not found", retryable: false }, meta: meta() };
    const schedules = await conn.query<any>(`SELECT Id, BillingAccountId, TotalAmount, Quantity, UnitPrice, NextBillingDate, BillingScheduleStartDate, BillingScheduleEndDate, Status, BilledAmount, PendingAmount FROM BillingSchedule WHERE BillingAccountId = '${escapeSoql(input.accountId)}'`);
    const invoices = await conn.query<any>(`SELECT Id, BillingAccountId, InvoiceNumber, TotalAmount, TotalAmountWithTax, Status, InvoiceDate, DueDate, Balance FROM Invoice WHERE BillingAccountId = '${escapeSoql(input.accountId)}'`);

    const data: BillingSummaryData = {
      billingAccounts: [{ id: accountRow.Id, name: accountRow.Name, accountId: accountRow.Id, isDefaultBillingProfile: true, taxExemptionStatus: null }],
      schedules: schedules.records.map((r: any) => ({
        id: r.Id as string,
        billingAccountId: r.BillingAccountId as string,
        totalAmount: r.TotalAmount ?? null,
        quantity: r.Quantity ?? null,
        unitPrice: r.UnitPrice ?? null,
        nextBillingDate: r.NextBillingDate ?? null,
        billingScheduleStartDate: r.BillingScheduleStartDate ?? null,
        billingScheduleEndDate: r.BillingScheduleEndDate ?? null,
        status: r.Status ?? null,
        billedAmount: r.BilledAmount ?? null,
        pendingAmount: r.PendingAmount ?? null,
      })),
      invoices: invoices.records.map((r: any) => ({
        id: r.Id as string,
        billingAccountId: r.BillingAccountId as string,
        invoiceNumber: r.InvoiceNumber ?? null,
        totalAmount: r.TotalAmount ?? null,
        totalAmountWithTax: r.TotalAmountWithTax ?? null,
        status: r.Status ?? null,
        invoiceDate: r.InvoiceDate ?? null,
        dueDate: r.DueDate ?? null,
        balance: r.Balance ?? null,
      })),
    };

    return { ok: true, data, meta: meta() };
  } catch (err) {
    return { ok: false, error: { code: "SALESFORCE_ERROR", message: String(err), retryable: true }, meta: meta() };
  }
}
