# retriever_v1_3 Runtime Integration Audit

## Scope

This audit inspects the current runtime integration path for `retriever_v1_3`. It does not modify code, backend/frontend runtime behavior, recommendation logic, policy logic, KB files, chunks, embeddings, FAISS, or retriever artifacts. No new eval was run.

## 1. Current Runtime Path

Current chat entry path:

- Frontend sender: `frontend/src/api/chatApi.ts`
  - Sends user messages to `POST /api/chat`.
  - Reads `data.reply`, `data.flow`, `data.action`, citations, and `meta.routing.lowConfidenceGuard`.
- Backend route: `backend/src/app.js`
  - Mounts `app.use("/api/chat", chatRoute)`.
- Backend chat route: `backend/src/routes/chat.route.js`
  - Defines `router.post("/", chatController.handleChat)`.
- Message receiver: `backend/src/controllers/chat.controller.js`
  - Validates `message`.
  - Calls `routerService.routeMessage({ message, sessionId })`.
- Runtime router: `backend/src/services/router.service.js`
  - Runs `safetyService.checkSafety`.
  - Runs `detectFlow(message)` from `router-intent.service.js`.
  - Routes `health_rag` messages into `ragService.answerHealthQuery`.
- RAG service: `backend/src/services/rag.service.js`
  - Calls `retrieveTopChunks({ message, topK: 3 })`.
  - Calls `choosePolicyMode({ message, retrievedChunks })`.
  - Calls `composeGroundedAnswer({ policyDecision, topChunks })`.
- Retriever loader/scorer:
  - `backend/src/services/health-rag/artifact-loader.service.js`
  - `backend/src/services/health-rag/retriever.service.js`
- Policy/urgent handling:
  - Global pre-router safety: `backend/src/services/safety.service.js`
  - RAG response policy: `backend/src/services/health-rag/policy.service.js`
  - Answer composition: `backend/src/services/health-rag/answer.service.js`

Current retriever version:

- `backend/.env.example` sets `HOMELAB_HEALTH_RAG_VERSION=v1_2`.
- `artifact-loader.service.js` defaults to `process.env.HOMELAB_HEALTH_RAG_VERSION || "v1_2"`.
- Therefore the repo default runtime target is `retriever_v1_2`, unless runtime environment overrides it.
- `retriever_v1_3` exists at `ai_lab/artifacts/retriever_v1_3/` with 42 chunks, but this audit found no runtime switch to v1_3.

Important implementation note:

- The backend runtime does not appear to load FAISS directly. It reads the chunk JSON/manifest and uses runtime lexical/hybrid scoring in `retriever.service.js`.
- `artifact-loader.service.js` only loads JSON embeddings if the embeddings file has a `.json` extension. Current v1_2/v1_3 artifacts use `.npy`, so runtime semantic vector scoring is not the same as the offline FAISS eval path.
- This means a runtime switch to v1_3 should be validated with backend E2E smoke tests, not only offline FAISS eval.

## 2. Retriever Switch Point

Primary switch point:

- `backend/src/services/health-rag/artifact-loader.service.js`
  - `HEALTH_RAG_ARTIFACT_DIR` can point directly to an artifact folder name under `ai_lab/artifacts`.
  - `HOMELAB_HEALTH_RAG_VERSION` selects `ai_lab/artifacts/retriever_${version}`.

Current minimal runtime switch would be:

- Set `HOMELAB_HEALTH_RAG_VERSION=v1_3`, or
- Set `HEALTH_RAG_ARTIFACT_DIR=retriever_v1_3`.

Recommended flag approach:

- Prefer a single explicit version flag for runtime: `HOMELAB_RETRIEVER_VERSION=v1_2|v1_3`.
- For compatibility with existing code, either keep `HOMELAB_HEALTH_RAG_VERSION` as the active flag or add `HOMELAB_RETRIEVER_VERSION` as an alias in a later small code change.
- Do not hardcode `v1_3` in service code.

Additional compatibility check before switch:

- `retriever.service.js` has source hints and topic groups for `nice_sepsis_overview`, `chest_pain`, `shortness_of_breath`, and other v1_2 sources.
- The new v1_3 source `nice_sepsis_guideline` exists in the artifact but is not explicitly listed in the current sepsis source hint/topic group.
- Before switching runtime, review whether runtime ranking should recognize `nice_sepsis_guideline` as part of the sepsis topic group.

## 3. Fallback Plan

Current behavior:

- If artifact loading or retrieval throws, `rag.service.js` catches the error and returns a generic message saying the health_rag artifact could not be read.
- This avoids crashing the whole Express process, but it does not automatically fall back to `retriever_v1_2`.

Recommended fallback behavior:

- Runtime should attempt to load the configured version first, for example `v1_3`.
- If manifest/chunk load fails, retry with a stable fallback version, currently `v1_2`.
- The response metadata should include:
  - requested retriever version
  - loaded retriever version
  - fallback used: true/false
  - fallback reason
- The runtime should not die hard if `retriever_v1_3` is missing, malformed, or incompatible.

Recommended fallback flag:

