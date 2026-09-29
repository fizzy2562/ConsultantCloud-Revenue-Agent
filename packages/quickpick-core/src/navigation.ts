import type { ConfigurationGroup, ConfigurationState, GroupStatus } from "./types";

/**
 * Derives the linear progress-stepper shape (plan section 3) purely from group metadata and
 * status -- no host renderer (React, Block Kit, ...) should recompute this independently, so
 * React and Slack stay provably in sync.
 */
export interface ProgressStep {
  groupId: string;
  label: string;
  sequence: number;
  status: GroupStatus;
}

export function deriveProgressSteps(state: ConfigurationState): ProgressStep[] {
  return [...state.groups]
    .sort((a, b) => a.sequence - b.sequence)
    .map((group) => ({
      groupId: group.id,
      label: group.label,
      sequence: group.sequence,
      status: group.status,
    }));
}

export function isGroupSatisfied(group: ConfigurationGroup): boolean {
  const selectedCount = group.options.filter((o) => o.selected).length;
  const { min, max } = group.cardinality;
  if (selectedCount < min) return false;
  if (max !== null && selectedCount > max) return false;
  return group.options.every(option => (!option.required || option.selected) &&
    (!option.selected || option.attributes.every(attr => !attr.required || hasAttributeValue(attr.currentValue))));
}

/** False and zero are supplied values; null and blank strings are not. */
export function hasAttributeValue(value: string | number | boolean | null): boolean {
  return value !== null && value !== undefined && (typeof value !== "string" || value.trim() !== "");
}

export function activeGroup(state: ConfigurationState): ConfigurationGroup | null {
  return state.groups.find((g) => g.status === "current") ?? null;
}
