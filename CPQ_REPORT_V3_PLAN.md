# CPQ -> Revenue Management Assessment v3: implementation plan

## Executive summary

The existing report is a sound, deterministic configuration inventory, but it is not yet a full migration assessment. Its six read-only inspectors cover Price Rules, Discount Schedules, Product Rules, QCP/custom scripts, catalog structure, and Twin Fields. The report layer then applies a fixed target-mapping table, a small rules-based complexity rubric, and a fixed configuration-first sequence. The live product runs all six inspectors concurrently through one query route, passes their complete result object to a synthesis route, and renders the resulting Markdown in a modal. This architecture can be extended, but the query payload, execution time, result limits, partial-failure behavior, and UI language will all need deliberate redesign as metadata and transactional coverage grow.

The highest-value first move is the disposition and readiness reframing. It uses existing evidence, removes the current overconfident “X maps to Y” framing, and creates the report contract into which later inspectors can plug. It should be Phase 1. The numeric score must initially be labeled **provisional** and paired with an **assessment coverage** percentage; missing installed-base, integration, data, reporting, and testing evidence must not silently become either a passing score or a zero.

Recommended delivery order:

| Phase | Scope | Why now |
|---|---|---|
| 0 — schema and evidence spike | Verify every new source object/field and Tooling/Metadata API capability in the actual CPQ org; record permissions, row volumes, pagination behavior, and unavailable sources | Preserves the project's “describe before code” discipline and prevents plans from hardening guessed API names into implementation |
| 1 — assessment contract and executive report | Disposition model, provisional readiness score plus coverage, redesigned first page, top risks/opportunities, confidence/evidence labels, and replacement of fixed week-by-week language | Low cost, high visible value, no new Salesforce schema dependency; establishes common output types for all later work |
| 2 — transactional and catalog evidence | Installed base/renewals, selling-model inference, and a bounded first version of usage analytics | Highest architectural gap and strong customer value; mostly SOQL after live verification; creates evidence needed by later disposition and dependency decisions |
| 3 — customization impact | Apex/Flow/automation scanner and custom-field intelligence, backed by a normalized metadata reference index | High-value blocker detection; both areas should share metadata retrieval, parsing, and reference-classification infrastructure |
| 4 — graph and ecosystem impact | Full dependency graph, integration impact, and reporting impact | These become materially better after Phases 2 and 3 supply transaction, field, and automation nodes; metadata access and attribution are more complex |
| 5 — validation and productization | Calibrate scoring on multiple real orgs, seed a representative demo dataset, generate regression scenarios, add coexistence/cutover prompts, scale API execution, and verify target-side recommendations against the licensed Revenue Management release | Prevents a broad but uncalibrated scanner from presenting false precision; turns findings into a repeatable assessment product |

Phase 2 can be split into 2A (installed base and selling model) and 2B (usage analytics) if delivery time is constrained. Phase 3 can run automation and custom-field work in the same release because they rely on the same metadata corpus. The dependency graph should not be built first: a graph of only today’s six configuration families would look impressive but omit most of the blast radius the feature is intended to expose.

## Cross-cutting implementation principles

### Source verification gate

Before implementation, run read-only `describe`/Tooling describes against the live org and store a schema-capability manifest for the org and API version. For each proposed query, confirm object availability, queryability, field API name, type, relationship name, filterability, and permissions. The 219 verified `SBQQ__` objects and fields already used by the six inspectors remain ground truth; nothing beyond that set is treated as verified here.

Metadata coverage needs a separate capability check. Tooling API queryability is not the same as Metadata API retrievability, and neither guarantees visibility under the connected user's permissions. Phase 0 should test `ApexClass`, `ApexTrigger`, the org's available Flow entities, `ValidationRule`, and `MetadataComponentDependency`, then test Metadata API/listMetadata/retrieve for component types that Tooling does not expose fully. Absence caused by permissions or unsupported retrieval must be reported as **not assessed**, never “none found.”

### Evidence and confidence model

Every finding should carry `source`, `evidence`, `observedAt`, `confidence`, and `limitations`. Use three evidence classes:

