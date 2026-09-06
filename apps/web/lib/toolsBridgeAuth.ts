export function authorizeToolsRequest(request: Request): Response | null {
  const apiKey = process.env.TOOLS_API_KEY;
  if (!apiKey) {
    console.error("Tools API refused request: TOOLS_API_KEY is not configured");
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
