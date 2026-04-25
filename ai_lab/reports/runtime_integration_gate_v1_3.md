# Runtime Integration Gate v1_3

## Decision Status

`retriever_v1_3` has not been switched into runtime. This gate report is a pre-integration decision artifact only.

Offline retrieval eval v2 shows strong retrieval quality, but two cases remain as integration gates:

- `v2_ambiguous_005`: vague urgent-sounding symptom query needs clarification before retrieval output is used.
- `v2_customer_need_003`: mixed customer test-selection and infection-risk query needs intent routing through the recommendation layer.

## Eval Basis

- Eval report: `ai_lab/reports/retriever_v1_3_eval_v2_report.json`
- Query count: `52`
- Hit@1: `0.9038`
- Hit@3: `0.9808`
- Hit@5: `0.9808`
- MRR@5: `0.9359`
- Keyword coverage@3: `0.9551`
- Failure cases: `2`

## Gate Requirements Before Runtime Switch

1. Ambiguous query gate: vague symptom questions must go through a clarifying-question policy before final medical guidance is generated.

2. Customer test/package gate: customer requests for test advice or package selection must go through the intent and recommendation layer, not raw retrieval alone.

3. Emergency/urgent safety gate: emergency or urgent signals must not be hidden or overridden by recommendation-layer package suggestions.

4. E2E smoke gate: controlled runtime smoke tests must pass before `retriever_v1_3` is enabled by default.

## Runtime Readiness Conclusion

`retriever_v1_3` is suitable for controlled runtime integration review, but it should not be switched on by default yet. The next step should be a constrained runtime integration review that verifies clarification behavior, customer-intent routing, emergency escalation preservation, and E2E smoke coverage.

## Scope Confirmation

This gate report does not modify KB files, retriever artifacts, embeddings, FAISS, backend, frontend, runtime configuration, recommendation logic, policy logic, or package catalog files.
