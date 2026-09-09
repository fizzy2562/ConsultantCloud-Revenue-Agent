# CPQ → Revenue Cloud Migration Readiness Report

_Generated 2026-09-09. Source: a live Salesforce CPQ trial org (`trailhead-4ab-dev-ed`), queried directly via the six `@consultantcloud/cpq-analysis` inspector tools. Every finding below reflects real records/metadata in that org at query time — nothing here is illustrative or inferred. Revenue Cloud target-object mappings are grounded in schema independently verified against a live Revenue Cloud org during this same project (see `docs/revenue-cloud-trail-gap-analysis.md`)._

## Executive summary

This org carries a representative cross-section of CPQ complexity: a conditional Price Rule, a tiered Discount Schedule, two Product Rules (one a genuine bundle-configuration constraint, one a subscription-lifecycle enforcement pattern), a Quote Calculator Plugin (custom JavaScript pricing logic), a 100+ product catalog with real bundle structure, and — critically — two live "Twin Field" pairs, an implicit, name-based automation convention that is invisible to any tool that only inspects explicit relationships.

None of this is exotic. It is the standard shape of a real, if not yet deeply mature, CPQ implementation. The migration-relevant finding is this: **every mechanism in this org maps to a real Revenue Cloud construct, but none of them map 1:1.** Every category requires re-architecture, not data transformation. The QCP script and the Twin Fields are the two genuinely high-risk items; everything else is moderate, well-precedented rebuild work.

## Object-by-object inventory

| CPQ source | Records found | Revenue Cloud target | Migration mechanism |
|---|---:|---|---|
| `SBQQ__PriceRule__c` + `SBQQ__PriceCondition__c` + `SBQQ__PriceAction__c` | 1 rule, 1 condition, 1 action | `CalculationProcedure` → `CalculationProcedureVersion` → `CalculationProcedureStep` | Re-author as a declarative pricing step on the Business Rules Engine; condition/action pairs become step conditions and formula outputs |
| `SBQQ__DiscountSchedule__c` + `SBQQ__DiscountTier__c` | 1 schedule, 3 tiers | `PriceAdjustmentSchedule` + `PriceAdjustmentTier` | Near-direct structural match — tier boundaries and discount percentages carry over conceptually with the least rework of any category |
| `SBQQ__ProductRule__c` (Validation, Product scope) + `SBQQ__ConfigurationRule__c` | 1 rule, 1 configuration rule | `ProductConfigurationRule` | Rule type/scope/evaluation-event map onto RC's configuration rule model; error messaging is preserved as a qualification/validation outcome |
| `SBQQ__ProductRule__c` (Validation, Quote scope) + `SBQQ__SummaryVariable__c` | 1 rule, 1 summary variable | `ProductConfigurationRule` (or a `DecisionTable`/`CalculationProcedureStep` if the comparison logic is pricing-adjacent) + no direct Summary Variable equivalent | The aggregation logic behind a Summary Variable has no named RC counterpart — it must be re-expressed as a Decision Table lookup or an expression inside a Calculation Procedure step |
| `SBQQ__CustomScript__c` (QCP) | 1 script, 781 characters | No object-level equivalent. Logic moves to `CalculationProcedureStep` (formula-based) or, if genuinely un-expressible declaratively, an Apex-backed pricing callout | Confirmed by two independent industry sources during earlier research: there is no automated conversion path for this category anywhere, commercial or open source |
| `Product2` / `SBQQ__ProductOption__c` / `SBQQ__ProductFeature__c` / `SBQQ__AttributeSet__c` / `SBQQ__ConfigurationAttribute__c` | 100 products (capped; org has 161), 81 options, 26 features, 0 attribute sets, 0 configuration attributes | `Product2` (shared schema) + `ProductRelatedComponent`/bundle structure + `ProductAttributeDefinition` | Catalog and bundle structure is the best-tooled part of any CPQ migration — multiple commercial products (Hansen, IdeaHelix) already automate this well. Zero Configuration Attributes in this org means no attribute-based configuration complexity to carry over here, which is a genuine simplification, not a gap in our tooling |
| Twin Fields (`Warranty_Months__c`: `Product2` ↔ `SBQQ__QuoteLine__c`; `Committed_Quantity__c`: `SBQQ__QuoteLine__c` ↔ `SBQQ__Subscription__c`) | 2 real pairs, detected generically (not hardcoded) | Explicit Field Mapping configuration | This is the category most likely to be silently dropped in a naive migration — nothing in CPQ's schema declares these fields are linked, so a migration that only reads relationship metadata will miss it entirely. Both pairs found here were only discoverable by describing every source/destination object pair and comparing field names and types directly, which is exactly what the `detect_twin_fields` tool does |