- **Observed**: direct record, field definition, metadata component, or explicit dependency.
- **Inferred**: correlation or static string/reference match, such as selling behavior inferred from CPQ fields and quote-line history.
- **Declared**: questionnaire/input needed for facts the org cannot reliably reveal, such as business criticality, external ownership, contractual cutover constraints, or licensing plans.

The report must distinguish zero records from unavailable, unauthorized, truncated, capped, and not-yet-inspected results. Existing hard limits (for example 100 active products, 200 options, and 50 rules) are suitable for samples but not for assessment totals. New work should use aggregate counts and paginated/query-more detail retrieval, with explicit completeness metadata.

### Shared acquisition architecture

Do not make one large inspector that performs every query. Keep bounded read-only inspectors, but add shared services for schema capability checks, pagination, metadata retrieval, reference extraction, and stable finding IDs. The current query route launches all tools in parallel under a 30-second maximum and returns all raw data to the browser before posting it back to synthesis. Transactional and metadata scans may exceed that envelope and may expose source bodies unnecessarily. Plan to move toward server-side analysis state or a job/result token, bounded concurrency, progress by domain, and a compact normalized result passed to report assembly. Preserve per-inspector partial failure.

No source bodies, credentials, tokens, Named Credential secrets, or customer transaction details should appear in raw UI output. Store excerpts only when needed for evidence and redact string literals likely to contain endpoints or sensitive values.

## Phase 1: readiness scoring and disposition reframing

### Recommendation

This should be Phase 1. It is the cheapest high-payoff change, touches the existing deterministic report logic rather than Salesforce schema, and corrects the product's framing before new inventory makes the old “mapping” table larger and more misleading.

Replace each mapping row with an assessment item containing:

| Field | Meaning |
|---|---|
| Identity and category | Stable item ID, source type/name, domain, and related component IDs |
| Business intent | Plain-English statement; deterministic where structured evidence supports it, otherwise explicitly inferred or requiring confirmation |
| Disposition | `DIRECT`, `TRANSFORM`, `REDESIGN`, `RETIRE`, `INVESTIGATE`, or `BLOCKED` |
| Suggested target | Candidate target pattern, not a guarantee; target release/licensing verification status included |
| Current and target complexity | Separate ratings, because simple CPQ structure can still require difficult target redesign |
| Risk and criticality | Technical migration risk separated from business impact |
| Confidence and evidence | Observed/inferred/declared evidence with High/Medium/Low confidence |
| Recommendation | Action focused on preserving or simplifying business intent, not cloning CPQ structure |
| Dependencies | Prerequisite items, blockers, and affected downstream nodes |

Disposition rules should be conservative and deterministic:

- `DIRECT`: source semantics and a supported target construct are verified, only value/record transfer and validation are needed, and no redesign trigger is present. Do not use merely because object shapes look similar.
- `TRANSFORM`: intent and target are known, but fields, hierarchy, expressions, or data shape must be converted.
- `REDESIGN`: business intent remains required but the implementation paradigm changes materially; QCP and many quote-scoped patterns will normally land here.
- `RETIRE`: there is positive evidence of no required business use plus an approved rationalization decision. Inactivity or no recent transactions alone should produce a retirement **candidate**, not final `RETIRE`.
- `INVESTIGATE`: evidence, target verification, ownership, or business intent is insufficient. This is the correct Phase 1 result for ambiguous items, not a failure of the report.
- `BLOCKED`: a named unmet prerequisite prevents migration (unsupported critical behavior, missing access, unresolved source corruption, required license/capability unavailable, or no approved installed-base strategy). High complexity by itself is not blocked.

For current data, likely starting classifications are: QCP `REDESIGN`; Twin Fields `TRANSFORM`; Discount Schedules `TRANSFORM` until target semantics are verified, with `DIRECT` reserved for proven compatible cases; Price Rules `TRANSFORM` or `REDESIGN` based on expression/evaluation behavior; product-scoped rules `TRANSFORM`; quote-scoped/summary-variable patterns `REDESIGN` or `INVESTIGATE`; catalog elements `TRANSFORM`, with nested/configuration patterns promoted to `REDESIGN`. These are rule defaults, not blanket conclusions.

