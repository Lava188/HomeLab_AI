# HomeLab Decision Log

| Decision | Context | Reason | Consequence | Status |
| --- | --- | --- | --- | --- |
| Build RAG-first before early fine-tuning | HomeLab needs grounded medical/lab answers and safety behavior. | KB/retrieval/eval can be inspected, tested, and corrected faster than fine-tuning at this stage. | Prioritize KB quality, retriever artifacts, runtime metadata, and smoke tests before model training. | Active |
| Expand KB by controlled batches | v1_3 added Batch A items such as sepsis, chest pain, breathing red flags, and blood-test result guidance. | Medical content must be reviewed and promoted deliberately. | Batch items carry protected runtime flags during packaging and require artifact/eval/runtime gates. | Active |
| Treat offline eval and runtime behavior separately | v1_3 offline FAISS eval is strong, but Node runtime does not use FAISS or `.npy` embeddings. | Offline success can overstate real product behavior. | Every release decision must check backend runtime metadata and user-facing smoke, not only artifact eval. | Active |
| Do not switch default/global runtime yet | Controlled semantic retrieval now works, but rollout is still gated. | Default promotion should wait for product review and the recommendation/test package prototype path. | Keep semantic retrieval controlled/opt-in; do not switch global defaults yet. | Active |
| Do not patch semantic failure with more keywords | Current router/retriever already contains many keyword, source-hint, and rewrite rules. | More keywords can hide the root semantic activation gap and make behavior brittle. | Next milestone must activate semantic retrieval, not add lexical camouflage. | Active |
| Keep rules for safety/guardrails, not as the main engine | Healthcare chatbot requires red-flag escalation and clarification gates. | Safety rules are appropriate for guardrails, but should not replace semantic understanding. | Rules remain for emergency, ambiguity, package gating, and low-confidence handling. Retrieval intelligence should move semantic. | Active |
| Use controlled semantic bridge/shadow mode next | Existing artifact has FAISS and `.npy`; backend Node could not originally consume them semantically. | Shadow mode can compare semantic top-k vs lexical top-k without risky user-facing promotion. | Implement bridge/service/subprocess or equivalent; expose semantic/lexical scores; keep fallback. | Completed for controlled bridge/retrieval |
| Chốt controlled semantic retrieval + safety-priority intent grouping before recommendation runtime | v1_3 bridge server and 8-case manual smoke passed. | Product needs truthful semantic retrieval and safe routing before package recommendations become live. | Do not switch everything to recommendation runtime yet; keep semantic retrieval controlled and use `intentGroup` for `urgent_health`, `test_advice`, `booking`, and `general_health`. | Active |
| Prioritize urgent_health over booking in mixed queries | Users may ask to book tests while also describing urgent red flags. | Safety escalation must not be suppressed by booking workflow. | Mixed urgent + booking queries route to `health_rag` with `intentGroup="urgent_health"`; normal explicit booking still routes to booking. | Active |
| Keep test_advice out of booking unless there is explicit booking/sample action | Users often ask what tests or packages are suitable before deciding to book. | Advice intent should ask for context and use RAG/policy, not start collection workflow. | `test_advice` stays in health RAG; booking requires clear booking/sample-collection action such as placing an appointment or requesting home sampling. | Active |
| Preserve fallback to stable retriever | v1_3 artifact/config can fail or be incompatible at runtime. | Health RAG should degrade gracefully instead of returning only artifact-read errors. | Use configured version plus fallback version metadata; current reports describe v1_2 fallback behavior. | Active |
| Ask clarifying questions for vague urgent queries | Eval v2 failure `v2_ambiguous_005` asks whether to go to hospital without concrete symptoms. | It is unsafe to answer a confident yes/no without context. | Router/policy should ask for symptoms and red flags, while escalating if serious signs are present. | Active |
| Route mixed customer test/infection questions through safety first | Eval v2 failure `v2_customer_need_003` mixes test selection and infection concern. | Package/test advice must not suppress possible infection/sepsis safety guidance. | Safety screening appears before test explanation; package-first answers remain blocked. | Active |
| Keep package recommendations gated | Reports indicate package catalog runtime remains disabled/gated. | Recommendation should only appear when safe, configured, and validated through the intended layer. | Do not infer product readiness from retriever smoke alone. | Active |
| Accept Recommendation Answer UX 3D | Recommendation Runtime 3B passed 10/10, 3C API metadata contract passed 9/9, and 3D answer UX smoke passed 7/7. | Safety priority remains intact, booking and urgent health are not interrupted by recommendation UX, and catalog disabled still keeps `recommendedPackage=null`. | Accept controlled slot-based recommendation/test package runtime prototype UX, but do not enable live package recommendation or package-first answers. | Active |
| Keep controlled live package recommendation behind a separate env gate | 3E flag-off regression passed 6/6, 3F frontend manual smoke passed 7/7, 3G catalog/source contract passed 6/6, and 3H controlled live package smoke passed 7/7. | Live package return should be possible only in controlled mode after runtime, safety, source, and catalog checks pass. It must not become default/global behavior by accident. | Use `HOMELAB_RECOMMENDATION_LIVE_PACKAGE_ENABLED=true` as the explicit live package gate. With the gate off, 3C/3D/3G behavior remains `recommendedPackage=null`; with runtime off, 3E behavior has no recommendation meta/UX/package IDs. | Active |
| Align recommendation sources with recommendation answer | 3F found source/provenance mismatch risk where recommendation answers could inherit unrelated RAG source chips. 3G fixed this for general/kidney recommendation answers, CBC boundary, and urgent health. | Source chips must support the answer the user sees; mismatched sources can make safe recommendation UX look medically inconsistent. | Recommendation/test-advice UX should hide or replace unrelated visible sources; CBC boundary can use CBC source; urgent health can keep suitable urgent/NHS sources. | Active |
| Treat package recommendation as controlled prototype only | 3H allows `recommendedPackage` to become non-null when runtime and live package gates are both enabled and enough safe context exists. | This validates controlled catalog-derived recommendation, not a complete intelligent recommendation engine or production default. | Do not hard-code package-first answers, do not weaken urgent/booking/medical-review/missing-context gates, and do not promote live recommendation without a future release decision. | Active |
| Accept KB/Retriever v1.4 Batch 4A as offline evidence for 4B controlled runtime candidate | Batch 4A completed source registry, raw capture, normalized/cleaned extraction, human review, approved KB dataset, merged corpus, embeddings/FAISS, eval v2, rerank experiments, and held-out v3. | Evidence is source-backed, human-reviewed, provenance-preserving, and held-out metrics are strong: held-out v3 Hit@3 0.8500, Hit@5 0.9000, MRR@5 0.6667 with warning/error 0. | Proceed to 4B controlled runtime integration of expanded-query + topic-aware rerank behind explicit flags. Do not promote v1.4 as default/global runtime yet. Freeze held-out v3 as evidence and avoid repeated tuning against it. | Active |
| Keep Retriever v1.4 offline until controlled runtime flags and smokes pass | At 4A close, v1.4 artifact validation passed with 97 chunks/vectors/FAISS ntotal and the best strategy was still offline-only. | Offline artifact/eval success can overstate real product behavior unless runtime wiring, metadata, fallback, and safety regressions are checked. | Completed by 4B-2G: controlled runtime flags, bridge/API wiring, flag-off, fallback, router, regression, and provenance smokes passed. Existing v1_3/default behavior remains safe when v1.4 flags are off; default/global promotion is still blocked pending broader frontend/manual observation. | Completed |
| Port Retriever v1.4 into runtime under controlled flags only | 4A offline evidence showed expanded-query + topic-aware rerank improves retrieval strongly, and 4B needed real API proof before any promotion. | Runtime integration must preserve RAG-first provenance, explicit observability, fallback, and safety gates while avoiding accidental default/global rollout. | Python bridge v1.4, Node semantic bridge, and real `/api/chat` health RAG path now support v1.4 only when explicit flags are enabled. Default/global runtime is unchanged; no frontend/package catalog/.env committed changes are required. | Active |
| Preserve urgent, booking, recommendation, flag-off, fallback, and provenance gates during v1.4 runtime integration | Controlled runtime retrieval can change routing and metadata if not guarded. | Healthcare safety and operational workflows must remain stable before broader rollout: urgent red flags beat test/recommendation/booking, booking/reschedule/cancel should not be hijacked, and bridge failures must not crash `/api/chat`. | 4B smoke matrix passed: bridge controlled 10/10, server contract 10/10 + health OK, Node controlled 10/10, router lab explanation 11/11, API controlled 9/9 + 2/2 gate, regression 14/14, flag-off 8/8, fallback 6/6, provenance 11/11. | Active |
| Commit GitHub only after meaningful functional behavior changes | Project has many small reports, scripts, and handoff docs. | Committing every small file churn makes history noisy. | Prefer commits after clear product/eval/runtime improvements or requested handoff milestones. | Active |
| Aim for professional prototype, not simple demo | Product goal is semantic healthcare chatbot with safety, retrieval, clarification, and recommendations. | Demo-like keyword responses will not meet the intended standard. | Technical work should improve real behavior, observability, and safety gates. | Active |

