import {
  AccountIdInputSchema,
  AddQuoteLineInputSchema,
  ApplyDiscountInputSchema,
  CreateAmendmentQuoteInputSchema,
  CreateInitialQuoteInputSchema,
  CreateRenewalQuoteInputSchema,
  FindAccountInputSchema,
  ProductSearchInputSchema,
  QuoteIdInputSchema,
  RemoveQuoteLineInputSchema,
  UpdateQuoteLineInputSchema,
  CreateProductInputSchema,
  UpdateProductInputSchema,
  SetProductPriceInputSchema,
  BundleIdInputSchema,
  AddBundleComponentInputSchema,
  RemoveBundleComponentInputSchema,
  UpdateBundleComponentInputSchema,
} from "@consultantcloud/shared";
import { protectedMutationActions } from "@consultantcloud/policy";
import type { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { generatedToolDefinitions } from "./tools/generated/registry";

export type ToolKind = "read" | "write";

type ToolDefinition = {
  title: string;
  description: string;
  kind: ToolKind;
  input: z.AnyZodObject;
  successShape: string;
};

export const toolDefinitions = {
  find_account: { title: "Find Account", description: "Looks up an account by name (case-insensitive partial match). Use this first, before any tool that takes an accountId, to resolve a customer's name to their account record. This tool is read-only and never modifies any data. No confirmation is required to call it. It never invents an account: if no fixture account matches, it returns an empty list rather than guessing or fabricating a plausible-looking account.", kind: "read", input: FindAccountInputSchema, successShape: "Array of account summaries (id, name, industry, existingDiscountPercent)." },
  get_account_revenue_context: { title: "Get Account Revenue Context", description: "Returns an account summary, including its existing discount when available, together with its existing assets (quantities, product names, and status). It does not return contract terms such as term length; those require a specific quote. Use this after you have resolved an accountId via find_account. This tool is read-only and never modifies any data. No confirmation is required to call it. If the account has no recorded assets, it returns an empty list.", kind: "read", input: AccountIdInputSchema, successShape: "An account summary and its array of account assets." },
  search_products: { title: "Search Products", description: "Searches the product catalog by name or keyword (case-insensitive partial match). Use this to discover which products are available before building a quote or comparing options. This tool is read-only and never modifies any data. No confirmation is required to call it. It never invents a product: if no catalog entry matches, it returns an empty list rather than guessing or fabricating a plausible-looking product.", kind: "read", input: ProductSearchInputSchema, successShape: "Array of product summaries (id, name, listPrice)." },
  get_account_assets: { title: "Get Account Assets", description: "Returns the list of assets currently held by an account. Use this when you need the specific asset records for an account you have already resolved via find_account. This tool is read-only and never modifies any data. No confirmation is required to call it. It never invents an asset: if the account has no recorded assets, it returns an empty list rather than guessing or fabricating plausible-looking holdings.", kind: "read", input: AccountIdInputSchema, successShape: "Array of account assets with product, quantity, status, and quote references." },
  get_quote_summary: { title: "Get Quote Summary", description: "Returns a summary of an existing quote by either its internal quoteId or human-readable quoteNumber. Use this to review the line items, totals, and status of a quote before presenting it to a customer. This tool is read-only and never modifies any data. No confirmation is required to call it. It never invents a quote: if no matching quote exists, it returns an error rather than guessing or fabricating a plausible-looking quote.", kind: "read", input: QuoteIdInputSchema, successShape: "Quote identity, account, status, term, and line summaries." },
  create_initial_quote: { title: "Create Initial Quote", description: "Creates a new quote for an account with no existing quote. This mutates Salesforce (or the mock) state, requires explicit user confirmation, and is idempotent by idempotencyKey.", kind: "write", input: CreateInitialQuoteInputSchema, successShape: "Created quote id, number, and status." },
  create_renewal_quote: { title: "Create Renewal Quote", description: "Creates a renewal quote for an account with existing assets. This mutates Salesforce (or the mock) state, requires explicit user confirmation, and is idempotent by idempotencyKey.", kind: "write", input: CreateRenewalQuoteInputSchema, successShape: "Created renewal quote id, number, and status." },
  create_amendment_quote: { title: "Create Amendment Quote", description: "Creates an amendment quote from an existing active quote. This mutates Salesforce (or the mock) state, requires explicit user confirmation, and is idempotent by idempotencyKey.", kind: "write", input: CreateAmendmentQuoteInputSchema, successShape: "Created amendment quote id, number, and status." },
  add_quote_line: { title: "Add Quote Line", description: "Adds a product line to an existing quote. This mutates Salesforce (or the mock) state and is idempotent by idempotencyKey.", kind: "write", input: AddQuoteLineInputSchema, successShape: "Created quote-line id, quote id, product id, and quantity." },
  remove_quote_line: { title: "Remove Quote Line", description: "Removes a line item from an existing quote. This mutates Salesforce (or the mock) state, requires explicit user confirmation, and is idempotent by idempotencyKey.", kind: "write", input: RemoveQuoteLineInputSchema, successShape: "Removed quote-line id and removed=true." },
  update_quote_line: { title: "Update Quote Line", description: "Updates the quantity of an existing quote line. This mutates Salesforce (or the mock) state, requires explicit user confirmation, and is idempotent by idempotencyKey.", kind: "write", input: UpdateQuoteLineInputSchema, successShape: "Updated quote-line id and quantity." },
  apply_discount: { title: "Apply Discount", description: "Applies a policy-controlled discount to a quote line. Confirmation depends on the discount policy decision and the call is idempotent by idempotencyKey.", kind: "write", input: ApplyDiscountInputSchema, successShape: "Quote-line id and applied discount percent." },
  create_product: { title: "Create Product", description: "Creates a new Product2 record in the Salesforce catalog. Architect-mode only. This mutates Salesforce (or the mock) state, requires explicit user confirmation, and is idempotent by idempotencyKey.", kind: "write", input: CreateProductInputSchema, successShape: "Created product id and name." },
  update_product: { title: "Update Product", description: "Updates fields on an existing Product2 record. Architect-mode only. This mutates Salesforce (or the mock) state, requires explicit user confirmation, and is idempotent by idempotencyKey.", kind: "write", input: UpdateProductInputSchema, successShape: "Updated product id and name." },
  set_product_price: { title: "Set Product Price", description: "Creates or updates a Standard Price Book entry for a product. Architect-mode only. This mutates Salesforce (or the mock) state, requires explicit user confirmation, and is idempotent by idempotencyKey.", kind: "write", input: SetProductPriceInputSchema, successShape: "Pricebook entry id, product id, and unit price." },
  get_bundle_structure: { title: "Get Bundle Structure", description: "Returns the real component records (child products, quantities, min/max, required/default flags) for a bundle product. Architect-mode only. This tool is read-only and never modifies any data. No confirmation is required to call it.", kind: "read", input: BundleIdInputSchema, successShape: "Bundle product id and its array of component records." },
  add_bundle_component: { title: "Add Bundle Component", description: "Adds a child product as a component of a bundle product. Architect-mode only. This mutates Salesforce (or the mock) state, requires explicit user confirmation, and is idempotent by idempotencyKey.", kind: "write", input: AddBundleComponentInputSchema, successShape: "Created component id, parent product id, and child product id." },
  remove_bundle_component: { title: "Remove Bundle Component", description: "Removes a component record from a bundle. Architect-mode only. This mutates Salesforce (or the mock) state, requires explicit user confirmation, and is idempotent by idempotencyKey.", kind: "write", input: RemoveBundleComponentInputSchema, successShape: "Removed component id and removed=true." },
  update_bundle_component: { title: "Update Bundle Component", description: "Updates quantity, min/max, required, or grouping fields on an existing bundle component record. Architect-mode only. This mutates Salesforce (or the mock) state, requires explicit user confirmation, and is idempotent by idempotencyKey.", kind: "write", input: UpdateBundleComponentInputSchema, successShape: "Updated component id, parent product id, and child product id." },
  ...generatedToolDefinitions,
} as const satisfies Record<string, ToolDefinition>;

export type ToolName = keyof typeof toolDefinitions;

export const catalogToolNames = [
  "create_product",
  "update_product",
  "set_product_price",
  "get_bundle_structure",
  "add_bundle_component",
  "remove_bundle_component",
  "update_bundle_component",
] as const satisfies readonly ToolName[];

export const catalogTools = new Set<ToolName>(catalogToolNames);

export function toolRegistration<N extends ToolName>(name: N): {
  title: string;
  description: string;
  inputSchema: (typeof toolDefinitions)[N]["input"]["shape"];
} {
  const definition = toolDefinitions[name];
  return { title: definition.title, description: definition.description, inputSchema: definition.input.shape } as {
    title: string;
    description: string;
    inputSchema: (typeof toolDefinitions)[N]["input"]["shape"];
  };
}

export const toolCatalog = (Object.entries(toolDefinitions) as Array<[ToolName, ToolDefinition]>).map(([name, definition]) => ({
  name,
  title: definition.title,
  description: definition.description,
  kind: definition.kind,
  confirmationRequired: protectedMutationActions.includes(name as never),
  inputSchema: zodToJsonSchema(definition.input, { target: "openApi3", $refStrategy: "none" }) as Record<string, unknown>,
  successShape: definition.successShape,
}));
