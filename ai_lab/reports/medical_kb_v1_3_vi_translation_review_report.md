# medical_kb_v1_3 Vietnamese Translation Review Report

## Files

- Input candidate: `ai_lab/datasets/medical_kb_v1_3_encoding_schema_fixed_candidate.json`
- Output candidate: `ai_lab/datasets/medical_kb_v1_3_vi_review_candidate.json`

## Scope

Only the four Batch A v1_3 draft items were translated/reviewed:

- `kb_v1_3_039`
- `kb_v1_3_040`
- `kb_v1_3_041`
- `kb_v1_3_042`

No chunks, embeddings, FAISS index, retriever artifact, eval, backend, frontend, runtime, package catalog, or recommendation-layer file was rebuilt or modified.

## Translation Summary

- `kb_v1_3_039`: translated sepsis / severe infection warning into Vietnamese with explicit source scope for people aged 16 or over; kept wording non-diagnostic and avoided pediatric or pregnancy coverage claims.
- `kb_v1_3_040`: translated chest-pain emergency warning into Vietnamese; preserved escalation for chest pain with sweating, sickness, light-headedness, or shortness of breath; did not diagnose heart attack.
- `kb_v1_3_041`: translated shortness-of-breath emergency warning into Vietnamese; preserved escalation for very pale/blue/grey lips or skin and sudden confusion; did not diagnose the cause.
- `kb_v1_3_042`: translated blood-test interpretation limitation into Vietnamese; preserved the message that blood tests may need clinical interpretation and sometimes further tests.

## Emergency / High-Risk Items

High-risk emergency/red-flag items:

- `kb_v1_3_039`
- `kb_v1_3_040`
- `kb_v1_3_041`

Lower-risk explainer item:

- `kb_v1_3_042`

## Changed Fields

Allowed patient-facing/review fields changed: `title`, `content`, `language`, `locale`, `tags`, `keywords`, `faq_type`, `safety_notes`.

- `kb_v1_3_039`: changed `content, keywords, language, locale, safety_notes, tags, title`
- `kb_v1_3_040`: changed `content, keywords, language, locale, safety_notes, tags, title`
- `kb_v1_3_041`: changed `content, keywords, language, locale, safety_notes, tags, title`
- `kb_v1_3_042`: changed `content, keywords, language, locale, safety_notes, tags, title`

Allowed-scope check: `PASS`

## Protected Field Check

Protected fields requested by the workflow were not changed:

- `id`
- `source_url`
- `source_excerpt`
- `review_status`
- `runtime_enabled`
- `promotion_status`
- `use_in_v1`
- `kb_version`
- `release_version`

Protected-field validation: `PASS - no protected field changed.`

Non-target item validation: `PASS - no non-target item changed.`

## Draft Item Status After Translation

- `kb_v1_3_039`: language=`vi`, risk_level=`high`, faq_type=`red_flag_general`, review_status=`needs_manual_review`, runtime_enabled=`False`, promotion_status=`draft_kb_only`
- `kb_v1_3_040`: language=`vi`, risk_level=`high`, faq_type=`emergency_warning`, review_status=`needs_manual_review`, runtime_enabled=`False`, promotion_status=`draft_kb_only`
- `kb_v1_3_041`: language=`vi`, risk_level=`high`, faq_type=`emergency_warning`, review_status=`needs_manual_review`, runtime_enabled=`False`, promotion_status=`draft_kb_only`
- `kb_v1_3_042`: language=`vi`, risk_level=`low`, faq_type=`test_result_explainer`, review_status=`needs_manual_review`, runtime_enabled=`False`, promotion_status=`draft_kb_only`

## Manual Review Still Needed

Manual review is still required before any promotion or retriever build:

- Confirm Vietnamese wording is clinically conservative and understandable for patient-facing chatbot use.
- Confirm emergency escalation wording remains grounded in each source excerpt.
- Confirm `kb_v1_3_039` does not imply coverage for children, pregnancy, or recently pregnant people.
- Confirm no item implies HomeLab can diagnose, rule out disease, or replace clinical assessment.

Next step should be manual safety/language review of `ai_lab/datasets/medical_kb_v1_3_vi_review_candidate.json`, not retriever rebuild yet.