## Current Release Decision

HomeLab has completed stage 3 for the controlled slot-based recommendation/test package runtime prototype through 3H, KB/Retriever v1.4 Batch 4A through offline held-out validation in 4A-19, and KB/Retriever v1.4 Batch 4B controlled runtime integration through smoke/regression 4B-2G. The current state is **controlled recommendation prototype + controlled retriever v1.4 runtime path**, not a full default-runtime switch and not default/global live package recommendation.

The backend can use the persistent semantic bridge in health RAG with `selectedRetrievalMode="semantic_faiss"` when enabled, and manual frontend/runtime testing passed 8/8 for urgent health, test advice, normal booking, and mixed booking + urgent health priority. Safety remains the priority: urgent health red flags beat booking actions, and test advice does not become booking unless the user clearly asks to book or collect a sample.

Recommendation Runtime 3B is accepted with 10/10 PASS and 3A regression 8/8 PASS. Recommendation API Metadata Contract 3C passed 9/9 with `testAdviceHasRecommendation=true`, `bookingUrgentNoRecommendation=true`, and `catalogDisabledKeepsPackageNull=true`. Recommendation Answer UX 3D passed 7/7. Flag-off regression 3E passed 6/6 after backend restart with recommendation runtime off. Frontend manual smoke 3F passed 7/7 with no raw package IDs and no booking/urgent interruption; newline/bullet flattening is a minor non-blocker. Catalog Contract + Recommendation Source Contract 3G passed 6/6 and fixed mismatched recommendation-visible sources. Controlled Live Package Recommendation 3H passed 7/7 with `HOMELAB_RECOMMENDATION_RUNTIME_ENABLED=true` and `HOMELAB_RECOMMENDATION_LIVE_PACKAGE_ENABLED=true`.

