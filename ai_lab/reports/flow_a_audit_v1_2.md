# Flow A Audit v1_2

- Audit time (UTC): 2026-04-21T03:15:58+00:00
- AI root: `ai_lab`
- Baseline files detected:
  - ai_lab/raw/raw_manifest.jsonl
  - ai_lab/extracted/extract_manifest.jsonl
  - ai_lab/normalized/docs.jsonl
  - ai_lab/datasets/medical_kb_v1.json
  - ai_lab/artifacts/retriever_v1/retriever_manifest.json
  - ai_lab/datasets/eval/health_rag_eval_v1_1.json
  - ai_lab/reports/final_answer_simulation_v2.csv

- Baseline manifest count before expansion: 22
- New raw source folders detected: 0

## Already In raw_manifest.jsonl
- blood_tests
- cdc_dpdx_blood_collection
- cdc_specimen_packing_and_shipping
- chest_pain
- medlineplus_blood_culture_test
- medlineplus_blood_testing_overview
- medlineplus_bmp_test
- medlineplus_cbc_test
- medlineplus_crp_test
- medlineplus_ddimer_test
- medlineplus_pulse_oximetry_test
- medlineplus_troponin_test
- nhs_anaphylaxis
- nhs_blood_tests
- nhs_fainting_adults
- nhs_headaches
- nhs_stomach_ache
- nhs_stroke_symptoms
- nice_sepsis_guideline
- nice_sepsis_overview
- shortness_of_breath
- who_infectious_shipping_guidance

## Newly Added To raw_manifest.jsonl

## Duplicate Candidates
- medlineplus_blood_testing_overview -> duplicate candidate of blood_tests
- nhs_blood_tests -> duplicate candidate of blood_tests

## Hybrid Strategy State
- Data and KB draft artifacts are ready under the versioned v1_2 outputs.
- Official chunking / embeddings / FAISS / retrieval-eval / grounded-simulation are still pending the notebook route.
- Any fallback-only review artifacts must stay quarantined and non-comparable to the frozen baseline.
