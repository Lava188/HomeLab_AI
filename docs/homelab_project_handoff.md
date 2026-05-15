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

**5B Professional Booking & Lab Operations Runtime**.

HomeLab now includes a professional product prototype for booking and lab operations, in addition to the RAG-first healthcare chatbot. This is a new product/business module, not a change to the medical RAG architecture.

5B completion summary:

- 5B-0 created `docs/booking_runtime_product_spec_5b.md` for the Professional Booking & Lab Operations Runtime.
- 5B-1 added Prisma + MySQL/XAMPP database foundation for `homelab_ai` with provider `mysql`.
- Runtime models: `Patient`, `TestCatalogItem`, `StaffProfile`, `AvailabilitySlot`, `Booking`, `BookingDraft`, and `BookingStatusHistory`.
- Runtime enums: `BookingStatus`, `StaffRole`, and `CreatedSource`.
- Seed catalog includes CBC, HBA1C, LIPID_PROFILE, LIVER_FUNCTION, KIDNEY_FUNCTION, and GENERAL_CHECKUP.
- 5B-2/5B-3 added persistent booking runtime service/repository and chat integration.
- Chat booking now saves drafts by session, asks for missing required fields, shows a confirmation summary, and creates a real DB booking only after explicit user confirmation.
- Required confirmed booking fields are patient name, phone, test type or mapped catalog item, sample date, sample time, and address.
- Generic home sample collection such as "lay mau mau tai nha" does not infer a test type.
- Confirmed bookings use status `CONFIRMED`, booking codes like `HLB-YYYYMMDD-XXXX`, and `BookingStatusHistory`.
- Reschedule/cancel through chatbot uses `bookingCode`.
- `urgent_health` still wins over booking; red-flag booking requests do not create confirmed bookings or new booking drafts.
- 5B-4 added Admin/Staff Booking API for list/detail/status history/status update/assign staff/internal note.
- 5B-5 added Admin Booking Dashboard UI at `/admin/bookings`.
- 5B-6 added end-to-end booking product regression: `backend/scripts/smoke_booking_e2e_product_5b6.js`, passing 12/12.

Important boundary: 5B does not make HomeLab a production lab operations system. It validates a professional prototype/product flow. Payment, SMS/email notification, full auth/RBAC, real payment gateway, real lab result upload, production deployment, and clinical diagnosis remain out of scope.

RAG/retriever/recommendation status is unchanged:

- HomeLab remains RAG-first for medical/lab answers.
- Retriever v1.4 remains controlled-only behind explicit flags and is not promoted as the default/global runtime.
- Live package recommendation remains disabled by default and is not promoted as default/global behavior.

Current recommended next work:

- Optional UI polish for the admin booking table, especially horizontal scrolling and dense table ergonomics.
- Optional auth/RBAC for real admin/staff separation.
- Optional `AvailabilitySlot` capacity enforcement.
- Optional notifications, payment, and lab-result upload as future modules.
- If the priority is the thesis, package the narrative as "AI healthcare chatbot + lab booking operations" rather than adding more features.

Previous milestone context: **Recommendation/Test Package Runtime Prototype**.

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
- Best offline strategy at the end of 4A: expanded-query + topic-aware rerank. This was offline-only at 4A close, and has since been ported in 4B as a controlled-only runtime path.
- Held-out v3 should be frozen as evidence and not repeatedly tuned against.

Decision: offline retrieval evidence is strong enough to proceed to a **4B controlled runtime candidate**, but retriever v1.4 must not become the default/global runtime yet.

## KB/Retriever v1.4 Batch 4B Controlled Runtime Status

KB/Retriever v1.4 Batch 4B has ported the v1.4 retrieval strategy into backend runtime as a controlled-only path. It has **not** been promoted as the default/global retriever.

- Python bridge: `ai_lab/scripts/semantic_retriever_bridge_v1_4.py`.
- Strategy: `expanded_query_topic_aware_rerank`.
- Artifact directory: `ai_lab/artifacts/retriever_v1_4`.
- Corpus/chunk count: 97.
- Default candidate retrieval: `candidateTopK=20`.
- Default final retrieval: `finalTopK=5`.
- Runtime flags remain explicit: `runtimePromoted=false`, `runtimeDefaultChanged=false`.
- Backend integration is wired through the semantic bridge service and the real `/api/chat` `health_rag` path.

