# HomeLab Project Handoff

## Project Overview

HomeLab is a prototype AI healthcare chatbot for lab-test and symptom guidance. The project is moving from a simple chat/demo toward a professional, safety-aware product that can understand natural Vietnamese questions, route intent, retrieve grounded medical/lab knowledge, ask clarifying questions when needed, and avoid unsafe diagnosis or package-first recommendations.

## Final Product Goal

The desired product behavior is:

- User asks a natural question about symptoms, tests, results, or packages.
- System analyzes semantic intent and missing context.
- System asks follow-up questions when the input is vague or safety-critical.
- System retrieves relevant medical/lab knowledge from the KB.
- System answers flexibly, grounded in sources, with citations/metadata.
- System escalates urgent or emergency red flags.
- System recommends lab packages only when safe, relevant, and enabled.

The project must not stop at a keyword/template chatbot.

## Current Architecture Summary

| Area | Current shape |
| --- | --- |
| Frontend | React/Vite chat UI in `frontend/src`. Sends `POST /api/chat` via `frontend/src/api/chatApi.ts`; displays reply, flow/action, citation source, and clarification variant. |
| Backend | Express-style chat path: route/controller -> `backend/src/services/router.service.js` -> booking/reschedule/cancel/RAG services. |
| Router | `backend/src/services/router-intent.service.js` uses TF-IDF prototype intent routing plus controlled business intent grouping: `urgent_health`, `test_advice`, `booking`, and `general_health`. Safety priority is explicit: urgent red flags override booking/sample-collection actions. |
| Health RAG | `backend/src/services/rag.service.js` can run controlled semantic retrieval when enabled. Runtime metadata exposes `selectedRetrievalMode`, with `semantic_faiss` for controlled semantic retrieval and lexical fallback when needed. Answers remain grounded through `policy.service.js` and `answer.service.js`. |
| KB/artifacts | Retriever artifacts live under `ai_lab/artifacts/retriever_v1*`. Current v1_3 artifact has chunks, metadata, `.npy` embeddings, FAISS index, and manifest. |
| Recommendation | Controlled slot-based recommendation/test package runtime prototype exists for `test_advice`. It extracts slots, exposes candidate package metadata, improves answer UX, controls recommendation sources, and can return a live `recommendedPackage` only when the separate live package gate is explicitly enabled. |

## Current Milestone

**Recommendation/Test Package Runtime Prototype**.

HomeLab has completed the current stage of the controlled slot-based recommendation/test package runtime prototype. The runtime only runs when `HOMELAB_RECOMMENDATION_RUNTIME_ENABLED=true` and `intentGroup === "test_advice"`. It does not run for `urgent_health` or booking flows.

Live package return is controlled by a separate gate, `HOMELAB_RECOMMENDATION_LIVE_PACKAGE_ENABLED=true`. With runtime on and live gate off, `recommendedPackage` remains `null`. With both gates on and enough safe context, `recommendedPackage` can be non-null. This is still controlled mode, not default/global production behavior.

## KB/Retriever v1.4 Batch 4A Offline Status

KB/Retriever v1.4 Batch 4A has completed the offline RAG-first pipeline through held-out evaluation, without runtime promotion.

- Source registry: 26 authoritative patient-facing sources from `medlineplus.gov`, `nhs.uk`, and `niddk.nih.gov`.
- Human review outcome: 55 approved KB items, 58 revise, 15 reject, 0 pending.
- Final approved QA: 55/55 pass; `warning_count=0`, `error_count=0`, `duplicate_like_count=0`, `suspected_noise_count=0`, `missing_provenance_count=0`.
- Offline merged corpus: 97 total records = 42 legacy v1_3 chunks + 55 approved Batch 4A items.
- Offline embeddings/FAISS: `intfloat/multilingual-e5-small`, dimension 384, normalized embeddings, `IndexFlatIP`.
- Artifact validation: `total_chunks=97`, `embedding_vector_count=97`, `faiss_ntotal=97`, `warning_count=0`, `error_count=0`.
- Best offline strategy so far: expanded-query + topic-aware rerank, not yet ported to runtime.
- Held-out v3 should be frozen as evidence and not repeatedly tuned against.

