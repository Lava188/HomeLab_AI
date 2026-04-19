# HomeLab AI Baseline Release Notes v1.1

- Release title: HomeLab AI baseline internal release v1.1
- Release version: v1.1
- Release date: 2026-04-17
- Release type: Internal baseline freeze

## Purpose

This release preserves the current HomeLab AI baseline as a documented internal reference package before any future knowledge base expansion, retriever improvement, reranking work, or model fine-tuning.

The purpose of this release is stability and comparability. It is not a redesign release.

## Supported scope

The baseline scope verified in this repository remains limited to the current `health_rag` v1 domain:

- basic blood test information
- basic preparation and result timing guidance for blood tests
- red-flag guidance for chest pain
- red-flag guidance for shortness of breath
- red-flag guidance for severe infection / sepsis awareness

The baseline does not claim support for diagnosis, prescribing, full treatment planning, or broad medical assistant behavior.

## Source of truth

The following files are treated as source-of-truth references for the frozen baseline package:

- KB source of truth:
  - `ai_lab/datasets/medical_kb_v1.json`
- Retriever source of truth:
  - `ai_lab/artifacts/retriever_v1/retriever_manifest.json`
  - `ai_lab/artifacts/retriever_v1/kb_chunks_v1.json`
  - `ai_lab/artifacts/retriever_v1/chunk_metadata.json`
  - `ai_lab/artifacts/retriever_v1/embedding_config.json`
- Policy source of truth:
  - `ai_lab/docs/response_policy_v1.md`
- Eval source of truth:
  - `ai_lab/datasets/eval/health_rag_eval_v1.json`
  - `ai_lab/datasets/eval/health_rag_eval_v1_1.json`
  - `ai_lab/reports/retrieval_eval_v1.csv`
  - `ai_lab/reports/retrieval_eval_v1_1.csv`
  - `ai_lab/reports/final_answer_simulation_v2.csv`

`ai_lab/docs/answer_policy.md` is not treated as an independent source of truth. During this polish pass, it is resolved as a stub reference file only.

## Active data sources used in the frozen baseline

Verified from current chunk metadata and datasets:

- `blood_tests` from NHS-derived material
- `chest_pain` from NHS-derived material
- `shortness_of_breath` from NHS-derived material
- `nice_sepsis_overview` from NICE-derived material

Current frozen retriever artifacts indicate:

- 15 approved chunks in `ai_lab/artifacts/retriever_v1/kb_chunks_v1.json`
- chunk metadata present in `ai_lab/artifacts/retriever_v1/chunk_metadata.json`
- baseline sections limited to:
  - `test_explainers`
  - `red_flags`

## Current retriever baseline

Verified facts:

- retriever version: `v1`
- chunk file: `kb_chunks_v1.json`
- metadata file: `chunk_metadata.json`
- FAISS index file present: `faiss.index`
- embedding file present: `chunk_embeddings.npy`
- embedding config present: `embedding_config.json`
- model name: `intfloat/multilingual-e5-small`
- embedding dimension: `384`
- index type: `IndexFlatIP`
- normalized embeddings: `true`
- retriever default top-k: `3`

Important note:

This release freezes the artifact package and baseline documentation state. It does not assert that every runtime path in the repository is using FAISS directly at inference time. In the current repository state, artifact-based integration and true retriever runtime may differ.

## Current policy baseline

Verified policy baseline:

- primary policy document: `ai_lab/docs/response_policy_v1.md`

Verified policy characteristics from the policy document:

- answer generation is intended to be grounded on retrieved chunks
- top-3 retrieval is treated as the decision basis rather than top-1 only
- emergency and red-flag content has higher priority than neutral informational content
- the system should not diagnose disease
- the system should not prescribe medication
- mixed emergency cases should be handled conservatively

## Current eval assets used as baseline

Verified evaluation and simulation assets present in the repository:

- `ai_lab/datasets/eval/health_rag_eval_v1.json`
- `ai_lab/datasets/eval/health_rag_eval_v1_1.json`
- `ai_lab/reports/retrieval_eval_v1.csv`
- `ai_lab/reports/retrieval_eval_v1_1.csv`
- `ai_lab/reports/final_answer_simulation_v2.csv`

These files are treated as the evaluation reference set available at inspection time.

## Reproducibility note

This release freeze and polish pass are documentation-level and inspection-level only.

Specifically:

- no chunking was regenerated
- no embeddings were regenerated
- no FAISS index was regenerated
- no eval outputs were regenerated
- no KB content was modified

All values in this release package were taken from files found in the repository at inspection time unless explicitly marked as inferred or unknown.

## Known limitations

- The baseline is intentionally small:
  - 15 chunks
  - 4 source groups
  - narrow health scope
- Runtime integration may use artifact-derived logic that is simpler than the original FAISS evaluation pipeline.
- `data_contract.md` and `eval_criteria.md` were incomplete before this polish pass and have now been upgraded only to minimum viable release-level documentation.
- The frozen baseline is suitable as a controlled comparison point, but not as a complete medical assistant baseline.

## Representative pass cases

The following are representative pass-case categories suggested by the available eval and report files. They were not re-executed during this polish-only task:

- blood test definition and basic explanation queries
- blood test preparation queries such as fasting before testing
- blood test result timing queries
- chest pain emergency wording queries
- shortness of breath emergency wording queries
- mixed chest pain plus shortness of breath red-flag cases

## Representative failure or limitation cases

The following are representative limitations suggested by existing reports and by the current narrow scope. They are included conservatively and should not be interpreted as a new evaluation run from this polish task:

- some mixed red-flag cases remain sensitive to retriever ordering across top-1 versus top-3
- some emergency-like cases depend heavily on policy-level interpretation rather than top-1 retrieval alone
- current release documentation quality is now improved, but still lighter than a full production specification
- the current baseline should not be interpreted as coverage for out-of-scope medical domains

## Intentionally not included yet

This release does not include:

- knowledge base expansion
- new medical source ingestion
- re-chunking
- new embeddings
- regenerated FAISS index
- reranker introduction
- answer generation redesign
- policy redesign
- backend architecture refactor
- fine-tuning or model adaptation

## Recommended next phase after v1.1

The recommended next phase after this freeze is:

1. preserve this release as the stable reference baseline
2. keep future comparisons explicitly tied to this release manifest
3. decide whether future retriever comparisons should use:
   - true FAISS runtime
   - artifact-adapter runtime
4. begin controlled KB expansion only after this baseline is treated as frozen
5. add lightweight automated validation for artifact presence and release consistency