Controlled v1.4 runtime only runs when all explicit flags are enabled:

```text
HOMELAB_SEMANTIC_RETRIEVAL_ENABLED=true
HOMELAB_SEMANTIC_BRIDGE_MODE=server
HOMELAB_SEMANTIC_BRIDGE_URL=http://127.0.0.1:8766
HOMELAB_SEMANTIC_RETRIEVER_VERSION=v1_4
HOMELAB_SEMANTIC_RETRIEVAL_STRATEGY=expanded_query_topic_aware_rerank
```

Runtime flow when enabled:

1. `/api/chat` routes lab/test education and advice cases to `health_rag`.
2. Node semantic bridge service calls the v1.4 bridge server.
3. Bridge applies alias-aware expanded query.
4. Bridge retrieves FAISS semantic candidates from `retriever_v1_4` with top20.
5. Bridge applies topic-aware rerank.
6. Final topK results return to `rag.service.js` with v1.4 provenance and metadata.
7. API response exposes controlled metadata such as `retrieverVersion`, `retrievalStrategy`, `candidateTopK`, `finalTopK`, query-expansion details, bridge status, fallback state, and runtime promotion flags.

Fallback and gates:

- When v1.4 flags are off, default behavior remains v1_3/lexical fallback and v1.4 metadata is not exposed.
- If the v1.4 bridge errors or times out, runtime falls back to the existing path without crashing and reports fallback metadata.
- Router/business intent was minimally updated so lab explanation questions such as HbA1c, ALT/AST, TSH/T4, creatinine/eGFR, and kidney function route to `health_rag` + `test_advice`.
- Booking still requires a clear booking/sample-collection action.
- `urgent_health` remains higher priority than test advice, booking, and recommendation.
- Booking/reschedule/cancel and recommendation gates remain preserved.
- Provenance/source metadata was checked through API smoke; revise/rejected/pending items are not surfaced.
- 4B-2H tightened urgent and booking UX: `urgent_health` now forces `primaryMode="emergency_or_urgent"` and `urgencyLevel="emergency"` for strong red flags, even when v1.4 chunks use `topic`/`intended_use="emergency_warning"` instead of older `section`/`faq_type` metadata. Generic "lay mau tai nha" booking no longer infers a test type without user confirmation.
- 4B-2I polished answer text: lab explanations no longer inject raw source titles/headings into the answer body, while source/provenance metadata remains available for source chips in `meta`/citations/topChunks.
- Manual frontend observation after the polish covered CBC abnormal boundary, urgent chest pain/shortness of breath/sweating, generic booking, reschedule, HbA1c explanation, and HbA1c sample questions; behavior now matches current API/UX expectations, but broader frontend/manual observation is still required before promotion.
- 4B-2J controlled frontend/manual UX follow-up checked UI + Network after 4B-2H/2I. Network/API behavior matched expectations, while answer text needed small polish for creatinine/eGFR and lab explanation wording. The observed UI answers are now more natural for HbA1c, HbA1c blood draw, ALT/AST, creatinine/eGFR, cholesterol/triglyceride, CBC boundary, urgent red flags, and generic booking, without raw source headings in the answer body and without weakening safety boundaries.
- 4C product UX polish completed after controlled observation hardening: pure lab explanations no longer append soft booking CTAs, WBC-high answers avoid leukemia/blood-cancer mention unless asked, urgent fever/confusion/rapid-breathing remains emergency-oriented, source alignment avoids D-dimer/generic blood-test drift, and the NICE urgent-fever source chip no longer displays `undefined - https://www.nice.org.uk/guidance/ng253`.
- 4D longer controlled runtime regression/product review passed **29/29** via `backend/scripts/smoke_controlled_runtime_regression_4d.js`, covering lab explanations, medical review/result boundaries, urgent red flags, mixed urgent + booking/test advice, booking/reschedule/cancel, and controlled recommendation/test advice.

Next status: controlled v1.4 runtime has completed targeted 4C UX/source polish and broader 4D controlled regression, but **not** default/global promotion. The recommended next step is thesis technical narrative packaging / khóa luận write-up, not adding large features unless specifically needed.

## Current Status