The next release decision should focus on whether and how to promote controlled package recommendation beyond explicit env-gated mode. Until then, live package recommendation remains controlled only: live gate off keeps `recommendedPackage=null`, runtime off removes recommendation meta/UX/package IDs, and safety gates still block live package return for `urgent_health`, booking, `medical_review_boundary`, and missing required context.

For retriever v1.4, the offline decision is positive for moving to 4B controlled runtime candidate:

- Batch 4A used 26 authoritative sources from `medlineplus.gov`, `nhs.uk`, and `niddk.nih.gov`.
- Human review produced 55 approved KB items, 58 revise, 15 reject, 0 pending.
- Approved QA passed 55/55 with warning/error 0, duplicate-like 0, suspected noise 0, and missing provenance 0.
- Merged corpus has 97 records: 42 legacy v1_3 chunks + 55 approved Batch 4A items.
- Embeddings/FAISS were built offline with `intfloat/multilingual-e5-small`, dimension 384, normalized embeddings, and `IndexFlatIP`; artifact validation has chunks/vectors/FAISS ntotal 97/97/97 with warning/error 0.
- 4A-18 expanded-query + topic-aware rerank reached Hit@1 0.6833, Hit@3 0.8333, Hit@5 0.8500, Hit@10 0.8833, Hit@20 0.8833, MRR@5 0.7589.
- 4A-19 held-out v3 reached total 40, Hit@1 0.4750, Hit@3 0.8500, Hit@5 0.9000, Hit@10 0.9250, Hit@20 0.9250, MRR@5 0.6667, warning/error 0.
- Held-out v3 failures are limited and categorized: `alias_gap_remaining=2`, `topic_missing_from_candidates=1`, `acceptable_broad_domain_but_wrong_topic=3`.

This supports the product thesis: natural Vietnamese question -> semantic understanding -> safety/urgent handling -> RAG retrieval -> grounded answer -> test/package recommendation path. It also reinforces the RAG-first decision: use provenance/auditability and human-reviewed medical knowledge before considering fine-tuning. Fine-tuning, if any, remains later and only after the RAG baseline is proven.

