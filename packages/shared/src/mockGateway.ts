import {
  RevenueGateway,
  FindAccountInput,
  AccountSummary,
  AccountIdInput,
  AccountAsset,
  ProductSearchInput,
  ProductSummary,
  CreateInitialQuoteInput,
  CreateRenewalQuoteInput,
  QuoteResult,
  AddQuoteLineInput,
  QuoteLineResult,
  ApplyDiscountInput,
  DiscountResult,
  QuoteIdInput,
  QuoteSummary,
  ToolResult,
} from "../types/index";
import { accounts, products, accountAssets, ACME_UNIVERSITY_ID } from "./mockData";

type StoredQuoteLine = {
  quoteLineId: string;
  productId: string;
  productName: string;
  quantity: number;
  discountPercent: number;
  netPrice: number;
};

type StoredQuote = {
  quoteId: string;
  quoteNumber: string;
  accountId: string;
  status: string;
  termMonths: number;
  lines: StoredQuoteLine[];
};

export class MockRevenueGateway implements RevenueGateway {
  private quotes = new Map<string, StoredQuote>();
  private idempotencyResults = new Map<string, ToolResult<QuoteResult>>();
  private quoteCounter = 1;
  private lineCounter = 1;

  constructor() {
    // Acme University is fixture data for an existing customer (see existingDiscountPercent
    // in mockData.ts) — seed the active quote/line their existing asset actually lives on,
    // so discount flows have a real quoteId/quoteLineId to act on instead of nothing at all.
    this.quotes.set("a0Q000000000001AAA", {
      quoteId: "a0Q000000000001AAA",
      quoteNumber: "Q-10000",
      accountId: ACME_UNIVERSITY_ID,
      status: "Active",
      termMonths: 36,
      lines: [
        {
          quoteLineId: "a0L000000000001AAA",
          productId: "01t000000000002AAA",
          productName: "Cloud Pro",
          quantity: 100,
          discountPercent: 12,
          netPrice: 100 * 2400 * (1 - 0.12),
        },
      ],
    });
  }

  private meta(): ToolResult<never>["meta"] {
    return { requestId: crypto.randomUUID(), durationMs: 0, source: "mock" };
  }

  private findQuoteLineForProduct(accountId: string, productName: string | null): { quoteId: string; quoteLineId: string } | null {
    for (const quote of this.quotes.values()) {
      if (quote.accountId !== accountId) continue;
      const line = quote.lines.find((l) => l.productName === productName);
      if (line) return { quoteId: quote.quoteId, quoteLineId: line.quoteLineId };
    }
    return null;
  }

  async findAccount(input: FindAccountInput): Promise<ToolResult<AccountSummary[]>> {
    const needle = input.name.toLowerCase();
    const matches = accounts.filter((a) => a.name.toLowerCase().includes(needle));
    return { ok: true, data: matches, meta: this.meta() };
  }

  async getAccountById(input: AccountIdInput): Promise<ToolResult<AccountSummary>> {
    const account = accounts.find((candidate) => candidate.id === input.accountId);
    if (!account) {
      return {
        ok: false,
        error: { code: "NOT_FOUND", message: "Account not found", retryable: false },
        meta: this.meta(),
      };
    }
    return { ok: true, data: account, meta: this.meta() };
  }

  async getAccountAssets(input: AccountIdInput): Promise<ToolResult<AccountAsset[]>> {
    const assets = accountAssets[input.accountId] ?? [];
    const data: AccountAsset[] = assets.map((asset) => {
      const linked = this.findQuoteLineForProduct(input.accountId, asset.productName);
      return { ...asset, quoteId: linked?.quoteId ?? null, quoteLineId: linked?.quoteLineId ?? null };
    });
    return { ok: true, data, meta: this.meta() };
  }

  async searchProducts(input: ProductSearchInput): Promise<ToolResult<ProductSummary[]>> {
    if (input.query === "") {
      return { ok: true, data: products, meta: this.meta() };
    }
    const needle = input.query.toLowerCase();
    const matches = products.filter((p) => p.name.toLowerCase().includes(needle));
    return { ok: true, data: matches, meta: this.meta() };
  }

  async createInitialQuote(input: CreateInitialQuoteInput): Promise<ToolResult<QuoteResult>> {
    const existing = this.idempotencyResults.get(input.idempotencyKey);
    if (existing) {
      return existing;
    }
    const quoteId = `a0Q${crypto.randomUUID()}`;
    const quoteNumber = `Q-${10000 + this.quoteCounter}`;
    this.quoteCounter += 1;
    const quote: StoredQuote = {
      quoteId,
      quoteNumber,
      accountId: input.accountId,
      status: "Draft",
      termMonths: input.termMonths,
      lines: [],
    };
    this.quotes.set(quoteId, quote);
    const result: ToolResult<QuoteResult> = {
      ok: true,
      data: { quoteId, quoteNumber, status: "Draft" },
      meta: this.meta(),
    };
    this.idempotencyResults.set(input.idempotencyKey, result);
    return result;
  }

