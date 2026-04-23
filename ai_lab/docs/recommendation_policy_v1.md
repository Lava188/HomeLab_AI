# HomeLab Recommendation Policy v1

## Status

- Document status: `ready`
- Policy scope: `package_recommendation_v1`
- Runtime promotion status: `draft_policy_only`

## Core Policy

Package recommendation in HomeLab is advisory only. It is not diagnosis, treatment, prescribing, or clinical clearance.

The system may recommend only a package candidate from the controlled package catalog and only when the recommendation is supported by structured repo evidence.

## Evidence Reference Policy

Authoritative package evidence in this draft must reference the versioned KB with the format:

- `medical_kb_v1_2#<kb_id>`

`knowledge_items.json` and similar legacy notes may be retained only as supplementary `legacy_support_notes`. They must not be used as the primary package-support anchor when a versioned KB reference is available.

## Non-Diagnostic Rule

The assistant must not say or imply:

- "you have anemia"
- "you have diabetes"
- "you have liver disease"
- "this package will confirm the diagnosis"
- "this package is enough to rule out all causes"

Allowed framing is limited to wording such as:

- "this may be a basic package to discuss or consider"
- "this package is intended for general screening-oriented use within the current HomeLab scope"
- "abnormal results still need clinician review"

## Escalate Instead Of Recommend

The system must escalate instead of recommend when:

- current red-flag routing indicates emergency or urgent care
- the user asks for diagnosis or treatment
- the user describes rapidly worsening illness
- the user asks for a package whose components are not supported by repo evidence
- the request depends on HBV, HIV, or liver-function specifics not grounded in repo sources
- the system does not have enough structured evidence to justify a recommendation safely

Escalation modes should be:

- `escalate_for_urgent_care`
- `escalate_for_medical_review`
- `do_not_recommend`

## Wording Boundaries

The AI must:

- use conservative, non-diagnostic wording
- state when a recommendation is only basic or partial
- state when a package is blocked by missing source support
- avoid certainty language about disease state or package sufficiency
- avoid promising clinical benefit beyond what repo evidence supports

The AI must not:

- invent included tests
- claim package preparation rules that are not grounded in repo evidence
- interpret individual lab values
- compare packages using unsupported clinical superiority claims

## Structured Evidence Requirement

Before recommendation, the package must have structured support for:

- package goal
- included test list
- candidate conditions for use
- exclusion and escalation boundaries
- interpretation boundary
- evidence status

The structured support must be traceable to existing repo artifacts such as:

- `ai_lab/datasets/medical_kb_v1_2.json`
- `ai_lab/reports/flow_a_final_report_v1_2.md`
- `ai_lab/reports/kb_v1_2_hardening_report.md`

Legacy note sources such as `ai_lab/datasets/knowledge_items.json` may be cited only as supplementary support when no clean equivalent prep note exists in the versioned KB.

## Evidence Threshold For Recommendation

For v1, a package can be marked:

- `ready`: core package goal and included test are directly supported by repo evidence
- `partial`: some package framing is supported, but dedicated package-level support is incomplete
- `blocked`: key package components or disease-screening claims are not supported by repo evidence

Only `ready` packages should be considered safe for recommendation in a later runtime pass without further source expansion.

`partial` packages may remain in the catalog for planning visibility, but should not be promoted to runtime recommendation without additional source-backed work.

`blocked` packages must not be recommended.

## Runtime Gating Fields

Each package in the catalog must expose explicit runtime gating fields:

- `runtime_allowed`
- `recommendation_exposure`
- `needs_manual_review`

Default gating interpretation:

- `ready` -> `runtime_allowed=true`, `recommendation_exposure="allowed"`, `needs_manual_review=false`
- `partial` -> `runtime_allowed=false`, `recommendation_exposure="guarded"`, `needs_manual_review=true`
- `blocked` -> `runtime_allowed=false`, `recommendation_exposure="none"`, `needs_manual_review=true`

These package-level gating fields do not override the catalog-level draft state. In the current repo pass, `ai_lab/datasets/package_catalog_v1.json` still has `runtime_enabled=false`, so no package should be treated as live runtime behavior yet.

The policy layer must never treat `partial` or `blocked` packages as runtime-recommendable just because human-readable package text exists in the catalog.

## Structured Rule Layer

Human-readable fields such as:

- `candidate_if`
- `exclude_if`
- `prep_rules`
- `escalation_rules`

must be preserved for reviewability.

In parallel, each package should provide a minimal machine-readable layer through:

- `eligibility_logic`
- `exclusion_logic`
- `prep_logic`
- `escalation_logic`

These structured fields are draft schema only. They exist to prepare later slot-filling and rule evaluation work, not to claim that a runtime rule engine already exists.
