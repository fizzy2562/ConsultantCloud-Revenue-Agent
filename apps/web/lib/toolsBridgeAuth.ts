import { createHash, timingSafeEqual } from "node:crypto";

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

  // Compare digests in constant time, so response timing can't reveal the key.
  const digest = (value: string) => createHash("sha256").update(value).digest();
  if (!timingSafeEqual(digest(request.headers.get("authorization") ?? ""), digest(`Bearer ${apiKey}`))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
