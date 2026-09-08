# Revenue Cloud Trail Gap Analysis

_Research date: 2026-09-08. Trailhead now labels Revenue Cloud as **Agentforce Revenue Management**. This audit uses only the current unit bodies returned by the official Trailhead MCP server, plus this checkout's source and docs._

## Scope and method

The trail [`prepare-for-your-salesforce-revenue-cloud-consultant-exam`](https://trailhead.salesforce.com/content/learn/trails/prepare-for-your-salesforce-revenue-cloud-consultant-exam) contains external reference links and 23 modules. Every one of the 23 modules was fetched with `fetch_content(maxUnits: 50)`: 79 units in total, with no module truncated. “Objects” below are named only when Trailhead named them; Trailhead generally uses UI/business labels rather than API names. A missing API name is explicitly marked instead of inferred.

Repository coverage is based on the 19 definitions in `packages/revenue-mcp/src/toolCatalog.ts`, including the seven `catalogToolNames`, and on the actual Salesforce gateway. The gateway declares/uses `Account`, `Asset`, `Product2`, `Pricebook2`, `PricebookEntry`, `Opportunity`, `Quote`, `QuoteLineItem`, and `ProductRelatedComponent`; it also resolves `ProductRelationshipType` and invokes seven `quotingAI__...` Flow actions. “Covered” means a user-facing tool performs the Trailhead capability, not merely that an adjacent object is queried.

## Trail summary

| Trail module | Key features taught | Overall coverage |
|---|---|---|
| [Agentforce Revenue Management Foundations](https://trailhead.salesforce.com/content/learn/modules/revenue-lifecycle-management-foundations) | Product-to-cash, catalog/configurator/pricing/rating, CPQ, assets, contracts, orchestration, invoicing | **Partial** |
| [Agentforce Revenue Management Design](https://trailhead.salesforce.com/content/learn/modules/revenue-cloud-design) | Shared catalog, qualification rules, context, configuration, pricing procedures, decision tables, orders, billing | **Partial** |
| [Context Service Basics](https://trailhead.salesforce.com/content/learn/modules/context-service-basics) | Context definitions, mappings, tags, nodes, runtime context | **Not covered** |
| [Omnistudio Basics](https://trailhead.salesforce.com/content/learn/modules/omnistudio-basics) | FlexCards, OmniScripts, Integration Procedures, Data Mappers | **Not covered** |
| [Business Rules Engine](https://trailhead.salesforce.com/content/learn/modules/business-rules-engine) | Decision matrices, decision tables, expression sets, explanations and workflow invocation | **Not covered** |
| [Salesforce Adoption Strategies](https://trailhead.salesforce.com/content/learn/modules/salesforce-adoption-strategies) | Executive sponsorship, process discovery, pilots, training, feedback and adoption metrics | **Not covered** (implementation practice, not a data tool) |
| [User Acceptance Testing](https://trailhead.salesforce.com/content/learn/modules/user-acceptance-testing-video) | End-user UAT in a sandbox/test environment | **Not covered** (delivery practice, not a data tool) |
| [Product Catalog Management: Quick Look](https://trailhead.salesforce.com/content/learn/modules/product-catalog-management-quick-look) | Catalog/category hierarchy, attributes, classifications, bundles, selling models, qualification | **Partial** |
| [Product Catalog Management with Agentforce Revenue Management](https://trailhead.salesforce.com/content/learn/modules/product-catalog-management-with-revenue-cloud) | Categories, attributes, picklists, classifications, simple products, bundle cardinality, indexing | **Partial** |
| [Product Configuration with Agentforce Revenue Management](https://trailhead.salesforce.com/content/learn/modules/product-configuration-with-revenue-cloud) | Configurator flows, configuration rules, BRE and constraint rules engines, third-party configurators | **Partial** |
| [Salesforce Pricing: Quick Look](https://trailhead.salesforce.com/content/learn/modules/salesforce-pricing-quick-look) | Pricing Designer, rules/procedures, waterfall, integrations | **Partial** |
| [Price Management with Agentforce Revenue Management](https://trailhead.salesforce.com/content/learn/modules/price-management-with-revenue-cloud) | List price, adjustment schedules/tiers, manual, volume, attribute- and bundle-based pricing | **Partial** |
| [Advanced Price Management with Agentforce Revenue Management](https://trailhead.salesforce.com/content/learn/modules/advanced-price-management-with-revenue-cloud) | Derived/discovery, subscription/proration, aggregate, contract-based pricing | **Not covered** |
| [Efficient Sales with Agentforce Revenue Management](https://trailhead.salesforce.com/content/learn/modules/efficient-sales-with-revenue-cloud) | Product discovery/configuration, quote line editor/grouping, quote-to-order and assetization | **Partial** |
| [Usage Management Foundations](https://trailhead.salesforce.com/content/learn/modules/usage-management-foundations) | Usage modeling/selling, rates, wallets, consumption, summaries | **Not covered** |
| [Salesforce Contracts Foundations](https://trailhead.salesforce.com/content/learn/modules/salesforce-contracts-foundations) | Contract generation, negotiation, approval, signature and collaboration | **Not covered** |
| [Deep Dive into Salesforce Contracts](https://trailhead.salesforce.com/content/learn/modules/deep-dive-into-salesforce-contracts) | Contract types/states/actions, documents, obligations, analytics | **Not covered** |
| [Generative AI for Salesforce Contracts](https://trailhead.salesforce.com/content/learn/modules/generative-ai-for-salesforce-contracts) | AI clause drafting and legacy-contract extraction/digitization | **Not covered** |
| [Dynamic Revenue Orchestrator Foundations](https://trailhead.salesforce.com/content/learn/modules/dynamic-revenue-orchestrator-foundations) | Order decomposition, orchestration plans, SLAs/jeopardy, fallout, monitoring | **Not covered** |
| [Simple Order Orchestration with Agentforce Revenue Management](https://trailhead.salesforce.com/content/learn/modules/simple-order-orchestration-with-revenue-cloud) | Workspace, steps/groups/dependencies, scenarios, plan execution | **Not covered** |
| [Complex Order Decomposition and Orchestration with Agentforce Revenue Management](https://trailhead.salesforce.com/content/learn/modules/complex-order-decomposition-and-orchestration-with-revenue-cloud) | Technical products, decomposition/execution rules, lanes and cross-lane dependencies | **Not covered** |
| [Asset Lifecycle Management with Agentforce Revenue Management](https://trailhead.salesforce.com/content/learn/modules/asset-lifecycle-management-with-revenue-cloud) | Managed-asset view, amendments, renewals, cancellations, upsell | **Partial** |
| [Billing Basics in Agentforce Revenue Management](https://trailhead.salesforce.com/content/learn/modules/billing-basics-in-revenue-cloud) | Billing schedules, tax, invoicing, payments, credits, collections, accounting and dashboards | **Not covered** |

## Complete module and unit inventory

Unit names below are the unit slugs returned in fetched content, rendered as titles. Where the assembled content exposed no unit slug, the first substantive unit heading is shown in brackets; the fetched unit count is still authoritative.

1. **Agentforce Revenue Management Foundations** (3): Meet Revenue Lifecycle Management; Explore Revenue Lifecycle Management; [Target Personas].
2. **Agentforce Revenue Management Design** (5): Set Up Your Product Offerings; Define Your Product Configuration Experience; Configure Pricing for Products; Manage Orders; Generate Invoices.
3. **Context Service Basics** (2): Get to Know Context Service; Explore Context Service Components and Processes.
4. **Omnistudio Basics** (3): Get Started with Omnistudio; Discover the Omnistudio Digital Suite; Explore Omnistudio Use Cases.
5. **Business Rules Engine** (4): Get to Know Business Rules Engine; Build Decisions with Lookup Tables; Orchestrate Rules with Expression Sets; Automate Business Processes.
6. **Salesforce Adoption Strategies** (5): Accelerate Salesforce Adoption; [Adoption Starts Now]; [Build in Adoption as You Build Salesforce]; [This Is the Big Show]; [Keep the Party Going].
7. **User Acceptance Testing** (1): [Learn from an Expert].
8. **Product Catalog Management: Quick Look** (1): Discover Product Catalog Management.
9. **Product Catalog Management with Agentforce Revenue Management** (5): Get Started with Product Catalog Management; Create Product Categories and Attributes; Work with Product Classifications; Build a Simple Product; Create a Product Bundle.
10. **Product Configuration with Agentforce Revenue Management** (4): Get Started with Product Configurator; Create and Configure a Product Configurator Flow; Use Product Configurator with Business Rules Engine; Explore Product Configurator with Constraint Rules Engine.
11. **Salesforce Pricing: Quick Look** (1): Discover Salesforce Pricing.
12. **Price Management with Agentforce Revenue Management** (5): Explore Salesforce Pricing; Create a Pricing Procedure with the List Price Element; Add Volume and Manual Discounts; Implement Attribute-Based Pricing; Set Up Bundle-Based Pricing.
13. **Advanced Price Management with Agentforce Revenue Management** (5): Explore Derived Pricing and Discovery Procedures; Implement Derived Pricing; Set Up Subscription Pricing with Proration; Apply Aggregate Pricing; Configure Contract-Based Pricing.
14. **Efficient Sales with Agentforce Revenue Management** (4): Get Started with Transaction Management; Discover and Configure Products; Work with Quotes; Create and Fulfill Orders.
15. **Usage Management Foundations** (4): [Get Started with Usage Management]; Explore Components and Personas; [Build Your Usage Strategy]; Manage Wallets and Track Consumption.
16. **Salesforce Contracts Foundations** (4): Meet Salesforce Contracts; Dive into Salesforce Contracts Capabilities; Collaborate with Salesforce Contracts; [Digital Transformation at Cloud Kicks].
17. **Deep Dive into Salesforce Contracts** (4): Explore Contract Types, Actions, and Lifecycle States; Create, Update, and Manage Contracts; Track and Manage Obligations; Analyze and Visualize Contract Data.
18. **Generative AI for Salesforce Contracts** (3): Discover Contracts AI; Explore Smart Clause Generation; Digitize Legacy Contracts.
19. **Dynamic Revenue Orchestrator Foundations** (3): Meet Dynamic Revenue Orchestrator; Discover Order Decomposition; Explore Order Orchestration.
20. **Simple Order Orchestration with Agentforce Revenue Management** (2): Design a Simple Order Orchestration; Configure and Execute a Simple Order Orchestration.
21. **Complex Order Decomposition and Orchestration with Agentforce Revenue Management** (4): Define an Order Decomposition; Design an Orchestration Plan; Define Dependencies and Fulfillment Scenarios; Execute an Orchestration Plan.
22. **Asset Lifecycle Management with Agentforce Revenue Management** (4): Build Loyalty Through Post-Sale Engagement; Provide Post-Sales Support; Manage Customer Asset Amendments; Manage Customer Asset Renewals and Cancellations.
23. **Billing Basics in Agentforce Revenue Management** (3): Get Started with Billing in Revenue Cloud; [Fancy Capabilities]; Navigate the Full Billing Lifecycle.

## What is covered today

| Trailhead capability | Status | Existing implementation |
|---|---|---|
| Account discovery/context | **Covered** | `find_account`, `get_account_revenue_context`; `Account` plus assets. |
| Basic product records and discovery | **Covered** | `search_products`, `create_product`, `update_product`; `Product2`. |
| Standard list price | **Covered** | `search_products`, `set_product_price`; Standard `Pricebook2`/`PricebookEntry`. |
| Basic bundle structure/cardinality | **Covered** | `get_bundle_structure`, `add_bundle_component`, `update_bundle_component`, `remove_bundle_component`; `ProductRelatedComponent` and resolved `ProductRelationshipType`. Min/max, required/default, sequence and group ID are surfaced. |
| Quote creation and line editing | **Covered** | `create_initial_quote`, `add_quote_line`, `update_quote_line`, `remove_quote_line`, `get_quote_summary`; `Opportunity`, `Quote`, `QuoteLineItem`, and Flow actions. |
| Manual line discount | **Covered** | `apply_discount`; Flow action plus local confirmation/manager-name policy (over 15% requires an approver; over 25% rejected). This is demo policy, not inspection of Revenue Management pricing/approval records. |
| Renewal and amendment quote creation | **Covered** | `create_renewal_quote`, `create_amendment_quote`; lifecycle Flow actions. |
| Asset lookup | **Covered** | `get_account_assets`/`get_account_revenue_context`; Flow action and `Asset`. |

The docs reinforce the deliberate narrowness: read calls require no confirmation, writes are confirmation/idempotency gated, catalog mutations use a separate architect-mode/API-key scope, and arbitrary SOQL is explicitly avoided. The native Agentforce spec exposes only the 12 non-catalog actions and says architect-mode catalog actions are out of scope there.

## Partial and uncovered capabilities

### Product-to-cash and Transaction Management — Partially covered

Trailhead presents one lifecycle from catalog and pricing through quote, contract, order, fulfillment, asset and invoice. The repo implements product/quote/line actions and some asset lifecycle entry points, but it cannot create or inspect contracts, orders, fulfillment, invoices or payments; consequently it cannot demonstrate or explain an end-to-end transaction. Trailhead names products, quotes, orders, contracts, assets and invoices but does not state API names here. **Tool shape:** mostly read-only inspection first; progression/creation requires mutations.

### Catalogs, categories and hierarchy — Partially covered

Product Catalog Management makes a catalog the organized source of truth, with category/subcategory hierarchy and product-to-category assignments. The repo queries `Product2` but has no catalog/category list, hierarchy or assignment tools; it therefore models a product list, not the shared catalog Trailhead teaches. No API names are stated in the fetched units. **Tool shape:** read-only list/inspect tools are sufficient for a strong first addition; maintenance requires mutation.

### Dynamic attributes, attribute categories, picklists and classifications — Not covered

Trailhead describes reusable dynamic attributes grouped into attribute categories, picklists for allowed values, and product classifications as templates whose products inherit attributes (with overrides). None is queried or mutated. No API names are stated. **Tool shape:** read-only inspection of a product/classification’s inherited and overridden attributes is immediately useful; authoring is mutation-heavy.

### Product selling models — Partially covered

Trailhead distinguishes one-time, term-defined and evergreen selling models, and permits multiple selling models per product. `add_quote_line` calls `quotingAI__getProdtSellModelForPrdct`, but no tool lists or explains models/options and `search_products` does not expose them. Trailhead names Product Selling Model but supplies no API name. **Tool shape:** read-only list/inspect.

### Qualification rules and product visibility — Not covered

Qualification rules qualify/disqualify products or categories for a context such as account attributes or geography. The design module shows a qualification procedure using context definitions and decision tables; the repo’s product search simply filters active `Product2` records by name. No API names are stated. **Tool shape:** inspect active rules and evaluate/explain visibility are read-friendly; rule authoring is mutation.

### Product Configurator flows and configuration rules — Partially covered

Trailhead’s configurator customizes attributes and bundle choices through assigned configuration flows. Rules can include/exclude, recommend, require or validate selections at product, bundle or transaction scope. The repo can read/change component cardinality, but does not run a configurator flow, expose assignments, evaluate rules, or validate a configuration. No API names are stated. **Tool shape:** list flows/rules and validate/explain a proposed configuration are read-like; flow/rule authoring is mutation.

### Constraint Rules Engine and third-party configurators — Not covered

Trailhead contrasts rules-based configuration with constraint models/interfaces that solve combinations of choices, and notes third-party configurator integration. The repo has no constraint model, interface, constraint, solver or integration surface. No API names are stated. **Tool shape:** inspect active models/constraints is read-only; model creation and external integration require mutation/configuration.

### Context Service — Not covered

Context Service abstracts source data into a logical data model. Trailhead teaches context definitions and versions, nodes, attributes, mappings and tags, then runtime context creation/updates so processes such as qualification, configuration, pricing and billing share consistent inputs. Nothing in the tool catalog touches it and no API names are stated. **Tool shape:** list/inspect a context definition, version, nodes and mappings is an excellent low-risk read surface; version design/activation is mutation.

### Business Rules Engine decision matrices and decision tables — Not covered

Decision matrices are purpose-built lookup tables for multidimensional rules; decision tables use Salesforce/external record data and conditions to return outcomes. Trailhead includes versioning, activation/simulation and explanation of results, and shows them callable from Flow, OmniScripts, Integration Procedures and Connect APIs. No API names are stated. **Tool shape:** list definitions/versions, inspect inputs/outputs, and simulate/explain are read-oriented; create/version/activate is mutation.

### Expression sets — Not covered

Expression sets orchestrate matrices/tables with calculations, conditions, branching and aggregation, using variables/constants and version date/rank. They can expose decision explanations and simulation JSON. No API names are stated. **Tool shape:** inspect graph/version and simulate/explain are read-friendly; authoring/activation is mutation.

### OmniStudio — Not covered

Trailhead teaches FlexCards (UI), OmniScripts (guided interactions), Integration Procedures (server-side orchestration) and Data Mappers (data transformation), including BRE invocation. These are absent from the repo and are adjacent platform capabilities rather than Revenue objects. No metadata API names are stated. **Tool shape:** metadata inventory is read-only but less central to this headless demo; executing or changing flows is broader work.

### Pricing procedures, elements and Pricing Designer — Not covered

Trailhead’s pricing procedure is the ordered, versioned calculation pipeline. Elements include Pricing Settings, List Price, Manual/Volume Discount, Attribute Based Price, Bundle Based Price, Derived Price, Proration, Subscription Pricing, Aggregate Price, List Group and other calculations; procedures are simulated before activation. `set_product_price` only changes one Standard Price Book entry and `apply_discount` applies one line discount, so neither exposes the procedure. No API names are stated. **Tool shape:** list/inspect active procedure versions and their ordered elements is read-only; design/activation is mutation.

### Pricing waterfall and explainability — Not covered

Trailhead says the pricing waterfall shows each adjustment from starting/list price to final price and provides pricing transparency; the same idea appears as a rating waterfall for usage rates. `get_quote_summary` returns only quantity, discount and total, with no calculation steps, rule provenance or explanation. No API names are stated. **Tool shape:** a quote-line pricing explanation is an ideal read-only tool.

### Price adjustment schedules and tiers — Partially covered

Trailhead defines quantity, range and tier-based schedules, including volume discount tiers. The repo supports only a direct manual percentage and Standard Price Book unit price; it cannot list or apply schedule-driven adjustments. No API names are stated. **Tool shape:** list schedule/tier details by product is read-only; creation and attachment require mutation.

### Attribute- and bundle-based pricing — Not covered

Trailhead adjusts prices from price-impacting attribute values and bundle composition. Bundle records exist in the repo, but no pricing rule refers to their attributes/components. No API names are stated. **Tool shape:** inspect applicable adjustments and explain their match is read-only; configuration is mutation.

### Derived pricing and discovery procedures — Not covered

Derived pricing calculates one product’s price from another product or source record; discovery procedures locate and transform the source data before the pricing procedure uses it. The repo has no derived price records, discovery procedure, or corresponding pricing elements. No API names are stated. **Tool shape:** inspect dependencies/source discovery and simulate is read-oriented; setup is mutation.

### Subscription pricing and proration — Not covered

Trailhead applies subscription pricing across a term and uses proration policies/elements for partial periods. The repo’s quote summary schema mentions a term, and it can renew/amend, but it does not query subscription, billing frequency, proration policy or calculated proration. No API names are stated. **Tool shape:** inspect selling model, term and proration breakdown is read-only; subscription changes are mutations.

### Aggregate pricing — Not covered

Aggregate pricing totals child products, groups or transaction values so downstream pricing can use a consolidated amount. The repo can list bundle children but does not calculate or expose aggregate pricing elements. No API names are stated. **Tool shape:** read/simulate/explain first; authoring is mutation.

### Contract-based pricing — Not covered

Trailhead stores negotiated customer pricing as Contract Item Prices with Contract Item Price Adjustment Tiers, then uses List Group/List Price logic in a pricing procedure. No contract or contracted-price object is queried. The fetched content gives these object labels but not API names. **Tool shape:** list effective contracted prices and tiers for an account/product is read-only; creation/renewal is mutation.

### Rate Management — Not covered

Rate cards and rate-card entries define tier/volume rates for consumption; rating procedures calculate net rate and a rating waterfall debugs the result. None is present. No API names are stated. **Tool shape:** list rate cards/entries and explain a rate is read-oriented; rate authoring is mutation.

### Usage modeling and usage selling — Not covered

Trailhead models sellable anchor products, usage resources, units of measure, tracking methods, entitlement/grant policies and rating, then sells them through CPQ. Product search cannot distinguish or explain usage resources or entitlements. No API names are stated. **Tool shape:** list/inspect product usage definitions and entitlements is read-only; setup/sale is mutation.

### Wallet and Consumption Management — Not covered

Wallets track grants/balances and consumption; Consumption Management captures usage data, generates invoice-ready summaries and runs standard flows. The repo has no wallet, balance, usage event or summary tools. No API names are stated. **Tool shape:** balance, transaction and usage-summary inspection is read-only; ingestion, adjustment and grant operations mutate.

### Quote line editor, grouping and full price detail — Partially covered

Trailhead’s Transaction Line Editor supports spreadsheet-style editing, grouping, personalization, configuration and price detail. The repo can add/remove lines, change quantity, discount and retrieve a basic summary, but cannot group lines, edit dates/attributes, or show detailed pricing. It uses `Quote` and `QuoteLineItem`. **Tool shape:** richer quote inspection is read-only; grouping/attribute/date edits are mutation.

### Quote-to-order conversion and order capture — Not covered

Trailhead creates orders from quotes or directly, edits Order Products, submits/activates orders and then creates assets. The repo creates quotes but no order tool or `Order`/Order Product query. No API names are stated by Trailhead. **Tool shape:** list/inspect order and status is read-only; conversion, edit, submission and activation are mutations.

### Asset lifecycle view — Partially covered

Trailhead’s managed-assets page supplies an install-base view for post-sale service, recurring revenue, upsell and lifecycle actions. `get_account_assets` returns `Asset` ID/name/product/quantity/status, but the gateway explicitly leaves `quoteId` and `quoteLineId` null and provides no dates, selling model, recurring-revenue or lifecycle history. **Tool shape:** enrich the existing read; lifecycle actions are mutations.

### Amendments and renewals — Partially covered

Trailhead schedules amendments, changes quantities/products/dates, sets renewal terms and creates/activates amendment or renewal orders. The repo creates amendment/renewal **quotes** through Flow actions, but cannot schedule them, inspect deltas/terms, create or activate resulting orders, or update assets. **Tool shape:** delta/eligibility/history inspection is read-only; completion is mutation.

### Cancellations — Not covered

Trailhead creates cancellation requests and cancellation orders and activates them against managed assets. There is no cancellation tool. No API names are stated. **Tool shape:** inspect eligibility/impact is read-only; request/order creation and activation mutate.

### Salesforce Contracts lifecycle — Not covered

Trailhead covers contract types, state models, dynamic actions, creation from quote/order, template-driven document generation, internal/external negotiation and redlining, approval, e-signature, activation, amendment and renewal. The repo never queries or mutates contracts or documents. Trailhead names Contract records/documents but gives no API names. **Tool shape:** list/inspect contract status, parties, dates and linked quote/order is read-only; generation, negotiation, approval and signature require mutation/external actions.

### Contract obligations and analytics — Not covered

Obligation Management creates and tracks contractual commitments, owners, dates and fulfillment to reduce risk. Contracts Analytics provides role-based dashboards for status, targets and obligation performance. Neither exists in the repo; no API names are stated. **Tool shape:** obligation and KPI inspection is read-only; obligation maintenance is mutation.

### Contracts AI — Not covered

Contracts AI drafts clauses from prompts/context and extracts key terms/clauses from legacy documents to create digital records. The repo has no generative contract or document-ingestion capability. No API names are stated. **Tool shape:** reviewing extracted/drafted output can be read-like, but generation, upload and record creation mutate and introduce higher document/AI risk.

### Dynamic Revenue Orchestrator: decomposition — Not covered

Trailhead decomposes commercial order items into technical products/fulfillment functions using decomposition relationships, scopes, conditional decomposition rules and execution rules. No order, technical-product or rule surface exists. No API names are stated. **Tool shape:** inspect how an order decomposed and which rules fired is read-only; technical-product/rule design is mutation.

### Dynamic Revenue Orchestrator: plans and fulfillment — Not covered

Fulfillment Workspaces define orchestration plans with lanes, step groups, steps, dependencies and product fulfillment scenarios; submitted orders instantiate fulfillment plans. The repo cannot inspect any of these. No API names are stated. **Tool shape:** inspect plan/step graph and live fulfillment progress is read-only; plan design and step completion/retry are mutations.

### SLA/jeopardy, fallout and fulfillment monitoring — Not covered

Trailhead monitors deadlines, flags jeopardy, handles failed (“fallout”) steps, and lets operators retry/complete work. No status or exception tool exists. No API names are stated. **Tool shape:** a read-only exception/status list is high-value; retry/complete changes state.

### Billing setup and invoice generation — Not covered

Trailhead covers invoicing criteria, billing profiles, invoice previews, invoice schedulers, billing schedules/groups, suspend/resume, payment terms, legal entities and generation after fulfillment. The repo does not touch billing or invoices. No API names are stated. **Tool shape:** billing-account/schedule/invoice preview and status inspection is read-only; generation and schedule changes mutate.

### Tax, accounting and post-invoice operations — Not covered

Trailhead includes tax policies/calculation across legal/tax entities, accounting periods and chart of accounts, then payments, credit memos, collections and write-offs. Billing dashboards/console expose operational performance. None is implemented and no API names are stated. **Tool shape:** invoice/tax/payment/credit/collections inspection is read-only; payment application, credits and write-offs are sensitive mutations.

### Revenue intelligence and dashboards — Not covered

The foundations module calls out embedded analytics, AI and revenue lifecycle intelligence; contract and billing modules teach specialized dashboards. The repo has per-record lookup only and no aggregate KPI/analytics tools. No API names are stated. **Tool shape:** read-only KPI summaries, provided access controls and aggregation are carefully scoped.

### Adoption strategy and UAT — Not covered (process capabilities)

Trailhead treats executive sponsorship, current-process documentation, pilot selection, launch communications, training, recognition, feedback/usage metrics and end-user UAT in sandbox/test environments as implementation essentials. They do not map cleanly to Revenue Cloud records and are outside the repo’s action-agent purpose. **Tool shape:** no recommended Salesforce CRUD tool; these belong in implementation checklists, telemetry and test/evaluation practice.

## Recommended next additions

These prioritize visible Revenue Management depth, read-only safety, and the repo’s existing small typed SOQL-tool pattern. Exact org object/API names must be confirmed through Salesforce schema describe before implementation because the fetched Trailhead units mostly provide labels, not API names.

1. **`explain_quote_line_price`** — Return the pricing waterfall for one quote line: ordered adjustments, rule/element source, input/output amounts and final net price. This directly closes the demo’s largest credibility gap (a “Revenue Agent” that can apply a discount but cannot explain Salesforce Pricing) while remaining read-only.
2. **`get_pricing_procedure`** — Inspect the active pricing procedure/version and ordered elements used for a product or quote. It makes Pricing Designer, manual/volume/attribute/bundle/subscription/proration logic visible without allowing rule edits.
3. **`get_product_configuration`** — Extend the `get_bundle_structure` idea to return product classifications, dynamic attributes/values, selling-model options, configurator-flow assignment and applicable configuration/qualification rules. If one query cannot safely span the graph, split it into `get_product_attributes` and `get_product_rules` rather than creating a generic query tool.
4. **`get_revenue_order_status`** — Inspect the order created from a quote, Order Products, activation state, assetization status and linked fulfillment plan. This bridges today’s quote demo to the order-to-cash story without mutating fulfillment.
5. **`get_fulfillment_plan`** — Return decomposition outputs, lanes/steps/dependencies, current status, SLA/jeopardy and fallout for one order. It showcases Dynamic Revenue Orchestrator especially well as a compact read-only graph/status response.
6. **`get_billing_summary`** — For an order/account, return billing schedule, invoice status/totals, tax summary, payment state and credits. This gives the demo an end-to-end stopping point; keep payment, credit memo, write-off and invoice-generation mutations out of the initial version.

Decision tables/context definitions are also strong read candidates, especially `list_decision_tables` and `get_context_definition`. They rank just below the six above because a raw inventory is less compelling than connecting pricing/configuration explanations to a customer transaction; they become the natural follow-on once the procedure/waterfall tools can reference them.

## Audit conclusion

ConsultantCloud is strong within its deliberately narrow slice: governed account/product discovery, basic catalog and bundle maintenance, quote/line work, manual discounts, basic assets, and renewal/amendment quote initiation. Against the certification trail, however, it covers the transaction’s front edge rather than Revenue Management as a whole. The most consequential gaps are pricing rules/explainability, contextual catalog/configuration, quote-to-order/fulfillment, contracts, usage/rating, and billing. Read-only inspection tools can expose much of that value without weakening the codebase’s existing confirmation and scoped-mutation safety model.
