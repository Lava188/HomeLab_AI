# Manifest Consistency Report v1_2

## Scope
- Audited tree: `ai_lab/raw/`, `ai_lab/extracted/`
- Audited manifests:
  - `ai_lab/raw/raw_manifest.jsonl`
  - `ai_lab/extracted/extract_manifest.jsonl`

## Inventory Counts
- Raw source folders with `source.html`: 19
- Raw source folders with `source.pdf`: 3
- Total source folders represented in current raw layer: 22
- Entries in `raw_manifest.jsonl`: 22
- Extracted `.txt` files in `ai_lab/extracted/`: 22
- Entries in `extract_manifest.jsonl`: 22

## Match Summary
- Raw manifest matched completely against actual raw source folders: 22/22
- Extract manifest matched completely against actual extracted `.txt` files after patch: 22/22

## Fully Matched Sources
- `blood_tests`
- `cdc_dpdx_blood_collection`
- `cdc_specimen_packing_and_shipping`
- `chest_pain`
- `medlineplus_blood_culture_test`
- `medlineplus_blood_testing_overview`
- `medlineplus_bmp_test`
- `medlineplus_cbc_test`
- `medlineplus_crp_test`
- `medlineplus_ddimer_test`
- `medlineplus_pulse_oximetry_test`
- `medlineplus_troponin_test`
- `nhs_anaphylaxis`
- `nhs_blood_tests`
- `nhs_fainting_adults`
- `nhs_headaches`
- `nhs_stomach_ache`
- `nhs_stroke_symptoms`
- `nice_sepsis_guideline`
- `nice_sepsis_overview`
- `shortness_of_breath`
- `who_infectious_shipping_guidance`

## Missing Sources
- Raw manifest missing entries: none
- Extract manifest missing entries: none

## Orphan / Extra Sources
- Orphan raw manifest entries: none
- Orphan extract manifest entries: none

## Added Entries
- No new manifest entries were added in this pass.

## Patched Entries
- `extract_manifest.jsonl`
  - Corrected `char_count` for the following sources to match the actual `.txt` file contents exactly:
  - `medlineplus_blood_culture_test`
  - `medlineplus_blood_testing_overview`
  - `medlineplus_bmp_test`
  - `medlineplus_cbc_test`
  - `medlineplus_crp_test`
  - `medlineplus_ddimer_test`
  - `medlineplus_pulse_oximetry_test`
  - `medlineplus_troponin_test`
  - `nhs_anaphylaxis`
  - `nhs_blood_tests`
  - `nhs_fainting_adults`
  - `nhs_headaches`
  - `nhs_stomach_ache`
  - `nhs_stroke_symptoms`

## Path / Status Checks
- `raw_manifest.jsonl`
  - No duplicate `source_id`
  - All `local_path` values are repo-relative
  - All entries map to real raw sources in `ai_lab/raw/`
- `extract_manifest.jsonl`
  - No duplicate `source_id`
  - All `input_file` values are repo-relative
  - All `output_file` values are repo-relative
  - All `status` values match current extract state
  - No missing extract entries
  - No orphan extract entries

## Conclusion
- Final state: `CLEAN`
- Both manifests now reflect the current repo state accurately and are consistent with the current raw/extract pipeline layer.
