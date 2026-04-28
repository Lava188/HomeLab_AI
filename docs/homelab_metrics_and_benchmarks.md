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
| Frontend manual smoke | manual frontend/runtime verification | Earlier controlled semantic/routing milestone: 8/8 PASS for urgent health, test advice, normal booking, and mixed booking + urgent health priority. This was not a dedicated v1.4 4B frontend smoke. |
| Recommendation Runtime 3B | `node backend/scripts/smoke_recommendation_runtime_3b.js` | 10/10 PASS; 3A regression `node backend/scripts/smoke_recommendation_runtime_3a.js` remains 8/8 PASS. |
| Recommendation API Metadata Contract 3C | `node backend/scripts/smoke_recommendation_api_3c.js` | 9/9 PASS; `{"total":9,"passed":9,"failed":0,"testAdviceHasRecommendation":true,"bookingUrgentNoRecommendation":true,"catalogDisabledKeepsPackageNull":true}`. |
| Recommendation Answer UX 3D | `node backend/scripts/smoke_recommendation_answer_ux_3d.js` | 7/7 PASS; `{"total":7,"passed":7,"failed":0}`. |
| Recommendation Flag-off Regression 3E | `node backend/scripts/smoke_recommendation_flag_off_3e.js` | 6/6 PASS after backend restart with `HOMELAB_RECOMMENDATION_RUNTIME_ENABLED=false`; no recommendation meta/UX/package IDs. |
| Recommendation Frontend Manual Smoke 3F | manual UI + Network verification | 7/7 PASS; UI stable, no raw package IDs, booking/urgent not interrupted, `recommendedPackage=null` when live disabled. Minor non-blocker: newline/bullet formatting can appear flattened. |
| Recommendation Catalog + Source Contract 3G | `node backend/scripts/smoke_recommendation_catalog_contract_3g.js` | 6/6 PASS; general/kidney answers no longer inherit mismatched chest pain/D-dimer sources, CBC boundary uses CBC source, urgent keeps suitable NHS source. |
| Controlled Live Package Recommendation 3H | `node backend/scripts/smoke_recommendation_live_package_3h.js` | 7/7 PASS with runtime gate and live package gate enabled; live gate off returns `recommendedPackage=null`. |
| KB/Retriever v1.4 Batch 4A source-backed pipeline | source registry / reviewed dataset / approved QA reports | 26 official sources; 55 approved, 58 revise, 15 reject, 0 pending; approved QA 55/55 PASS with warning/error 0. |
| Retriever v1.4 merged corpus + FAISS artifact | `ai_lab/artifacts/retriever_v1_4/retriever_manifest.json` | 97 records = 42 legacy v1_3 + 55 Batch 4A; `intfloat/multilingual-e5-small`, dim 384, `IndexFlatIP`; artifact validation warning/error 0. |
| Retriever v1.4 baseline eval v2 | `ai_lab/reports/retriever_v1_4_offline_eval_report_v2.json` | Hit@1 0.1500, Hit@3 0.2167, Hit@5 0.3000, MRR@5 0.1961. |
| Retriever v1.4 rerank 4A-14 | `ai_lab/reports/retriever_v1_4_rerank_eval_report.json` | Hit@1 0.2667, Hit@3 0.3500, Hit@5 0.3833, MRR@5 0.3103. |
| Retriever v1.4 topic-aware rerank 4A-15 | `ai_lab/reports/retriever_v1_4_topic_rerank_eval_report.json` | Hit@1 0.3500, Hit@3 0.3833, Hit@5 0.4000, MRR@5 0.3700. |
| Retriever v1.4 alias-expanded single search 4A-17 | `ai_lab/reports/retriever_v1_4_alias_expansion_eval_report.json` | Hit@1 0.3500, Hit@3 0.6500, Hit@5 0.7333, Hit@20 0.8833, MRR@5 0.4950. |
| Retriever v1.4 expanded-query + topic-aware rerank 4A-18 | `ai_lab/reports/retriever_v1_4_expanded_topic_rerank_eval_report.json` | Hit@1 0.6833, Hit@3 0.8333, Hit@5 0.8500, Hit@10/20 0.8833, MRR@5 0.7589, warning/error 0. |
| Retriever v1.4 held-out eval v3 4A-19 | `ai_lab/reports/retriever_v1_4_expanded_topic_rerank_eval_report_heldout_v3.json` | 40 rows; Hit@1 0.4750, Hit@3 0.8500, Hit@5 0.9000, Hit@10 0.9250, Hit@20 0.9250, MRR@5 0.6667, warning/error 0. |
| Retriever v1.4 controlled Python bridge 4B-1A | `python ai_lab/scripts/smoke_semantic_bridge_v1_4_controlled.py` | 10/10 PASS; v1_4 bridge loads `ai_lab/artifacts/retriever_v1_4`, strategy `expanded_query_topic_aware_rerank`. |
| Retriever v1.4 server contract 4B-1B | `python ai_lab/scripts/smoke_semantic_bridge_v1_4_server_contract.py` | 10/10 PASS + health OK; chunkCount 97, candidateTopKDefault 20, finalTopKDefault 5, runtime promotion flags false. |
| Retriever v1.4 Node controlled bridge 4B-2A | `node backend/scripts/smoke_semantic_bridge_v1_4_node_controlled.js` | 10/10 PASS; Node service can call v1.4 bridge when explicit flags are enabled. |
| Retriever v1.4 API controlled path 4B-2B | `node backend/scripts/smoke_api_retriever_v1_4_controlled_4b2b.js` | 9/9 normal PASS, 2/2 gate PASS; real `/api/chat` health RAG uses v1_4 semantic path under flags. |
| Router lab/test explanation 4B-2C | `node backend/scripts/smoke_router_lab_test_explanation_4b2c.js` | 11/11 PASS; lab explanation questions route to `health_rag` + `test_advice`, while gates remain intact. |
| Retriever v1.4 API regression 4B-2D | `node backend/scripts/smoke_api_retriever_v1_4_regression_4b2d.js` | 14/14 PASS; health/test-advice, urgent, booking/reschedule/cancel, recommendation gates, and edge routing preserved. |
| Retriever v1.4 flag-off regression 4B-2E | `node backend/scripts/smoke_api_retriever_v1_4_flag_off_4b2e.js` | 8/8 PASS; flag-off behavior does not expose v1.4 version/strategy/artifact/query-expansion metadata. |
| Retriever v1.4 fallback regression 4B-2F | `node backend/scripts/smoke_api_retriever_v1_4_fallback_4b2f.js` | 6/6 PASS; bad bridge URL/timeout falls back without crash and reports fallback metadata. |
| Retriever v1.4 provenance smoke 4B-2G | `node backend/scripts/smoke_api_retriever_v1_4_provenance_4b2g.js` | 11/11 PASS; API sources/provenance are allowlisted and do not surface revise/rejected/pending items. |

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
| KB v1.4 Batch 4A | Official sources | 26 |
| KB v1.4 Batch 4A | Human review approved/revise/reject/pending | 55 / 58 / 15 / 0 |
| KB v1.4 Batch 4A | Approved QA pass | 55/55 |
| Retriever v1.4 | Merged corpus records | 97 |
| Retriever v1.4 | Legacy v1_3 chunks retained | 42 |
| Retriever v1.4 | Approved Batch 4A items added | 55 |
| Retriever v1.4 | Embedding model | `intfloat/multilingual-e5-small` |
| Retriever v1.4 | Embedding dimension / index | 384 / `IndexFlatIP` |
| Retriever v1.4 artifact validation | Chunks / vectors / FAISS ntotal | 97 / 97 / 97 |

