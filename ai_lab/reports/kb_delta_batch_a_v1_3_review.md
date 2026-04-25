# KB Delta Batch A v1_3 Review

## Scope

This report documents the draft KB delta file for Batch A v1_3. It is a review artifact only. The production KB `ai_lab/datasets/medical_kb_v1_2.json` was not edited, and `ai_lab/datasets/medical_kb_v1_3.json` was not created.

## Draft Delta Summary

- Draft delta file: `ai_lab/review/kb_delta_batch_a_v1_3_draft.json`
- Draft delta items: 4
- Planned KB version: `medical_kb_v1_3`
- Planned release version: `v1_3`
- Runtime status: all items have `runtime_enabled=false`
- Promotion status: all items have `promotion_status=draft_kb_only`
- Review status: all items have `review_status=needs_manual_review`

## IDs Created

- `kb_v1_3_039`
- `kb_v1_3_040`
- `kb_v1_3_041`
- `kb_v1_3_042`

The current `medical_kb_v1_2.json` contains 38 items, ending at `kb_v1_2_038`. No existing ID collision was found for the four draft IDs.

## Source IDs Used

- `nice_sepsis_guideline`
- `chest_pain`
- `shortness_of_breath`
- `blood_tests`

All four sources are already registered in `ai_lab/raw/raw_manifest.jsonl` and `ai_lab/extracted/extract_manifest.jsonl`.

## Schema Assumptions

The draft delta follows the existing `medical_kb_v1_2.json` item schema as closely as possible. Existing v1_2 items use Vietnamese `language` and `locale` values, but these Batch A draft candidates are written in English from English extracted sources, so the draft uses `language=en` and `locale=en`.

The field `use_in_v1` is retained for schema compatibility and set to `false` because these are not v1 baseline items.

## Exact Fields Added

Each draft item includes:

- `id`
- `doc_id`
- `source_id`
- `source_name`
- `source_url`
- `section`
- `title`
- `content`
- `source_excerpt`
- `language`
- `locale`
- `risk_level`
- `tags`
- `keywords`
- `test_types`
- `faq_type`
- `safety_notes`
- `review_status`
- `use_in_v1`
- `kb_version`
- `release_version`
- `runtime_enabled`
- `promotion_status`

## Evidence and Safety Notes

### `kb_v1_3_039`

- Source: `nice_sepsis_guideline`
- Safety note: non-diagnostic severe infection wording. The source scope applies to people aged 16 or over who are not and have not recently been pregnant. The draft does not imply pediatric coverage.
- Evidence handling: uses a direct excerpt from `ai_lab/extracted/nice_sepsis_guideline.txt` describing recognition, early assessment, escalating care, and the adult scope.

### `kb_v1_3_040`

- Source: `chest_pain`
- Safety note: preserves emergency escalation wording but does not diagnose heart attack.
- Evidence handling: uses a direct excerpt from `ai_lab/extracted/chest_pain.txt` listing chest pain with sweating, sickness, light-headedness, or shortness of breath as emergency warning signs.

### `kb_v1_3_041`

- Source: `shortness_of_breath`
- Safety note: preserves emergency escalation wording but does not diagnose the cause of breathlessness.
- Evidence handling: uses a direct excerpt from `ai_lab/extracted/shortness_of_breath.txt` listing pale, blue, or grey lips/skin and sudden confusion as emergency warning signs.

### `kb_v1_3_042`

- Source: `blood_tests`
- Safety note: explains limitation and interpretation boundaries; does not imply blood tests alone diagnose or rule out conditions.
- Evidence handling: uses a direct excerpt from `ai_lab/extracted/blood_tests.txt` stating that other tests may sometimes be needed and blood test results can be complicated.

## Duplicate and Collision Check

- ID collision check: no collisions found against existing v1_2 IDs.
- Source duplication check:
  - `nhs_blood_tests` was not used because it is marked as an exact duplicate of `blood_tests`.
  - `medlineplus_blood_testing_overview` was not used because the accepted blood-test delta could be supported by the existing `blood_tests` source.
  - CDC, WHO, lab-operations, specimen packing, shipping, and sample-handling sources were not used.

## Modification Confirmation

No production KB, retriever, runtime, backend, frontend, package catalog, recommendation-layer, chunk, embedding, FAISS, or eval files were modified.

## Next Recommended Step

Manually review the four draft delta items for wording, source grounding, and safety. If accepted, the next controlled step should create a separate `medical_kb_v1_3.json` draft by appending this delta to the v1_2 KB, without rebuilding chunks, embeddings, FAISS, or eval until that draft is explicitly approved.