Decision: offline retrieval evidence is strong enough to proceed to a **4B controlled runtime candidate**, but retriever v1.4 must not become the default/global runtime yet.

## Current Status

- KB/retriever v1_3 artifact has been built successfully.
- Offline v1_3 retrieval evals are strong.
- Persistent Python semantic bridge is available and verified with `runtimeMode=semantic_faiss`.
- Controlled semantic retrieval is available behind runtime flags and returns `selectedRetrievalMode="semantic_faiss"` for health RAG when enabled.
- Intent grouping is active in backend metadata: `urgent_health`, `test_advice`, `booking`, and `general_health`.
- Frontend manual test for the latest routing and controlled semantic retrieval milestone passed **8/8**.
- Default runtime/env has **not** been switched globally; semantic retrieval remains controlled/opt-in.
- Recommendation Runtime 3B is accepted: `test_advice` -> slot extraction -> `candidatePackageIds`, with smoke **10/10 PASS** and 3A regression **8/8 PASS**.
- Recommendation API Metadata Contract 3C passed **9/9** via `node backend/scripts/smoke_recommendation_api_3c.js`; API metadata includes `intentGroup`, `selectedRetrievalMode`, `meta.recommendation`, slots/missing slots, candidate package IDs, and `decisionType` when applicable.
- Recommendation Answer UX 3D passed **7/7** via `node backend/scripts/smoke_recommendation_answer_ux_3d.js`; ask-more, ready-but-catalog-disabled, and medical-review-boundary answers are safer and more natural in Vietnamese.
- Recommendation flag-off regression 3E passed **6/6** after restarting backend with `HOMELAB_RECOMMENDATION_RUNTIME_ENABLED=false`; no recommendation meta, UX, package IDs, or `recommendedPackage` are exposed when runtime is off.
- Recommendation frontend manual smoke 3F passed **7/7**; UI did not break, raw package IDs were not exposed, booking and urgent health were not interrupted, and `recommendedPackage` stayed `null` when live recommendation was disabled. Minor non-blocker: newline/bullet formatting in the UI can appear flattened.
- Catalog Contract + Recommendation Source Contract 3G passed **6/6**; general/kidney recommendation answers no longer inherit mismatched visible sources such as chest pain or D-dimer, CBC boundary uses CBC source, and urgent answers keep suitable urgent/NHS source behavior.
- Controlled Live Package Recommendation 3H passed **7/7** with `HOMELAB_RECOMMENDATION_RUNTIME_ENABLED=true` and `HOMELAB_RECOMMENDATION_LIVE_PACKAGE_ENABLED=true`; when live gate is off, 3C/3D/3G still pass and `recommendedPackage` returns to `null`.
- Default/global live package recommendation is not enabled. Safety gates remain: `urgent_health`, booking, `medical_review_boundary`, and missing required context do not return live packages.
- KB/Retriever v1.4 Batch 4A offline pipeline is complete through 4A-19. Runtime is unchanged; v1_4 is not promoted as default.
- 4A-18 expanded-query + topic-aware rerank on eval v2 reached Hit@1 0.6833, Hit@3 0.8333, Hit@5 0.8500, Hit@10 0.8833, Hit@20 0.8833, MRR@5 0.7589.
- 4A-19 held-out v3 reached total 40, Hit@1 0.4750, Hit@3 0.8500, Hit@5 0.9000, Hit@10 0.9250, Hit@20 0.9250, MRR@5 0.6667, warning/error 0.

## What Is Already Done

