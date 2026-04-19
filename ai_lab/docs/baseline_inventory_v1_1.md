# HomeLab AI Baseline Inventory v1.1

## Metadata

- Last verified date: 2026-04-17
- Inspection scope:
  - `ai_lab/datasets/`
  - `ai_lab/artifacts/retriever_v1/`
  - `ai_lab/docs/`
  - `ai_lab/reports/`
- Usage note: this inventory is for release visibility and baseline freeze review. It is not, by itself, a runtime specification.

## Purpose

This inventory records the AI-side files inspected during the Stage 1 baseline freeze and subsequent polish pass for internal release `v1.1`.

Definitions used in this table:

- `Existence`
  - `present`: file existed at inspection time
  - `missing`: file was referenced in project context but was not found
- `Release status`
  - `required`: part of the frozen baseline release package
  - `optional`: useful supporting material, but not required to define the release package

## Inventory

| Path | Existence | Release status | Role |
| --- | --- | --- | --- |
| `ai_lab/datasets/medical_kb_v1.json` | present | required | Curated baseline KB dataset |
| `ai_lab/datasets/knowledge_items.json` | present | optional | Legacy or alternative dataset export retained in repo |
| `ai_lab/datasets/eval/health_rag_eval_v1.json` | present | required | Original eval set for narrow-scope retrieval validation |
| `ai_lab/datasets/eval/health_rag_eval_v1_1.json` | present | required | Updated eval set used in later baseline-era comparison |
| `ai_lab/artifacts/retriever_v1/kb_chunks_v1.json` | present | required | Frozen chunk payload for retriever baseline |
| `ai_lab/artifacts/retriever_v1/chunk_metadata.json` | present | required | Compact chunk metadata and source mapping |
| `ai_lab/artifacts/retriever_v1/faiss.index` | present | required | Frozen FAISS index artifact |
| `ai_lab/artifacts/retriever_v1/chunk_embeddings.npy` | present | required | Frozen embedding matrix artifact |
| `ai_lab/artifacts/retriever_v1/embedding_config.json` | present | required | Embedding and index configuration |
| `ai_lab/artifacts/retriever_v1/retriever_manifest.json` | present | required | Existing retriever manifest with model and top-k defaults |
| `ai_lab/docs/response_policy_v1.md` | present | required | Active policy source-of-truth for baseline answer behavior |
| `ai_lab/docs/answer_policy.md` | present | optional | Reference stub that redirects readers to `response_policy_v1.md` without introducing a second policy |
| `ai_lab/docs/data_contract.md` | present | required | Release-level schema note, previously empty and now minimally documented |
| `ai_lab/docs/eval_criteria.md` | present | required | Release-level evaluation criteria note, previously materially blank |
| `ai_lab/reports/retrieval_eval_v1.csv` | present | required | Retrieval evaluation output for v1 |
| `ai_lab/reports/retrieval_eval_v1_1.csv` | present | required | Retrieval evaluation output for v1.1-era comparison |
| `ai_lab/reports/final_answer_simulation_v2.csv` | present | required | Answer-policy simulation output |
| `ai_lab/reports/kb_chunk_stats_v1.csv` | present | optional | Chunk statistics support report |
| `ai_lab/reports/kb_candidate_blocks_v1.csv` | present | optional | KB extraction candidate support report |
| `ai_lab/reports/kb_review_queue_v1.csv` | present | optional | KB review support artifact |

## Baseline facts extracted from inspected files

Verified facts:

- retriever version explicitly found: `v1`
- chunk count explicitly found: `15`
- retriever model explicitly found: `intfloat/multilingual-e5-small`
- embedding dimension explicitly found: `384`
- index type explicitly found: `IndexFlatIP`
- default top-k explicitly found: `3`
- source groups found in chunk metadata:
  - `blood_tests`
  - `chest_pain`
  - `shortness_of_breath`
  - `nice_sepsis_overview`
- supported sections found in chunk metadata:
  - `test_explainers`
  - `red_flags`

## Notes

- This inventory is conservative. Presence in this file does not imply that every artifact is currently consumed by every runtime path.
- Release visibility and runtime behavior should be tracked separately.
