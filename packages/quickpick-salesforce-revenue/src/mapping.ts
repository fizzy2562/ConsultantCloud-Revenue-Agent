import { isGroupSatisfied } from "@revenue-picker/core";
import type {
  ConfigurationAttribute,
  ConfigurationGroup,
  ConfigurationOption,
  ConfigurationState,
  ControlType,
  GroupStatus,
} from "@revenue-picker/core";
import type { ConfiguratorComponent, ConfiguratorMessage } from "./client";
import type { ExistingAttribute, ExistingQuoteLine, ExistingRelationship } from "./catalogLookup";

function mapDataType(dataType: string): ControlType {
  switch (dataType) {
    case "Picklist":
      return "picklist";
    case "Boolean":
    case "Checkbox":
      return "boolean";
    case "Number":
    case "Currency":
    case "Percent":
      return "numeric";
    case "Date":
    case "DateTime":
      return "date";
    default:
      return "text";
  }
}

interface MappedGroupWork {
  group: ConfigurationGroup;
  requiredSatisfied: boolean;
  hasAttention: boolean;
}

function buildOption(
  component: ConfiguratorComponent,
  existingLines: ExistingQuoteLine[],
  relationships: ExistingRelationship[],
  attributesByLine: Map<string, ExistingAttribute[]>,
  rootLineId: string,
  allowProductFallback: boolean
): { option: ConfigurationOption; matchedLineId: string | null } {
  const prcId = component.productRelatedComponent?.id;
  const candidates = relationships.filter((r) => r.mainQuoteLineId === rootLineId &&
    existingLines.some((l) => l.id === r.associatedQuoteLineId && l.product2Id === component.id));
  const exact = prcId ? candidates.filter((r) => r.productRelatedComponentId === prcId) : [];
  const legacy = candidates.filter((r) => !prcId || !r.productRelatedComponentId);
  // A missing identity must never select the same product occurrence in multiple groups.
  const matches = exact.length ? exact : allowProductFallback ? legacy : [];
  if (matches.length > 1 || (!allowProductFallback && legacy.length && !exact.length)) {
    throw new Error(`Ambiguous component identity for ${component.name}. Reload after repairing its quote-line relationship.`);
  }
  const rel = matches[0];
  const matchedLine = rel ? (existingLines.find((l) => l.id === rel.associatedQuoteLineId) ?? null) : null;
  const selected = matchedLine !== null;

  const attributes: ConfigurationAttribute[] = component.attributeCategories.flatMap((category) =>
        category.attributes.map((attr) => {
          const existing = matchedLine ? (attributesByLine.get(matchedLine.id) ?? []).find((a) => a.attributeDefinitionId === attr.id) : undefined;
          return {
            id: attr.id,
            apiName: attr.name,
            label: attr.label,
            controlType: mapDataType(attr.dataType),
            required: attr.isRequired,
            currentValue: existing?.attributeValue ?? null,
            validValues: attr.attributePicklist ? attr.attributePicklist.values.map((v) => ({ code: v.code, label: v.displayValue })) : null,
          };
        })
      );

  const price = component.prices.find((p) => p.isSelected) ?? component.prices.find((p) => p.isDefault) ?? component.prices[0];

  return {
    option: {
      id: component.id,
      productId: component.id,
      occurrenceId: prcId,
      lineId: matchedLine?.id,
      name: component.name,
      description: price ? `List price ${price.unitPrice.toFixed(2)}` : component.description,
      selected,
      required: component.productRelatedComponent?.isComponentRequired === true,
      attributes,
      listPrice: price ? price.unitPrice : undefined,
      disabled: !selected && component.ruleDisabled === true,
      quantity: matchedLine ? Number(matchedLine.quantity) : undefined,
      quantityEditable: component.productRelatedComponent?.isQuantityEditable === true,
      minQuantity: component.productRelatedComponent?.minQuantity ?? undefined,
      maxQuantity: component.productRelatedComponent?.maxQuantity ?? undefined,
      notice: component.ruleDisabled ? (component.ruleMessage ?? undefined) : undefined,
    },
    matchedLineId: matchedLine?.id ?? null,
  };
}

