# retriever_v1_3 Eval v2 Failure Triage

## Scope

This triage reviews the two failure cases from `ai_lab/reports/retriever_v1_3_eval_v2_report.json`. It does not modify KB data, retriever artifacts, embeddings, FAISS, backend, frontend, runtime configuration, recommendation logic, policy logic, or package catalog files.

## Eval Context

- Retriever version: `v1_3`
- KB version: `v1_3`
- Eval query count: `52`
- Hit@1: `0.9038`
- Hit@3: `0.9808`
- Hit@5: `0.9808`
- MRR@5: `0.9359`
- Keyword coverage@3: `0.9551`
- Failure cases: `2`

## Failure Case: v2_ambiguous_005

- Query: `triệu chứng của tôi có cần đi viện ngay hay chỉ theo dõi`
- Expected chunks: `kb_v1_004_c1`, `kb_v1_2_029_c1`, `kb_v1_2_031_c1`
- Expected sources: `nice_sepsis_overview`, `nhs_anaphylaxis`, `nhs_fainting_adults`
- Top5 chunks: `kb_v1_2_038_c1`, `kb_v1_010_c1`, `kb_v1_2_033_c1`, `kb_v1_2_022_c1`, `kb_v1_2_024_c1`
- Top5 sources: `nhs_stroke_symptoms`, `chest_pain`, `nhs_headaches`, `medlineplus_crp_test`, `medlineplus_ddimer_test`
- Keyword coverage@3: `0.6667`
- Issue type: `ambiguous_query_needs_clarification`

Short assessment: the query is intentionally under-specified and asks for a safety decision without naming symptoms. The retriever returns several emergency-adjacent red-flag topics, but not the specific expected sepsis/anaphylaxis/fainting chunks. This is not primarily a KB content failure; it indicates the runtime path needs a clarifying-question policy before relying on retrieval ranking.

Recommended next action: route vague urgent-sounding symptom questions through a clarification and safety-screening gate. The assistant should ask for key symptoms and escalate conservatively if the user reports red flags, rather than treating the top retrieved chunk as sufficient.

## Failure Case: v2_customer_need_003

- Query: `tôi muốn xét nghiệm vì nghi nhiễm trùng thì chỉ số nào liên quan`
- Expected chunks: `kb_v1_2_019_c1`, `kb_v1_2_021_c1`, `kb_v1_2_016_c1`
- Expected sources: `medlineplus_cbc_test`, `medlineplus_crp_test`, `medlineplus_blood_culture_test`
- Top5 chunks: `kb_v1_3_039_c1`, `kb_v1_3_042_c1`, `kb_v1_2_016_c1`, `kb_v1_001_c1`, `kb_v1_2_020_c1`
- Top5 sources: `nice_sepsis_guideline`, `blood_tests`, `medlineplus_blood_culture_test`, `nice_sepsis_overview`, `medlineplus_cbc_test`
- Keyword coverage@3: `0.3333`
- Issue type: `recommendation_layer_gap` and `eval_expectation_too_strict`

Short assessment: the query mixes customer intent, test selection, and suspected infection. The top result prioritizes severe infection safety content, while one expected lab source appears at rank 3 and another at rank 5. This ranking is clinically conservative, but it does not fully satisfy the eval expectation for lab-explainer coverage in the top 3.

Recommended next action: handle this class through an intent/recommendation-layer gate. The runtime should separate urgent infection safety screening from customer-facing test/package guidance. Eval expectations for mixed-intent test questions should also allow safety-first retrieval when infection risk terms are present, while requiring the recommendation layer to avoid implying that tests alone diagnose or rule out infection.

## Triage Summary

The two failures do not indicate that `retriever_v1_3` should be rejected outright. They expose integration gates that must be handled before runtime switch: vague symptom questions need clarification, and customer test-selection questions need intent routing through the recommendation layer with safety escalation preserved.
