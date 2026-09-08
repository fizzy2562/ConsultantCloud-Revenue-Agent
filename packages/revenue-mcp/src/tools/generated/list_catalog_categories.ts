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

export interface CatalogCategory {
  id: string;
  name: string;
  catalogId: string | null;
  parentCategoryId: string | null;
  description: string | null;
  sortOrder: number | null;
  isNavigational: boolean;
  code: string | null;
}

export interface listCatalogCategoriesMeta {
  requestId: string;
  durationMs: number;
  source: "salesforce";
}

export interface listCatalogCategoriesSuccess {
  ok: true;
  data: {
    categories: CatalogCategory[];
    truncated: boolean;
  };
  meta: listCatalogCategoriesMeta;
}

export interface listCatalogCategoriesFailure {
  ok: false;
  error: { code: string; message: string; retryable: boolean };
  meta: listCatalogCategoriesMeta;
}

export type listCatalogCategoriesResult = listCatalogCategoriesSuccess | listCatalogCategoriesFailure;

export const listCatalogCategoriesTool = {
  name: "list_catalog_categories",
  title: "List Catalog Categories",
  description: "Lists the product category hierarchy (ProductCategory), optionally filtered by catalogId or by the categories a given product belongs to. Read-only.",
  kind: "read" as const,
  inputSchema: {
    type: "object",
    properties: {
      catalogId: { type: "string", description: "Optional catalog id to scope the category hierarchy to a single catalog." },
      productId: { type: "string", description: "Optional product id; when given, returns only the categories that product belongs to (via ProductCategoryProduct)." },
    },
    required: [],
  },
};

function mapCategory(r: any): CatalogCategory {
  return {
    id: r.Id,
    name: r.Name,
    catalogId: r.CatalogId ?? null,
    parentCategoryId: r.ParentCategoryId ?? null,
    description: r.Description ?? null,
    sortOrder: r.SortOrder ?? null,
    isNavigational: r.IsNavigational ?? false,
    code: r.Code ?? null,
  };
}

export async function listCatalogCategoriesHandler(
  conn: Connection,
  input: { catalogId?: string; productId?: string }
): Promise<listCatalogCategoriesResult> {
  try {
    let soql: string;

    if (input.productId) {
      const junction = await conn.query<any>(
        `SELECT ProductCategoryId FROM ProductCategoryProduct WHERE ProductId = '${escapeSoql(input.productId)}'`
      );
      const categoryIds = junction.records.map((r: any) => r.ProductCategoryId).filter((v: unknown): v is string => typeof v === "string" && v.length > 0);
      if (categoryIds.length === 0) {
        return { ok: true, data: { categories: [], truncated: false }, meta: meta() };
      }
      const idList = categoryIds.map((id) => `'${escapeSoql(id)}'`).join(", ");
      const catalogClause = input.catalogId ? ` AND CatalogId = '${escapeSoql(input.catalogId)}'` : "";
      soql = `SELECT Id, Name, CatalogId, ParentCategoryId, Description, SortOrder, IsNavigational, Code FROM ProductCategory WHERE Id IN (${idList})${catalogClause} ORDER BY SortOrder ASC NULLS LAST`;
    } else if (input.catalogId) {
      soql = `SELECT Id, Name, CatalogId, ParentCategoryId, Description, SortOrder, IsNavigational, Code FROM ProductCategory WHERE CatalogId = '${escapeSoql(input.catalogId)}' ORDER BY SortOrder ASC NULLS LAST`;
    } else {
      soql = `SELECT Id, Name, CatalogId, ParentCategoryId, Description, SortOrder, IsNavigational, Code FROM ProductCategory ORDER BY SortOrder ASC NULLS LAST LIMIT 26`;
    }

    const records = await conn.query<any>(soql);
    const rows = records.records ?? [];
    return { ok: true, data: { categories: rows.slice(0, 25).map((r: any) => mapCategory(r)), truncated: rows.length > 25 }, meta: meta() };
  } catch (err) {
    return { ok: false, error: { code: "SALESFORCE_ERROR", message: String(err), retryable: true }, meta: meta() };
  }
}