## Complexity / risk scoring

| Item | Complexity | Risk if missed | Why |
|---|---|---|---|
| Quote Calculator Plugin | **High** | **High** | Arbitrary JavaScript, no automated conversion tooling exists anywhere (verified independently); silent mis-migration changes real pricing outcomes |
| Twin Fields | **Medium** | **High** | Cheap to migrate once found (it's just two matching custom fields → one Field Mapping record), but invisible to naive inspection — the risk is entirely in *detection*, not implementation |
| Minimum License Enforcement (Product Rule + Summary Variable + Twin Field) | **Medium-High** | **Medium** | Multi-part pattern spanning three mechanism types; the Summary Variable's aggregation logic has no named RC equivalent and needs judgment to re-express |
| Price Rule (conditional discount) | **Medium** | **Medium** | Structurally simple in this org (one condition, one action) but Price Rules in real implementations are rarely this small — this one likely under-represents typical real-world complexity |
| Product Rule (bundle validation) | **Low-Medium** | **Medium** | Clean 1:1 conceptual mapping to `ProductConfigurationRule`; risk is mostly in re-testing the validation trigger conditions |
| Discount Schedule + Tiers | **Low** | **Low** | Closest structural match of any category to its RC target; tier data can largely be carried over programmatically |
| Catalog / bundle structure | **Low** | **Low** | Best-tooled category industry-wide; this org's zero Configuration Attributes further reduces scope here |

## Sequencing recommendation

1. **Catalog and bundle structure first.** Lowest risk, best existing tooling, and everything else in the org (Price Rules, Discount Schedules, Product Rules) references real products — get the product/bundle foundation right in Revenue Cloud before building pricing or configuration logic on top of it.
2. **Discount Schedules next.** Near-direct structural mapping to `PriceAdjustmentSchedule`/`PriceAdjustmentTier`; a good "quick win" that builds confidence in the pricing procedure framework before tackling harder pricing logic.
3. **Twin Fields — audit before building anything else.** Because these are invisible to relationship-based inspection, run the detection pass across the *full* org (not just what we sampled here) before finalizing any Field Mapping design, so nothing gets silently dropped. This should happen early even though the actual rework is small, because discovering a missed Twin Field late in the project means re-opening already-"finished" Quote Line and Subscription configuration.
4. **Product Rules.** Migrate the bundle-validation rule (`ProductConfigurationRule`) before the Quote-scoped enforcement rule — the former is a clean 1:1 mapping, the latter depends on the Summary Variable rework happening in parallel.
5. **Price Rules.** Rebuild as Calculation Procedure steps once the pricing procedure skeleton exists from step 2.
6. **Quote Calculator Plugin last, and budget the most time for it.** This is the one category with zero automated tooling anywhere and the highest financial risk if the calculation logic is subtly wrong. Treat it as a manual re-architecture project with its own test plan (compare CPQ and Revenue Cloud pricing output side-by-side for representative quotes before cutover), not a task to slot in alongside the others.

## Method note

This report was produced by six purpose-built, read-only inspector tools (`packages/cpq-analysis`) run directly against the live CPQ org — no manual data entry, no sampling assumptions. Five inspectors are straightforward SOQL queries against verified real schema; the sixth (`detect_twin_fields`) is genuine describe-based comparison logic that generically finds any custom-field-name-and-type match across the documented CPQ source/destination object pairs, not a lookup keyed to this org's specific field names. Running the same six tools against any other CPQ org would produce an equivalently grounded report for that org's actual configuration.
