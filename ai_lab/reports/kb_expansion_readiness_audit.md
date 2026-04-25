# KB Expansion Readiness Audit

## Scope

This audit is read-only. It inspects the current HomeLab AI/RAG repository state before any new KB Expansion Batch A or RAG hardening work. No benchmark, embedding, FAISS, notebook, or evaluation pipeline was run.

## 1. Current KB State

### KB Dataset Files

Existing KB-related dataset files:

| File | Observed count | Notes |
|---|---:|---|
| `ai_lab/datasets/knowledge_items.json` | 20 items | Older/simple knowledge item format. |
| `ai_lab/datasets/medical_kb_v1.json` | 15 items | Baseline medical KB. |
| `ai_lab/datasets/medical_kb_v1_2.json` | 38 items | Latest versioned medical KB found. |
| `ai_lab/artifacts/retriever_v1/kb_chunks_v1.json` | 15 chunks | Retriever v1 chunk artifact. |
| `ai_lab/artifacts/retriever_v1_2/kb_chunks_v1_2.json` | 38 chunks | Latest retriever chunk artifact found. |

The current source of truth appears to be `ai_lab/datasets/medical_kb_v1_2.json`. Evidence:

- `ai_lab/artifacts/retriever_v1_2/release_manifest.json` lists `kb_version` as `medical_kb_v1_2`.
- `ai_lab/artifacts/retriever_v1_2/retriever_manifest.json` lists `kb_version` as `v1_2` and `chunk_count` as `38`.
- Current recommendation/package documentation references `medical_kb_v1_2#<kb_id>`.

### Current Topics and Source Groups

Current `medical_kb_v1_2.json` state:

- Item count: 38
- Sections: `red_flags`, `test_explainers`
- Source names: `NICE`, `NHS`, `MedlinePlus`
- Test types represented: `blood_culture`, `bmp`, `cbc`, `crp`, `d_dimer`, `pulse_oximetry`, `troponin`
- Risk levels represented: `high`, `medium`, `low`
- Release version: `v1_2`
- Runtime flags: all 38 items have `runtime_enabled=false`
- Promotion status: all 38 items have `promotion_status=draft_kb_only`

Current source coverage in `medical_kb_v1_2.json`:

| Source ID | KB items |
|---|---:|
| `blood_tests` | 5 |
| `chest_pain` | 3 |
| `medlineplus_blood_culture_test` | 1 |
| `medlineplus_bmp_test` | 2 |
| `medlineplus_cbc_test` | 2 |
| `medlineplus_crp_test` | 2 |
| `medlineplus_ddimer_test` | 2 |
| `medlineplus_pulse_oximetry_test` | 2 |
| `medlineplus_troponin_test` | 2 |
| `nhs_anaphylaxis` | 2 |
| `nhs_fainting_adults` | 2 |
| `nhs_headaches` | 2 |
| `nhs_stomach_ache` | 2 |
| `nhs_stroke_symptoms` | 2 |
| `nice_sepsis_overview` | 4 |
| `shortness_of_breath` | 3 |

The `retriever_v1_2` release manifest lists supported sections as `red_flags` and `test_explainers`, with `patient_facing_only=true`.

## 2. Raw Source State

### Existing Raw and Source Folders

Repository folders relevant to source ingestion:

- `ai_lab/raw/`
- `ai_lab/extracted/`
- `ai_lab/normalized/`
- `ai_lab/sources/`
- `ai_lab/review/`

Raw source folders currently present under `ai_lab/raw/`:

- `blood_tests`
- `cdc_dpdx_blood_collection`
- `cdc_specimen_packing_and_shipping`
- `chest_pain`
- `medlineplus_blood_culture_test`
- `medlineplus_blood_testing_overview`
- `medlineplus_bmp_test`
- `medlineplus_cbc_test`
- `medlineplus_crp_test`
- `medlineplus_ddimer_test`
- `medlineplus_pulse_oximetry_test`
- `medlineplus_troponin_test`
- `nhs_anaphylaxis`
- `nhs_blood_tests`
- `nhs_fainting_adults`
- `nhs_headaches`
- `nhs_stomach_ache`
- `nhs_stroke_symptoms`
- `nice_sepsis_guideline`
- `nice_sepsis_overview`
- `shortness_of_breath`
- `who_infectious_shipping_guidance`

### Manifest Registration

`ai_lab/raw/raw_manifest.jsonl` exists and contains 22 entries. All 22 raw source folders are registered in the manifest, and no registered source IDs are missing from the raw folder list.

Registered source names:

