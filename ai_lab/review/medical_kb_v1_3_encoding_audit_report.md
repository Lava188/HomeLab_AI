# medical_kb_v1_3 Encoding Audit Report

## Input File

- `ai_lab/datasets/medical_kb_v1_3.json`

## Output Candidate File

- `ai_lab/datasets/medical_kb_v1_3_encoding_fixed_candidate.json`

## Summary

- Total items: `42`
- Input UTF-8 BOM detected: `True`
- Output candidate UTF-8 BOM detected: `False`
- Items with mojibake detected: `38`
- String fields with mojibake detected: `241`
- Fields safely fixed in candidate: `224`
- Protected field check: PASS - protected fields were not changed.

## Detection Notes

Mojibake was detected using common broken UTF-8 patterns such as `cÃ³`, `dáº¥u`, `nhiá»…m`, `Ã`, `áº`, `á»`, `Ä`, `Æ`, and related sequences. Candidate repair used a conservative cp1252-to-UTF-8 reversal only for non-protected string fields.

The following fields were intentionally not modified: `id`, `source_url`, `source_excerpt`, `review_status`, `runtime_enabled`, `promotion_status`.

## v1_3 English Draft Items Requiring Review / Translation

These four Batch A v1_3 draft items are currently English and should be manually reviewed and translated to Vietnamese before building `retriever_v1_3`:

- `kb_v1_3_039` / `nice_sepsis_guideline` / language=`en` / review_status=`needs_manual_review`
- `kb_v1_3_040` / `chest_pain` / language=`en` / review_status=`needs_manual_review`
- `kb_v1_3_041` / `shortness_of_breath` / language=`en` / review_status=`needs_manual_review`
- `kb_v1_3_042` / `blood_tests` / language=`en` / review_status=`needs_manual_review`

## Runtime / Retriever / Eval Confirmation

No runtime logic, backend, frontend, recommendation layer, package catalog, chunks, embeddings, FAISS index, retriever artifact, or eval was rebuilt or modified.

## Recommendation

Review `ai_lab/datasets/medical_kb_v1_3_encoding_fixed_candidate.json` against the original draft. If the candidate is accepted, use a separate controlled prompt to decide whether it should replace the draft KB before any chunk or retriever build.