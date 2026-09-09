import { describe, expect, it, vi } from "vitest";
import type { Connection } from "jsforce";
import { invokeDecisionTableHandler } from "../src/tools/generated/invoke_decision_table";

describe("invoke_decision_table", () => {
  it("posts the documented conditionsList payload and maps a direct outcome", async () => {
    const requestPost = vi.fn().mockResolvedValue({
      errorCode: null,
      errorMessage: null,
      outcomeList: [{ values: { RCA_UnitPrice__c: "23043.04" } }],
      outcomeType: "Single Match",
      successStatus: true,
    });
    const conn = { requestPost } as unknown as Connection;

    const result = await invokeDecisionTableHandler(conn, {
      decisionTableId: "0lDxx0000000001",
      conditions: [{ fieldName: "RCA_Quantity__c", value: 5, operator: "GreaterOrEqual" }],
    });

    expect(requestPost).toHaveBeenCalledWith(
      "/services/data/v67.0/connect/business-rules/decision-table/lookup/0lDxx0000000001",
      { conditions: [{ conditionsList: [{ fieldName: "RCA_Quantity__c", value: 5, operator: "GreaterOrEqual" }] }] }
    );
    expect(result.ok && result.data).toEqual({
      errorCode: null,
      errorMessage: null,
      outcomeList: [{ values: { RCA_UnitPrice__c: "23043.04" } }],
      outcomeType: "Single Match",
      successStatus: true,
    });
  });

  it("handles the documented outputs wrapper", async () => {
    const conn = {
      requestPost: vi.fn().mockResolvedValue({
        outputs: [{ outcomeList: [], outcomeType: "No Match", successStatus: false, errorCode: "NO_MATCH", errorMessage: "No row matched" }],
      }),
    } as unknown as Connection;

    const result = await invokeDecisionTableHandler(conn, { decisionTableId: "0lDxx0000000002", conditions: [] });

    expect(result.ok && result.data).toMatchObject({
      outcomeList: [], outcomeType: "No Match", successStatus: false, errorCode: "NO_MATCH", errorMessage: "No row matched",
    });
  });
});
