# Package Coverage Gap Report v1

## Status

- Report status: `ready`
- Inspection basis: current repo state only
- External sources used: `none`

## Repo Evidence Reviewed

Primary inspected artifacts for this pass:

- `ai_lab/datasets/medical_kb_v1_2.json`
- `ai_lab/datasets/knowledge_items.json`
- `ai_lab/review/approved_chunk_v1_2.jsonl`
- `ai_lab/reports/flow_a_final_report_v1_2.md`
- `ai_lab/reports/kb_v1_2_hardening_report.md`
- `ai_lab/docs/response_policy_v1.md`
- `ai_lab/docs/data_contract.md`

## Coverage Summary

| Intended package | Repo-supported evidence already present | Missing knowledge still needed | Status |
| --- | --- | --- | --- |
| Basic Anemia / Infection Screening | Direct CBC support in `medical_kb_v1_2#kb_v1_2_019` and `medical_kb_v1_2#kb_v1_2_020` | No ferritin / iron studies, no package-specific interpretation layer | `ready` |
| Basic Glucose Screening | Generic blood-glucose mention in `medical_kb_v1_2#kb_v1_007`; legacy prep note exists in `knowledge_items#kb_002` | No dedicated glucose explainer item, no HbA1c support, no package-specific logic | `partial` |
| Basic Lipid Screening | Generic lipid-profile mention in `medical_kb_v1_2#kb_v1_007`; legacy prep note exists in `knowledge_items#kb_001` | No dedicated lipid explainer item, no cardiometabolic package logic, no risk interpretation support | `partial` |
| Basic Liver / Metabolic Screening | No clean liver-function package source found | Dedicated liver test sources and structured package evidence | `blocked` |
| Basic Kidney Function Screening | Direct BMP support in `medical_kb_v1_2#kb_v1_2_017` and `medical_kb_v1_2#kb_v1_2_018` | No package-specific interpretation layer beyond high-level boundary | `ready` |
| Basic Infectious Screening (HBV/HIV) | No clean HBV/HIV package support found | HBV/HIV source material, package schema support, policy and escalation details | `blocked` |

## Detailed Notes By Package

### Basic Anemia / Infection Screening

What exists:

- `medical_kb_v1_2#kb_v1_2_019` defines CBC meaning
- `medical_kb_v1_2#kb_v1_2_020` states CBC is commonly used to look into anemia, infection, or blood-cell disorders

What is still missing:

- dedicated package-level copy
- supported add-ons such as ferritin or iron studies
- package-specific result-handling policy

Decision:

- `ready` for a CBC-only basic package candidate

### Basic Glucose Screening

What exists:

- `medical_kb_v1_2#kb_v1_007` includes generic blood-glucose mention in a common blood-test explainer
- `knowledge_items#kb_002` adds a conservative note that some glucose tests may require fasting

What is still missing:

- dedicated glucose test source promoted into the versioned KB
- support for HbA1c or other diabetes-specific package components
- recommendation rules specific to diabetes-oriented screening

Decision:

- `partial`

### Basic Lipid Screening

What exists:

- `medical_kb_v1_2#kb_v1_007` includes generic lipid-profile mention in a common blood-test explainer
- `knowledge_items#kb_001` adds a conservative fasting note for lipid testing

What is still missing:

- dedicated lipid panel source
- cardiometabolic package logic
- supported wording for cardiovascular risk framing

Decision:

- `partial`

### Basic Liver / Metabolic Screening

What exists:

- no clean liver-specific package source in inspected repo artifacts

What is still missing:

- dedicated liver function test sources
- structured evidence for included tests
- package-level prep and interpretation boundaries

Decision:

- `blocked`

### Basic Kidney Function Screening

What exists:

- `medical_kb_v1_2#kb_v1_2_017` and `medical_kb_v1_2#kb_v1_2_018` directly support BMP as a basic metabolic panel with kidney-related screening context

What is still missing:

- package-specific explanation layer
- explicit runtime recommendation wiring

Decision:

- `ready` for a BMP-only basic package candidate

### Basic Infectious Screening (HBV/HIV)

What exists:

- no clean HBV/HIV screening source support in current repo state

What is still missing:

- raw/source material
- normalized and reviewed evidence
- package-specific recommendation policy

Decision:

- `blocked`

## Supported Ingestion Decision For This Pass

Conservative ingestion decision:

- use existing CBC and BMP evidence as the only direct package-support anchors
- use versioned KB references as the authoritative support anchor
- keep `knowledge_items` notes only as supplementary legacy support notes where equivalent versioned prep support is not available
- do not create or promote a runtime-facing package KB in this pass
- do not fabricate liver or HBV/HIV package entries

## Next Knowledge Gaps

The next pass needs source-backed additions for:

- dedicated glucose test support
- dedicated lipid panel support
- liver function test support
- HBV/HIV screening support
- package-level candidate and exclusion logic grounded in reviewed source material
