import type { ToolCallEvent } from "@consultantcloud/shared";

export type MetricsSummary = {
  successfulTaskRate: number;
  averageToolLatencyMs: number;
  toolFailureCount: number;
  policyBlockCount: number;
  humanConfirmationCount: number;
  endToEndDurationMs: number;
};

export function computeMetrics(events: ToolCallEvent[]): MetricsSummary {
  if (events.length === 0) {
    return {
      successfulTaskRate: 0,
      averageToolLatencyMs: 0,
      toolFailureCount: 0,
      policyBlockCount: 0,
      humanConfirmationCount: 0,
      endToEndDurationMs: 0,
    };
  }

  let successCount = 0;
  let totalDurationMs = 0;
  let toolFailureCount = 0;
  let policyBlockCount = 0;
  let humanConfirmationCount = 0;

  let earliest: number | null = null;
  let latest: number | null = null;

  for (const event of events) {
    if (event.status === "success") {
      successCount += 1;
    }
    if (event.status === "error") {
      toolFailureCount += 1;
    }
    if (event.status === "policy_blocked") {
      policyBlockCount += 1;
    }
    if (event.confirmationEvent === "confirmed") {
      humanConfirmationCount += 1;
    }

    totalDurationMs += event.durationMs;

    const t = new Date(event.timestamp).getTime();
    if (earliest === null || t < earliest) {
      earliest = t;
    }
    if (latest === null || t > latest) {
      latest = t;
    }
  }

  const successfulTaskRate = successCount / events.length;
  const averageToolLatencyMs = totalDurationMs / events.length;

  let endToEndDurationMs = 0;
  if (earliest !== null && latest !== null && events.length > 1) {
    endToEndDurationMs = latest - earliest;
  }

  return {
    successfulTaskRate,
    averageToolLatencyMs,
    toolFailureCount,
    policyBlockCount,
    humanConfirmationCount,
    endToEndDurationMs,
  };
}
