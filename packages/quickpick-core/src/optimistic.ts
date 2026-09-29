import { isGroupSatisfied } from "./navigation";
import type { ConfigurationChange, ConfigurationGroup, ConfigurationState, GroupStatus } from "./types";

/**
 * The UI's provisional echo of a change, used only to paint the click immediately while Revenue
 * Cloud works (a configure-and-price run takes about 2.5s, measured, and no API in the org is
 * faster).
 *
 * This is NOT the UI deciding what's valid. It only repeats a selection the engine's own catalog
 * already offered, within the cardinality the engine published for that group, and it never
 * invents prices. The engine's answer replaces this state wholesale a moment later, and if the
 * engine disagrees the caller reverts to the engine's version and shows its message.
 */
export function applyOptimistically(state: ConfigurationState, change: ConfigurationChange): ConfigurationState {
  const groups = state.groups.map((group) => {
    if (group.id !== change.groupId) return group;
    const touches = group.options.some((o) => o.id === change.optionId);
    if (!touches) return group;

    const singleSelect = group.cardinality.max === 1;
    const options = group.options.map((option) => {
      if (change.type === "select-option") {
        if (option.id === change.optionId) return { ...option, selected: true, quantity: option.quantity ?? 1 };
        return singleSelect && option.selected ? { ...option, selected: false } : option;
      }
      if (option.id !== change.optionId) return option;
      if (change.type === "deselect-option") return { ...option, selected: false };
      if (change.type === "set-quantity") return { ...option, quantity: change.quantity };
      if (change.type === "set-attribute") {
        return {
          ...option,
          attributes: option.attributes.map((a) => (a.id === change.attributeId ? { ...a, currentValue: change.value } : a)),
        };
      }
      return option;
    });
    return { ...group, options };
  });

  return { ...state, groups: withStatuses(groups), isComplete: groups.every(satisfied), lastUpdatedAt: new Date().toISOString() };
}

/** Same cardinality reading the mapping applies to an engine response. */
function satisfied(group: ConfigurationGroup): boolean {
  return isGroupSatisfied(group);
}

function withStatuses(groups: ConfigurationGroup[]): ConfigurationGroup[] {
  let currentAssigned = false;
  return groups.map((group) => {
    let status: GroupStatus;
    if (satisfied(group)) {
      status = "complete";
    } else if (!currentAssigned) {
      status = "current";
      currentAssigned = true;
    } else {
      status = "locked";
    }
    return { ...group, status };
  });
}
