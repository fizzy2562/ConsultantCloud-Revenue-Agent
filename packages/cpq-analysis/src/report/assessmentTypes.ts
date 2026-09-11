export type Disposition = "DIRECT" | "TRANSFORM" | "REDESIGN" | "RETIRE" | "INVESTIGATE" | "BLOCKED";

export type ComplexityLevel = "Low" | "Medium" | "High" | "N/A";

export type RiskLevel = "Low" | "Medium" | "Medium-High" | "High" | "N/A";

export type Confidence = "High" | "Medium" | "Low";

export type EvidenceClass = "Observed" | "Inferred" | "Declared";

/**
 * One migration assessment item: the v3 replacement for the old flat "X maps to Y" mapping row.
 * Produced by buildDispositions.ts from the same raw inspector data scoreComplexity.ts already
 * consumes -- this does not require any new Salesforce query.
 */
export interface AssessmentItem {
  /** Stable id, e.g. "price-rules", "twin-fields", or a per-record id for rule-level items. */
  id: string;
  name: string;
  /** One of the nine READINESS_DIMENSIONS ids below -- drives buildReadinessScore.ts grouping. */
  dimension: ReadinessDimensionId;
  /** Plain-English statement of what this item is for, independent of any target system. */
  businessIntent: string;
  disposition: Disposition;
  /** Candidate target pattern -- phrased as a candidate, never a guarantee (see rcMappings.ts). */
  suggestedTarget: string;
  currentComplexity: ComplexityLevel;
  targetComplexity: ComplexityLevel;
  risk: RiskLevel;
  confidence: Confidence;
  evidenceClass: EvidenceClass;
  /** Action-oriented: preserve/simplify business intent, not "clone this CPQ structure". */
  recommendation: string;
  /** Names of other AssessmentItem.id values this item depends on, if any. */
  dependencies: string[];
}

export const READINESS_DIMENSIONS = [
  { id: "catalogSellingModels", label: "Catalog and selling models", weight: 12 },
  { id: "pricing", label: "Pricing", weight: 13 },
  { id: "configurationRules", label: "Configuration and rules", weight: 10 },
  { id: "customDevelopment", label: "Custom development/automation", weight: 15 },
  { id: "installedBaseLifecycle", label: "Installed base/lifecycle", weight: 15 },
  { id: "integrations", label: "Integrations", weight: 10 },
  { id: "dataMigrationQuality", label: "Data migration quality/volume", weight: 10 },
  { id: "reportingSecurityOps", label: "Reporting/security/operability", weight: 7 },
  { id: "testingCutover", label: "Testing and cutover readiness", weight: 8 },
] as const;

export type ReadinessDimensionId = (typeof READINESS_DIMENSIONS)[number]["id"];