/**
 * Turns the catalog shape from `configure` (what's possible) plus the persisted QuoteLineItem /
 * QuoteLineRelationship / QuoteLineItemAttribute rows (what's actually selected) into a
 * ConfigurationState. Kept as a pure function -- no network calls -- so it's unit-testable
 * against fixture data without hitting the org.
 */
export function mapToConfigurationState(
  quoteId: string,
  rootLineId: string,
  catalogRoot: ConfiguratorComponent,
  existingLines: ExistingQuoteLine[],
  relationships: ExistingRelationship[],
  attributes: ExistingAttribute[],
  messages: ConfiguratorMessage[]
): ConfigurationState {
  const attributesByLine = new Map<string, ExistingAttribute[]>();
  for (const attr of attributes) {
    const list = attributesByLine.get(attr.quoteLineItemId) ?? [];
    list.push(attr);
    attributesByLine.set(attr.quoteLineItemId, list);
  }

  const attentionLineIds = new Set(messages.map((m) => m.relatedRecordId).filter((id): id is string => Boolean(id)));

  const occurrences = new Map<string, number>();
  for (const g of catalogRoot.productComponentGroups) for (const c of g.components) {
    occurrences.set(c.id, (occurrences.get(c.id) ?? 0) + 1);
  }
  const work: MappedGroupWork[] = [...catalogRoot.productComponentGroups]
    .sort((a, b) => a.sequence - b.sequence)
    .map((group) => {
      const options: ConfigurationOption[] = [];
      const matchedLineIds: string[] = [];
      let anyRequired = false;

      for (const component of group.components) {
        if (component.productRelatedComponent?.isComponentRequired) anyRequired = true;
        const { option, matchedLineId } = buildOption(component, existingLines, relationships, attributesByLine, rootLineId, occurrences.get(component.id) === 1);
        options.push(option);
        if (matchedLineId) matchedLineIds.push(matchedLineId);
      }

      const selectedCount = options.filter((o) => o.selected).length;
      const effectiveMin = group.minBundleComponents ?? (anyRequired ? 1 : 0);
      const effectiveMax = group.maxBundleComponents;
      const requiredSatisfied = isGroupSatisfied({id:group.id,apiName:group.name,label:group.name,
        sequence:group.sequence,status:"current",options,cardinality:{min:effectiveMin,max:effectiveMax}});
      // A message tied to the root line (e.g. "bundle isn't complete yet") is a whole-transaction
      // signal, not evidence that THIS group specifically needs attention -- only count messages
      // tied to a line item that actually belongs to this group.
      const hasAttention = matchedLineIds.some((id) => attentionLineIds.has(id));

      return {
        group: {
          id: group.id,
          apiName: group.name,
          label: group.name,
          sequence: group.sequence,
          cardinality: { min: effectiveMin, max: effectiveMax },
          status: "locked" as GroupStatus,
          options,
        },
        requiredSatisfied,
        hasAttention,
      };
    });

  let currentAssigned = false;
  for (const w of work) {
    if (w.hasAttention) {
      w.group.status = "attention";
      currentAssigned = true;
      continue;
    }
    if (w.requiredSatisfied) {
      w.group.status = "complete";
      continue;
    }
    if (!currentAssigned) {
      w.group.status = "current";
      currentAssigned = true;
    } else {
      w.group.status = "locked";
    }
  }

  const isComplete = work.every((w) => w.requiredSatisfied);

  return {
    sessionId: `${quoteId}:${rootLineId}`,
    rootProductId: catalogRoot.id,
    rootProductName: catalogRoot.name,
    transactionContext: { quoteId },
    groups: work.map((w) => w.group),
    isComplete,
    lastUpdatedAt: new Date().toISOString(),
    notices: [...new Set(messages.filter((m) => m.messageType === "info").map((m) => m.message))],
  };
}