- Professional Booking & Lab Operations Runtime 5B is complete as a product prototype: Prisma MySQL booking DB, persistent chat booking, admin/staff API, admin dashboard UI, and E2E product smoke are in place.
- 5B scripted evidence: persistent booking chat smoke 7/7 PASS; admin booking API smoke PASS; booking E2E product smoke 12/12 PASS.
- 5B manual evidence: admin dashboard UI manual check OK, with a minor accepted UX note that the booking table can scroll horizontally in the prototype.
- KB/retriever v1_3 artifact has been built successfully.
- Offline v1_3 retrieval evals are strong.
- Persistent Python semantic bridge is available and verified with `runtimeMode=semantic_faiss`.
- Controlled semantic retrieval is available behind runtime flags and returns `selectedRetrievalMode="semantic_faiss"` for health RAG when enabled.
- Intent grouping is active in backend metadata: `urgent_health`, `test_advice`, `booking`, and `general_health`.
- Earlier frontend manual test for the controlled semantic retrieval and routing milestone passed **8/8**. This was not a dedicated v1.4 4B frontend manual smoke.
- Default runtime/env has **not** been switched globally; semantic retrieval remains controlled/opt-in.
- Recommendation Runtime 3B is accepted: `test_advice` -> slot extraction -> `candidatePackageIds`, with smoke **10/10 PASS** and 3A regression **8/8 PASS**.
- Recommendation API Metadata Contract 3C passed **9/9** via `node backend/scripts/smoke_recommendation_api_3c.js`; API metadata includes `intentGroup`, `selectedRetrievalMode`, `meta.recommendation`, slots/missing slots, candidate package IDs, and `decisionType` when applicable.
- Recommendation Answer UX 3D passed **7/7** via `node backend/scripts/smoke_recommendation_answer_ux_3d.js`; ask-more, ready-but-catalog-disabled, and medical-review-boundary answers are safer and more natural in Vietnamese.
- Recommendation flag-off regression 3E passed **6/6** after restarting backend with `HOMELAB_RECOMMENDATION_RUNTIME_ENABLED=false`; no recommendation meta, UX, package IDs, or `recommendedPackage` are exposed when runtime is off.
- Recommendation frontend manual smoke 3F passed **7/7**; UI did not break, raw package IDs were not exposed, booking and urgent health were not interrupted, and `recommendedPackage` stayed `null` when live recommendation was disabled. Minor non-blocker: newline/bullet formatting in the UI can appear flattened.
- Catalog Contract + Recommendation Source Contract 3G passed **6/6**; general/kidney recommendation answers no longer inherit mismatched visible sources such as chest pain or D-dimer, CBC boundary uses CBC source, and urgent answers keep suitable urgent/NHS source behavior.
- Controlled Live Package Recommendation 3H passed **7/7** with `HOMELAB_RECOMMENDATION_RUNTIME_ENABLED=true` and `HOMELAB_RECOMMENDATION_LIVE_PACKAGE_ENABLED=true`; when live gate is off, 3C/3D/3G still pass and `recommendedPackage` returns to `null`.
- Default/global live package recommendation is not enabled. Safety gates remain: `urgent_health`, booking, `medical_review_boundary`, and missing required context do not return live packages.
- KB/Retriever v1.4 Batch 4A offline pipeline is complete through 4A-19. At 4A close, runtime was unchanged; in 4B, v1_4 is available only as a controlled runtime path and is still not promoted as default/global.
- 4A-18 expanded-query + topic-aware rerank on eval v2 reached Hit@1 0.6833, Hit@3 0.8333, Hit@5 0.8500, Hit@10 0.8833, Hit@20 0.8833, MRR@5 0.7589.
- 4A-19 held-out v3 reached total 40, Hit@1 0.4750, Hit@3 0.8500, Hit@5 0.9000, Hit@10 0.9250, Hit@20 0.9250, MRR@5 0.6667, warning/error 0.
- KB/Retriever v1.4 Batch 4B controlled runtime path is now wired through Python bridge v1.4, Node semantic bridge service, and real `/api/chat` health RAG.
- 4B smokes/regressions passed: Python bridge controlled 10/10, server contract 10/10 + health OK, Node controlled 10/10, router lab explanation 11/11, API controlled 9/9 normal + 2/2 gate, regression 14/14, flag-off 8/8, fallback 6/6, provenance 11/11.
- 4B-2H urgent/booking UX smoke passed **2/2**: chest pain + dyspnea + sweating gets emergency/care-facility guidance, and generic home sampling asks for the test type instead of inventing one (`booking.draft.testType=null`, `missingFields` still includes `testType`).
- 4B-2I answer text polish smoke passed **5/5**: HbA1c/ALT/AST-style explanations stay in clean Vietnamese answer text without raw English source heading leakage such as "Is there anything else..." or "What are they used for?"; source/provenance still lives in metadata/source chips.
- Manual frontend checks after 4B-2H/2I found CBC abnormal boundary, urgent red flags, generic booking, reschedule, HbA1c explanation, and HbA1c sample questions aligned with the current API/UX contract.
- 4B-2J frontend/API answer UX alignment was handled as controlled manual UI + Network review and minimal answer-text polish. Lab explanation answers are more natural for ALT/AST, creatinine/eGFR, and cholesterol/triglyceride; CBC abnormal remains non-diagnostic, urgent chest pain/shortness of breath/sweating remains emergency-oriented, and generic booking still does not infer `testType`.
- 4C Product UX polish and source alignment hardening passed: `smoke_product_ux_polish_4c.js`, `smoke_frontend_ux_regression_4b2k.js`, `smoke_urgent_booking_ux_4b2h.js`, and `smoke_answer_text_polish_4b2i.js` all pass. Manual UI retest of 7 priority cases passed: CBC explanation, ALT/AST explanation, creatinine/eGFR explanation, WBC-high boundary, CBC abnormal/leukemia boundary, urgent fever/confusion/rapid-breathing, and mixed general-test request with urgent fever/confusion/rapid-breathing.
- 4D Longer Controlled Runtime Regression/Product Review passed **29/29** with `backend/scripts/smoke_controlled_runtime_regression_4d.js`. It checks lab explanation polish, medical review/result-boundary behavior, urgent red-flag escalation, mixed urgent + booking/test-advice priority, booking/reschedule/cancel routing, controlled recommendation behavior, source-name validity, D-dimer drift prevention for urgent fever, raw package ID hiding, and raw English source-heading leakage prevention.
- v1.4 still is not default/global. Live package recommendation remains controlled/not promoted. Current evidence is suitable for controlled thesis demo/evaluation, not production healthcare deployment.

