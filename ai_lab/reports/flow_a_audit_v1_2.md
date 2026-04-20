# Flow A Audit v1_2

- Audit time (UTC): 2026-04-20T03:40:06+00:00
- AI root: `ai_lab`
- Baseline files detected:
  - ai_lab/raw/raw_manifest.jsonl
  - ai_lab/extracted/extract_manifest.jsonl
  - ai_lab/normalized/docs.jsonl
  - ai_lab/datasets/medical_kb_v1.json
  - ai_lab/artifacts/retriever_v1/retriever_manifest.json
  - ai_lab/datasets/eval/health_rag_eval_v1_1.json
  - ai_lab/reports/final_answer_simulation_v2.csv

- Baseline manifest count before expansion: 8
- New raw source folders detected: 14

## Already In raw_manifest.jsonl
- blood_tests
- cdc_dpdx_blood_collection
- cdc_specimen_packing_and_shipping
- chest_pain
- nice_sepsis_guideline
- nice_sepsis_overview
- shortness_of_breath
- who_infectious_shipping_guidance

## Newly Added To raw_manifest.jsonl
- medlineplus_blood_culture_test | group=patient_facing_secondary | url=https://medlineplus.gov/ency/article/003744.htm
- medlineplus_blood_testing_overview | group=duplicate_or_review_needed | url=https://medlineplus.gov/lab-tests/what-you-need-to-know-about-blood-testing/
- medlineplus_bmp_test | group=patient_facing_secondary | url=https://medlineplus.gov/lab-tests/basic-metabolic-panel-bmp/
- medlineplus_cbc_test | group=patient_facing_secondary | url=https://medlineplus.gov/lab-tests/complete-blood-count-cbc/
- medlineplus_crp_test | group=patient_facing_secondary | url=https://medlineplus.gov/lab-tests/c-reactive-protein-crp-test/
- medlineplus_ddimer_test | group=patient_facing_secondary | url=https://medlineplus.gov/lab-tests/d-dimer-test/
- medlineplus_pulse_oximetry_test | group=patient_facing_secondary | url=https://medlineplus.gov/lab-tests/pulse-oximetry/
- medlineplus_troponin_test | group=patient_facing_secondary | url=https://medlineplus.gov/lab-tests/troponin-test/
- nhs_anaphylaxis | group=patient_facing_primary | url=https://www.nhs.uk/conditions/anaphylaxis/
- nhs_blood_tests | group=duplicate_or_review_needed | url=https://www.nhs.uk/tests-and-treatments/blood-tests/
- nhs_fainting_adults | group=patient_facing_primary | url=https://www.nhs.uk/symptoms/fainting/
- nhs_headaches | group=patient_facing_primary | url=https://www.nhs.uk/symptoms/headaches/
- nhs_stomach_ache | group=patient_facing_primary | url=https://www.nhs.uk/symptoms/stomach-ache/
- nhs_stroke_symptoms | group=patient_facing_primary | url=https://www.nhs.uk/conditions/stroke/symptoms/

## Duplicate Candidates
- medlineplus_blood_testing_overview -> duplicate candidate of blood_tests
- nhs_blood_tests -> duplicate candidate of blood_tests
