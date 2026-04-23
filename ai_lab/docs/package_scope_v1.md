# HomeLab Package Scope v1

## Status

- Document status: `ready`
- Recommendation layer status: `draft_service_boundary`
- Runtime impact in this pass: `none`

## Purpose

This document defines the intended scope for HomeLab package recommendation v1.

The v1 layer is meant to help the system choose a small, conservative at-home blood-test package candidate when:

- the user is asking about a basic screening-oriented package
- the request stays within already supported HomeLab blood-test knowledge
- there are no emergency or urgent red-flag signals that should override package advice

The package layer is additive. It does not replace the current RAG runtime, current KB versions, or existing red-flag routing behavior.

## What v1 is intended to do

- Recommend a small number of basic package options that map to already supported test themes in the repo
- Explain the high-level goal of a package in non-diagnostic wording
- Gather minimal recommendation inputs at the service boundary level, such as user goal and red-flag screen result
- Refuse or escalate when the request exceeds the current evidence-supported package scope
- Keep package recommendations clearly separated from diagnosis, treatment, and result interpretation

## What v1 does not do

- Diagnose anemia, infection, diabetes, liver disease, kidney disease, hepatitis, HIV, or any other condition
- Claim that a package is medically sufficient for an individual case
- Replace clinician ordering logic
- Interpret laboratory results beyond a high-level boundary statement
- Recommend unsupported package components that are not grounded in repo evidence
- Promote new package knowledge into the official runtime KB in this pass

## Service Boundary For Recommendation v1

The recommendation service boundary for v1 should be:

- Input:
  - user goal or concern
  - short symptom summary
  - red-flag screen result
  - optional context such as known condition, prior abnormal result, or fasting feasibility
- Output:
  - `recommend_package`
  - `do_not_recommend`
  - `escalate_for_medical_review`
  - `escalate_for_urgent_care`

The service may only recommend from the controlled package catalog in `ai_lab/datasets/package_catalog_v1.json`.

## Naming Convention

Each package in the catalog should expose four naming layers:

- `package_id`: stable machine identifier
- `internal_name`: stable developer-facing label
- `display_name`: business and UI-facing English label
- `display_name_vi`: Vietnamese narrative label for future UI or conversational use

The current naming convention is intentionally conservative and screening-oriented. Package names must not imply diagnosis, confirmation, or treatment sufficiency.

## Package Inclusion Criteria

A v1 package may be included only if all of the following hold:

- its core test theme already exists in repo evidence
- the package goal can be stated without inventing unsupported clinical claims
- the package can be framed as a basic screening or discussion-starting option, not a diagnosis pathway
- the package has a clear escalation boundary
- the package can be represented with structured fields for recommendation policy and later slot-filling

## Package Exclusion And Red-Flag Boundaries

The recommendation layer must not recommend and instead must escalate when repo-supported red-flag logic is triggered, including but not limited to:

- chest pain
- shortness of breath
- suspected severe infection or sepsis-style deterioration
- fainting with concerning features
- stroke-like symptoms
- anaphylaxis

The recommendation layer must also exclude:

- packages that imply disease confirmation
- packages that require unsupported source material
- infectious screening packages if HBV/HIV support is not cleanly grounded in repo data
- complex organ-specific bundles that need detailed component evidence not yet present in repo artifacts

## Why The Chosen Package Set Fits Current Scope

The intended v1 business direction is broader than the currently supported evidence, so the practical package set must be narrowed by repo support.

Current repo evidence cleanly supports:

- CBC-centered screening for `Basic Anemia / Infection Screening`
- BMP-centered screening for `Basic Kidney Function Screening`
- generic blood-test references that mention glucose, lipid profile, and renal testing at a high level

Current repo evidence does not yet cleanly support:

- dedicated liver function package components
- dedicated HBV/HIV screening package components
- detailed glucose-only package logic beyond generic blood-test mention and preparation guidance
- detailed lipid package logic beyond generic blood-test mention and one preparation note

For that reason, v1 scope should be treated as:

- `ready`: `Basic Anemia / Infection Screening`, `Basic Kidney Function Screening`
- `partial`: `Basic Glucose Screening`, `Basic Lipid Screening`
- `blocked`: `Basic Liver / Metabolic Screening`, `Basic Infectious Screening (HBV/HIV)`

## Evidence Reference Rule

Authoritative package-support references in this draft should point to the versioned KB using:

- `medical_kb_v1_2#<kb_id>`

Legacy notes such as `knowledge_items.json` may still be retained when useful, but only as supplementary `legacy_support_notes`. They must not be treated as the primary support anchor for package recommendation.

This keeps the recommendation layer honest, minimal, and aligned with the existing HomeLab project stage.