- `NHS`
- `CDC`
- `NICE`
- `WHO`
- `MedlinePlus`

Registered section targets:

- `test_explainers`
- `pre_test_guides`
- `red_flags`
- `sample_collection`
- `lab_ops`

Registered source-group labels where present:

- `patient_facing_primary`
- `patient_facing_secondary`
- `duplicate_or_review_needed`

Raw source folders not registered in `raw_manifest.jsonl`: none found.

Registered sources missing corresponding raw folders: none found.

`ai_lab/extracted/extract_manifest.jsonl` also exists and contains 22 entries. Existing `ai_lab/reports/manifest_consistency_report_v1_2.md` records the raw and extracted manifest state as clean.

### Batch A Status

No explicit artifact, folder, or report named `Batch A` was found in the inspected AI/RAG files. The repository does contain a completed `Flow A` / `v1_2` expansion path:

- `ai_lab/scripts/flow_a_expand.py`
- `ai_lab/reports/flow_a_audit_v1_2.md`
- `ai_lab/reports/flow_a_final_report_v1_2.md`
- `ai_lab/reports/flow_a_patch_report_v1_2.md`
- `ai_lab/reports/kb_v1_2_hardening_report.md`

Therefore, the current state is not merely raw folders. A prior v1_2 expansion has already ingested 23 new approved KB items into `medical_kb_v1_2.json` and produced official `retriever_v1_2` artifacts. However, a new phase explicitly named `KB Expansion Batch A` has not yet started as a separately labeled repo artifact.

## 3. Pipeline Scripts

### Existing Scripts and Notebooks

Python scripts under `ai_lab/scripts/`:

| File | Observed role |
|---|---|
| `ai_lab/scripts/flow_a_expand.py` | Monolithic/conservative Flow A expansion script covering audit, extraction/normalization helpers, candidate generation, KB item creation, draft eval preparation, and reporting. |
| `ai_lab/scripts/run_recommendation_eval.py` | Recommendation-layer evaluation script, not RAG KB expansion. |
| `ai_lab/scripts/run_recommendation_e2e_eval.py` | Recommendation-layer E2E-style evaluation script, not RAG KB expansion. |

Pipeline notebooks under `ai_lab/notebooks/`:

| Notebook | Observed role |
|---|---|
| `02_extract_and_normalize.ipynb` | Extraction and normalization route. |
| `03_curate_medical_kb.ipynb` | KB curation route. |
| `04_build_kb_chunks.ipynb` | Chunk build route; current runbook says it reads `medical_kb_v1_2.json` when `HOMELAB_KB_VERSION=v1_2`. |
| `05_build_embeddings_and_faiss.ipynb` | Embedding and FAISS build route. |
| `06_eval_retriever.ipynb` | Retriever evaluation route. |
| `07_simulate_top3_policy.ipynb` | Top-3 policy simulation route. |
| `08_simulate_grounded_response.ipynb` | Grounded response simulation route. |

### Missing or Unclear Pipeline Steps

- There is no small standalone Python script found for each individual step: extraction, normalization, chunking, embedding, FAISS build, and retriever evaluation. The official route appears to rely on notebooks plus the broader `flow_a_expand.py` script.
- Runtime promotion remains unclear. `medical_kb_v1_2.json` marks all 38 items as `runtime_enabled=false` and `promotion_status=draft_kb_only`, while `retriever_v1_2` artifacts have been built.
- `ai_lab/artifacts/retriever_v1_2/release_manifest.json` notes that the backend still uses lexical top-3 retrieval over `kb_chunks`, not direct FAISS search, by implementation design. That should be treated as a runtime integration boundary before any production/runtime claim.

## 4. Retriever and Eval Artifact State

### Retriever Artifact Folders

Existing artifact folders:

- `ai_lab/artifacts/audit/`
- `ai_lab/artifacts/rag_pipeline_v1/`
- `ai_lab/artifacts/retriever_v1/`
- `ai_lab/artifacts/retriever_v1_2/`

`ai_lab/artifacts/retriever_v1/` contains:

- `kb_chunks_v1.json`
- `chunk_metadata.json`
- `chunk_embeddings.npy`
- `faiss.index`
- `embedding_config.json`
- `retriever_manifest.json`
- `release_manifest.json`

`ai_lab/artifacts/retriever_v1_2/` contains:

- `kb_chunks_v1_2.json`
- `chunk_metadata.json`
- `chunk_embeddings.npy`
- `faiss.index`
- `embedding_config.json`
- `retriever_manifest.json`
- `release_manifest.json`

