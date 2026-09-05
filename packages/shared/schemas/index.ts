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
    name: z.string().min(1),
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
    accountId: z.string().min(1),
  })
  .strict();

export const AccountAssetSchema = z.object({
  id: z.string(),
  productName: z.string().nullable(),
  quantity: z.number().nullable(),
  status: z.string().nullable(),
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
  listPrice: z.number().nullable(),
});

export const ProductSearchOutputSchema = z.array(ProductSummarySchema);

export const QuoteIdInputSchema = z
  .object({
    quoteId: z.string().min(1),
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
  termMonths: z.number().int().positive().nullable(),
  lines: z.array(QuoteLineSummarySchema),
});

export const CreateInitialQuoteInputSchema = z
  .object({
    accountId: z.string().min(1),
    termMonths: z.number().int().positive(),
    idempotencyKey: z.string().min(1),
    confirmedByUser: z.boolean(),
  })
  .strict();

export const CreateRenewalQuoteInputSchema = z
  .object({
    accountId: z.string().min(1),
    termMonths: z.number().int().positive(),
    effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "effectiveDate must be YYYY-MM-DD"),
    idempotencyKey: z.string().min(1),
    confirmedByUser: z.boolean(),
  })
  .strict();

export const QuoteResultSchema = z.object({
  quoteId: z.string().min(1),
  quoteNumber: z.string().min(1),
  status: z.string(),
});

export const AddQuoteLineInputSchema = z
  .object({
    quoteId: z.string().min(1),
    productId: z.string().min(1),
    quantity: z.number().int().positive(),
    idempotencyKey: z.string().min(1),
    confirmedByUser: z.boolean(),
  })
  .strict();

export const QuoteLineResultSchema = z.object({
  quoteLineId: z.string().min(1),
  quoteId: z.string(),
  productId: z.string(),
  quantity: z.number(),
});

export const ApplyDiscountInputSchema = z
  .object({
    quoteId: z.string().min(1),
    quoteLineId: z.string().min(1),
    discountPercent: z.number().min(0).max(100),
    idempotencyKey: z.string().min(1),
    confirmedByUser: z.boolean(),
  })
  .strict();

export const DiscountResultSchema = z.object({
  quoteLineId: z.string(),
  appliedDiscountPercent: z.number().min(0).max(100),
});
