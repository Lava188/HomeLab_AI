# Package Scope Decision Report v1

## Status

- Report status: `ready`
- Scope covered: roadmap stages 1 to 3
- Runtime changes made: `none`

## What Was Found In The Repo

The inspected `ai_lab` structure already contains:

- frozen baseline and expanded KB datasets
- versioned retriever artifacts
- answer and response policy documents
- reviewed v1_2 KB additions for CBC and BMP
- legacy internal preparation notes in `knowledge_items.json`

The strongest package-support evidence currently available is:

- CBC support for `Basic Anemia / Infection Screening`
- BMP support for `Basic Kidney Function Screening`
- generic blood-test mentions for glucose and lipid profile
- conservative legacy preparation notes for glucose and lipid tests in `knowledge_items.json`

The repo does not currently provide clean package-support evidence for:

- liver function packages
- HBV/HIV screening packages
- richer package-level interpretation logic

## What Was Added In This Pass

Created:

- `ai_lab/docs/package_scope_v1.md`
- `ai_lab/docs/recommendation_policy_v1.md`
- `ai_lab/datasets/package_catalog_v1.json`
- `ai_lab/reports/package_coverage_gap_v1.md`
- `ai_lab/reports/package_scope_decision_report_v1.md`

These additions define:

- a conservative recommendation-service boundary
- package inclusion and exclusion criteria
- package naming layers: `package_id`, `internal_name`, `display_name`, `display_name_vi`
- package status labels: `ready`, `partial`, `blocked`
- runtime gating fields: `runtime_allowed`, `recommendation_exposure`, `needs_manual_review`
- a minimal structured rule layer parallel to human-readable rule text
- an initial catalog that keeps unsupported package candidates visible without promoting them
- a gap report for the next source-expansion pass

## What Remains Blocked

Blocked because source data is missing or incomplete:

- `Basic Liver / Metabolic Screening`
- `Basic Infectious Screening (HBV/HIV)`
- promotion of `Basic Glucose Screening` to `ready`
- promotion of `Basic Lipid Screening` to `ready`
- any package-specific runtime KB artifact

## Recommendation Outcome For This Pass

Safe package planning outcome:

- `ready`: `Basic Anemia / Infection Screening`, `Basic Kidney Function Screening`
- `partial`: `Basic Glucose Screening`, `Basic Lipid Screening`
- `blocked`: `Basic Liver / Metabolic Screening`, `Basic Infectious Screening (HBV/HIV)`

Runtime gating outcome:

- `ready` packages are the only ones mapped to `runtime_allowed=true`
- `partial` packages remain `runtime_allowed=false` with `recommendation_exposure="guarded"`
- `blocked` packages remain `runtime_allowed=false` with `recommendation_exposure="none"`
- the catalog itself still remains `runtime_enabled=false`, so these gates are draft control metadata only in this pass

This gating is still draft-only design work. It does not change the current runtime.

This is narrow enough to preserve the current system while still establishing a structured recommendation layer.

## What Should Happen Next

Recommended next pass:

1. Add source-backed raw and normalized material for glucose, lipid, liver, and infectious screening topics.
2. Produce a draft-only package evidence artifact once those sources are reviewed.
3. Add package-level retrieval or routing only after `partial` packages have enough structured evidence to move to `ready`.
4. Keep retriever and runtime promotion separate from package-planning documents until recommendation behavior is evaluated.