## Retriever v1.4 Batch 4A Offline Evidence

The v1.4 Batch 4A retrieval work is an offline, controlled evidence package only. It does not change backend runtime defaults.

| Step | Hit@1 | Hit@3 | Hit@5 | Hit@10 | Hit@20 | MRR@5 | Notes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Baseline eval v2 | 0.1500 | 0.2167 | 0.3000 | n/a | n/a | 0.1961 | Initial eval after label alignment. |
| 4A-14 rerank | 0.2667 | 0.3500 | 0.3833 | n/a | n/a | 0.3103 | Generic rerank reduced result-boundary dominance. |
| 4A-15 topic-aware rerank | 0.3500 | 0.3833 | 0.4000 | n/a | n/a | 0.3700 | Topic-aware boosts improved ranking slightly. |
| 4A-17 alias-expanded single search | 0.3500 | 0.6500 | 0.7333 | 0.8167 | 0.8833 | 0.4950 | Candidate generation improved strongly; top20 missing dropped to 7. |
| 4A-18 expanded-query + topic-aware rerank | 0.6833 | 0.8333 | 0.8500 | 0.8833 | 0.8833 | 0.7589 | Best eval v2 strategy; warning/error 0. |
| 4A-19 held-out v3 | 0.4750 | 0.8500 | 0.9000 | 0.9250 | 0.9250 | 0.6667 | 40 new natural Vietnamese queries; warning/error 0. |