### Numeric readiness score

Use a 0–100 weighted score across the nine dimensions requested by the architect:

| Dimension | Weight |
|---|---:|
| Catalog and selling models | 12 |
| Pricing | 13 |
| Configuration and rules | 10 |
| Custom development/automation | 15 |
| Installed base/lifecycle | 15 |
| Integrations | 10 |
| Data migration quality/volume | 10 |
| Reporting/security/operability | 7 |
| Testing and cutover readiness | 8 |

Each dimension gets a deterministic 0–100 readiness value from documented checks, not from item counts alone. Examples include percentage with an assigned disposition, percentage with high-confidence target design, unresolved blocker severity, dependency concentration, data-quality failures, and tested migration scenarios. Complexity is reported separately; a complex estate can still be ready if its design and validation are complete.

Calculate:

`readiness = sum(dimension score × dimension weight for assessed dimensions) / sum(assessed dimension weights)`

`assessment coverage = sum(dimension weight × evidence completeness for every dimension) / 100`

Evidence completeness ranges from 0 to 1 and must be defined per dimension. A dimension with no inspector is **Unknown**, contributes no readiness points or denominator, and reduces coverage. Label the score **Provisional** until coverage is at least 70%, no mandatory dimension is wholly unknown, and all inspector results are complete. This avoids treating unknowns as zero while preventing a high score based only on the easiest 30% of the estate. Also show disposition counts, critical blockers, high-risk items, and the denominator behind every percentage.

The first page should become: overall/provisional readiness and coverage; complexity; footprint; disposition counts; top evidence-backed risks; top evidence-backed opportunities; unassessed domains; and the next three decisions required. The detailed existing inventory follows. Replace the fixed sequencing section with prerequisite-based workstreams and gates; dates/weeks require project inputs and should not be invented from inventory counts.

### Feasibility, verification, demo, cost, and dependencies

- **Mechanism:** Pure deterministic report-domain and assembly changes using the six current inspector results. No new Salesforce call is required for the first release.
- **Live verification:** None for the initial reframing. Before asserting target object names or “direct” semantics, separately verify the target Revenue Management release, licenses, and schema; current fixed mappings should be presented as candidate targets until then.
- **Demo richness:** Useful immediately in the seeded org. The small footprint actually makes disposition explanations easy to demonstrate. The readiness score will have low coverage and must visibly say so.
- **Cost / payoff:** **Low–Medium / High**. Cost includes a normalized assessment model, rubric tests, first-page template, route response updates, and modal copy/progress changes—not just edits to `scoreComplexity.ts` and `buildInventorySection.ts`.
- **Dependencies:** None. All later areas depend on this output contract.

## Phase 2A: installed base, amendments, renewals, and lifecycle

### Feasibility and mechanism

This is mostly a straightforward read-only SOQL inspector after schema verification, but it is broader than a single count query. Use aggregate queries for counts and date windows, then bounded/paginated detail queries to characterize relationships among `Contract`, `SBQQ__Subscription__c`, `Asset`, `SBQQ__Quote__c`, quote lines, renewal/amendment opportunities and quotes, `Order`, and `OrderItem`. Determine lifecycle behavior from verified CPQ fields and relationships: active/end state, subscription term conventions, evergreen behavior, renewal/amendment lineage, co-term/proration indicators, uplift/renewal pricing, cancellations, and bundle/MDQ or ramp characteristics.

Record counts alone cannot determine the customer's intended renewal, amendment, cancellation, or cutover model. Emit observed patterns and exceptions, then require declared business-process confirmation. Historical asset conversion readiness should be a first-class finding and can become `BLOCKED` when active lifecycle records exist but no migration strategy is approved.

### Schema verification required

Describe and permission-check `Contract`, `SBQQ__Subscription__c` beyond its currently verified query fields, `Asset`, `SBQQ__Quote__c`, `SBQQ__QuoteLine__c`, `Opportunity`, `Order`, `OrderItem`, and any org-specific renewal/amendment objects discovered through describes. Verify exact fields for status, start/end dates, terms, evergreen, renewal/amendment type and lineage, master contract/co-terming, proration, uplift/renewal price, cancellation, product/bundle linkage, order/asset conversion, and record currencies. Verify relationship names and whether aggregate/date filters are supported. Do not assume standard Salesforce fields alone represent CPQ lifecycle semantics.

