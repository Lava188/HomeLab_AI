# Flow A Final Report v1_2

## Changed Files
- ai_lab/raw/raw_manifest.jsonl
- ai_lab/extracted/extract_manifest.jsonl

## Created Files
- ai_lab/reports/flow_a_audit_v1_2.md
- ai_lab/reports/extraction_qc_v1_2.csv
- ai_lab/normalized/docs_v1_2.jsonl
- ai_lab/reports/kb_candidate_blocks_v1_2.csv
- ai_lab/reports/kb_review_report_v1_2.csv
- ai_lab/reports/kb_review_report_v1_2.md
- ai_lab/review/approved_chunk_v1_2.jsonl
- ai_lab/datasets/medical_kb_v1_2.json
- ai_lab/reports/kb_diff_v1_2.md
- ai_lab/datasets/eval/health_rag_eval_v1_2_release_candidate.json
- ai_lab/reports/flow_a_patch_report_v1_2.md

## Ingested Sources
- medlineplus_blood_culture_test: 1 approved KB item(s)
- medlineplus_bmp_test: 2 approved KB item(s)
- medlineplus_cbc_test: 2 approved KB item(s)
- medlineplus_crp_test: 2 approved KB item(s)
- medlineplus_ddimer_test: 2 approved KB item(s)
- medlineplus_pulse_oximetry_test: 2 approved KB item(s)
- medlineplus_troponin_test: 2 approved KB item(s)
- nhs_anaphylaxis: 2 approved KB item(s)
- nhs_fainting_adults: 2 approved KB item(s)
- nhs_headaches: 2 approved KB item(s)
- nhs_stomach_ache: 2 approved KB item(s)
- nhs_stroke_symptoms: 2 approved KB item(s)

## Excluded Or Held Out
- medlineplus_blood_testing_overview: General blood testing overview overlaps the existing NHS blood tests baseline and is held out to avoid duplicate ingestion.
- nhs_blood_tests: Exact NHS blood tests duplicate of the already-registered baseline source.

## KB-Ready State
- Expanded KB items: 38
- New approved KB items: 23
- Release-candidate eval rows prepared: 65
- Baseline v1 KB and retriever remain untouched.

## Official Notebook Outputs
- `ai_lab/artifacts/retriever_v1_2/` now contains the official notebook-built chunks, embeddings, FAISS index, and manifest.
- `ai_lab/reports/retrieval_eval_v1_2.csv` is the official retrieval evaluation report for `v1_2`.
- `ai_lab/reports/final_answer_simulation_v1_2.csv` is the official grounded response simulation report for `v1_2`.
- `ai_lab/artifacts/retriever_v1_2/release_manifest.json` records the current official artifact state.

## Manual Review Needed
- Re-check source wording for high-risk emergency content before runtime promotion.
- Decide whether MedlinePlus blood testing overview should stay held out or be merged later as a secondary anchor source.
- Keep script-generated fallback review outputs quarantined from official release artifacts.