  async createRenewalQuote(input: CreateRenewalQuoteInput): Promise<ToolResult<QuoteResult>> {
    const existing = this.idempotencyResults.get(input.idempotencyKey);
    if (existing) {
      return existing;
    }
    const quoteId = `a0Q${crypto.randomUUID()}`;
    const quoteNumber = `Q-${10000 + this.quoteCounter}`;
    this.quoteCounter += 1;
    const quote: StoredQuote = {
      quoteId,
      quoteNumber,
      accountId: input.accountId,
      status: "Draft",
      termMonths: input.termMonths,
      lines: [],
    };
    this.quotes.set(quoteId, quote);
    const result: ToolResult<QuoteResult> = {
      ok: true,
      data: { quoteId, quoteNumber, status: "Draft" },
      meta: this.meta(),
    };
    this.idempotencyResults.set(input.idempotencyKey, result);
    return result;
  }

  async addQuoteLine(input: AddQuoteLineInput): Promise<ToolResult<QuoteLineResult>> {
    const quote = this.quotes.get(input.quoteId);
    if (!quote) {
      return {
        ok: false,
        error: { code: "NOT_FOUND", message: "Quote not found", retryable: false },
        meta: this.meta(),
      };
    }
    const product = products.find((p) => p.id === input.productId);
    if (!product) {
      return {
        ok: false,
        error: { code: "NOT_FOUND", message: "Product not found", retryable: false },
        meta: this.meta(),
      };
    }
    // listPrice is only nullable for the real Salesforce gateway (missing price-book entry);
    // every fixture product here always has one.
    const netPrice = input.quantity * (product.listPrice as number);
    const quoteLineId = `a0L${crypto.randomUUID()}`;
    this.lineCounter += 1;
    const line: StoredQuoteLine = {
      quoteLineId,
      productId: input.productId,
      productName: product.name,
      quantity: input.quantity,
      discountPercent: 0,
      netPrice,
    };
    quote.lines.push(line);
    return {
      ok: true,
      data: {
        quoteLineId,
        quoteId: input.quoteId,
        productId: input.productId,
        quantity: input.quantity,
      },
      meta: this.meta(),
    };
  }

  async applyDiscount(input: ApplyDiscountInput): Promise<ToolResult<DiscountResult>> {
    const quote = this.quotes.get(input.quoteId);
    if (!quote) {
      return {
        ok: false,
        error: { code: "NOT_FOUND", message: "Quote not found", retryable: false },
        meta: this.meta(),
      };
    }
    const line = quote.lines.find((l) => l.quoteLineId === input.quoteLineId);
    if (!line) {
      return {
        ok: false,
        error: { code: "NOT_FOUND", message: "Quote line not found", retryable: false },
        meta: this.meta(),
      };
    }
    const product = products.find((p) => p.name === line.productName);
    // listPrice is only nullable for the real Salesforce gateway; every fixture product here always has one.
    const listPrice = product ? (product.listPrice as number) : 0;
    line.discountPercent = input.discountPercent;
    line.netPrice = line.quantity * listPrice * (1 - input.discountPercent / 100);
    return {
      ok: true,
      data: { quoteLineId: input.quoteLineId, appliedDiscountPercent: input.discountPercent },
      meta: this.meta(),
    };
  }

  async getQuoteSummary(input: QuoteIdInput): Promise<ToolResult<QuoteSummary>> {
    if (!input.quoteId && !input.quoteNumber) {
      return {
        ok: false,
        error: { code: "INVALID_INPUT", message: "quoteId or quoteNumber is required", retryable: false },
        meta: this.meta(),
      };
    }
    const quote = input.quoteId
      ? this.quotes.get(input.quoteId)
      : Array.from(this.quotes.values()).find((candidate) => candidate.quoteNumber === input.quoteNumber);
    if (!quote) {
      return {
        ok: false,
        error: { code: "NOT_FOUND", message: "Quote not found", retryable: false },
        meta: this.meta(),
      };
    }
    return {
      ok: true,
      data: {
        quoteId: quote.quoteId,
        quoteNumber: quote.quoteNumber,
        accountId: quote.accountId,
        status: quote.status,
        termMonths: quote.termMonths,
        lines: quote.lines.map((l) => ({
          productName: l.productName,
          quantity: l.quantity,
          discountPercent: l.discountPercent,
          netPrice: l.netPrice,
        })),
      },
      meta: this.meta(),
    };
  }
}