### Current Retriever Version

The latest retriever version found is `v1_2`.

From `ai_lab/artifacts/retriever_v1_2/retriever_manifest.json`:

- Retriever version: `v1_2`
- KB version: `v1_2`
- Chunk count: 38
- Embedding model: `intfloat/multilingual-e5-small`
- Default top-k: 3
- Build route: `official_notebook`

From `ai_lab/artifacts/retriever_v1_2/release_manifest.json`:

- Release version: `v1_2`
- Release date: `2026-04-21`
- KB version: `medical_kb_v1_2`
- Retriever version: `v1_2`
- Chunk version: `kb_chunks_v1_2`
- Index type: `IndexFlatIP`
- Embedding dimension: 384
- Normalized embeddings: `true`

### Eval Reports

Existing RAG evaluation dataset files:

| File | Rows |
|---|---:|
| `ai_lab/datasets/eval/health_rag_eval_v1.json` | 30 |
| `ai_lab/datasets/eval/health_rag_eval_v1_1.json` | 40 |
| `ai_lab/datasets/eval/health_rag_eval_v1_2_release_candidate.json` | 65 |

Existing retrieval evaluation reports:

| File | Rows / summary |
|---|---:|
| `ai_lab/reports/retrieval_eval_v1.csv` | 30 rows |
| `ai_lab/reports/retrieval_eval_v1_1.csv` | 40 rows |
| `ai_lab/reports/retrieval_eval_v1_2.csv` | 65 rows |
| `ai_lab/reports/retrieval_eval_summary_v1_2.md` | Summary present |

`ai_lab/reports/retrieval_eval_summary_v1_2.md` reports:

- Eval rows: 65
- Strict Recall@1: 0.9385
- Strict Recall@3: 1.0000
- Strict Source Accuracy@1: 0.9692
- Strict Section Accuracy@1: 1.0000
- Acceptable Top-3 Match: 1.0000

Existing grounded/final-answer simulation reports:

- `ai_lab/reports/final_answer_simulation_v1_2.csv`: 24 rows
- `ai_lab/reports/final_answer_simulation_v1_2.md`: summary present
- `ai_lab/reports/final_answer_simulation_v2.csv`: older report present

`ai_lab/reports/final_answer_simulation_v1_2.md` reports:

- Simulation rows: 24
- Mode accuracy: 0.9583
- Unsafe banned pattern count: 0
- Missing urgent wording count: 0
- Residual problem cases: 1

## 5. Readiness Assessment for KB Expansion Batch A

The repository is ready to begin a controlled Batch A planning step, but not ready for immediate embedding/index rebuild or runtime promotion without defining the Batch A delta first.

What is ready:

- Raw source inventory is registered: 22 raw folders and 22 raw manifest entries.
- Extracted layer is present: 22 extracted text files and 22 extract manifest entries.
- Current v1_2 KB is readable and counted: 38 items.
- Current v1_2 retriever artifacts are present and have official manifests.
- Current v1_2 retrieval and grounded-response eval reports are present.
- Baseline `retriever_v1` remains present for comparison/rollback.

What must be done first:

- Define what `Batch A` means relative to existing `Flow A` / `v1_2` artifacts.
- Decide whether Batch A starts from new raw sources, held-out existing sources, or additional curated items from already registered sources.
- Freeze the current v1_2 state as the pre-Batch-A baseline for comparison.
- Choose conservative target topics and acceptance criteria before creating or modifying KB data.
- Clarify whether runtime promotion is in scope, since current v1_2 KB entries are still marked `runtime_enabled=false`.

What should not be done yet:

- Do not regenerate embeddings.
- Do not rebuild FAISS.
- Do not rerun retrieval or recommendation benchmarks.
- Do not promote `medical_kb_v1_2.json` to runtime behavior.
- Do not mix recommendation-layer thesis evidence with the next RAG/KB expansion phase.
- Do not edit package or recommendation logic as part of Batch A readiness.

## 6. Recommended Next Step

Suggested next Codex prompt checklist:

1. Create a Batch A scope proposal that names the target source set and target topics only.
2. Compare proposed Batch A sources against `raw_manifest.jsonl`, `extract_manifest.jsonl`, and current `medical_kb_v1_2.json`.
3. Produce a no-write gap analysis showing which candidate sources are new, held out, duplicate, or already represented.
4. Select a small Batch A target, preferably 3-5 source/topic additions, before editing KB data.
5. Only after scope approval, create a versioned draft plan for `medical_kb_v1_3` or another explicit next version.

