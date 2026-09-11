import type { InspectorResult } from "./buildInventorySection";

function md(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  return value;
}

function plural(count: number, singular: string, pluralForm?: string): string {
  const form = count === 1 ? singular : pluralForm ?? `${singular}s`;
  return `${count} ${form}`;
}

function getOkData<T>(raw: Record<string, InspectorResult>, key: string): T | null {
  const result = raw[key];
  if (result && result.ok) return result.data as T;
  return null;
}

function failureNote(raw: Record<string, InspectorResult>, key: string): string {
  const result = raw[key];
  if (result && !result.ok) return `_Inspector failed: ${result.error.message}_`;
  return "_No data returned for this inspector._";
}

interface CustomFieldSummary {
  objectApiName: string;
  developerName: string;
  isFormula: boolean;
}

interface CustomFieldCountsByObject {
  objectApiName: string;
  customFieldCount: number;
}

interface InspectCustomFieldsData {
  fields: CustomFieldSummary[];
  countsByObject: CustomFieldCountsByObject[];
}

export function buildCustomFieldSection(raw: Record<string, InspectorResult>): string {
  const lines: string[] = [];
  lines.push("## Custom Field Inventory");
  lines.push("");

  const data = getOkData<InspectCustomFieldsData>(raw, "inspect_custom_fields");
  if (data === null) {
    lines.push(failureNote(raw, "inspect_custom_fields"));
    lines.push("");
    return lines.join("\n");
  }

  const totalCustomFields = data.fields.length;
  const objectsWithAtLeastOne = data.countsByObject.filter((c) => c.customFieldCount > 0).length;

  lines.push(
    `Found ${plural(totalCustomFields, "customer-created custom field")} across ${objectsWithAtLeastOne} of ${plural(data.countsByObject.length, "scanned object")}, excluding the CPQ managed package's own fields.`,
  );
  lines.push("");

  lines.push("### Custom fields by object");
  lines.push("");
  lines.push("| Object | Custom fields |");
  lines.push("|---|---:|");
  for (const entry of data.countsByObject) {
    lines.push(`| ${md(entry.objectApiName)} | ${entry.customFieldCount} |`);
  }
  lines.push("");

  lines.push("### Formula fields");
  lines.push("");
  const formulaFields = data.fields.filter((f) => f.isFormula === true);
  if (formulaFields.length === 0) {
    lines.push(
      "_No formula fields were found among the custom fields scanned. (Formula detection is a known simplification in this version -- see the method note below.)_",
    );
  } else {
    for (const field of formulaFields.slice(0, 15)) {
      lines.push(`- **${md(field.objectApiName)}.${md(field.developerName)}__c**`);
    }
  }
  lines.push("");

  lines.push("### All custom fields");
  lines.push("");
  if (data.fields.length === 0) {
    lines.push("_No customer-created custom fields were found on any of the scanned objects._");
    lines.push("");
  } else {
    lines.push("| Object | Field |");
    lines.push("|---|---|");
    for (const field of data.fields) {
      lines.push(`| ${md(field.objectApiName)} | ${md(field.developerName)}__c |`);
    }
    lines.push("");
  }

  lines.push("### Method note");
  lines.push("");
  lines.push(
    "_This inventory covers Product2, Quote, Quote Line, Subscription, Contract, Order, Order Product, Opportunity, and Account. It lists customer-created fields only -- fields that belong to the CPQ managed package itself are excluded, since they are not customer migration risk._",
  );
  lines.push("");
  lines.push(
    "_Formula detection in this version is a simplification: every field is currently reported as non-formula, regardless of its actual type, pending a deeper pass that parses each field's metadata. Field-level classification by purpose (pricing dependency, automation dependency, reporting dependency, etc.) is not attempted in this version -- this section is an inventory, not yet a dependency classification._",
  );
  lines.push("");

  return lines.join("\n");
}