## What Is Already Done

- 5B Professional Booking & Lab Operations Runtime is complete as a professional prototype: product spec, Prisma MySQL schema/seed, persistent booking service/repository, chat confirmation-to-create flow, reschedule/cancel by booking code, admin/staff booking API, admin dashboard UI, and E2E regression smoke.
- KB v1_3 packaged with 42 items.
- Batch A v1_3 items `kb_v1_3_039` to `kb_v1_3_042` approved in packaging report.
- Retriever v1_3 artifact built at `ai_lab/artifacts/retriever_v1_3/`.
- Artifact includes `kb_chunks_v1_3.json`, `chunk_metadata.json`, `chunk_embeddings.npy`, `faiss.index`, `embedding_config.json`, and `retriever_manifest.json`.
- Offline eval v1_3 and eval v2 completed.
- Controlled runtime flags added/reported: `HOMELAB_RETRIEVER_VERSION`, `HOMELAB_RETRIEVER_FALLBACK_VERSION`, legacy `HOMELAB_HEALTH_RAG_VERSION`.
- Fallback and safety gates were reported as passing controlled smoke/API smoke.
- Earlier frontend manual/runtime smoke passed 8/8 for controlled semantic retrieval and intentGroup routing; this predates the dedicated v1.4 4B controlled runtime path.
- Controlled semantic retrieval with persistent bridge verified in runtime.
- `intentGroup` routing added so urgent health, test advice, and booking are easier to inspect in Network/debug metadata.
- Earlier manual frontend/runtime test passed 8/8 for urgent health, test advice, normal booking, and mixed booking + urgent health cases; v1.4 4B still needs broader frontend/manual UX review before promotion.
- Recommendation Runtime 3B implemented and accepted as a controlled slot-based prototype, not a live package recommendation engine.
- Recommendation API Metadata Contract 3C verified through real `/api/chat` smoke, 9/9 PASS.
- Recommendation Answer UX 3D verified through real `/api/chat` smoke, 7/7 PASS.
- Recommendation flag-off regression 3E verified through real `/api/chat` smoke, 6/6 PASS.
- Recommendation frontend manual smoke 3F verified through UI + Network checks, 7/7 PASS.
- Catalog Contract + Recommendation Source Contract 3G verified through real `/api/chat` smoke, 6/6 PASS.
- Controlled Live Package Recommendation 3H verified through real `/api/chat` smoke, 7/7 PASS behind the separate live package gate.
- KB/Retriever v1.4 Batch 4A source-backed pipeline completed offline: registry, raw capture, normalization, cleaning, human review, approved dataset, merged corpus, embeddings/FAISS, evals, rerank experiments, and held-out validation.
- v1.4 Batch 4A approved dataset lives at `ai_lab/datasets/kb_v1_4_batch4a_approved_items.jsonl`; offline retriever artifacts live at `ai_lab/artifacts/retriever_v1_4/`.
- 4B-2H urgent/booking UX fix verified through `backend/scripts/smoke_urgent_booking_ux_4b2h.js`, 2/2 PASS, with 4B-2B, 4B-2D, and 4B-2G regressions still passing.
- 4B-2I answer text polish verified through `backend/scripts/smoke_answer_text_polish_4b2i.js`, 5/5 PASS, with 4B-2H, 4B-2B, 4B-2D, and 4B-2G regressions still passing.
- Manual frontend follow-up after polish checked CBC abnormal, urgent chest pain/shortness of breath/sweating, generic booking, reschedule, HbA1c explanation, and HbA1c sample question paths; the observed API/UX behavior is reasonable, but not yet enough for default/global promotion.
- 4B-2J controlled frontend/manual UX review extended the manual cases to creatinine/eGFR and cholesterol/triglyceride. The follow-up confirmed the UI answer text is more natural and aligned with Network JSON after minimal polish; this remains controlled-only observation, not a default/global promotion signal.
- 4C completed targeted product UX and source metadata hardening after 4B-2M: pure educational lab answers avoid soft booking CTA, WBC-high stays neutral unless leukemia/blood cancer is asked, urgent fever/confusion/rapid-breathing keeps emergency guidance with NICE/sepsis-aligned sources, and source display names are no longer `undefined`.
- 4D completed broader controlled runtime regression after 4C: `backend/scripts/smoke_controlled_runtime_regression_4d.js` passed 29/29 across lab explanation, result boundary, urgent, mixed urgent/booking, booking/reschedule/cancel, and recommendation-controlled scenarios.

