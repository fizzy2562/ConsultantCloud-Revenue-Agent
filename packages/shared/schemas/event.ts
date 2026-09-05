import { z } from "zod";

export const ToolCallEventSchema = z
  .object({
    requestId: z.string(),
    runId: z.string(),
    toolName: z.string(),
    durationMs: z.number().nonnegative(),
    status: z.enum(["success", "policy_blocked", "error"]),
    policyDecision: z.enum(["permitted", "approval_required", "rejected"]).optional(),
    confirmationEvent: z.enum(["confirmed", "declined"]).optional(),
    salesforceStatus: z.string().optional(),
    timestamp: z.string(),
  })
  .strict();

export type ToolCallEvent = z.infer<typeof ToolCallEventSchema>;
