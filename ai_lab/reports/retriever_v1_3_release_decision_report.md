# retriever_v1_3 Release Decision Report

## Executive Summary

`retriever_v1_3` has enough evidence for controlled frontend manual smoke testing, but it should not be switched on as the default runtime yet. The KB, artifact, offline eval, service-level smoke, and backend API smoke evidence are all favorable. The remaining release gate is manual frontend validation with the v1_3 runtime environment enabled in a controlled run.

## Current Status

- KB v1_3 is packaged as `ai_lab/datasets/medical_kb_v1_3.json`.
- Retriever artifact v1_3 exists at `ai_lab/artifacts/retriever_v1_3/`.
- Backend runtime can load v1_3 through environment configuration.
- Default runtime has not been switched to v1_3.
- Frontend manual smoke has not yet been completed.

## Evidence Collected

### KB v1_3 Packaging Status

- Report: `ai_lab/reports/medical_kb_v1_3_packaging_report.md`
- JSON parse: `PASS`
- Item count: `42`
- Duplicate ID check: `PASS`
- Batch A items `kb_v1_3_039` through `kb_v1_3_042`: `review_status=approved`
- Runtime flags remain protected: `runtime_enabled=false`, `promotion_status=draft_kb_only`, `use_in_v1=false`

### Artifact Build Status

- Report: `ai_lab/reports/retriever_v1_3_build_report.md`
- Artifact folder: `ai_lab/artifacts/retriever_v1_3/`
- Chunk count: `42`
- Build convention: one KB item equals one chunk
- FAISS index load: `PASS`
- Embedding dimension/config match: `PASS`
- New Batch A IDs present in chunks and metadata: `PASS`

### Offline Eval v2 Metrics

- Report: `ai_lab/reports/retriever_v1_3_eval_v2_report.md`
- Query count: `52`
- Hit@1: `0.9038`
- Hit@3: `0.9808`
- Hit@5: `0.9808`
- MRR@5: `0.9359`
- Keyword coverage@3: `0.9551`

### Failure Triage Result

- Report: `ai_lab/reports/retriever_v1_3_eval_v2_failure_triage.md`
- `v2_ambiguous_005`: classified as `ambiguous_query_needs_clarification`
- `v2_customer_need_003`: classified as `recommendation_layer_gap` and `eval_expectation_too_strict`
- Triage conclusion: failures do not reject v1_3; they require runtime integration gates.

### Controlled Runtime Patch Result

- Report: `ai_lab/reports/retriever_v1_3_controlled_runtime_patch_report.md`
- Service-level smoke: `6/6 PASS`
- Fallback probe: `PASS`
- Added runtime controls:
  - `HOMELAB_RETRIEVER_VERSION`
  - `HOMELAB_RETRIEVER_FALLBACK_VERSION`
  - compatibility with `HOMELAB_HEALTH_RAG_VERSION`
- Added integration behavior:
  - sepsis hint support for `nice_sepsis_guideline`
  - ambiguous urgent-query clarification gate
  - customer infection-test safety gate

### API Smoke Result

- Report: `ai_lab/reports/retriever_v1_3_api_smoke_report.md`
- Backend API path: real HTTP `POST /api/chat`
- Total cases: `6`
- Passed: `6`
- Failed: `0`
- Missing meta count: `0`
- Recommendation from API smoke: `do_not_switch_default_yet_controlled_api_smoke_passed`

## Runtime Default Status

The default runtime has not been switched to `retriever_v1_3`.

Controlled v1_3 runtime testing requires explicit environment configuration, for example:

- `HOMELAB_RETRIEVER_VERSION=v1_3`
- `HOMELAB_RETRIEVER_FALLBACK_VERSION=v1_2`

If a local backend `.env` sets `HEALTH_RAG_ARTIFACT_DIR`, that direct artifact override must also be reviewed during controlled testing.

## Risks Remaining

- Frontend manual smoke has not been completed.
- Recommendation/package layer behavior is not the target of v1_3 and should not be treated as validated by retriever evidence.
- Ambiguous questions still require clarifying behavior and must not be answered as certain medical decisions.
- Emergency/urgent signals must always take priority over recommendation or package-oriented responses.
- Backend runtime retrieval and offline FAISS retrieval are not identical paths, so frontend behavior must be checked through the real UI.

## Decision

Do not switch the default runtime to `retriever_v1_3` in this report.

`retriever_v1_3` is approved for manual frontend smoke testing in controlled mode only, using explicit v1_3 backend environment variables. A default switch should wait until the frontend smoke checklist is completed and reviewed.

## Conditions Required Before Default Switch

- Manual frontend smoke passes all six required cases.
- Emergency/urgent cases show safety-first behavior and no package-first recommendation.
- Ambiguous urgent query produces a clarifying response and does not diagnose.
- Customer infection-test query shows safety screening before or alongside test information.
- General test/package query does not bypass package runtime gating.
- Backend metadata confirms `loadedRetrieverVersion=v1_3` and `fallbackUsed=false` where health RAG is used.
- Any issues found during manual smoke are documented and triaged.

## Recommended Next Step

Run the manual frontend smoke checklist in `ai_lab/reports/retriever_v1_3_frontend_manual_smoke_checklist.md`, then record results in `ai_lab/reports/retriever_v1_3_frontend_manual_smoke_result_template.md`.