## What Is Blocked

| Blocker | Why it matters |
| --- | --- |
| Default live package recommendation | Controlled live package recommendation exists behind `HOMELAB_RECOMMENDATION_LIVE_PACKAGE_ENABLED=true`, but it is not default/global behavior. |
| Default runtime switch | Still intentionally avoided until controlled behavior is reviewed in product context. |
| Production readiness | 3H proves controlled live behavior only. Broader production rollout still needs product review, catalog governance, and monitoring decisions. |
| Retriever v1.4 default promotion | Controlled runtime integration, 4C UX polish, targeted manual retest, and 4D 29/29 regression pass, but default/global promotion remains intentionally blocked. |

## Immediate Next Step

Proceed from 5B booking runtime completion and 4D controlled regression evidence to thesis technical narrative packaging / khóa luận, unless a specific product gap requires more implementation:

- Keep v1.4 behind explicit flags only.
- Do not promote retriever v1.4 as default/global runtime yet.
- Do not promote live package recommendation as default/global behavior.
- Package the technical narrative: AI healthcare chatbot, RAG-first decision, controlled v1.4 runtime, safety gates, recommendation gating, professional booking/lab operations runtime, smoke evidence, and limitations.
- Treat 5B as a professional product prototype, not production lab deployment.
- Avoid adding large new features unless the thesis/demo narrative exposes a specific gap.

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
| 4 | Complete earlier frontend manual smoke for controlled semantic/routing behavior. Done, 8/8 PASS; not a dedicated v1.4 4B frontend smoke. |
| 5 | Controlled recommendation/test package runtime 3B. Done, 10/10 PASS; 3A regression 8/8 PASS. |
| 6 | API metadata contract 3C. Done, 9/9 PASS. |
| 7 | Recommendation Answer UX 3D. Done, 7/7 PASS. |
| 8 | Flag-off regression 3E. Done, 6/6 PASS. |
| 9 | Frontend manual smoke 3F. Done, 7/7 PASS. |
| 10 | Catalog/source contract readiness 3G. Done, 6/6 PASS. |
| 11 | Controlled live package recommendation 3H. Done, 7/7 PASS behind `HOMELAB_RECOMMENDATION_LIVE_PACKAGE_ENABLED=true`. |
| 12 | KB/Retriever v1.4 Batch 4A offline source-backed expansion. Done through 4A-19; held-out v3 PASS; no runtime promotion. |
| 13 | 4B controlled retriever v1.4 runtime candidate behind explicit flags. Done; runtime smokes/regressions pass, no default promotion. |
| 14 | 4B-2H urgent/booking UX safety polish. Done, 2/2 PASS; urgent red flags answer as emergency/urgent, generic booking does not infer test type. |
| 15 | 4B-2I answer text polish. Done, 5/5 PASS; answer body no longer leaks raw source title/heading while source metadata remains available. |
| 16 | 4C product UX polish and source alignment hardening. Done; targeted smokes and 7-case manual UI retest pass, no default promotion. |
| 17 | 4D longer controlled runtime regression/product review. Done, 29/29 PASS; no default/global promotion. |
| 18 | Thesis technical narrative packaging / khóa luận. Next. |
| 19 | Broader default/global production promotion. Future decision only. |

