export type ToolsBridgeScope = "revenue" | "catalog";

export function authorizeToolsRequest(request: Request, scope: ToolsBridgeScope = "revenue"): Response | null {
  const variableName = scope === "catalog" ? "CATALOG_TOOLS_API_KEY" : "TOOLS_API_KEY";
  const apiKey = process.env[variableName];
  if (!apiKey) {
    console.error(`Tools API refused request: ${variableName} is not configured`);
    return Response.json(
      { error: "Tools API is not configured" },
      { status: 500 }
    );
  }

  if (request.headers.get("authorization") !== `Bearer ${apiKey}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