### Data richness risk

Current demo value is **Low**: 0 Contracts means the headline installed-base assessment will correctly report an empty book, but it cannot demonstrate renewal or amendment complexity. Seed roughly 10–20 contracts, 30–100 subscriptions, representative assets/orders, several renewals due inside and outside 90 days, at least two amendments, one cancellation, one evergreen subscription, one co-termed bundle, and one multi-year/MDQ or ramp example. Preserve lineage among quote, contract, subscription, asset, order, and opportunity records.

### Cost, payoff, dependencies

- **Cost / payoff:** **Medium / High** in a real customer org; **Low** demo payoff until seeded.
- **Dependencies:** Phase 0 verification and Phase 1 assessment contract. It supplies lifecycle nodes to usage analytics and the dependency graph.

## Phase 2A: Product Selling Model readiness

### Feasibility and mechanism

This is **not** a straightforward “query the Product Selling Model” inspector. Product Selling Model is a target-side Revenue Management concept; CPQ embeds selling behavior across Product2 CPQ fields, PricebookEntry/pricing data, product options, quote-line history, subscriptions, and sometimes custom automation. Build an inference engine that classifies each product as one-time, term subscription, evergreen, usage/consumption candidate, mixed, or unknown. Use configuration evidence first and transactional evidence second; flag conflicts such as the same product appearing with recurring and one-time behavior.

Inference rules must be versioned and explainable. Usage/consumption should default to `INVESTIGATE` unless explicit CPQ/custom fields and transaction patterns support it; labels in product names or families are weak evidence. The target Product Selling Model recommendation also needs separate target-org/release verification before implementation planning.

### Schema verification required

Describe `Product2`, `PricebookEntry`, `SBQQ__QuoteLine__c`, and the already verified `SBQQ__Subscription__c`; verify exact CPQ fields governing subscription type, subscription term, pricing method, charge/price behavior, percent-of-total/block pricing, renewal behavior, evergreen, MDQ segments, and consumption/usage indicators available in this package version. Verify any related schedule/segment objects found in the installed 219-object catalog and any relevant custom fields. On the target side, later verify actual selling-model objects/fields for the licensed Revenue Management release; do not infer target schema from names in the feedback.

### Data richness risk

Current demo value is **Medium** for configuration-only classification across 100 products, but mixed-behavior and actual-use conclusions will be weak with 78 quote lines and no contracts. Seed at least one one-time, term, evergreen, mixed, bundle subscription, multi-year/MDQ, and genuine usage/consumption example, with repeated quote-line and subscription history. Unknown should remain a valid visible outcome.

### Cost, payoff, dependencies

- **Cost / payoff:** **High / High**. The concept is strategically important, but inference and confidence design make it materially harder than a SOQL inventory.
- **Dependencies:** Phase 1; benefits strongly from installed-base and usage data. It can ship first as configuration-only inference with explicit low coverage.

## Phase 2B: quote behavior and usage analytics

### Feasibility and mechanism

Product usage is straightforward to aggregate from quote lines by product and date once fields are verified. Configuration usage is not universally observable. Join Product2 and configuration entities to recent quotes/quote lines and lifecycle records, and report “quoted in the selected window,” “referenced by active configuration,” and “no observed transactional use.” For rule/schedule use, exploit explicit references where they exist and any persisted calculation/audit fields verified in the org. Otherwise label findings as inferred candidates.

Do not claim that a Price Rule “did not execute” merely because no transaction row names it: CPQ generally does not provide a universal execution ledger for every rule. QCP impact percentage is also not derivable from the presence of a script alone; it requires reliable activation scope, telemetry, or controlled replay. Retirement recommendations require a configurable lookback, data completeness checks, seasonal/business-owner review, and preferably multiple signals.

### Schema verification required