Held-out v3 failure audit: `failed_at_3_count=6`, with `alias_gap_remaining=2`, `topic_missing_from_candidates=1`, and `acceptable_broad_domain_but_wrong_topic=3`.

Interpretation: 4A offline retrieval evidence is strong enough to proceed to a 4B controlled runtime candidate. It is not evidence for default/global promotion yet.

## Retriever v1.4 Batch 4B Runtime Smoke Evidence

The v1.4 Batch 4B runtime work is a controlled-only runtime path. It ports the 4A winning strategy into Python bridge + Node semantic bridge + real `/api/chat`, but only when explicit v1.4 flags are enabled. It is not a default/global promotion.

| Smoke / Regression | Scope | Result |
| --- | --- | --- |
| `smoke_semantic_bridge_v1_4_controlled.py` | Direct Python bridge v1.4 controlled retrieval. | 10/10 PASS. |
| `smoke_semantic_bridge_v1_4_server_contract.py` | Bridge server `/health` and `/query` contract. | 10/10 PASS + health OK. |
| `smoke_semantic_bridge_v1_4_node_controlled.js` | Backend Node semantic bridge service against v1.4 bridge. | 10/10 PASS. |
| `smoke_router_lab_test_explanation_4b2c.js` | Router/business intent for lab explanation questions and gates. | 11/11 PASS. |
| `smoke_api_retriever_v1_4_controlled_4b2b.js` | Real `/api/chat` controlled v1.4 health RAG path and gates. | 9/9 normal PASS, 2/2 gate PASS. |
| `smoke_api_retriever_v1_4_regression_4b2d.js` | Regression for health/test advice, urgent, booking/reschedule/cancel, recommendation gates, and edge lab education. | 14/14 PASS. |
| `smoke_api_retriever_v1_4_flag_off_4b2e.js` | Default/flag-off behavior. | 8/8 PASS; no v1.4 metadata when flags are off. |
| `smoke_api_retriever_v1_4_fallback_4b2f.js` | Bridge error/timeout fallback. | 6/6 PASS; no crash and fallback metadata is reported. |
| `smoke_api_retriever_v1_4_provenance_4b2g.js` | Runtime provenance, source allowlist, approved-only behavior, urgent and booking gates. | 11/11 PASS. |

4B runtime metadata checked through smoke includes `retrieverVersion="v1_4"`, `retrievalStrategy="expanded_query_topic_aware_rerank"`, `candidateTopK=20`, `finalTopK=5`, bridge status, fallback state, query-expansion details, `runtimePromoted=false`, and `runtimeDefaultChanged=false`.

Offline vs runtime distinction:

