import { describe, expect, it } from "vitest";
import { GET } from "../app/api/system/architecture/route";

describe("GET /api/system/architecture", () => {
  it("returns the architecture snapshot as JSON", async () => {
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^application\/json/);
    expect(body).toEqual(expect.objectContaining({
      schemaVersion: 1,
      generatedAt: expect.any(String),
      application: expect.objectContaining({ apiRoutes: expect.any(Array) }),
      tools: expect.any(Array),
      warnings: expect.any(Array),
    }));
  });
});
