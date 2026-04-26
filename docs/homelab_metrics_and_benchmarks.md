# HomeLab Metrics And Benchmarks

## Benchmark / Evaluation Timeline

| Milestone | Report | Result |
| --- | --- | --- |
| Retrieval v1_2 eval | `ai_lab/reports/retrieval_eval_summary_v1_2.md` | Strong v1_2 baseline. |
| Recommendation controller eval v1 | `ai_lab/reports/recommendation_eval_summary_v1.md` | 24/24 passed. |
| Recommendation E2E-style eval v1 | `ai_lab/reports/recommendation_e2e_eval_summary_v1.md` | 25/25 passed. |
| Recommendation before/after benchmark | `ai_lab/reports/recommendation_before_after_benchmark_v1.md` | Improved 24, unchanged 1, regressed 0. |
| KB v1_3 packaging | `ai_lab/reports/medical_kb_v1_3_packaging_report.md` | PASS, 42 items. |
| Retriever v1_3 artifact build | `ai_lab/reports/retriever_v1_3_build_report.md` | PASS, 42 chunks, FAISS load PASS. |
| Retriever v1_3 eval | `ai_lab/reports/retriever_v1_3_eval_report.md` | 12 queries, all top-k metrics 1.0000. |
| Retriever v1_3 eval v2 | `ai_lab/reports/retriever_v1_3_eval_v2_report.md` | 52 queries, strong metrics, 2 failure cases. |
| Controlled runtime patch smoke | `ai_lab/reports/retriever_v1_3_controlled_runtime_patch_report.md` | 6/6 service-level PASS. |
| Backend API smoke | `ai_lab/reports/retriever_v1_3_api_smoke_report.md` | 6/6 API PASS. |
| Runtime semantic activation audit | `ai_lab/reports/runtime_semantic_activation_audit_v1_3.md` | Historical audit: semantic runtime inactive at that point; default switch was BLOCKED. |
| Controlled semantic retrieval + intentGroup routing | `ai_lab/reports/semantic_retrieval_controlled_hybrid_report.md` | 8/8 PASS; `selectedRetrievalMode="semantic_faiss"` verified for semantic health RAG cases and booking/test-advice split verified. |
| Frontend manual smoke | manual frontend/runtime verification | 8/8 PASS for urgent health, test advice, normal booking, and mixed booking + urgent health priority. |

## Key Metrics Found In Repo

| Area | Metric | Value |
| --- | --- | ---: |
| Retrieval v1_2 | Eval rows | 65 |
| Retrieval v1_2 | Strict Recall@1 | 0.9385 |
| Retrieval v1_2 | Strict Recall@3 | 1.0000 |
| Retrieval v1_2 | Strict Source Accuracy@1 | 0.9692 |
| Retrieval v1_2 | Strict Section Accuracy@1 | 1.0000 |
| Retrieval v1_2 | Acceptable Top-3 Match | 1.0000 |
| Retriever v1_3 eval | Query count | 12 |
| Retriever v1_3 eval | Hit@1 | 1.0000 |
| Retriever v1_3 eval | Hit@3 | 1.0000 |
| Retriever v1_3 eval | Expected source Hit@3 | 1.0000 |
| Retriever v1_3 eval | Expected keyword Hit@3 | 1.0000 |
| Retriever v1_3 eval v2 | Query count | 52 |
| Retriever v1_3 eval v2 | Hit@1 | 0.9038 |
| Retriever v1_3 eval v2 | Hit@3 | 0.9808 |
| Retriever v1_3 eval v2 | Hit@5 | 0.9808 |
| Retriever v1_3 eval v2 | MRR@5 | 0.9359 |
| Retriever v1_3 eval v2 | Keyword coverage@3 | 0.9551 |
| Retriever v1_3 eval v2 | Failure cases | 2 |
| Recommendation controller | Passed cases | 24/24 |
| Recommendation E2E-style | Passed cases | 25/25 |
| Recommendation before/after | Outcome accuracy | 0.44 -> 1.0 |
| Recommendation before/after | Package accuracy | 0.84 -> 1.0 |
| Recommendation before/after | Unsafe recommendation count | 0 -> 0 |

## Retriever v1_2 / v1_3 Comparison

| Version | Eval scope | Main numbers | Notes |
| --- | --- | --- | --- |
| v1_2 | 65-row retrieval eval | Recall@1 0.9385, Recall@3 1.0000 | Stable baseline. Residual misses are cross-red-flag overlaps but acceptable within top-3. |
| v1_3 | 12-query eval | Hit@1/3/source/keyword all 1.0000 | Small eval; report says candidate ready for larger eval before runtime switch. |
| v1_3 | 52-query eval v2 | Hit@1 0.9038, Hit@3 0.9808, MRR@5 0.9359 | Strong offline artifact result, but 2 integration gates remain. |

## Offline Artifact / Eval Vs Runtime Behavior

| Layer | Status | Evidence |
| --- | --- | --- |
| Offline v1_3 artifact | PASS | Build report validates JSON, 42 chunks, FAISS load, dimensions/config. |
| Offline v1_3 retrieval quality | PASS with integration caveats | Eval v2 has strong metrics and 2 triaged failures. |
| Controlled runtime wiring | PASS for service/API smoke | Six controlled cases pass in reports. |
| Runtime semantic retrieval | PASS in controlled mode | Persistent semantic bridge can provide semantic FAISS retrieval for health RAG with `selectedRetrievalMode="semantic_faiss"` and lexical fallback. |

