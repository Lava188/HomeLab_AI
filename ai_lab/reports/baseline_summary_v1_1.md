# HomeLab Baseline Summary v1.1

## Baseline scope

The frozen AI baseline v1.1 covers a narrow `health_rag` scope:

- basic blood test information
- blood test preparation and result timing guidance
- chest pain red-flag guidance
- shortness of breath red-flag guidance
- severe infection / sepsis awareness guidance

The baseline is explicitly not a full medical assistant baseline.

## Baseline fingerprint

- KB file: `ai_lab/datasets/medical_kb_v1.json`
- Chunk file: `ai_lab/artifacts/retriever_v1/kb_chunks_v1.json`
- Chunk count: `15`
- Source groups count: `4`
- Source groups:
  - `blood_tests`
  - `chest_pain`
  - `shortness_of_breath`
  - `nice_sepsis_overview`
- Retriever model: `intfloat/multilingual-e5-small`
- Embedding dimension: `384`
- Index type: `IndexFlatIP`
- Normalized embeddings: `true`
- Retrieval top-k default: `3`
- Policy decision basis: `top-3 retrieved chunks`
- Main policy document: `ai_lab/docs/response_policy_v1.md`

## Key artifacts found

Verified during release inspection:

- KB dataset: `ai_lab/datasets/medical_kb_v1.json`
- Eval datasets:
  - `ai_lab/datasets/eval/health_rag_eval_v1.json`
  - `ai_lab/datasets/eval/health_rag_eval_v1_1.json`
- Retriever artifacts:
  - `ai_lab/artifacts/retriever_v1/kb_chunks_v1.json`
  - `ai_lab/artifacts/retriever_v1/chunk_metadata.json`
  - `ai_lab/artifacts/retriever_v1/faiss.index`
  - `ai_lab/artifacts/retriever_v1/chunk_embeddings.npy`
  - `ai_lab/artifacts/retriever_v1/embedding_config.json`
  - `ai_lab/artifacts/retriever_v1/retriever_manifest.json`
- Policy document:
  - `ai_lab/docs/response_policy_v1.md`
- Reports:
  - `ai_lab/reports/retrieval_eval_v1.csv`
  - `ai_lab/reports/retrieval_eval_v1_1.csv`
  - `ai_lab/reports/final_answer_simulation_v2.csv`

## Current readiness level

This baseline is release-freeze ready as an internal comparison package.

It is suitable for:

- thesis methodology reference
- regression comparison against future KB expansion
- retriever comparison against later iterations
- policy comparison against later answer-generation changes

It is not a production-grade AI release package.

## Known technical debt

- `answer_policy.md` was previously missing and is now resolved only as a stub reference file
- release documentation quality is improved, but still intentionally lightweight
- explicit release-level versioning did not exist before this freeze
- artifact presence remains stronger than full runtime specification

## Limitations of current retriever runtime vs true baseline

The frozen artifact baseline clearly includes FAISS and embedding outputs under `ai_lab/artifacts/retriever_v1`.

However, the repository may also contain runtime integrations that rely on JSON artifact reading rather than direct FAISS inference. This means the current runtime path can be simpler than the full evaluated retriever artifact stack, even though both are derived from the same frozen baseline package.

This distinction matters for future evaluation:

- artifact freeze preserves the baseline assets
- runtime implementation should be tracked separately when comparing later retriever changes

## Why this release freeze matters before KB expansion

Without a release freeze, later KB expansion or retriever changes would make it difficult to answer baseline comparison questions such as:

- which KB file defined the baseline
- which retriever artifact package was considered official
- which policy document was active
- which eval assets were considered in-scope

The v1.1 freeze establishes a stable comparison point before introducing new data or algorithmic changes.

## Recommended next steps

1. keep v1.1 unchanged as the internal baseline reference
2. tie future comparisons explicitly to `release_manifest.json`
3. decide whether future retriever experiments will compare against:
   - artifact-level baseline only
   - artifact plus exact runtime path
4. begin KB expansion only after v1.1 is treated as frozen
5. add lightweight automated validation for artifact presence and release consistency
