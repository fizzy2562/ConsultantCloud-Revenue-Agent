import { describe, it, expect } from "vitest";
import { ToolCallEventSchema } from "@consultantcloud/shared";
import { EventLogger, InMemoryEventSink } from "../src/logger.js";
import { computeMetrics } from "../src/metrics.js";

describe("EventLogger", () => {
  it("round-trips a logged event through the sink", () => {
    const sink = new InMemoryEventSink();
    const logger = new EventLogger(sink);
    const event = {
      requestId: "req-abc",
      runId: "run-xyz",
      toolName: "find_account",
      durationMs: 42,
      status: "success" as const,
      timestamp: "2026-01-01T00:00:00.000Z",
    };
    logger.log(event);
    const events = sink.getEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.requestId).toBe("req-abc");
  });
});

describe("ToolCallEventSchema", () => {
  it("rejects an unknown secret-bearing field", () => {
    const valid = {
      requestId: "req-1",
      runId: "run-1",
      toolName: "find_account",
      durationMs: 100,
      status: "success" as const,
      timestamp: "2026-01-01T00:00:00.000Z",
    };
    const smuggled = { ...valid, apiKey: "sk-should-not-be-loggable" };
    const result = ToolCallEventSchema.safeParse(smuggled);
    expect(result.success).toBe(false);
  });
});

describe("computeMetrics", () => {
  const events = [
    { requestId: "req-1", runId: "run-1", toolName: "find_account", durationMs: 100, status: "success" as const, timestamp: "2026-01-01T00:00:00.000Z" },
    { requestId: "req-2", runId: "run-1", toolName: "create_renewal_quote", durationMs: 200, status: "success" as const, confirmationEvent: "confirmed" as const, timestamp: "2026-01-01T00:00:01.000Z" },
    { requestId: "req-3", runId: "run-1", toolName: "get_account_assets", durationMs: 150, status: "success" as const, timestamp: "2026-01-01T00:00:02.000Z" },
    { requestId: "req-4", runId: "run-1", toolName: "add_quote_line", durationMs: 50, status: "error" as const, timestamp: "2026-01-01T00:00:03.000Z" },
    { requestId: "req-5", runId: "run-1", toolName: "add_quote_line", durationMs: 300, status: "error" as const, timestamp: "2026-01-01T00:00:04.000Z" },
    { requestId: "req-6", runId: "run-1", toolName: "apply_discount", durationMs: 10, status: "policy_blocked" as const, confirmationEvent: "declined" as const, timestamp: "2026-01-01T00:00:05.000Z" },
    { requestId: "req-7", runId: "run-1", toolName: "apply_discount", durationMs: 20, status: "policy_blocked" as const, timestamp: "2026-01-01T00:00:06.000Z" },
    { requestId: "req-8", runId: "run-1", toolName: "apply_discount", durationMs: 120, status: "success" as const, confirmationEvent: "confirmed" as const, timestamp: "2026-01-01T00:00:07.000Z" },
    { requestId: "req-9", runId: "run-1", toolName: "search_products", durationMs: 80, status: "success" as const, confirmationEvent: "confirmed" as const, timestamp: "2026-01-01T00:00:08.000Z" },
    { requestId: "req-10", runId: "run-1", toolName: "get_quote_summary", durationMs: 170, status: "success" as const, timestamp: "2026-01-01T00:00:09.000Z" },
  ];

  it("computes rollup metrics over the fixed fixture", () => {
    const m = computeMetrics(events);
    expect(m.successfulTaskRate).toBe(0.6);
    expect(m.averageToolLatencyMs).toBe(120);
    expect(m.toolFailureCount).toBe(2);
    expect(m.policyBlockCount).toBe(2);
    expect(m.humanConfirmationCount).toBe(3);
    expect(m.endToEndDurationMs).toBe(9000);
  });

  it("returns all-zero fields for an empty input", () => {
    const m = computeMetrics([]);
    expect(m.successfulTaskRate).toBe(0);
    expect(m.endToEndDurationMs).toBe(0);
  });
});