Retriever v1.4 controlled runtime decision:

- Decision: port retriever v1.4 into runtime under controlled flags only.
- Rationale: offline 4A showed expanded query + topic-aware rerank improved retrieval strongly; controlled runtime had to prove bridge/API/routing/fallback/provenance behavior before any promotion.
- Required flags: `HOMELAB_SEMANTIC_RETRIEVAL_ENABLED=true`, `HOMELAB_SEMANTIC_BRIDGE_MODE=server`, `HOMELAB_SEMANTIC_BRIDGE_URL=http://127.0.0.1:8766`, `HOMELAB_SEMANTIC_RETRIEVER_VERSION=v1_4`, and `HOMELAB_SEMANTIC_RETRIEVAL_STRATEGY=expanded_query_topic_aware_rerank`.
- Constraints: no default/global promotion, no frontend/package catalog/.env committed changes, preserve urgent/booking/recommendation gates, preserve fallback path.
- Outcome: controlled, flag-off, fallback, provenance, router, and API regression smokes all pass.

Do not promote retriever v1.4 as default/global runtime yet. The next step is controlled frontend/manual UX review plus longer regression observation. Broader runtime/default promotion remains a future release decision only.

## Decision Criteria Before Revisiting Default Switch

| Criterion | Required state |
| --- | --- |
| Runtime semantic vectors/query embeddings | Active and same embedding space as artifact. |
| FAISS or equivalent vector search | Used directly or through a verified service/bridge. |
| Runtime metadata | Shows truthful mode, lexical score, semantic score, final score, loaded version, fallback state. |
| Semantic audit | PASS with non-zero semantic scores on relevant queries. |
| API smoke | PASS after semantic activation, not only lexical/rule wiring. |
| Frontend manual smoke | Completed and PASS. |
| Safety behavior | Emergency/urgent signals beat package/test suggestions. |
| Retriever v1.4 runtime candidate | Expanded-query + topic-aware rerank available behind explicit flags only; default remains unchanged. |
| Retriever v1.4 controlled runtime smoke matrix | PASS for bridge, server contract, Node service, API path, router, flag-off, fallback, regression, and provenance. |
| Held-out eval discipline | Held-out v3 frozen and not repeatedly tuned against. |

## Remaining Risks After Current Milestone

| Risk | Implication | Next action |
| --- | --- | --- |
| `test_advice` is a business-intent gate, not a full recommendation engine. | It can route and answer safely, but it does not yet choose personalized packages end to end. | Build a recommendation/test package runtime prototype. |
| Default/global runtime has not been switched. | Current semantic retrieval is controlled/opt-in rather than a broad production default. | Keep rollout gated until product review and additional smoke coverage. |
| Retriever v1.4 is controlled-only today. | 4B proves controlled backend runtime behavior, but not default/global production readiness. | Keep v1.4 behind explicit flags and run frontend/manual UX plus longer regression before promotion. |
| Package recommendation UX is not complete. | Users may still need guided follow-up before package selection. | Design missing-context questions and package recommendation safety gates. |
| Controlled recommendation prototype is not default production recommendation. | 3H validates env-gated live package return, but only in controlled mode. | Do not promote default/global runtime or live package behavior without a future release decision. |
| Some test_advice rows may use lexical fallback. | 3C metadata contract is still valid, but semantic runtime coverage may need tightening later. | Track as non-blocker before stricter semantic coverage goals. |
| Live package output depends on flag state. | `recommendedPackage` can be non-null only when both runtime and live package gates are enabled and context is safe/sufficient. | Keep the three-state regression matrix visible: runtime on/live off, runtime off, runtime on/live on. |

## Decisions Needing Future Review

| Topic | Open question |
| --- | --- |
| Semantic architecture | Should the persistent Python bridge remain the long-term architecture, or be replaced by a more integrated vector service? |
| Runtime promotion | When should controlled semantic retrieval become the broader default? |
| Retriever v1.4 controlled integration | Controlled integration is implemented and smoke-tested; future review should decide if/when it becomes broader default. |
| Recommendation integration | How and when should package recommendation become live in full frontend/backend runtime? |
| Metadata UX | How much debug/citation metadata should be visible to users versus developers? |
| Live package recommendation promotion | Should controlled live package recommendation remain env-gated only, or be promoted after product/catalog/monitoring review? |
