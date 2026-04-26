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
| Recommendation | Recommendation layer has separate eval evidence in `ai_lab/reports`, but package catalog runtime remains gated/disabled in current reports. |

## Current Milestone

**Controlled Semantic Retrieval + Safety-Priority Intent Grouping**.

HomeLab has passed the controlled semantic retrieval milestone. The backend can use the persistent semantic bridge with `selectedRetrievalMode="semantic_faiss"` in health RAG, while retaining safe lexical fallback. Routing now exposes intent groups and prioritizes urgent health red flags over booking actions.

## Current Status

- KB/retriever v1_3 artifact has been built successfully.
- Offline v1_3 retrieval evals are strong.
- Persistent Python semantic bridge is available and verified with `runtimeMode=semantic_faiss`.
- Controlled semantic retrieval is available behind runtime flags and returns `selectedRetrievalMode="semantic_faiss"` for health RAG when enabled.
- Intent grouping is active in backend metadata: `urgent_health`, `test_advice`, `booking`, and `general_health`.
- Frontend manual test for the latest routing and controlled semantic retrieval milestone passed **8/8**.
- Default runtime/env has **not** been switched globally; semantic retrieval remains controlled/opt-in.

## What Is Already Done

- KB v1_3 packaged with 42 items.
- Batch A v1_3 items `kb_v1_3_039` to `kb_v1_3_042` approved in packaging report.
- Retriever v1_3 artifact built at `ai_lab/artifacts/retriever_v1_3/`.
- Artifact includes `kb_chunks_v1_3.json`, `chunk_metadata.json`, `chunk_embeddings.npy`, `faiss.index`, `embedding_config.json`, and `retriever_manifest.json`.
- Offline eval v1_3 and eval v2 completed.
- Controlled runtime flags added/reported: `HOMELAB_RETRIEVER_VERSION`, `HOMELAB_RETRIEVER_FALLBACK_VERSION`, legacy `HOMELAB_HEALTH_RAG_VERSION`.
- Fallback and safety gates were reported as passing controlled smoke/API smoke.
- Frontend manual smoke checklist/template exists, but no completed result was found.
- Controlled semantic retrieval with persistent bridge verified in runtime.
- `intentGroup` routing added so urgent health, test advice, and booking are easier to inspect in Network/debug metadata.
- Manual frontend/runtime test passed 8/8 for urgent health, test advice, normal booking, and mixed booking + urgent health cases.

## What Is Blocked

| Blocker | Why it matters |
| --- | --- |
| Recommendation/test package runtime | `test_advice` is now routed safely, but it is not a full package recommendation engine. |
| Default runtime switch | Still intentionally avoided until controlled behavior is reviewed in product context. |
| Package recommendation UX | Needs a dedicated prototype for asking missing context and recommending packages safely. |

## Immediate Next Step

Begin designing the recommendation/test package runtime prototype:

- Use the new `test_advice` intent group as the entry point.
- Ask for missing context before recommending packages: goal, age/sex, symptoms, duration, risk factors, red flags, and prior conditions.
- Keep urgent-health escalation above package/booking recommendations.
- Keep booking gated behind explicit booking/sample-collection actions.
- Preserve semantic RAG as the grounded explanation layer and avoid hard-coded package answers.

## Near-Term Roadmap

| Step | Goal |
| --- | --- |
| 1 | Controlled semantic bridge/retrieval for v1_3 runtime. Done. |
| 2 | Expose runtime debug metadata including `selectedRetrievalMode` and `intentGroup`. Done. |
| 3 | Validate urgent/test-advice/booking routing priority. Done, 8/8 PASS. |
| 4 | Complete frontend manual smoke for latest behavior. Done, 8/8 PASS. |
| 5 | Design recommendation/test package runtime prototype. Next. |
| 6 | Add package recommendation smoke/eval with safety gates. |
| 7 | Only after that revisit broader runtime/default promotion decisions. |

## Rules For Future Work

- RAG-first before early fine-tuning.
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
5. `ai_lab/reports/retriever_v1_3_release_decision_report.md`
6. `ai_lab/reports/retriever_v1_3_api_smoke_report.md`
7. `ai_lab/reports/retriever_v1_3_eval_v2_report.md`
8. `ai_lab/reports/retriever_v1_3_build_report.md`
9. `backend/src/services/health-rag/artifact-loader.service.js`
10. `backend/src/services/health-rag/retriever.service.js`
11. `backend/src/services/router-intent.service.js`
12. `backend/src/services/router.service.js`

## How To Continue From Here

Start from the controlled semantic retrieval and intent grouping state, not the older semantic-inactive audit. The current backend can expose `selectedRetrievalMode="semantic_faiss"` and `intentGroup` when controlled flags/server are enabled. The next implementation should focus on a recommendation/test package runtime prototype, while preserving the current safety priority: urgent health beats booking and test/package advice.