Describe `SBQQ__Quote__c`, `SBQQ__QuoteLine__c`, `Product2`, `PricebookEntry`, Opportunities, orders/order items, contracts/subscriptions/assets, and all fields used for product, bundle, quote status, created/last activity dates, currency, net/list values, quantities, and lifecycle lineage. Re-verify configuration reference fields needed to connect products to schedules/rules. Discover whether the org has calculation logs, quote calculator telemetry, custom audit objects, field history, or platform-event retention that can support rule/QCP execution evidence.

### Data richness risk

Current demo value is **Medium–Low**. Fifty-five quotes and 78 lines can demonstrate a last-12-month product utilization table, but percentages will be unstable and likely dominated by seeding patterns. Seed at least 12–18 months of dated transactions, 200+ quote lines, repeat use, deliberately unused products/rules/schedules, multiple statuses, currencies, bundles, amendments, and renewals. Mark synthetic/demo conclusions as such.

### Cost, payoff, dependencies

- **Cost / payoff:** **Medium–High / High** in customer orgs; **Medium** in the current demo.
- **Dependencies:** Phase 1 and verified transactional schema; product analysis benefits from installed-base work. Its observed-use edges feed custom fields and the graph.

## Phase 3: Apex, Flow, and automation scanner

### Feasibility and mechanism

This is a metadata analysis subsystem, not an ordinary SOQL inspector. Use Tooling API queries to inventory and retrieve Apex classes/triggers and the org-supported Flow/Validation Rule representations. Query `MetadataComponentDependency` for explicit component relationships, while treating it as a useful but incomplete index. Retrieve metadata/source text where permitted and run structured plus lexical extraction for `SBQQ__` object/field tokens, dynamic SOQL strings, API-name strings, invocable actions, and cross-component calls. Parse Apex symbol tables when available for static references and call relationships; scan trigger bodies and tests separately. Parse Flow XML/metadata for record objects, fields, formulas, Apex actions, subflows, and activation/version state. Parse validation/formula expressions rather than relying only on substring counts.

Expand later to Process Builder flows, LWC/Aura, Visualforce, email templates, approval processes, custom metadata/settings, and formula fields. Each hit should name component, type, active state, exact referenced object/field, evidence method, confidence, and migration impact. String matching is a fallback and must distinguish comments/test fixtures from executable references where possible.

### Schema verification required

Verify Tooling describes, queryable fields, body/source access, and permissions for `ApexClass`, `ApexTrigger`, the available Flow entities (`FlowDefinition` is specifically unverified and Flow version access varies by API), `ValidationRule`, `MetadataComponentDependency`, and any source-member/symbol-table facilities used. Verify Metadata API retrieval for Flow, approval process, Lightning/Aura bundles, Visualforce, custom metadata/settings, email templates, and object formulas/validation rules. Confirm namespace representation and managed-package source visibility; managed internals may be opaque.

### Data richness risk

Current demo value is **unknown, likely Low–Medium** because no automation counts have been supplied. Seed or deploy at least two Apex classes, one trigger, three Flows (record-triggered, subflow, and Apex action), two validation/formula references, one dynamic-SOQL/string-only reference, and one inactive component. Include a dependency chain such as Flow -> Apex -> Quote Line field so graph behavior is visible.

### Cost, payoff, dependencies

- **Cost / payoff:** **High / High**.
- **Dependencies:** Phase 0 and Phase 1. Share retrieval/reference-index infrastructure with custom-field intelligence. Produces core edges for integrations and the dependency graph.

## Phase 3: custom-field intelligence

### Feasibility and mechanism

Use object describes for field inventory and Tooling/Metadata API for custom field definitions, formulas, validation dependencies, component dependencies, and metadata source references. Cover custom fields on Product2, Quote, Quote Line, Contract, Subscription, Order, Order Product, Opportunity, Account, and Asset. Build a reverse-reference index from formulas, rules, Apex, Flow, UI metadata, reports, and integration evidence.

