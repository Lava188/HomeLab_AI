# HomeLab AI Data Contract (Minimum Viable Release-Level Document)

## Purpose

This document records the minimum data-structure assumptions that can be grounded from the current repository during the Stage 1 baseline freeze polish pass.

It is not a full schema redesign. It is a conservative release-level reference for the current baseline only.

## Scope of this document

This document covers the minimum visible structures for:

- baseline KB items in `ai_lab/datasets/medical_kb_v1.json`
- baseline chunk metadata in `ai_lab/artifacts/retriever_v1/chunk_metadata.json`
- baseline chunk payload entries in `ai_lab/artifacts/retriever_v1/kb_chunks_v1.json`
- eval items in:
  - `ai_lab/datasets/eval/health_rag_eval_v1.json`
  - `ai_lab/datasets/eval/health_rag_eval_v1_1.json`

## Conservative schema note

Field lists below describe repository-observed baseline structures. They should be interpreted as minimum documented expectations rather than as exhaustive or future-proof contracts.

If later versions introduce new fields, those changes should be versioned explicitly rather than assumed to be part of the v1.1 baseline.

## Baseline KB item minimum fields

Observed in `medical_kb_v1.json`, baseline KB items commonly include:

- `id`
- `doc_id`
- `source_id`
- `source_name`
- `source_url`
- `section`
- `title`
- `content`
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

Fields such as `source_excerpt` are also present in observed items, but should be treated as supporting fields rather than the minimum release identity of a KB item.

### Required vs optional interpretation for baseline KB items

Conservative minimum required identity/content fields:

- `id`
- `source_id`
- `section`
- `title`
- `content`
- `risk_level`
- `faq_type`
- `use_in_v1`

Supporting or optional fields in current evidence:

- `doc_id`
- `source_name`
- `source_url`
- `source_excerpt`
- `language`
- `locale`
- `tags`
- `keywords`
- `test_types`
- `safety_notes`
- `review_status`

## Baseline chunk metadata minimum fields

Observed in `chunk_metadata.json`:

- `chunk_id`
- `kb_id`
- `source_id`
- `source_name`
- `section`
- `title`
- `risk_level`
- `faq_type`
- `use_in_v1`

These fields are sufficient to identify chunk-level release scope and source grouping at metadata level.

## Baseline chunk payload minimum fields

Observed in `kb_chunks_v1.json`, chunk payload entries commonly include:

- `chunk_id`
- `kb_id`
- `doc_id`
- `source_id`
- `source_name`
- `source_url`
- `section`
- `title`
- `content`
- `chunk_text`
- `risk_level`
- `tags`
- `keywords`
- `test_types`
- `faq_type`
- `safety_notes`
- `review_status`
- `use_in_v1`
- `language`
- `locale`

For retrieval-plus-policy baseline purposes, the most important minimum fields are:

- `chunk_id`
- `source_id`
- `section`
- `title`
- `content`
- `risk_level`
- `faq_type`
- `safety_notes`

## Eval item minimum fields

Observed in `health_rag_eval_v1.json`, eval items minimally include:

- `query`
- `expected_chunk_ids`
- `expected_source_id`
- `expected_section`

Observed in `health_rag_eval_v1_1.json`, eval items additionally include fields such as:

- `acceptable_source_ids`
- `acceptable_sections`

This suggests:

- `v1` eval format is stricter and simpler
- `v1_1` eval format preserves the baseline fields while allowing broader acceptable matches

## Required vs optional fields for eval items

Conservative minimum required eval fields:

- `query`
- `expected_chunk_ids`
- `expected_source_id`
- `expected_section`

Observed optional or extension-style eval fields:

- `acceptable_source_ids`
- `acceptable_sections`

## Versioning note

The current release freeze uses the following document-level version assumptions:

- KB version: `medical_kb_v1`
- chunk version: `kb_chunks_v1`
- retriever version: `v1`
- policy version: `response_policy_v1`

These values are grounded by current file names and manifests, not by a single unified schema registry.

## Release-level caution

This document describes the current baseline as found in the repository. It does not claim:

- a complete enterprise-grade schema specification
- cross-version backward compatibility guarantees
- that every runtime integration consumes every documented field

Those concerns should be handled separately in future iterations if the baseline evolves into a broader platform contract.
