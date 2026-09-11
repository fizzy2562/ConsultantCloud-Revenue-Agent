import { type AssessmentItem, type Disposition, READINESS_DIMENSIONS, type ReadinessDimensionId } from "./assessmentTypes";
import type { InspectorResult } from "./buildInventorySection";

export interface DimensionScore {
  id: ReadinessDimensionId;
  label: string;
  weight: number;
  /** 0-100, or null when this dimension has no assessed items yet ("Unknown"). */
  score: number | null;
  /** 0-1: how much of this dimension's real-world scope today's inspectors actually cover. */
  evidenceCompleteness: number;
  itemCount: number;
}

export interface ReadinessResult {
  /** 0-100 weighted average across assessed (non-null) dimensions only, or null if none assessed. */
  overallReadiness: number | null;
  /** 0-100: sum(weight * evidenceCompleteness) across ALL nine dimensions, assessed or not. */
  coveragePercent: number;
  /** True until coverage clears 70%, no dimension is wholly unknown, and every inspector succeeded. */
  isProvisional: boolean;
  dimensions: DimensionScore[];
  dispositionCounts: Record<Disposition, number>;
}

/**
 * How much of each dimension's real-world scope the CURRENT six inspectors can actually see.
 * This is a fixed, documented estimate (not derived from data) -- it exists so an org with zero
 * Installed Base/Integration/Reporting/Testing evidence cannot silently read as "fully assessed."
 * Revisit these numbers as later report phases (installed base, automation scanner, etc.) land.
 */
const EVIDENCE_COMPLETENESS: Record<ReadinessDimensionId, number> = {
  // Catalog structure and selling-model classification are both covered now. Still not full: no
  // verified target-side Revenue Cloud Product Selling Model mapping, and this org's own catalog
  // fields are mostly unpopulated, so a lot of the classification leans on thinner Inferred evidence.
  catalogSellingModels: 0.75,
  pricing: 0.6, // Price Rules + Discount Schedules covered; waterfall/contracted/currency are not
  configurationRules: 0.7, // Product Rules + Configuration Rules covered; conflict/dependency analysis is not
  // QCP custom scripts and a real Tooling API scan of custom Apex/Triggers/Validation Rules
  // (namespace-filtered to exclude managed-package internals) are both covered now. Still not
  // full: Flow XML is not parsed, and MetadataComponentDependency graph traversal isn't used
  // (it doesn't support the queries this scan would need) -- SBQQ reference detection is a
  // substring match on source, not real dependency analysis.
  customDevelopment: 0.6,
  // Phase 2A inspector now covers real contract/subscription/asset/renewal/amendment counts, but
  // not the renewal/amendment/cancellation business-process model or a verified RC-side target
  // (both still require declared, non-observable facts) -- so this is partial, not full, coverage.
  installedBaseLifecycle: 0.45,
  // Named Credentials, Remote Site Settings, and Connected Apps are now scanned (namespace-
  // filtered to exclude the CPQ package's own pre-shipped ones). Still not full: metadata alone
  // cannot reveal inbound integrations or middleware-owned mappings outside Salesforce.
  integrations: 0.35,
  // Twin Fields plus a real custom-field inventory across ten objects are both covered now.
  // Still not full: fields are not yet classified by purpose/dependency, and formula detection
  // is a known simplification (every field currently reports as non-formula).
  dataMigrationQuality: 0.45,
  // Reports/Dashboards are now scanned for SBQQ references. Still not full: this dimension also
  // covers security/sharing review, which no inspector touches yet, and the "reporting" half only
  // covers reports/dashboards visible to this connection (private folders are invisible to it).
  reportingSecurityOps: 0.25,
  testingCutover: 0, // no inspector yet (Phase 5)
};

const COVERAGE_THRESHOLD_PERCENT = 70;

/**
 * Deterministic per-disposition readiness contribution. A dimension's score is the average of
 * these points across its items -- DIRECT/RETIRE items are fully resolved (100), TRANSFORM is a
 * known, bounded amount of rework (70), REDESIGN is unresolved-but-scoped (40), INVESTIGATE means
 * the org doesn't yet know what this item needs (30), and BLOCKED contributes nothing (0).
 */
const DISPOSITION_POINTS: Record<Disposition, number> = {
  DIRECT: 100,
  RETIRE: 100,
  TRANSFORM: 70,
  REDESIGN: 40,
  INVESTIGATE: 30,
  BLOCKED: 0,
};

const EMPTY_DISPOSITION_COUNTS: Record<Disposition, number> = {
  DIRECT: 0,
  TRANSFORM: 0,
  REDESIGN: 0,
  RETIRE: 0,
  INVESTIGATE: 0,
  BLOCKED: 0,
};

function scoreDimension(items: AssessmentItem[]): number | null {
  if (items.length === 0) return null;
  const total = items.reduce((sum, item) => sum + DISPOSITION_POINTS[item.disposition], 0);
  return Math.round(total / items.length);
}

function hasFailedInspector(raw: Record<string, InspectorResult>): boolean {
  return Object.values(raw).some((result) => !result.ok);
}

export function buildReadinessScore(
  items: AssessmentItem[],
  raw: Record<string, InspectorResult>
): ReadinessResult {
  const dimensions: DimensionScore[] = READINESS_DIMENSIONS.map(({ id, label, weight }) => {
    const dimensionItems = items.filter((item) => item.dimension === id);
    return {
      id,
      label,
      weight,
      score: scoreDimension(dimensionItems),
      evidenceCompleteness: EVIDENCE_COMPLETENESS[id],
      itemCount: dimensionItems.length,
    };
  });

  const assessedDimensions = dimensions.filter((dimension) => dimension.score !== null);
  const assessedWeight = assessedDimensions.reduce((sum, dimension) => sum + dimension.weight, 0);
  const overallReadiness =
    assessedWeight === 0
      ? null
      : Math.round(
          assessedDimensions.reduce((sum, dimension) => sum + (dimension.score as number) * dimension.weight, 0) /
            assessedWeight
        );

  const coveragePercent =
    Math.round(
      dimensions.reduce((sum, dimension) => sum + dimension.weight * dimension.evidenceCompleteness, 0) * 10
    ) / 10;

  const hasWhollyUnknownDimension = dimensions.some((dimension) => dimension.score === null);
  const isProvisional =
    coveragePercent < COVERAGE_THRESHOLD_PERCENT || hasWhollyUnknownDimension || hasFailedInspector(raw);

  const dispositionCounts: Record<Disposition, number> = { ...EMPTY_DISPOSITION_COUNTS };
  for (const item of items) {
    dispositionCounts[item.disposition] += 1;
  }

  return { overallReadiness, coveragePercent, isProvisional, dimensions, dispositionCounts };
}
