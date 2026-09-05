import { z } from "zod";

export function ToolResultSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    ok: z.boolean(),
    data: dataSchema.optional(),
    error: z
      .object({
        code: z.string(),
        message: z.string(),
        retryable: z.boolean(),
      })
      .optional(),
    meta: z.object({
      requestId: z.string(),
      durationMs: z.number(),
      source: z.enum(["salesforce", "policy", "mock"]),
    }),
  });
}

export const FindAccountInputSchema = z
  .object({
    name: z.string(),
  })
  .strict();

export const AccountSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  industry: z.string(),
  existingDiscountPercent: z.number().min(0).max(100).nullable(),
});

export const FindAccountOutputSchema = z.array(AccountSummarySchema);

export const AccountIdInputSchema = z
  .object({
    accountId: z.string(),
  })
  .strict();

export const AccountAssetSchema = z.object({
  id: z.string(),
  productName: z.string(),
  quantity: z.number(),
  status: z.string(),
});

export const AccountAssetsOutputSchema = z.array(AccountAssetSchema);

export const ProductSearchInputSchema = z
  .object({
    query: z.string(),
  })
  .strict();

export const ProductSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  listPrice: z.number(),
});

export const ProductSearchOutputSchema = z.array(ProductSummarySchema);

export const QuoteIdInputSchema = z
  .object({
    quoteId: z.string(),
  })
  .strict();

export const QuoteLineSummarySchema = z.object({
  productName: z.string(),
  quantity: z.number(),
  discountPercent: z.number().min(0).max(100),
  netPrice: z.number(),
});

export const QuoteSummarySchema = z.object({
  quoteId: z.string(),
  quoteNumber: z.string(),
  accountId: z.string(),
  status: z.string(),
  termMonths: z.number().int().positive(),
  lines: z.array(QuoteLineSummarySchema),
});

export const CreateInitialQuoteInputSchema = z
  .object({
    accountId: z.string(),
    termMonths: z.number().int().positive(),
    idempotencyKey: z.string().min(1),
    confirmedByUser: z.boolean(),
  })
  .strict();

export const CreateRenewalQuoteInputSchema = z
  .object({
    accountId: z.string(),
    termMonths: z.number().int().positive(),
    effectiveDate: z.string(),
    idempotencyKey: z.string().min(1),
    confirmedByUser: z.boolean(),
  })
  .strict();

export const QuoteResultSchema = z.object({
  quoteId: z.string(),
  quoteNumber: z.string(),
  status: z.string(),
});

export const AddQuoteLineInputSchema = z
  .object({
    quoteId: z.string(),
    productId: z.string(),
    quantity: z.number(),
    idempotencyKey: z.string().min(1),
    confirmedByUser: z.boolean(),
  })
  .strict();

export const QuoteLineResultSchema = z.object({
  quoteLineId: z.string(),
  quoteId: z.string(),
  productId: z.string(),
  quantity: z.number(),
});

export const ApplyDiscountInputSchema = z
  .object({
    quoteId: z.string(),
    quoteLineId: z.string(),
    discountPercent: z.number().min(0).max(100),
    idempotencyKey: z.string().min(1),
    confirmedByUser: z.boolean(),
  })
  .strict();

export const DiscountResultSchema = z.object({
  quoteLineId: z.string(),
  appliedDiscountPercent: z.number().min(0).max(100),
});