- 4A metrics measure retrieval quality over eval datasets and held-out queries.
- 4B smokes measure controlled runtime contract, routing, fallback, provenance, and safety gates through the bridge and `/api/chat`.
- Passing 4B smokes supports controlled runtime readiness, not default/global promotion.

## Recommendation Runtime Prototype Milestones

| Milestone | Meaning | Result |
| --- | --- | --- |
| 3B Recommendation Runtime Quality | `test_advice` can run controlled slot extraction, missing-context detection, red-flag screening, and `candidatePackageIds` metadata. It only runs when `HOMELAB_RECOMMENDATION_RUNTIME_ENABLED=true` and `intentGroup === "test_advice"`. | 10/10 PASS; 3A regression 8/8 PASS. |
| 3C API Metadata Contract | Real `/api/chat` responses expose recommendation metadata for `test_advice`; booking and `urgent_health` do not get `meta.recommendation`; mixed booking + urgent keeps urgent priority. | 9/9 PASS. |
| 3D Recommendation Answer UX | User-facing answer text uses recommendation metadata for natural Vietnamese ask-more, ready-but-catalog-disabled, and medical-review-boundary responses without exposing raw package IDs. | 7/7 PASS. |
| 3E Flag-off Regression | Recommendation runtime off means no recommendation meta, UX, package IDs, candidate IDs, or `recommendedPackage`, while routing still works. | 6/6 PASS. |
| 3F Frontend Manual Smoke | Browser UI and Network behavior match controlled recommendation expectations without exposing raw package IDs or interrupting booking/urgent flows. | 7/7 PASS; newline/bullet flattening is non-blocking UX polish. |
| 3G Catalog + Source Contract | Recommendation answer provenance is aligned to the answer; recommendation UX no longer shows unrelated RAG sources such as chest pain/D-dimer for general/kidney advice. | 6/6 PASS. |
| 3H Controlled Live Package | With `HOMELAB_RECOMMENDATION_RUNTIME_ENABLED=true` and `HOMELAB_RECOMMENDATION_LIVE_PACKAGE_ENABLED=true`, safe, sufficiently contextual `test_advice` can return a catalog-derived `recommendedPackage`. | 7/7 PASS; not default/global behavior. |

Catalog/live-gate note: with live package gate off or catalog runtime disabled, `recommendedPackage=null` is expected behavior, not a failure. Candidate package IDs may appear in metadata for debug/evaluation. With `HOMELAB_RECOMMENDATION_LIVE_PACKAGE_ENABLED=true` and enough safe context, 3H allows a catalog-derived `recommendedPackage` in controlled mode only.

Non-blocker tracking note: some `test_advice` rows can still use `selectedRetrievalMode="lexical_fallback"`. This does not block 3C because 3C validates the recommendation metadata contract through the real API, but it should remain visible if future work tightens semantic runtime coverage.

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
| Offline v1.4 artifact | PASS | 97 chunks/vectors/FAISS ntotal, provenance retained, warning/error 0. |
| Offline v1.4 retrieval strategy | PASS for controlled candidate | Expanded-query + topic-aware rerank passes eval v2 and held-out v3. |
| Controlled v1.4 runtime path | PASS | Python bridge, Node bridge, real `/api/chat`, flag-off, fallback, router, regression, and provenance smokes pass; default remains unchanged. |

Important distinction: the older semantic activation audit remains useful historical evidence, but the current milestone verifies controlled semantic retrieval through the persistent bridge rather than Node loading `.npy`/FAISS directly.

## API Smoke / Manual Smoke Status