Classification should be multi-label rather than exclusive: formula-derived, pricing dependency, configuration dependency, lifecycle dependency, automation dependency, integration dependency, reporting dependency, UI/display-only candidate, and unknown usage. “Display-only” and “unused” are conclusions requiring broad scan coverage; until automation, reports, integrations, and recent data are inspected, use “no observed dependency in assessed sources.” Formula dependency graphs should be traversed transitively and detect cycles.

### Schema verification required

Describe every scoped business object and confirm custom field definitions, namespace, type, formula/calculated metadata, relationship targets, default values, requiredness, uniqueness/external-ID flags, and FLS visibility. Verify Tooling/Metadata access to custom fields, formula expressions, validation rules, layouts/actions where included, and `MetadataComponentDependency`. Verify the exact CPQ standard/managed fields only when a classifier uses them. Security/FLS analysis would additionally require live verification of profile/permission-set metadata and should either be included explicitly or reported as a remaining gap.

### Data richness risk

Current demo value is **Medium** because the known Twin Fields guarantee at least two meaningful custom fields, but “148 custom fields” style output and rich classifications require more metadata. Seed 15–30 custom fields across the scoped objects: formulas, pricing inputs, integration keys, Flow/Apex references, report-only fields, true display-only fields, and deliberately orphaned candidates. Include transitive formula dependencies.

### Cost, payoff, dependencies

- **Cost / payoff:** **High / High**.
- **Dependencies:** Phase 1 and the automation scanner's shared reference index; usage analytics, integration, and reporting scans progressively improve classification confidence.

## Phase 4: full dependency graph and migration blast radius

### Feasibility and mechanism

Build a normalized graph, not a single Salesforce query. Nodes represent records, metadata components, fields, products, transaction/lifecycle aggregates, external systems, and candidate target patterns. Edges come from explicit lookup fields in current inspectors, described relationships, configuration fields containing object/field API names, `MetadataComponentDependency`, parsed Apex/Flow/formula/report metadata, Twin Field name/type matches, and observed transaction use. Every edge needs provenance and confidence.

Compute connected components, upstream/downstream reach, cycles, fan-in/fan-out, critical paths, and weighted blast radius. Do not rank solely by node degree: weight active transaction volume, lifecycle population, business criticality, edge confidence, and disposition severity. Keep observed and inferred edges visually/reportably distinct. Product2 -> PricebookEntry and product/bundle/rule links are natural early edges; QCP -> arbitrary fields and integrations require source parsing and may remain incomplete.

### Schema verification required

There is no single additional graph schema. Verify each contributing source described in Phases 2–4, plus exact relationship fields on PricebookEntry, quote/quote line, lifecycle, order/asset, and configuration objects. Verify `MetadataComponentDependency` fields, dependency direction, supported component types, namespace behavior, and gaps in the org/API version. Confirm whether IDs/full names can be reconciled consistently across data, Tooling, and Metadata APIs.

### Data richness risk

Current demo value is **Medium** for a configuration-only graph but **Low** for the promised end-to-end blast radius. Seed the Phase 2 and 3 data plus one ERP-like integration and two reports. Ensure at least one chain spans product -> price/config rule -> custom field -> Flow/Apex -> quote line -> subscription/order -> integration/report.

### Cost, payoff, dependencies

- **Cost / payoff:** **High / High** once populated; otherwise visually attractive but misleading.
- **Dependencies:** Current six inspectors plus installed base, selling/usage evidence, automation, and custom-field intelligence. Integration/reporting add the final external edges.

## Phase 4: integration impact assessment

### Feasibility and mechanism

Use a layered evidence approach. Inventory integration-related metadata through Tooling/Metadata APIs where supported: Named Credentials/external credentials, Remote Site Settings, Connected Apps, Apex callout code, Flow HTTP/external-service actions, platform events, change data capture configuration, outbound messaging, external services, middleware-facing custom metadata/settings, and API/integration users where security access permits. Parse Apex and Flow for endpoints, credential aliases, payload field references, event names, and CPQ object/field tokens. Correlate with custom fields marked external IDs and with automation entry points.

Salesforce metadata cannot reliably reveal every external consumer. Inbound clients may query CPQ through generic APIs, middleware may own mappings outside Salesforce, and secrets/endpoints can be hidden. The output should say “integrations evidenced in this org,” include a declared-system questionnaire/reconciliation step, and never claim completeness from metadata alone. Do not retrieve or display credential secrets.