- KB v1_3 packaged with 42 items.
- Batch A v1_3 items `kb_v1_3_039` to `kb_v1_3_042` approved in packaging report.
- Retriever v1_3 artifact built at `ai_lab/artifacts/retriever_v1_3/`.
- Artifact includes `kb_chunks_v1_3.json`, `chunk_metadata.json`, `chunk_embeddings.npy`, `faiss.index`, `embedding_config.json`, and `retriever_manifest.json`.
- Offline eval v1_3 and eval v2 completed.
- Controlled runtime flags added/reported: `HOMELAB_RETRIEVER_VERSION`, `HOMELAB_RETRIEVER_FALLBACK_VERSION`, legacy `HOMELAB_HEALTH_RAG_VERSION`.
- Fallback and safety gates were reported as passing controlled smoke/API smoke.
- Frontend manual/runtime smoke passed 8/8 for controlled semantic retrieval and intentGroup routing.
- Controlled semantic retrieval with persistent bridge verified in runtime.
- `intentGroup` routing added so urgent health, test advice, and booking are easier to inspect in Network/debug metadata.
- Manual frontend/runtime test passed 8/8 for urgent health, test advice, normal booking, and mixed booking + urgent health cases.
- Recommendation Runtime 3B implemented and accepted as a controlled slot-based prototype, not a live package recommendation engine.
- Recommendation API Metadata Contract 3C verified through real `/api/chat` smoke, 9/9 PASS.
- Recommendation Answer UX 3D verified through real `/api/chat` smoke, 7/7 PASS.
- Recommendation flag-off regression 3E verified through real `/api/chat` smoke, 6/6 PASS.
- Recommendation frontend manual smoke 3F verified through UI + Network checks, 7/7 PASS.
- Catalog Contract + Recommendation Source Contract 3G verified through real `/api/chat` smoke, 6/6 PASS.
- Controlled Live Package Recommendation 3H verified through real `/api/chat` smoke, 7/7 PASS behind the separate live package gate.
- KB/Retriever v1.4 Batch 4A source-backed pipeline completed offline: registry, raw capture, normalization, cleaning, human review, approved dataset, merged corpus, embeddings/FAISS, evals, rerank experiments, and held-out validation.
- v1.4 Batch 4A approved dataset lives at `ai_lab/datasets/kb_v1_4_batch4a_approved_items.jsonl`; offline retriever artifacts live at `ai_lab/artifacts/retriever_v1_4/`.

## What Is Blocked

| Blocker | Why it matters |
| --- | --- |
| Default live package recommendation | Controlled live package recommendation exists behind `HOMELAB_RECOMMENDATION_LIVE_PACKAGE_ENABLED=true`, but it is not default/global behavior. |
| Default runtime switch | Still intentionally avoided until controlled behavior is reviewed in product context. |
| Production readiness | 3H proves controlled live behavior only. Broader production rollout still needs product review, catalog governance, and monitoring decisions. |
| Retriever v1.4 default promotion | Offline evidence is strong, but runtime integration has not been implemented or smoke-tested. v1.4 must remain offline/controlled until 4B flags, runtime metadata, and regression smokes pass. |

## Immediate Next Step

Proceed to 4B controlled runtime candidate for retriever v1.4:

- Port expanded-query + topic-aware rerank into runtime behind explicit flags only.
- Keep existing v1_3/default behavior safe and unchanged unless controlled flags are enabled.
- Expose truthful runtime metadata for query expansion, reranking, selected retriever version, and fallback.
- Run regression matrix for urgent health, booking, test advice, recommendation gating, and existing semantic v1_3 behavior.
- Do not promote retriever v1.4 as default/global runtime yet.

Keep the stage-3 recommendation regression matrix explicit:

- Runtime on + live off: run 3C/3D/3G (`HOMELAB_RECOMMENDATION_RUNTIME_ENABLED=true`, `HOMELAB_RECOMMENDATION_LIVE_PACKAGE_ENABLED=false` or unset).
- Runtime off: run 3E (`HOMELAB_RECOMMENDATION_RUNTIME_ENABLED=false`).
- Runtime on + live on: run 3H (`HOMELAB_RECOMMENDATION_RUNTIME_ENABLED=true`, `HOMELAB_RECOMMENDATION_LIVE_PACKAGE_ENABLED=true`).
- Commit docs/handoff after review; do not commit `.env`.
- Preserve RAG-first, safety-first behavior; do not move to fine-tuning or package-first answers prematurely.

## Near-Term Roadmap

