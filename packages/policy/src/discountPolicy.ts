export type DiscountDecision = "permitted" | "approval_required" | "rejected";

export type DiscountEvaluation = {
  decision: DiscountDecision;
  reason?: string;
};

type ThresholdRule = {
  maxPercent: number;
  decision: DiscountDecision;
  reason?: string;
};

export const discountThresholds: ThresholdRule[] = [
  { maxPercent: 15, decision: "permitted" },
  {
    maxPercent: 25,
    decision: "approval_required",
    reason: "Discount exceeds 15% and requires manager approval",
  },
  {
    maxPercent: Infinity,
    decision: "rejected",
    reason: "Discount exceeds the maximum permitted threshold of 25%",
  },
];

export function evaluateDiscount(percent: number): DiscountEvaluation {
  if (Number.isNaN(percent) || !Number.isFinite(percent) || percent < 0) {
    return { decision: "rejected", reason: "Invalid discount percent" };
  }

  for (const rule of discountThresholds) {
    if (percent <= rule.maxPercent) {
      return { decision: rule.decision, reason: rule.reason };
    }
  }

  return { decision: "rejected", reason: "Invalid discount percent" };
}
