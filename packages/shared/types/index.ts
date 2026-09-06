import { z } from "zod";
import {
  ToolResultSchema,
  FindAccountInputSchema,
  AccountSummarySchema,
  FindAccountOutputSchema,
  AccountIdInputSchema,
  AccountAssetSchema,
  AccountAssetsOutputSchema,
  ProductSearchInputSchema,
  ProductSummarySchema,
  ProductSearchOutputSchema,
  QuoteIdInputSchema,
  QuoteLineSummarySchema,
  QuoteSummarySchema,
  CreateInitialQuoteInputSchema,
  CreateRenewalQuoteInputSchema,
  QuoteResultSchema,
  AddQuoteLineInputSchema,
  QuoteLineResultSchema,
  ApplyDiscountInputSchema,
  DiscountResultSchema,
} from "../schemas/index";

export type ToolResult<T> = z.infer<ReturnType<typeof ToolResultSchema<z.ZodType<T>>>>;

export type FindAccountInput = z.infer<typeof FindAccountInputSchema>;
export type AccountSummary = z.infer<typeof AccountSummarySchema>;
export type FindAccountOutput = z.infer<typeof FindAccountOutputSchema>;
export type AccountIdInput = z.infer<typeof AccountIdInputSchema>;
export type AccountAsset = z.infer<typeof AccountAssetSchema>;
export type AccountAssetsOutput = z.infer<typeof AccountAssetsOutputSchema>;
export type ProductSearchInput = z.infer<typeof ProductSearchInputSchema>;
export type ProductSummary = z.infer<typeof ProductSummarySchema>;
export type ProductSearchOutput = z.infer<typeof ProductSearchOutputSchema>;
export type QuoteIdInput = z.infer<typeof QuoteIdInputSchema>;
export type QuoteLineSummary = z.infer<typeof QuoteLineSummarySchema>;
export type QuoteSummary = z.infer<typeof QuoteSummarySchema>;
export type CreateInitialQuoteInput = z.infer<typeof CreateInitialQuoteInputSchema>;
export type CreateRenewalQuoteInput = z.infer<typeof CreateRenewalQuoteInputSchema>;
export type QuoteResult = z.infer<typeof QuoteResultSchema>;
export type AddQuoteLineInput = z.infer<typeof AddQuoteLineInputSchema>;
export type QuoteLineResult = z.infer<typeof QuoteLineResultSchema>;
export type ApplyDiscountInput = z.infer<typeof ApplyDiscountInputSchema>;
export type DiscountResult = z.infer<typeof DiscountResultSchema>;

export interface RevenueGateway {
  findAccount(input: FindAccountInput): Promise<ToolResult<AccountSummary[]>>;
  getAccountAssets(input: AccountIdInput): Promise<ToolResult<AccountAsset[]>>;
  searchProducts(input: ProductSearchInput): Promise<ToolResult<ProductSummary[]>>;
  createInitialQuote(input: CreateInitialQuoteInput): Promise<ToolResult<QuoteResult>>;
  createRenewalQuote(input: CreateRenewalQuoteInput): Promise<ToolResult<QuoteResult>>;
  addQuoteLine(input: AddQuoteLineInput): Promise<ToolResult<QuoteLineResult>>;
  applyDiscount(input: ApplyDiscountInput): Promise<ToolResult<DiscountResult>>;
  getQuoteSummary(input: QuoteIdInput): Promise<ToolResult<QuoteSummary>>;
}
