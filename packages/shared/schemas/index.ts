import { z } from "zod";

export function ToolResultSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.discriminatedUnion("ok", [
    z.object({ ok: z.literal(true), data: dataSchema, meta: ToolResultMetaSchema }),
    z.object({ ok: z.literal(false), error: ToolResultErrorSchema, meta: ToolResultMetaSchema }),
  ]);
}

export const ToolResultErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  retryable: z.boolean(),
});

export const ToolResultMetaSchema = z.object({
  requestId: z.string(),
  durationMs: z.number(),
  source: z.enum(["salesforce", "policy", "mock"]),
});

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
  quoteId: z.string().nullable(),
  quoteLineId: z.string().nullable(),
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
  productCode: z.string().nullable().optional(),
  family: z.string().nullable().optional(),
  type: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

export const ProductSearchOutputSchema = z.array(ProductSummarySchema);

export const QuoteIdInputSchema = z
  .object({
    quoteId: z.string().min(1).optional(),
    quoteNumber: z.string().min(1).optional(),
  })
  .strict();

export const QuoteLineSummarySchema = z.object({
  productName: z.string().nullable(),
  quantity: z.number().nullable(),
  discountPercent: z.number().min(0).max(100).nullable(),
  netPrice: z.number().nullable(),
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

export const CreateAmendmentQuoteInputSchema = z
  .object({
    accountId: z.string().min(1),
    sourceQuoteId: z.string().min(1),
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

export const RemoveQuoteLineInputSchema = z
  .object({
    quoteLineId: z.string().min(1),
    idempotencyKey: z.string().min(1),
    confirmedByUser: z.boolean(),
  })
  .strict();

export const RemoveQuoteLineResultSchema = z.object({
  quoteLineId: z.string().min(1),
  removed: z.literal(true),
});

export const UpdateQuoteLineInputSchema = z
  .object({
    quoteLineId: z.string().min(1),
    quantity: z.number().int().positive(),
    idempotencyKey: z.string().min(1),
    confirmedByUser: z.boolean(),
  })
  .strict();

export const UpdateQuoteLineResultSchema = z.object({
  quoteLineId: z.string().min(1),
  quantity: z.number(),
});

export const ApplyDiscountInputSchema = z
  .object({
    quoteId: z.string().min(1),
    quoteLineId: z.string().min(1),
    discountPercent: z.number().min(0).max(100),
    idempotencyKey: z.string().min(1),
    confirmedByUser: z.boolean(),
    approvedBy: z.string().min(1).optional(),
  })
  .strict();

export const DiscountResultSchema = z.object({
  quoteLineId: z.string(),
  appliedDiscountPercent: z.number().min(0).max(100),
});

const ProductFieldsSchema = z.object({
  name: z.string().min(1).optional(), productCode: z.string().optional(), description: z.string().optional(),
  isActive: z.boolean().optional(), family: z.string().optional(), type: z.string().nullable().optional(),
  isSoldOnlyWithOtherProds: z.boolean().optional(), quantityUnitOfMeasure: z.string().optional(), stockKeepingUnit: z.string().optional(),
});
const MutationControlSchema = { idempotencyKey: z.string().min(1), confirmedByUser: z.boolean() };
export const CreateProductInputSchema = ProductFieldsSchema.extend({ name: z.string().min(1), ...MutationControlSchema }).strict();
export const UpdateProductInputSchema = ProductFieldsSchema.extend({ productId: z.string().min(1), ...MutationControlSchema }).strict();
export const ProductResultSchema = z.object({ productId: z.string().min(1), name: z.string().min(1) });
export const SetProductPriceInputSchema = z.object({ productId: z.string().min(1), unitPrice: z.number().nonnegative(), isActive: z.boolean().optional(), ...MutationControlSchema }).strict();
export const ProductPriceResultSchema = z.object({ pricebookEntryId: z.string().min(1), productId: z.string().min(1), unitPrice: z.number() });
export const BundleIdInputSchema = z.object({ productId: z.string().min(1) }).strict();
export const BundleComponentSchema = z.object({ componentId: z.string(), parentProductId: z.string(), childProductId: z.string(), childName: z.string(), childProductCode: z.string().nullable(), quantity: z.number().nullable(), minQuantity: z.number().nullable(), maxQuantity: z.number().nullable(), isComponentRequired: z.boolean(), isDefaultComponent: z.boolean(), sequence: z.number().int().nullable(), productComponentGroupId: z.string().nullable() });
export const BundleStructureSchema = z.object({ productId: z.string(), components: z.array(BundleComponentSchema) });
export const AddBundleComponentInputSchema = z.object({ parentProductId: z.string().min(1), childProductId: z.string().min(1), quantity: z.number().nonnegative().optional(), minQuantity: z.number().nonnegative().optional(), maxQuantity: z.number().nonnegative().optional(), isComponentRequired: z.boolean().optional(), isDefaultComponent: z.boolean().optional(), sequence: z.number().int().nonnegative().optional(), productComponentGroupId: z.string().min(1).optional(), ...MutationControlSchema }).strict();
export const BundleComponentResultSchema = z.object({ componentId: z.string().min(1), parentProductId: z.string().min(1), childProductId: z.string().min(1) });
export const RemoveBundleComponentInputSchema = z.object({ componentId: z.string().min(1), ...MutationControlSchema }).strict();
export const RemoveBundleComponentResultSchema = z.object({ componentId: z.string().min(1), removed: z.literal(true) });
export const UpdateBundleComponentInputSchema = z.object({ componentId: z.string().min(1), quantity: z.number().nonnegative().optional(), minQuantity: z.number().nonnegative().optional(), maxQuantity: z.number().nonnegative().optional(), isComponentRequired: z.boolean().optional(), isDefaultComponent: z.boolean().optional(), sequence: z.number().int().nonnegative().optional(), productComponentGroupId: z.string().min(1).nullable().optional(), ...MutationControlSchema }).strict();
