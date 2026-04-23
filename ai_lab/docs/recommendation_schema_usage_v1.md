# Recommendation Schema Usage v1

## Status

- Document status: `ready`
- Runtime integration status: `draft_only`

## What Each File Does

- `ai_lab/datasets/package_catalog_v1.json`
  Stores package identity, gating, evidence, machine-readable rule hooks, and output helper text.
- `ai_lab/datasets/recommendation/slot_schema_v1.json`
  Defines the follow-up slots the AI can collect before deciding whether package recommendation is allowed.
- `ai_lab/datasets/recommendation/recommendation_schema_v1.json`
  Maps entry intent or symptom cluster to slot order, candidate packages, exclusions, prep handling, and escalation outcomes.

## Future Runtime Read Order

Suggested future read order:

1. Load `recommendation_schema_v1.json` to choose the matching flow.
2. Load `slot_schema_v1.json` to know which follow-up slots to collect and in what order.
3. Evaluate red-flag checks and exclusion checks first.
4. Read `package_catalog_v1.json` only for packages still eligible after exclusions.
5. Use package helper fields for recommendation text, prep notes, or escalation text.

## Current Package Exposure

Currently safe at package level only:

- `pkg_anemia_infection_basic_v1`
- `pkg_kidney_function_basic_v1`

Still draft and not runtime-allowed:

- `pkg_diabetes_glucose_basic_v1`
- `pkg_lipid_cardiometabolic_basic_v1`

Blocked and must not be recommended:

- `pkg_liver_function_metabolic_basic_v1`
- `pkg_infectious_screening_hbv_hiv_v1`

## Handling Partial And Blocked Packages

- `partial` packages may appear in schema planning and guarded controller logic, but must not be recommended in live runtime.
- `blocked` packages must resolve to `do_not_recommend` or medical-review escalation.
- Catalog-level `runtime_enabled=false` still means none of these schemas are connected to live runtime yet.

## Scope Boundary

These schemas prepare future slot-filling and recommendation control only.

They do not:

- change current retriever or router behavior
- implement a full multi-turn agent
- activate recommendation runtime in the current HomeLab system
