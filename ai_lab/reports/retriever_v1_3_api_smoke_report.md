# retriever_v1_3 API Smoke Report

## Scope

This smoke test calls the real backend HTTP endpoint `POST /api/chat`. It does not modify frontend code, KB files, retriever artifacts, embeddings, FAISS, offline eval files, or default runtime configuration.

## Runtime Setup Expected

- API base URL: `http://localhost:5013`
- Expected retriever version: `v1_3`
- Expected fallback version: `v1_2`
- Backend should be started separately with `HOMELAB_RETRIEVER_VERSION=v1_3` and `HOMELAB_RETRIEVER_FALLBACK_VERSION=v1_2`.

## Summary

- Total: `6`
- Passed: `1`
- Failed: `5`
- Missing meta count: `0`
- Recommendation: `do_not_switch_runtime_api_smoke_failed`

## Cases

| Case | HTTP | Flow | Action | Loaded Retriever | Fallback | Missing Meta | Result |
| --- | ---: | --- | --- | --- | --- | --- | --- |
| `api_chest_pain_emergency` | 200 | `health_rag` | `ANSWER_HEALTH_QUERY` | `v1_2` | `false` | `none` | FAIL |
| `api_shortness_blue_confused` | 200 | `health_rag` | `ANSWER_HEALTH_QUERY` | `v1_2` | `false` | `none` | FAIL |
| `api_sepsis_worse_fast` | 200 | `health_rag` | `ANSWER_HEALTH_QUERY` | `v1_2` | `false` | `none` | FAIL |
| `api_ambiguous_hospital` | 200 | `fallback` | `FALLBACK_RESPONSE` | `n/a` | `n/a` | `none` | PASS |
| `api_customer_infection_test` | 200 | `health_rag` | `ANSWER_HEALTH_QUERY` | `v1_2` | `false` | `none` | FAIL |
| `api_general_test_package` | 200 | `health_rag` | `ANSWER_HEALTH_QUERY` | `v1_2` | `false` | `none` | FAIL |

## Failure Cases

- `api_chest_pain_emergency`: expected loadedRetrieverVersion=v1_3, got v1_2
- `api_shortness_blue_confused`: expected loadedRetrieverVersion=v1_3, got v1_2
- `api_sepsis_worse_fast`: expected loadedRetrieverVersion=v1_3, got v1_2
- `api_customer_infection_test`: expected loadedRetrieverVersion=v1_3, got v1_2
- `api_general_test_package`: expected loadedRetrieverVersion=v1_3, got v1_2

## Missing Meta

- None

## Runtime Switch Note

This smoke test does not switch the default runtime to `v1_3`. Passing this API smoke test supports controlled runtime review only; a default switch still requires an explicit release decision.