| 20 | 5B Professional Booking & Lab Operations Runtime. Done; persistent booking chat smoke 7/7 PASS, admin booking API smoke PASS, admin dashboard manual UI OK, booking E2E product smoke 12/12 PASS. |
| 21 | Post-5B thesis narrative: AI healthcare chatbot + lab booking operations. Next if thesis is the priority. |

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
21. `ai_lab/scripts/semantic_retriever_bridge_v1_4.py`
22. `backend/scripts/smoke_api_retriever_v1_4_controlled_4b2b.js`
23. `backend/scripts/smoke_api_retriever_v1_4_regression_4b2d.js`
24. `backend/scripts/smoke_api_retriever_v1_4_provenance_4b2g.js`
25. `backend/scripts/smoke_urgent_booking_ux_4b2h.js`
26. `backend/scripts/smoke_answer_text_polish_4b2i.js`
27. `backend/scripts/smoke_semantic_bridge_v1_3.js`

## How To Continue From Here

Start from the controlled semantic retrieval and intent grouping state, not the older semantic-inactive audit. The current backend can expose `selectedRetrievalMode="semantic_faiss"` and `intentGroup` when controlled flags/server are enabled. The next implementation should focus on a recommendation/test package runtime prototype, while preserving the current safety priority: urgent health beats booking and test/package advice.

As of 3H, the recommendation/test package path is a controlled slot-based prototype with API metadata, answer UX, source contract, flag-off regression, frontend smoke, and controlled live package return behind a separate live gate. It is not a default/global production recommendation engine. When `HOMELAB_RECOMMENDATION_LIVE_PACKAGE_ENABLED` is unset or false, `recommendedPackage` stays `null`; when recommendation runtime is false, there is no recommendation meta/UX/package ID output.

As of 4D, retriever v1.4 is wired into backend runtime as a controlled-only path behind explicit semantic flags and has completed targeted product UX/source alignment polish plus broader controlled regression. `smoke_controlled_runtime_regression_4d.js` passed 29/29 across lab explanation, result boundary, urgent, mixed urgent/booking, booking/reschedule/cancel, and recommendation-controlled scenarios. v1_3/default behavior remains the safe baseline when flags are off, and v1.4 is still not promoted as default/global. The correct continuation is thesis technical narrative packaging / khóa luận and future controlled observation as needed, not immediate production/default release. This remains RAG-first work; fine-tuning, if any, stays later and only after the RAG baseline is proven.

As of 5B, HomeLab also has a professional booking and lab-operations product prototype. Chat can collect booking details, require explicit confirmation, create persistent DB bookings, reschedule/cancel by booking code, and expose internal admin/staff operations through `/api/admin/bookings` plus a prototype dashboard at `/admin/bookings`. This business module does not change the RAG-first medical answer path, does not promote retriever v1.4, and does not enable live package recommendation by default.
