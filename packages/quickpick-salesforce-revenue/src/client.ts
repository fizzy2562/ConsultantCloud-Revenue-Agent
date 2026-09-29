export interface SalesforceClientConfig {
  /**
   * Base URL to prefix every request with (e.g. for the Node smoke-test script, run outside
   * Salesforce). Omit this when running inside a Lightning component served by Salesforce
   * itself -- relative URLs plus the browser's own session cookie ("credentials: include")
   * work same-origin without needing a session id at all, and avoids the VF-domain/CORS problem
   * documented in /docs/api-spike-findings.md.
   */
  instanceUrl?: string;
  /** Only needed when instanceUrl is set (i.e. calling from outside an authenticated Salesforce page). */
  sessionId?: string;
  apiVersion?: string;
}

export interface ConfiguratorOptions {
  executePricing?: boolean;
  returnProductCatalogData?: boolean;
  executeConfigurationRules?: boolean;
  qualifyAllProductsInTransaction?: boolean;
  validateProductCatalog?: boolean;
  validateAmendRenewCancel?: boolean;
  addDefaultConfiguration?: boolean;
}

export interface ConfiguratorInput {
  transactionId: string;
  transactionLineId?: string;
  transactionContextId?: string;
  configuratorOptions?: ConfiguratorOptions;
}

export interface ConfiguratorAttributeValue {
  code: string;
  displayValue: string;
  id: string;
  sequence: number;
  status: string;
}

export interface ConfiguratorAttribute {
  id: string;
  name: string;
  label: string;
  dataType: string;
  isRequired: boolean;
  isPriceImpacting: boolean;
  isConfigurable: boolean;
  attributePicklist?: { id: string; values: ConfiguratorAttributeValue[] };
}

export interface ConfiguratorAttributeCategory {
  id: string;
  name: string;
  attributes: ConfiguratorAttribute[];
}

export interface ConfiguratorPrice {
  unitPrice: number;
  isSelected: boolean;
  isDefault: boolean;
  pricingModel?: { id: string; name: string; pricingModelType: string };
}

export interface ConfiguratorProductRelatedComponent {
  id: string;
  parentProductId: string;
  childProductId: string;
  productComponentGroupId: string;
  productRelationshipTypeId: string;
  doesBundlePriceIncludeChild: boolean;
  isComponentRequired: boolean;
  quantity?: number | null;
  minQuantity?: number | null;
  maxQuantity?: number | null;
  isQuantityEditable?: boolean;
}

export interface ConfiguratorComponent {
  id: string;
  name: string;
  description?: string;
  nodeType: string;
  isConfigurable: boolean;
  attributeCategories: ConfiguratorAttributeCategory[];
  prices: ConfiguratorPrice[];
  productComponentGroups: ConfiguratorProductComponentGroup[];
  productRelatedComponent?: ConfiguratorProductRelatedComponent;
  /** Switched off by an active DisableProduct/HideProduct configuration rule for this bundle. */
  ruleDisabled?: boolean;
  ruleMessage?: string | null;
}

export interface ConfiguratorProductComponentGroup {
  id: string;
  name: string;
  sequence: number;
  minBundleComponents: number | null;
  maxBundleComponents: number | null;
  components: ConfiguratorComponent[];
}

export interface ConfiguratorMessage {
  category: string;
  message: string;
  messageType: string;
  relatedRecordId?: string;
}

export interface ConfiguratorResponse {
  success: boolean;
  errors: Array<{ code?: string; message: string }>;
  messages: Record<string, ConfiguratorMessage[]>;
  catalogProducts: ConfiguratorComponent[];
  transactionContextId?: string;
}

interface RestErrorBody {
  errorCode?: string;
  message: string;
}

export class SalesforceRestError extends Error {
  code: string;
  retryable: boolean;
  constructor(message: string, code = "SALESFORCE_API_ERROR", retryable = false) {
    super(message);
    this.code = code;
    this.retryable = retryable;
  }
}

/**
 * Thin REST client for everything the salesforce-revenue adapter needs: plain SOQL/sobject CRUD
 * plus the one Product Configurator Connect resource that's actually enabled in this org
 * (see /docs/api-spike-findings.md). No caching, no retries beyond what the caller does --
 * this exists to keep every other file free of fetch/URL-building details.
 */
export class SalesforceClient {
  private instanceUrl: string;
  private sessionId: string | undefined;
  private apiVersion: string;

  constructor(config: SalesforceClientConfig = {}) {
    this.instanceUrl = (config.instanceUrl ?? "").replace(/\/$/, "");
    this.sessionId = config.sessionId;
    this.apiVersion = config.apiVersion ?? "v67.0";
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.instanceUrl}${path}`, {
      ...init,
      credentials: this.sessionId ? undefined : "include",
      headers: {
        ...(this.sessionId ? { Authorization: `Bearer ${this.sessionId}` } : {}),
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
    const text = await res.text();
    const body: unknown = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const errors = Array.isArray(body) ? (body as RestErrorBody[]) : [body as RestErrorBody];
      const first = errors[0];
      throw new SalesforceRestError(first?.message ?? `Salesforce API error (${res.status})`, first?.errorCode ?? `HTTP_${res.status}`, res.status >= 500);
    }
    return body as T;
  }

  async query<T = Record<string, unknown>>(soql: string): Promise<T[]> {
    const path = `/services/data/${this.apiVersion}/query/?q=${encodeURIComponent(soql)}`;
    const result = await this.request<{ records: T[] }>(path);
    return result.records;
  }

  async sobjectCreate(type: string, fields: Record<string, unknown>): Promise<string> {
    const result = await this.request<{ id: string; success: boolean }>(`/services/data/${this.apiVersion}/sobjects/${type}`, {
      method: "POST",
      body: JSON.stringify(fields),
    });
    return result.id;
  }

  async sobjectUpdate(type: string, id: string, fields: Record<string, unknown>): Promise<void> {
    await this.request<void>(`/services/data/${this.apiVersion}/sobjects/${type}/${id}`, {
      method: "PATCH",
      body: JSON.stringify(fields),
    });
  }

  async sobjectDelete(type: string, id: string): Promise<void> {
    await this.request<void>(`/services/data/${this.apiVersion}/sobjects/${type}/${id}`, { method: "DELETE" });
  }

  async configuratorConfigure(input: ConfiguratorInput): Promise<ConfiguratorResponse> {
    return this.request<ConfiguratorResponse>(`/services/data/${this.apiVersion}/connect/cpq/configurator/actions/configure`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }
}