Important distinction: the older semantic activation audit remains useful historical evidence, but the current milestone verifies controlled semantic retrieval through the persistent bridge rather than Node loading `.npy`/FAISS directly.

## API Smoke / Manual Smoke Status

| Smoke | Status | Notes |
| --- | --- | --- |
| Service-level controlled runtime smoke | PASS | `6/6 PASS` in `retriever_v1_3_controlled_runtime_patch_report.md`. |
| Real backend API smoke | PASS | `6/6 PASS`, no missing meta in `retriever_v1_3_api_smoke_report.md`. |
| Frontend manual smoke | PASS | Latest manual frontend/runtime check passed 8/8 for semantic retrieval and intent priority cases. |
| Semantic activation audit | Historical FAIL | Older audit found lexical-only runtime; later controlled semantic bridge/retrieval milestone resolved this for gated runtime use. |

## Controlled Semantic Retrieval + IntentGroup Manual Smoke

| Query | Expected intentGroup | Expected flow | Result | Notes |
| --- | --- | --- | --- | --- |
| nhiễm trùng nặng rất mệt xấu đi nhanh | `urgent_health` | `health_rag` | PASS | Uses controlled semantic retrieval for urgent/sepsis guidance. |
| nhiễm trùng nặng rất mệt xấu đi nhanh sepsis | `urgent_health` | `health_rag` | PASS | Semantically equivalent to the no-English-term query; same relevant sepsis source group. |
| đau ngực và mồ hôi khó thở | `urgent_health` | `health_rag` | PASS | Routes to urgent chest-pain guidance. |
| tôi muốn đặt lịch xét nghiệm vì đau ngực khó thở và vã mồ hôi | `urgent_health` | `health_rag` | PASS | Mixed booking + red flags prioritizes urgent health over booking. |
| tôi hay mệt và muốn biết nên xét nghiệm gì | `test_advice` | `health_rag` | PASS | Does not route to booking and does not answer as sepsis without red flags. |
| tôi muốn xét nghiệm tổng quát | `test_advice` | `health_rag` | PASS | Treated as test/package advice, not a booking action. |
| tôi muốn đặt lịch xét nghiệm tổng quát ngày mai | `booking` | `booking` | PASS | Explicit booking remains booking. |
| đặt lịch lấy mẫu máu tại nhà | `booking` | `booking` | PASS | Explicit sample-collection action remains booking. |

Result: **8/8 PASS**.

Meaning: this milestone reduces dependence on keyword-only routing and lowers the risk of confusing booking, test advice, and urgent health flows. Safety priority is now observable: urgent red flags override booking even in mixed queries.

## Historical Runtime Semantic Audit Findings

| Finding | Status |
| --- | --- |
| v1_3 artifact contains `chunk_embeddings.npy` | PASS |
| v1_3 artifact contains `faiss.index` | PASS |
| Node loader reads `.npy` embeddings | FAIL |
| Node runtime reads FAISS index | FAIL |
| Runtime creates real semantic query embedding | FAIL |
| `loadedEmbeddingVectorCount` | 0 |
| `semanticScore` in audited runtime chunks | 0 |
| Reported runtime mode | `lexical_only` |
| Default switch readiness | BLOCKED |

These findings describe the older pre-bridge runtime audit. Current controlled mode is verified separately above with `selectedRetrievalMode="semantic_faiss"` and 8/8 intentGroup/manual smoke PASS. Default/global runtime remains not switched.

## Pass / Fail / Blocker Table

| Item | Status | Notes |
| --- | --- | --- |
| KB v1_3 packaging | PASS | 42 items, duplicate check PASS. |
| Artifact build | PASS | 42 chunks, FAISS index load PASS, dimension match PASS. |
| Offline eval v1_3 | PASS | Strong eval results. |
| Controlled runtime wiring | PASS | Version/fallback/API metadata path can load v1_3. |
| Safety/clarification smoke | PASS in reports | Controlled smoke passes, but does not prove semantic retrieval. |
| Frontend manual smoke | PASS | Latest controlled semantic retrieval + intentGroup manual check passed 8/8. |
| Semantic runtime active | PASS in controlled mode | Persistent bridge path returns `selectedRetrievalMode="semantic_faiss"` when enabled and healthy. |
| Default switch | NOT SWITCHED | Runtime remains controlled/opt-in; no global default promotion yet. |

## Current Truth Table

| Question | Current truth |
| --- | --- |
| KB v1_3 packaging | PASS |
| Artifact build | PASS |
| Controlled runtime wiring | PASS |
| Backend API smoke | PASS |
| Semantic runtime active | PASS in controlled mode |
| IntentGroup routing priority | PASS, 8/8 manual smoke |
| Frontend manual smoke | PASS, 8/8 |
| Recommendation/package runtime validated in full app | Not yet; prototype needed |
| Default switch | Not switched; controlled/opt-in |

## Missing Or Needs Verification

- Recommendation/test package runtime is not yet a full engine; current `test_advice` is a business-intent gate.
- Broader default/runtime promotion remains a future decision after product review.
- End-to-end package recommendation runtime through frontend/backend still needs design and verification.