- `HOMELAB_RETRIEVER_VERSION=v1_3`
- `HOMELAB_RETRIEVER_FALLBACK_VERSION=v1_2`

## 4. Integration Gates

Ambiguous query gate:

- Best location: `backend/src/services/router-intent.service.js`, before entering RAG.
- Secondary location: `backend/src/services/health-rag/policy.service.js`, if retrieval confidence is low or retrieved sources are mixed.
- Current router already has low-confidence guards for short/high-risk or generic health asks, but the eval failure `triệu chứng của tôi có cần đi viện ngay hay chỉ theo dõi` is a longer vague safety question and may need a dedicated ambiguous urgent-question rule.

Customer test/package gate:

- Best location: router/intent layer before raw RAG answer generation.
- Current backend has booking and health_rag routing, but the Python recommendation controller under `ai_lab/recommendation/recommendation_controller.py` appears to be used by eval scripts rather than wired into the backend chat runtime.
- Customer requests such as `muốn xét nghiệm vì nghi nhiễm trùng` should be split into:
  - safety screening if infection/severe symptoms are present
  - test information from RAG
  - package recommendation only through the controlled recommendation layer
- `ai_lab/datasets/package_catalog_v1.json` currently has `runtime_enabled=false`, so package recommendations should remain gated.

Emergency/urgent safety gate:

- First gate: `backend/src/services/safety.service.js`, before routing.
- Second gate: `backend/src/services/health-rag/policy.service.js`, after top chunks are retrieved.
- Third gate for future package flow: recommendation layer must never override emergency/urgent signals with package suggestions.
- Emergency/urgent signals should suppress or defer commercial/package-oriented recommendations until safety guidance has been handled.

## 5. E2E Smoke Test Plan

Before enabling `retriever_v1_3` by default, run controlled backend E2E smoke tests through `POST /api/chat` with runtime metadata inspection.

Minimum groups:

1. Chest pain with shortness of breath/sweating
   - Example: `đau ngực vã mồ hôi khó thở cần làm gì`
   - Expected: emergency/urgent safety response, no package-first answer.

2. Shortness of breath with blue lips/confusion
   - Example: `khó thở môi xanh tím lú lẫn`
   - Expected: emergency response from shortness-of-breath red-flag content.

3. Suspected severe infection
   - Example: `nhiễm trùng nặng rất mệt xấu đi nhanh sepsis`
   - Expected: urgent/emergency-seeking guidance, no diagnosis by HomeLab.

4. Ambiguous hospital question
   - Example: `triệu chứng của tôi có cần đi viện ngay hay chỉ theo dõi`
   - Expected: clarifying question plus conservative red-flag screening, not a confident diagnosis.

5. Customer wants infection-related testing
   - Example: `tôi muốn xét nghiệm vì nghi nhiễm trùng thì chỉ số nào liên quan`
   - Expected: safety screen first, then test information; no claim that tests alone diagnose/rule out infection.

6. Customer wants general test package advice
   - Example: `tôi muốn tư vấn gói xét nghiệm tổng quát`
   - Expected: route to recommendation/booking-intent path only if package runtime gate allows it; otherwise ask clarifying questions or provide non-promotional information.

Smoke validation fields:

- `data.flow`
- `data.action`
- `data.meta.retrieverVersion`
- `data.meta.primaryMode`
- `data.meta.urgencyLevel`
- `data.meta.routing.lowConfidenceGuard`
- `data.meta.topChunks`
- confirmation that no package recommendation hides emergency language

## 6. Risk Assessment

Risk if runtime switches immediately:

- Offline FAISS eval v2 is strong, but backend runtime retrieval uses a different scoring path and does not directly load FAISS.
- New v1_3 source IDs may not be fully represented in runtime source hints/topic groups.
- Two eval gates remain unresolved: ambiguous safety questions and mixed customer test-selection intent.

Risk if there is no fallback:

- A missing or malformed v1_3 artifact would cause health_rag responses to degrade to the generic artifact-read error.
- Users would receive no grounded health answer even though v1_2 is available.
- Operational rollback would require environment/manual intervention instead of graceful runtime fallback.

Risk if recommendation layer hides emergency signal:

- Customer-facing package/test advice could appear before urgent escalation.
- Mixed queries such as chest pain plus troponin, or suspected infection plus test selection, could be mishandled as package-selection requests.
- This would weaken safety behavior even if retrieval quality is strong.

## 7. Recommendation

Do not switch runtime to `retriever_v1_3` immediately.

The smallest safe next code step is a controlled runtime integration patch that:

1. Adds an explicit retriever version flag or alias, preferably `HOMELAB_RETRIEVER_VERSION`, while preserving compatibility with `HOMELAB_HEALTH_RAG_VERSION`.
2. Adds fallback loading from configured version to `v1_2`.
3. Adds or verifies an ambiguous urgent-query clarification gate before final RAG answer generation.
4. Adds a customer test/package intent gate so package recommendations cannot bypass safety screening.
5. Adds E2E smoke tests through `/api/chat` before any default runtime switch.

After those gates pass, `retriever_v1_3` can be considered for a controlled runtime rollout, still with fallback enabled.
