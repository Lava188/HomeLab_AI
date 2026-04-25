# KB Expansion Plan Batch A v1_3

## Current Baseline Summary

The current confirmed AI/RAG baseline is `v1_2`.

| Area | Current baseline |
|---|---|
| Source-of-truth KB | `ai_lab/datasets/medical_kb_v1_2.json` |
| KB item count | 38 items |
| Current retriever artifact | `ai_lab/artifacts/retriever_v1_2/` |
| Retriever version | `v1_2` |
| Chunk count | 38 chunks |
| Embedding model | `intfloat/multilingual-e5-small` |
| Retrieval eval baseline | `ai_lab/reports/retrieval_eval_v1_2.csv` and `ai_lab/reports/retrieval_eval_summary_v1_2.md` |
| Retrieval eval summary | 65 rows; Strict Recall@1 `0.9385`; Strict Recall@3 `1.0000`; Acceptable Top-3 Match `1.0000` |
| Grounded-response baseline | `ai_lab/reports/final_answer_simulation_v1_2.csv` and `ai_lab/reports/final_answer_simulation_v1_2.md` |
| Grounded-response summary | 24 rows; mode accuracy `0.9583`; unsafe banned pattern count `0`; residual problem cases `1` |

The next planned KB version is `medical_kb_v1_3`. The next planned retriever artifact version is `retriever_v1_3`.

## Batch A Goal

Batch A should make a small, controlled improvement to the existing patient-facing KB coverage without changing runtime behavior. The goal is to strengthen already-supported domains with clearer explanation, limitation, and urgent-care wording where the current v1_2 KB is thin.

This step does not modify KB data yet. It creates only the scope and gap-analysis package for a future v1_3 drafting step.

## Scope Include

Batch A may include only targeted additions for the following domains:

- Blood tests
- Chest pain
- Shortness of breath
- Sepsis / severe infection red flags

Batch A may use only registered and extracted sources unless a later approved prompt explicitly adds new raw sources. Candidate additions should be patient-facing, concise, and traceable to existing source IDs.

## Scope Exclude

Batch A excludes:

- New broad disease domains outside the four target domains.
- Clinician-facing, laboratory-operations-heavy, shipping, packing, or specimen-handling content for patient-facing KB use.
- Backend runtime changes.
- Frontend changes.
- Recommendation-layer changes.
- Package-catalog changes.
- Runtime promotion of any KB item.
- Embedding, FAISS, chunk, or evaluation rebuilds during this planning step.

## Target Domains Only

The allowed Batch A target domains are:

1. Blood tests
2. Chest pain
3. Shortness of breath
4. Sepsis / severe infection red flags

No other topic should be added in Batch A.

## Source Selection Rules

- Prefer patient-facing NHS, NICE, or MedlinePlus-style content.
- Prefer sources already registered in `ai_lab/raw/raw_manifest.jsonl` and `ai_lab/extracted/extract_manifest.jsonl`.
- Use `medical_kb_v1_2.json` as the comparison baseline.
- Treat `duplicate_or_review_needed` sources as review candidates, not automatic ingestion candidates.
- Avoid duplicate ingestion of `nhs_blood_tests` because it is marked as an exact duplicate of `blood_tests`.
- Treat `medlineplus_blood_testing_overview` as a possible secondary review source only if it adds non-duplicative patient-facing limitation or preparation wording.
- Treat `nice_sepsis_guideline` as review-required because it is registered and extracted but not currently represented in the v1_2 KB.
- Do not use CDC or WHO lab-operations sources for patient-facing Batch A additions unless the content is explicitly excluded from the patient-facing KB.

## Patient-Facing Safety Rules

- Do not provide diagnosis.
- Do not imply that HomeLab replaces clinical assessment.
- Use urgent/emergency wording only when grounded by the source.
- Preserve clear escalation language for chest pain, shortness of breath, and severe infection red flags.
- Keep limitation/disclaimer text concise and understandable for non-clinician users.
- Avoid technical laboratory operations instructions in patient-facing KB entries.
- Keep high-risk red-flag entries conservative and review-required before any future runtime promotion.

## Expected Output Size

Batch A should be small:

- Recommended additions: 3 to 5 new KB items maximum.
- Recommended scope: one focused addition per selected gap, not a broad rewrite.
- Recommended version target: `medical_kb_v1_3`.
- Recommended artifact target after future approved build steps: `retriever_v1_3`.

## Planned Versioning

- Planned KB version: `medical_kb_v1_3`
- Planned retriever artifact version: `retriever_v1_3`
- Planned chunk artifact version: `kb_chunks_v1_3`
- Planned eval comparison baseline: current `v1_2` reports and manifests

The repository is already at `v1_2`, so Batch A must not use `v1_1` as the next version.

## Do Not Do Yet

- Do not edit `ai_lab/datasets/medical_kb_v1_2.json`.
- Do not create `ai_lab/datasets/medical_kb_v1_3.json` yet.
- Do not rebuild chunks.
- Do not rebuild embeddings.
- Do not rebuild FAISS.
- Do not rerun eval.
- Do not touch backend, frontend, package logic, or recommendation-layer logic.