| Step | Goal |
| --- | --- |
| 1 | Controlled semantic bridge/retrieval for v1_3 runtime. Done. |
| 2 | Expose runtime debug metadata including `selectedRetrievalMode` and `intentGroup`. Done. |
| 3 | Validate urgent/test-advice/booking routing priority. Done, 8/8 PASS. |
| 4 | Complete frontend manual smoke for latest behavior. Done, 8/8 PASS. |
| 5 | Controlled recommendation/test package runtime 3B. Done, 10/10 PASS; 3A regression 8/8 PASS. |
| 6 | API metadata contract 3C. Done, 9/9 PASS. |
| 7 | Recommendation Answer UX 3D. Done, 7/7 PASS. |
| 8 | Flag-off regression 3E. Done, 6/6 PASS. |
| 9 | Frontend manual smoke 3F. Done, 7/7 PASS. |
| 10 | Catalog/source contract readiness 3G. Done, 6/6 PASS. |
| 11 | Controlled live package recommendation 3H. Done, 7/7 PASS behind `HOMELAB_RECOMMENDATION_LIVE_PACKAGE_ENABLED=true`. |
| 12 | KB/Retriever v1.4 Batch 4A offline source-backed expansion. Done through 4A-19; held-out v3 PASS; no runtime promotion. |
| 13 | 4B controlled retriever v1.4 runtime candidate behind explicit flags. Next. |
| 14 | Broader default/global production promotion. Future decision only. |

## Rules For Future Work

- RAG-first before early fine-tuning.
- Medical/lab KB must remain source-backed with provenance; mock/simulated/demo data is not allowed as runtime medical knowledge.
- Do not fix semantic/reasoning failures by adding more keyword rules.
- Keep rules for safety/guardrails, not as the main intelligence engine.
- Keep package recommendations gated until safety and recommendation runtime are explicitly validated.
- Separate offline artifact/eval claims from backend runtime behavior.
- Do not switch default runtime while semantic retrieval is inactive.
- Add tests/smokes around behavior, not just file existence.
- Commit to GitHub after clear functional/behavior improvements, not after every small edit.

## Read First

New chat/developer should read these first:

1. `docs/homelab_project_handoff.md`
2. `docs/homelab_metrics_and_benchmarks.md`
3. `docs/homelab_decision_log.md`
4. `ai_lab/reports/runtime_semantic_activation_audit_v1_3.md`
5. `ai_lab/reports/semantic_retrieval_controlled_hybrid_report.md`
6. `ai_lab/reports/retriever_v1_3_release_decision_report.md`
7. `ai_lab/reports/retriever_v1_3_api_smoke_report.md`
8. `ai_lab/reports/retriever_v1_3_eval_v2_report.md`
9. `ai_lab/reports/retriever_v1_3_build_report.md`
10. `ai_lab/reports/retriever_v1_4_expanded_topic_rerank_eval_report_heldout_v3.json`
11. `ai_lab/reports/retriever_v1_4_expanded_topic_rerank_failure_audit_report_heldout_v3.json`
12. `ai_lab/artifacts/retriever_v1_4/retriever_manifest.json`
13. `backend/src/services/rag.service.js`
14. `backend/src/services/health-rag/answer.service.js`
15. `backend/src/services/health-rag/semantic-bridge.service.js`
16. `backend/src/services/health-rag/artifact-loader.service.js`
17. `backend/src/services/health-rag/retriever.service.js`
18. `backend/src/services/router-intent.service.js`
19. `backend/src/services/router.service.js`
20. `ai_lab/scripts/semantic_retriever_bridge_v1_3.py`
21. `backend/scripts/smoke_semantic_bridge_v1_3.js`

## How To Continue From Here

Start from the controlled semantic retrieval and intent grouping state, not the older semantic-inactive audit. The current backend can expose `selectedRetrievalMode="semantic_faiss"` and `intentGroup` when controlled flags/server are enabled. The next implementation should focus on a recommendation/test package runtime prototype, while preserving the current safety priority: urgent health beats booking and test/package advice.

As of 3H, the recommendation/test package path is a controlled slot-based prototype with API metadata, answer UX, source contract, flag-off regression, frontend smoke, and controlled live package return behind a separate live gate. It is not a default/global production recommendation engine. When `HOMELAB_RECOMMENDATION_LIVE_PACKAGE_ENABLED` is unset or false, `recommendedPackage` stays `null`; when recommendation runtime is false, there is no recommendation meta/UX/package ID output.

As of 4A-19, retriever v1.4 has strong offline evidence and held-out validation for expanded-query + topic-aware reranking, but it is not wired into backend runtime. The correct continuation is 4B controlled runtime integration behind explicit flags, with v1_3/default behavior preserved unless those flags are enabled. This remains RAG-first work; fine-tuning, if any, stays later and only after the RAG baseline is proven.
