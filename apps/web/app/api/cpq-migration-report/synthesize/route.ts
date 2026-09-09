export const runtime = "nodejs";
export const maxDuration = 300;

const TARGET_SCHEMA_GROUNDING = `Verified Revenue Cloud mappings:
- Price Rules, Conditions, Actions -> CalculationProcedure, CalculationProcedureVersion, CalculationProcedureStep. Re-author in the Business Rules Engine.
- Discount Schedules and Tiers -> PriceAdjustmentSchedule and PriceAdjustmentTier.
- Product-scoped Product/Configuration Rules -> ProductConfigurationRule.
- Quote rules and Summary Variables may require ProductConfigurationRule, DecisionTable, or CalculationProcedureStep; there is no direct Summary Variable equivalent.
- Custom Scripts / Quote Calculator Plugins have no object equivalent. Prefer CalculationProcedureStep formulas, otherwise an Apex-backed pricing callout.
- Product2 remains Product2; Options, Features, Attribute Sets, and Configuration Attributes become ProductRelatedComponent bundle structure and ProductAttributeDefinition configuration.
- Twin Fields -> explicit Field Mapping configuration; discover them by matching custom API names and types.`;

type CatalogInspectorResult =
  | { ok: true; data: { products: unknown[]; productOptions: unknown[]; productFeatures: unknown[]; attributeSets: unknown[]; configurationAttributes: unknown[] }; meta: unknown }
  | { ok: false };

export async function POST(request: Request) {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) return Response.json({ error: "Migration report LLM not configured" }, { status: 503 });

  const body = await request.json().catch(() => null) as { raw?: Record<string, unknown> } | null;
  if (!body || typeof body.raw !== "object" || body.raw === null) {
    return Response.json({ error: "Missing inspector data to synthesize" }, { status: 400 });
  }
  const raw = body.raw;

  // Catalog structure is by far the largest inspector result (100+ products, 80+ options) and
  // isn't individually interesting to the report — summarize it to counts + a few samples so the
  // LLM isn't spending its reasoning budget re-reading a full product list. Every other inspector
  // result stays complete; those are the small, high-signal configuration objects the report is
  // actually about.
  const catalogResult = raw.inspect_catalog_structure as CatalogInspectorResult | undefined;
  const promptData = { ...raw };
  if (catalogResult?.ok) {
    const { products, productOptions, productFeatures, attributeSets, configurationAttributes } = catalogResult.data;
    promptData.inspect_catalog_structure = {
      ok: true,
      data: {
        productCount: products.length,
        productOptionCount: productOptions.length,
        productFeatureCount: productFeatures.length,
        attributeSetCount: attributeSets.length,
        configurationAttributeCount: configurationAttributes.length,
        sampleProducts: products.slice(0, 8),
        sampleProductOptions: productOptions.slice(0, 5),
        sampleProductFeatures: productFeatures.slice(0, 5),
      },
      meta: catalogResult.meta,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 290_000);
  try {
    const response = await fetch(process.env.LLM_API_URL ?? "https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.LLM_MODEL ?? "liquid/lfm-2.5-2.6b:free",
        messages: [
          { role: "system", content: `You are a Salesforce CPQ-to-Revenue-Cloud migration architect. Be concise and direct - write the report immediately without extensive internal deliberation. Report only evidence in the inspector data, identify failures and unknowns, and never invent source records. ${TARGET_SCHEMA_GROUNDING}` },
          { role: "user", content: `Create a professional, actionable Markdown report using headings and GFM tables. Include exactly these main sections: Object-by-object inventory with Revenue Cloud mappings; Complexity / risk scoring; Sequencing recommendation. Include counts, concrete findings, migration mechanisms, and prioritize Custom Script and Twin Field risks. Keep it focused - aim for roughly 1200-1800 words total.\n\nSix inspector results (catalog structure is summarized with counts + samples, others are complete):\n${JSON.stringify(promptData, null, 2)}` },
        ],
        stream: false,
        max_tokens: 10000,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      console.error(`CPQ migration report LLM failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
      return Response.json({ error: `Report generation failed: LLM returned HTTP ${response.status}` }, { status: 502 });
    }
    const responseBody = await response.json() as { choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }> };
    const report = responseBody.choices?.[0]?.message?.content;
    if (!report) return Response.json({ error: "Report generation failed: LLM response contained no report" }, { status: 502 });
    return Response.json({ report, truncated: responseBody.choices?.[0]?.finish_reason === "length" });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    console.error("CPQ migration report generation failed:", error);
    return Response.json({ error: timedOut ? "Report generation timed out after 290 seconds" : "Report generation failed: could not reach the configured LLM" }, { status: timedOut ? 504 : 502 });
  } finally {
    clearTimeout(timeout);
  }
}
