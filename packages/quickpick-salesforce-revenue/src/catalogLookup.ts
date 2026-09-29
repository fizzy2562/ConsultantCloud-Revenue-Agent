import type { SalesforceClient } from "./client";

function soqlEscape(id: string): string {
  return id.replace(/'/g, "\\'");
}

export async function getQuotePricebookId(client: SalesforceClient, quoteId: string): Promise<string> {
  const rows = await client.query<{ Pricebook2Id: string | null }>(`SELECT Pricebook2Id FROM Quote WHERE Id = '${soqlEscape(quoteId)}'`);
  const pricebookId = rows[0]?.Pricebook2Id;
  if (!pricebookId) throw new Error(`Quote ${quoteId} has no Pricebook2Id set -- assign a price book before configuring.`);
  return pricebookId;
}

export interface PricebookEntryInfo {
  id: string;
  unitPrice: number;
}

export async function getPricebookEntry(client: SalesforceClient, pricebookId: string, productId: string): Promise<PricebookEntryInfo> {
  const rows = await client.query<{ Id: string; UnitPrice: number }>(
    `SELECT Id, UnitPrice FROM PricebookEntry WHERE Pricebook2Id = '${soqlEscape(pricebookId)}' AND Product2Id = '${soqlEscape(productId)}' AND IsActive = true LIMIT 1`
  );
  const row = rows[0];
  if (!row) throw new Error(`No active PricebookEntry for product ${productId} on price book ${pricebookId}.`);
  return { id: row.Id, unitPrice: row.UnitPrice };
}

export async function getDefaultSellingModelId(client: SalesforceClient, productId: string): Promise<string | null> {
  const rows = await client.query<{ ProductSellingModelId: string }>(
    `SELECT ProductSellingModelId FROM ProductSellingModelOption WHERE Product2Id = '${soqlEscape(productId)}' AND IsDefault = true LIMIT 1`
  );
  return rows[0]?.ProductSellingModelId ?? null;
}

export interface ProductRelatedComponentInfo {
  id: string;
  productRelationshipTypeId: string;
  doesBundlePriceIncludeChild: boolean;
}

export async function getProductRelatedComponent(
  client: SalesforceClient,
  parentProductId: string,
  childProductId: string,
  groupId: string
): Promise<ProductRelatedComponentInfo> {
  const rows = await client.query<{ Id: string; ProductRelationshipTypeId: string; DoesBundlePriceIncludeChild: boolean }>(
    `SELECT Id, ProductRelationshipTypeId, DoesBundlePriceIncludeChild FROM ProductRelatedComponent WHERE ParentProductId = '${soqlEscape(parentProductId)}' AND ChildProductId = '${soqlEscape(childProductId)}' AND ProductComponentGroupId = '${soqlEscape(groupId)}' LIMIT 1`
  );
  const row = rows[0];
  if (!row) throw new Error(`No ProductRelatedComponent linking ${childProductId} to ${parentProductId} in group ${groupId}.`);
  return { id: row.Id, productRelationshipTypeId: row.ProductRelationshipTypeId, doesBundlePriceIncludeChild: row.DoesBundlePriceIncludeChild };
}

export async function getAttributePicklistValueId(client: SalesforceClient, attributeDefinitionId: string, code: string): Promise<string | null> {
  const defRows = await client.query<{ PicklistId: string | null }>(`SELECT PicklistId FROM AttributeDefinition WHERE Id = '${soqlEscape(attributeDefinitionId)}'`);
  const picklistId = defRows[0]?.PicklistId;
  if (!picklistId) return null;
  const rows = await client.query<{ Id: string }>(`SELECT Id FROM AttributePicklistValue WHERE PicklistId = '${soqlEscape(picklistId)}' AND Code = '${soqlEscape(code)}' LIMIT 1`);
  return rows[0]?.Id ?? null;
}

export interface ExistingQuoteLine {
  id: string;
  product2Id: string;
  quantity: number;
}

export async function getQuoteLineItems(client: SalesforceClient, quoteId: string): Promise<ExistingQuoteLine[]> {
  const rows = await client.query<{ Id: string; Product2Id: string; Quantity: number }>(
    `SELECT Id, Product2Id, Quantity FROM QuoteLineItem WHERE QuoteId = '${soqlEscape(quoteId)}'`
  );
  return rows.map((r) => ({ id: r.Id, product2Id: r.Product2Id, quantity: r.Quantity }));
}

export interface ExistingRelationship {
  id: string;
  mainQuoteLineId: string;
  associatedQuoteLineId: string;
  productRelatedComponentId: string | null;
}

export async function getQuoteLineRelationships(client: SalesforceClient, rootLineId: string): Promise<ExistingRelationship[]> {
  const rows = await client.query<{ Id: string; MainQuoteLineId: string; AssociatedQuoteLineId: string; ProductRelatedComponentId: string | null }>(
    `SELECT Id, MainQuoteLineId, AssociatedQuoteLineId, ProductRelatedComponentId FROM QuoteLineRelationship WHERE RootQuoteLineId = '${soqlEscape(rootLineId)}'`
  );
  return rows.map((r) => ({ id: r.Id, mainQuoteLineId: r.MainQuoteLineId, associatedQuoteLineId: r.AssociatedQuoteLineId, productRelatedComponentId: r.ProductRelatedComponentId }));
}

export interface ExistingAttribute {
  id: string;
  quoteLineItemId: string;
  attributeDefinitionId: string;
  attributeValue: string | null;
}

export async function getQuoteLineItemAttributes(client: SalesforceClient, quoteLineItemIds: string[]): Promise<ExistingAttribute[]> {
  if (quoteLineItemIds.length === 0) return [];
  const idList = quoteLineItemIds.map((id) => `'${soqlEscape(id)}'`).join(",");
  const rows = await client.query<{ Id: string; QuoteLineItemId: string; AttributeDefinitionId: string; AttributeValue: string | null }>(
    `SELECT Id, QuoteLineItemId, AttributeDefinitionId, AttributeValue FROM QuoteLineItemAttribute WHERE QuoteLineItemId IN (${idList})`
  );
  return rows.map((r) => ({ id: r.Id, quoteLineItemId: r.QuoteLineItemId, attributeDefinitionId: r.AttributeDefinitionId, attributeValue: r.AttributeValue }));
}
