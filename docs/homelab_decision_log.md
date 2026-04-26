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
| Commit GitHub only after meaningful functional behavior changes | Project has many small reports, scripts, and handoff docs. | Committing every small file churn makes history noisy. | Prefer commits after clear product/eval/runtime improvements or requested handoff milestones. | Active |
| Aim for professional prototype, not simple demo | Product goal is semantic healthcare chatbot with safety, retrieval, clarification, and recommendations. | Demo-like keyword responses will not meet the intended standard. | Technical work should improve real behavior, observability, and safety gates. | Active |

## Current Release Decision

HomeLab is ready to proceed from controlled semantic retrieval into recommendation/test package runtime design. The current milestone is **controlled semantic retrieval + intentGroup routing**, not a full default-runtime or recommendation-runtime switch.

The backend can use the persistent semantic bridge in health RAG with `selectedRetrievalMode="semantic_faiss"` when enabled, and manual frontend/runtime testing passed 8/8 for urgent health, test advice, normal booking, and mixed booking + urgent health priority. Safety remains the priority: urgent health red flags beat booking actions, and test advice does not become booking unless the user clearly asks to book or collect a sample.

The next release decision should focus on a recommendation/test package runtime prototype, while preserving semantic RAG grounding and the current safety-priority routing.

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

## Remaining Risks After Current Milestone

| Risk | Implication | Next action |
| --- | --- | --- |
| `test_advice` is a business-intent gate, not a full recommendation engine. | It can route and answer safely, but it does not yet choose personalized packages end to end. | Build a recommendation/test package runtime prototype. |
| Default/global runtime has not been switched. | Current semantic retrieval is controlled/opt-in rather than a broad production default. | Keep rollout gated until product review and additional smoke coverage. |
| Package recommendation UX is not complete. | Users may still need guided follow-up before package selection. | Design missing-context questions and package recommendation safety gates. |

## Decisions Needing Future Review

| Topic | Open question |
| --- | --- |
| Semantic architecture | Should the persistent Python bridge remain the long-term architecture, or be replaced by a more integrated vector service? |
| Runtime promotion | When should controlled semantic retrieval become the broader default? |
| Recommendation integration | How and when should package recommendation become live in full frontend/backend runtime? |
| Metadata UX | How much debug/citation metadata should be visible to users versus developers? |
