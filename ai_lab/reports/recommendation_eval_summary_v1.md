# Recommendation Controller Eval v1

- Total cases: 24
- Passed cases: 24
- Failed cases: 0
- Pass rate: 1.0
- Status breakdown: ask_more=6, do_not_recommend=8, escalate=6, recommend=4
- Unsafe recommendation count: 0

Coverage spans ready-package recommendation, missing-slot clarification, ambiguous routing, red-flag escalation, request-flag escalation, guarded and blocked package suppression, unsupported add-on suppression, direct package asks, and explicit flow/goal conflicts. Red flags currently escalate rather than return do_not_recommend in the existing controller.
