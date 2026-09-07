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
  CreateAmendmentQuoteInputSchema,
  QuoteResultSchema,
  AddQuoteLineInputSchema,
  QuoteLineResultSchema,
  RemoveQuoteLineInputSchema,
  RemoveQuoteLineResultSchema,
  UpdateQuoteLineInputSchema,
  UpdateQuoteLineResultSchema,
  ApplyDiscountInputSchema,
  DiscountResultSchema,
  CreateProductInputSchema, UpdateProductInputSchema, ProductResultSchema, SetProductPriceInputSchema, ProductPriceResultSchema, BundleIdInputSchema, BundleComponentSchema, BundleStructureSchema, AddBundleComponentInputSchema, BundleComponentResultSchema, RemoveBundleComponentInputSchema, RemoveBundleComponentResultSchema, UpdateBundleComponentInputSchema,
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
export type CreateAmendmentQuoteInput = z.infer<typeof CreateAmendmentQuoteInputSchema>;
export type QuoteResult = z.infer<typeof QuoteResultSchema>;
export type AddQuoteLineInput = z.infer<typeof AddQuoteLineInputSchema>;
export type QuoteLineResult = z.infer<typeof QuoteLineResultSchema>;
export type RemoveQuoteLineInput = z.infer<typeof RemoveQuoteLineInputSchema>;
export type RemoveQuoteLineResult = z.infer<typeof RemoveQuoteLineResultSchema>;
export type UpdateQuoteLineInput = z.infer<typeof UpdateQuoteLineInputSchema>;
export type UpdateQuoteLineResult = z.infer<typeof UpdateQuoteLineResultSchema>;
export type ApplyDiscountInput = z.infer<typeof ApplyDiscountInputSchema>;
export type DiscountResult = z.infer<typeof DiscountResultSchema>;
export type CreateProductInput = z.infer<typeof CreateProductInputSchema>;
export type UpdateProductInput = z.infer<typeof UpdateProductInputSchema>;
export type ProductResult = z.infer<typeof ProductResultSchema>;
export type SetProductPriceInput = z.infer<typeof SetProductPriceInputSchema>;
export type ProductPriceResult = z.infer<typeof ProductPriceResultSchema>;
export type BundleIdInput = z.infer<typeof BundleIdInputSchema>;
export type BundleComponent = z.infer<typeof BundleComponentSchema>;
export type BundleStructure = z.infer<typeof BundleStructureSchema>;
export type AddBundleComponentInput = z.infer<typeof AddBundleComponentInputSchema>;
export type BundleComponentResult = z.infer<typeof BundleComponentResultSchema>;
export type RemoveBundleComponentInput = z.infer<typeof RemoveBundleComponentInputSchema>;
export type RemoveBundleComponentResult = z.infer<typeof RemoveBundleComponentResultSchema>;
export type UpdateBundleComponentInput = z.infer<typeof UpdateBundleComponentInputSchema>;

export interface RevenueGateway {
  findAccount(input: FindAccountInput): Promise<ToolResult<AccountSummary[]>>;
  getAccountById?(input: AccountIdInput): Promise<ToolResult<AccountSummary>>;
  getAccountAssets(input: AccountIdInput): Promise<ToolResult<AccountAsset[]>>;
  searchProducts(input: ProductSearchInput): Promise<ToolResult<ProductSummary[]>>;
  createInitialQuote(input: CreateInitialQuoteInput): Promise<ToolResult<QuoteResult>>;
  createRenewalQuote(input: CreateRenewalQuoteInput): Promise<ToolResult<QuoteResult>>;
  createAmendmentQuote(input: CreateAmendmentQuoteInput): Promise<ToolResult<QuoteResult>>;
  addQuoteLine(input: AddQuoteLineInput): Promise<ToolResult<QuoteLineResult>>;
  removeQuoteLine(input: RemoveQuoteLineInput): Promise<ToolResult<RemoveQuoteLineResult>>;
  updateQuoteLine(input: UpdateQuoteLineInput): Promise<ToolResult<UpdateQuoteLineResult>>;
  applyDiscount(input: ApplyDiscountInput): Promise<ToolResult<DiscountResult>>;
  getQuoteSummary(input: QuoteIdInput): Promise<ToolResult<QuoteSummary>>;
  createProduct?(input: CreateProductInput): Promise<ToolResult<ProductResult>>;
  updateProduct?(input: UpdateProductInput): Promise<ToolResult<ProductResult>>;
  setProductPrice?(input: SetProductPriceInput): Promise<ToolResult<ProductPriceResult>>;
  getBundleStructure?(input: BundleIdInput): Promise<ToolResult<BundleStructure>>;
  addBundleComponent?(input: AddBundleComponentInput): Promise<ToolResult<BundleComponentResult>>;
  removeBundleComponent?(input: RemoveBundleComponentInput): Promise<ToolResult<RemoveBundleComponentResult>>;
  updateBundleComponent?(input: UpdateBundleComponentInput): Promise<ToolResult<BundleComponentResult>>;
}