| Smoke | Status | Notes |
| --- | --- | --- |
| Service-level controlled runtime smoke | PASS | `6/6 PASS` in `retriever_v1_3_controlled_runtime_patch_report.md`. |
| Real backend API smoke | PASS | `6/6 PASS`, no missing meta in `retriever_v1_3_api_smoke_report.md`. |
| Frontend manual smoke | PASS | Earlier manual frontend/runtime check passed 8/8 for semantic retrieval and intent priority cases; v1.4 4B still needs broader frontend/manual UX review before promotion. |
| Semantic activation audit | Historical FAIL | Older audit found lexical-only runtime; later controlled semantic bridge/retrieval milestone resolved this for gated runtime use. |
| Recommendation Runtime 3B | PASS | 10/10 PASS with 3A regression 8/8 PASS; catalog disabled keeps live recommendation off. |
| Recommendation API Metadata Contract 3C | PASS | 9/9 PASS; `test_advice` gets `meta.recommendation`, booking/urgent do not. |
| Recommendation Answer UX 3D | PASS | 7/7 PASS; answer text no longer exposes raw package IDs and does not chốt live packages. |
| Recommendation Flag-off Regression 3E | PASS | 6/6 PASS after backend restart with runtime flag off; no recommendation meta/UX/package IDs. |
| Recommendation Frontend Manual Smoke 3F | PASS | 7/7 PASS; UI/Network behavior matches expectations, with minor non-blocker newline/bullet flattening. |
| Recommendation Catalog + Source Contract 3G | PASS | 6/6 PASS; recommendation answers no longer show mismatched visible sources. |
| Controlled Live Package Recommendation 3H | PASS | 7/7 PASS behind `HOMELAB_RECOMMENDATION_LIVE_PACKAGE_ENABLED=true`; live gate off keeps `recommendedPackage=null`. |
| Retriever v1.4 Batch 4A offline artifact | PASS | Source-backed KB, human-reviewed approved items, merged corpus, embeddings/FAISS validation all pass offline. |
| Retriever v1.4 4A-18 eval v2 | PASS offline | Hit@3 0.8333, Hit@5 0.8500, MRR@5 0.7589. |
| Retriever v1.4 4A-19 held-out v3 | PASS offline | Hit@3 0.8500, Hit@5 0.9000, MRR@5 0.6667. |
| Retriever v1.4 4B controlled runtime smoke | PASS controlled runtime | Full bridge/API/router/flag-off/fallback/provenance smoke matrix passes; no default promotion. |

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
| Frontend manual smoke | PASS | Earlier controlled semantic retrieval + intentGroup manual check passed 8/8; not a dedicated v1.4 4B frontend smoke. |
| Semantic runtime active | PASS in controlled mode | Persistent bridge path returns `selectedRetrievalMode="semantic_faiss"` when enabled and healthy. |
| Default switch | NOT SWITCHED | Runtime remains controlled/opt-in; no global default promotion yet. |
| Retriever v1.4 runtime promotion | NOT SWITCHED | Offline evidence supports 4B controlled runtime candidate only. |
| Retriever v1.4 controlled runtime path | PASS | v1.4 runs through explicit flags only; flag-off and fallback regressions pass. |

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
| Recommendation/package runtime prototype | PASS through 3B/3C/3D/3E/3F/3G/3H controlled smokes |
| Controlled live package recommendation | PASS behind separate live gate; off by default, live gate off keeps `recommendedPackage=null` |
| KB/Retriever v1.4 Batch 4A offline pipeline | PASS through held-out v3; not runtime-promoted |
| KB/Retriever v1.4 Batch 4B controlled runtime | PASS controlled smokes; not default/global |
| Default switch | Not switched; controlled/opt-in |

## Missing Or Needs Verification

- Recommendation/test package runtime is a controlled slot-based prototype, not a full recommendation engine.
- 3H proves controlled live package return only when both runtime and live package gates are enabled.
- Production/default rollout still needs product review, catalog governance, and monitoring decisions.
- Broader default/runtime promotion remains a future decision after product review.
- Retriever v1.4 expanded-query + topic-aware rerank now has controlled runtime integration and smoke coverage, but broader frontend/manual UX and longer regression evidence are still needed before any default/global promotion.
- Held-out v3 is evidence and should be frozen; do not repeatedly tune against it.
