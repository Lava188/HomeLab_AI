# medical_kb_v1_3 Encoding Schema Fix Report

## Files

- Source encoding-fixed candidate: `ai_lab/datasets/medical_kb_v1_3_encoding_fixed_candidate.json`
- Original v1_3 draft used for `test_types`: `ai_lab/datasets/medical_kb_v1_3.json`
- Output schema-fixed candidate: `ai_lab/datasets/medical_kb_v1_3_encoding_schema_fixed_candidate.json`

## Validation Results

- JSON parses successfully: `PASS`
- Output UTF-8 BOM detected: `False`
- Total item count remains 42: `PASS` (`42` items)
- No duplicate IDs: `PASS`
- ID order unchanged: `PASS`
- Every item has `test_types` as a JSON array: `PASS`
- `test_types` matches original `medical_kb_v1_3.json` by item ID: `PASS`
- Previously fixed text remains unchanged from encoding-fixed candidate: `PASS`
- Protected fields remain unchanged from encoding-fixed candidate: `PASS`
- Protected fields match original v1_3 draft: `PASS`
- Remaining non-protected mojibake markers after schema fix: `0`

## Restored `test_types`

`test_types` was restored exactly from `ai_lab/datasets/medical_kb_v1_3.json` for every matching item ID. Empty values remain `[]`, and single-item values remain JSON arrays such as `["cbc"]`. No empty array is serialized as `{}`, and no single-item array is serialized as a string.

## Four Batch A Draft Items

The four Batch A v1_3 draft items were not translated in this step and remain English, manual-review-only, runtime-disabled, and draft-only:

- `kb_v1_3_039` / `nice_sepsis_guideline`
- `kb_v1_3_040` / `chest_pain`
- `kb_v1_3_041` / `shortness_of_breath`
- `kb_v1_3_042` / `blood_tests`

Validation for these four draft items: `PASS`

## Protected Fields

The following fields were not changed by this schema repair:

- `id`
- `source_url`
- `source_excerpt`
- `review_status`
- `runtime_enabled`
- `promotion_status`
- `use_in_v1`
- `kb_version`
- `release_version`

## Runtime / Retriever / Eval Confirmation

No chunks, embeddings, FAISS index, retriever artifact, eval, backend, frontend, runtime, package catalog, or recommendation-layer file was rebuilt or modified.

## Next Step

Next step should be manual Vietnamese translation and safety review of the four Batch A draft items. Do not rebuild `retriever_v1_3` yet.
