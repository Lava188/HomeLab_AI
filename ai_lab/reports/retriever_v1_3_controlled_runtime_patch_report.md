# retriever_v1_3 Controlled Runtime Patch Report

## Scope

This patch prepares controlled runtime integration for `retriever_v1_3` without switching the default runtime to v1_3. It does not modify frontend code, KB JSON, chunks, embeddings, FAISS, retriever artifacts, offline eval scripts, package catalog, or recommendation catalog data.

## Files Changed

- `backend/src/services/health-rag/artifact-loader.service.js`
- `backend/src/services/health-rag/retriever.service.js`
- `backend/src/services/router-intent.service.js`
- `backend/src/services/router.service.js`
- `backend/src/services/rag.service.js`
- `backend/.env.example`
- `backend/scripts/smoke_retriever_v1_3_runtime_integration.js`
- `ai_lab/reports/retriever_v1_3_controlled_runtime_patch_report.md`

## Env Flags Added

- `HOMELAB_RETRIEVER_VERSION`
- `HOMELAB_RETRIEVER_FALLBACK_VERSION`

Backward compatibility is preserved:

- `HOMELAB_HEALTH_RAG_VERSION` remains supported.
- Priority is now `HOMELAB_RETRIEVER_VERSION > HOMELAB_HEALTH_RAG_VERSION > v1_2`.
- `.env.example` keeps the safe default as `v1_2`.
- `HEALTH_RAG_ARTIFACT_DIR` remains available as a direct artifact-folder override for controlled local testing.

## Fallback Behavior

The artifact loader now attempts to load the configured retriever first. If that version fails to load and no direct artifact-folder override is being used, it attempts `HOMELAB_RETRIEVER_FALLBACK_VERSION`, defaulting to `v1_2`.

Runtime metadata now includes:

- `requestedRetrieverVersion`
- `loadedRetrieverVersion`
- `fallbackUsed`
- `fallbackReason`

Fallback probe result:

- Requested version: `v9_missing`
- Fallback version: `v1_2`
- Loaded version: `v1_2`
- `fallbackUsed=true`
- Result: `PASS`

## Default Runtime Status

Runtime default has not been switched to `retriever_v1_3`.

The safe default remains `v1_2` through `.env.example` and the loader fallback default. `retriever_v1_3` can be tested only by setting `HOMELAB_RETRIEVER_VERSION=v1_3` or a direct controlled artifact override.

## v1_3 Sepsis Source Hint

`nice_sepsis_guideline` was added to the sepsis source handling in `backend/src/services/health-rag/retriever.service.js`.

Changes:

- Added `SOURCE_HINTS` entry for `nice_sepsis_guideline`.
- Added `nice_sepsis_guideline` to `TOPIC_SOURCE_GROUPS.sepsis`.
- Expanded sepsis query terms with `nhiem trung nang`.

## Ambiguous Urgent-Query Gate

`backend/src/services/router-intent.service.js` now detects vague urgent-disposition questions such as:

- `triệu chứng của tôi có cần đi viện ngay hay chỉ theo dõi`

Behavior:

- Returns a clarifying fallback response.
- Does not diagnose.
- Asks for the main symptom and red-flag details.
- Mentions emergency escalation if red flags are present.
- Does not route to package recommendation.

Smoke result for this case:

- Flow: `fallback`
- Action: `FALLBACK_RESPONSE`
- Low-confidence reason: `ambiguous_urgent_query_needs_clarification`
- Result: `PASS`

## Customer Test/Package Gate

Mixed customer test-selection and infection-risk questions now carry a router debug marker:

- `customerTestSafetyGate=true`

For health RAG responses, `router.service.js` applies a safety-first prefix when this gate is active.

Behavior:

- Safety screening appears before test explanation.
- The answer states that tests are supportive information only.
- It does not claim a single test can diagnose or rule out infection.
- It does not recommend a commercial test package.
- Package recommendations remain blocked by `package_catalog_v1.runtime_enabled=false`.

Smoke result for:

- `tôi muốn xét nghiệm vì nghi nhiễm trùng thì chỉ số nào liên quan`

Result:

- Flow: `health_rag`
- Primary mode: `informational_test`
- `customerTestSafetyGate=true`
- `customerTestSafetyGateApplied=true`
- No package-first answer
- Result: `PASS`

## E2E Smoke Test Result

Command:

```powershell
node backend\scripts\smoke_retriever_v1_3_runtime_integration.js
```

Environment used by the script:

- `HOMELAB_RETRIEVER_VERSION=v1_3`
- `HOMELAB_RETRIEVER_FALLBACK_VERSION=v1_2`

Smoke summary:

- Total cases: `6`
- Passed: `6`
- Failed: `0`
- Overall result: `PASS`

| Case | Flow | Action | Loaded retriever | Fallback | Result |
| --- | --- | --- | --- | --- | --- |
| `smoke_chest_pain_emergency` | `health_rag` | `ANSWER_HEALTH_QUERY` | `v1_3` | `false` | PASS |
| `smoke_shortness_blue_confused` | `health_rag` | `ANSWER_HEALTH_QUERY` | `v1_3` | `false` | PASS |
| `smoke_sepsis_worse_fast` | `health_rag` | `ANSWER_HEALTH_QUERY` | `v1_3` | `false` | PASS |
| `smoke_ambiguous_hospital` | `fallback` | `FALLBACK_RESPONSE` | n/a | n/a | PASS |
| `smoke_customer_infection_test` | `health_rag` | `ANSWER_HEALTH_QUERY` | `v1_3` | `false` | PASS |
| `smoke_general_test_package` | `health_rag` | `ANSWER_HEALTH_QUERY` | `v1_3` | `false` | PASS |

Emergency/urgent smoke cases did not produce package-first answers.

## Explicit Confirmation

- Runtime default has not been switched to `v1_3`.
- No frontend files were changed.
- No KB JSON files were changed.
- No chunks, embeddings, FAISS, or retriever artifact manifests were modified.
- No offline eval scripts were modified.
- No package catalog or recommendation catalog data was modified.

## Next Recommended Step

Run a controlled backend/API smoke pass with an actual backend process and `HOMELAB_RETRIEVER_VERSION=v1_3`, then compare response metadata and user-facing text against the six gate cases before considering any default runtime switch.