### Schema verification required

Verify metadata availability and safe fields for Named Credentials/external credentials in this org/API, Remote Site Settings, Connected Apps, External Services, Auth Providers as relevant, platform-event definitions/subscriptions, outbound messages, CDC, Apex callouts, Flow actions, and custom metadata/settings. Confirm permissions and whether metadata retrieval redacts protected values. Verify event/object names and any integration-user attribution fields before querying logs. Event Monitoring/API logs are license- and retention-dependent and should be an optional enrichment, not assumed.

### Data richness risk

Current demo value is **unknown, probably Low**. Seed at least two integrations: one Apex/Named Credential ERP or tax callout touching several CPQ fields, and one Flow/platform-event or e-signature-style path. Add an inbound integration that cannot be fully inferred from org metadata to demonstrate the “declared/reconcile” workflow.

### Cost, payoff, dependencies

- **Cost / payoff:** **High / High** in customer assessments; **Low** without representative integration metadata.
- **Dependencies:** Automation scanner and custom-field index. Adds external-system nodes to the graph.

## Phase 4: reporting impact

### Feasibility and mechanism

Use Metadata API/listMetadata/retrieve for report and dashboard definitions; Tooling/SOQL alone is unlikely to provide complete report XML and field references. Parse report types, columns, filters, groupings, formulas, joined blocks, dashboard components, and folders for `SBQQ__` objects/fields and custom-field dependencies. Include custom report types and, where accessible, CRM Analytics assets as a separate adapter because their APIs and metadata differ.

“Actively used recently” and “executive-critical” are not safely inferable from definitions. Usage may require optional Event Monitoring/report-event data or other licensed telemetry; criticality needs folder/owner heuristics plus declared confirmation. Classify as rebuild, validate, retire candidate, or investigate—never automatically retire a report because recent-use telemetry is unavailable.

### Schema verification required

Verify Metadata API access and component names for Report, Dashboard, ReportType, folders, and subscriptions; verify whether the connected user can retrieve private-folder assets. Verify any Tooling entities used for metadata IDs. Discover CRM Analytics presence and the supported retrieval/query API before promising coverage. Verify Event Monitoring licensing, event types, retention, and fields if usage recency is included.

### Data richness risk

Current demo value is **Low** unless CPQ reports already exist. Seed 8–12 reports and 2 dashboards: ARR/renewal, bookings, pricing exception, quote pipeline, one custom report type, formulas/filters with CPQ fields, an executive-critical declared example, and inactive/obsolete candidates. Add usage telemetry only if realistically available; otherwise demonstrate explicit unknown status.

### Cost, payoff, dependencies

- **Cost / payoff:** **Medium–High / Medium–High**.
- **Dependencies:** Phase 1 and custom-field intelligence; automation/integration are not hard prerequisites. Adds report nodes to the graph.

## Comparative priority matrix

| Area | Primary acquisition mode | Current demo usefulness | Needs richer seeding | Cost | Customer payoff | First phase |
|---|---|---:|---:|---:|---:|---:|
| Readiness + dispositions | Existing normalized inspector data | High, with low-coverage warning | No | Low–Medium | High | 1 |
| Installed base/lifecycle | SOQL aggregates + paginated relationships | Low | Yes | Medium | High | 2A |
| Selling-model readiness | Multi-source inference | Medium | Yes for mixed/lifecycle behavior | High | High | 2A |
| Usage analytics | SOQL aggregates + inference/optional telemetry | Medium–Low | Yes | Medium–High | High | 2B |
| Automation scanner | Tooling + Metadata + parsing | Unknown/Low–Medium | Probably | High | High | 3 |
| Custom-field intelligence | Describe + metadata reverse-reference index | Medium | Yes | High | High | 3 |
| Dependency graph | Normalize all prior evidence | Medium only as a partial graph | Yes | High | High after prerequisites | 4 |
| Integration impact | Metadata + source parsing + declared reconciliation | Probably Low | Yes | High | High | 4 |
| Reporting impact | Metadata API + optional usage telemetry | Probably Low | Yes | Medium–High | Medium–High | 4 |

