# Retriever v1.4 Controlled Runtime Release Decision 4B-2L

## 1. Decision summary

Retriever v1.4 should remain **controlled-only** at this milestone.

Approved scope:
- Controlled local testing under explicit runtime flags.
- Thesis/demo use under explicit flags.
- Continued UX, routing, safety, provenance, and regression observation.

Not approved:
- Default/global Retriever v1.4 promotion.
- Committed `.env` default activation.
- Default live package recommendation.
- Production healthcare readiness claims.

This decision recognizes that v1.4 has enough evidence for controlled runtime evaluation, but not enough evidence for default or production activation.

## 2. Runtime scope under review

The reviewed runtime scope is the controlled Retriever v1.4 backend path using:
- Python semantic bridge.
- Node semantic bridge integration.
- Real `/api/chat` runtime path.
- Explicit semantic retrieval and v1.4 flags.
- Existing safety-first routing policy: urgent health before booking before recommendation.

This review does not include frontend changes, production deployment readiness, default environment activation, or live package recommendation promotion.

## 3. Evidence reviewed

### Offline retriever v1.4 evidence

Reviewed evidence includes:
- Batch 4A human-reviewed KB items.
- Merged v1.4 corpus.
- Embeddings and FAISS index build.
- Held-out retrieval evaluation with strong enough results to justify controlled runtime testing.
- Provenance-oriented corpus construction using reviewed source metadata.

This evidence supports continued controlled evaluation. It does not by itself prove production readiness.

### Controlled runtime evidence

Reviewed evidence includes:
- Retriever v1.4 ported into backend runtime under controlled flags.
- Python bridge and Node semantic bridge exercised through the real `/api/chat` path.
- Runtime metadata present for selected retrieval mode, retriever version, strategy, bridge status, provenance, and runtime promotion flags.
- Fallback behavior and safety routing tested against API smoke cases.
- 4B-2K frontend/API UX retest blockers addressed.

## 4. Smoke/regression status

| Area | Status | Notes |
| --- | --- | --- |
| Bridge/API controlled v1.4 path | Pass | Controlled runtime path exercised through `/api/chat`. |
| Router regression | Pass | Health, booking, mixed urgent, fallback, and test-advice routing covered. |
| Fallback behavior | Pass | v1.4 remains controlled; fallback/default promotion not changed. |
| Provenance/source metadata | Pass | Source and provenance metadata available in controlled runtime responses. |
| Urgent-booking UX | Pass | Urgent health remains prioritized over booking. |
| Answer polish | Pass | Lab explanation and medical review boundary answers improved. |
| Recommendation gates | Pass | Recommendation runtime remains controlled prototype; no live/default promotion. |

## 5. Frontend/API UX review status

| 4B-2K issue | Current status |
| --- | --- |
| CBC explanation placeholder | Addressed; answer now explains CBC as hồng cầu, bạch cầu, tiểu cầu and does not rely on placeholder text. |
| CBC abnormal / leukemia boundary | Addressed; no diagnosis, no booking hijack, asks to read with clinician/context. |
| Bạch cầu high boundary | Addressed; routed through health RAG, not booking. |
| ALT/AST high boundary | Addressed; routed through health RAG, not booking. |
| Creatinine high boundary | Addressed; routed through health RAG, not booking. |
| Fever + confusion + rapid breathing | Addressed; urgent escalation retained and D-dimer mismatch suppressed. |
| Dyspnea + cyanosis + fatigue | Addressed; emergency/cyanosis wording used without adding infection context. |
| Generic home sampling booking | Preserved; remains booking and does not infer test type. |

The review supports controlled UX testing. It does not replace a longer manual regression window.

## 6. Safety and product gates

Safety gates that must remain in force:
- `urgent_health` has priority over booking and recommendation.
- Mixed booking plus urgent symptoms must route to urgent health.
- Booking continuation must not hijack lab-result or medical-review boundary questions unless the user is clearly answering a booking missing field.
- Medical review boundary answers must avoid diagnosis and encourage reading results with a clinician or qualified health worker.
- Recommendation runtime and live package recommendation must remain controlled and non-default.

Product gates that remain open:
- Tone and CTA review for lab explanation answers.
- Source chip/source alignment review across more frontend sessions.
- Manual validation of source snippets shown for medical boundary answers.
- Separate release decision for any live package recommendation behavior.

## 7. Known non-blocking issues

Known issues that do not block controlled-only testing:
- Lab explanation answers sometimes include a soft booking CTA.
- Bạch cầu high answer is safe, but still somewhat broad when it mentions leukemia/blood cancer context.
- Fever/confusion/rapid-breathing source alignment can be improved further, even though the current urgent answer avoids D-dimer mismatch.
- A longer frontend/manual regression window is still needed.
- Package recommendation remains a controlled prototype.

## 8. Release decision

Decision: **keep Retriever v1.4 controlled-only**.

Approved:
- Controlled local testing.
- Thesis/demo runs under explicit flags.
- Continued UX/regression observation.

Not approved:
- Default/global v1.4 promotion.
- Committed `.env` default activation.
- Default live package recommendation.
- Production healthcare readiness.

## 9. Conditions before revisiting default/global promotion

Before reconsidering default/global Retriever v1.4 promotion, the project should complete:
- Broader manual/API regression across health RAG, booking, urgent safety, fallback, provenance, and recommendation-gated flows.
- Verification that runtime metadata remains truthful, including selected retrieval mode, retriever version, bridge status, fallback reason, and promotion flags.
- Source alignment review for urgent and medical-review boundary answers.
- Confirmation that safety gates remain stable under active sessions and mixed intents.
- Product review for tone, CTA placement, and frontend source chips.
- A separate live package recommendation release decision.

## 10. Next steps

- Continue controlled runtime testing with explicit v1.4 flags.
- Keep collecting 4B UX/API regression cases, especially boundary questions and active booking-session interruptions.
- Review lab explanation CTA wording and source chip behavior in frontend sessions.
- Track any source alignment drift for urgent symptoms.
- Prepare a separate decision document before any live package recommendation promotion.