## Phase 5: calibration, testing, coexistence, and cutover

The nine requested areas still do not by themselves complete every gap in the architect's feedback. Phase 5 should explicitly close or label the remaining assessment domains: approvals, security/CRUD/FLS/sharing, UX/custom actions/LWC, billing architecture, price waterfall and currency strategy, data quality/reconciliation, test coverage, business process, organizational readiness, licensing, coexistence, rollback, and frozen-transaction handling.

Generate regression **scenario candidates** from observed patterns (bundle constraints, discount tiers, rule evaluation events, subscription lifecycle, QCP-affected fields, currencies, and integration paths), but do not claim test coverage until scenarios have expected outcomes and execution evidence. Replace today's single UAT paragraph with gates for design approval, data rehearsal/reconciliation, side-by-side pricing validation, lifecycle validation, integration/report validation, security validation, cutover rehearsal, and rollback approval.

Coexistence and license guidance changes over time and varies by contract/release. The report can always flag whether a coexistence plan and at least one usable legacy CPQ environment/license have been confirmed, but any Salesforce recommendation must be checked against current official documentation and the customer's agreement at build/release time.

Calibration requires more than the seeded org. Run the deterministic rubric against several anonymized org shapes—small declarative, automation-heavy, subscription-heavy, integration-heavy, and high-volume—and have Revenue Management architects independently rate them. Version the rubric, publish why scores changed, and set thresholds only after comparing predicted dispositions/readiness with expert review. The score should support decisions, not manufacture precision.

## Definition of done by phase

### Phase 0

- A checked-in schema/capability manifest records all verified source objects, fields, APIs, permissions, and known gaps.
- Every planned query has pagination/limit expectations and a failure/permission interpretation.
- No unverified field name appears in implementation logic.

### Phase 1

- The first page is executive-first and contains readiness, coverage, complexity, footprint, dispositions, risks, opportunities, unknowns, and next decisions.
- Every existing item has a deterministic disposition, confidence, evidence, target candidate, current/target complexity, and business-intent recommendation.
- Unknown and failed inspectors reduce coverage without masquerading as absence.
- The old “maps to” and fixed calendar-style confidence are removed from report and modal copy.

### Phases 2–4

- Each inspector reports complete/truncated/unavailable state and record-time scope.
- Aggregate totals are not derived from capped sample arrays.
- Inference is labeled and explainable; retirement requires positive evidence and approval.
- Metadata bodies and transaction details are minimized/redacted in API and UI payloads.
- Graph edges and blast-radius scores retain provenance and confidence.

### Phase 5

- Demo data exercises every headline claim without presenting synthetic patterns as customer evidence.
- Score thresholds are versioned and architect-calibrated across multiple org shapes.
- Regression, cutover, coexistence, reconciliation, and rollback sections are evidence-backed or explicitly unassessed.
- Target-side recommendations are verified for the customer's Revenue Management edition, release, and licenses before being presented as committed design.

## Principal uncertainties to resolve before build

1. Which Tooling and Metadata component bodies the production connection can retrieve, especially Flow versions, validation/formula definitions, reports in private folders, and managed-package internals.
2. Which exact fields in this installed CPQ package version encode lifecycle, MDQ/ramp, evergreen, renewal, pricing, and usage behavior.
3. Whether any reliable rule/QCP execution telemetry exists; without it, rule utilization remains inference and cannot support automatic retirement.
4. Whether Event Monitoring and CRM Analytics APIs are licensed and accessible for usage/reporting evidence.
5. Which Revenue Management edition/release is the target and which target constructs are actually licensed. Product Selling Model recommendations are target design hypotheses until that is verified.
6. How business owners will supply non-discoverable facts: critical reports, external integrations, intended lifecycle process, coexistence constraints, data-retention policy, and retirement approvals.

This plan intentionally makes no live-org claim beyond the verified schema and record counts supplied in the brief. All additional object/field and metadata capabilities above are proposed verification targets, not asserted facts about the current org.
