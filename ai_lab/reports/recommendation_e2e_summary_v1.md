# Recommendation-Layer E2E-Style Benchmark v1

## Scope

This is a recommendation-layer benchmark. It evaluates natural-language query handling into recommendation-controller inputs and outputs, but it does not evaluate the full frontend/backend/AI production system end to end.

## Current Benchmark Result

- Cases: 25
- Passed: 25
- Failed: 0
- Pass rate: 1.0
- Outcome accuracy: 1.0
- Flow accuracy: 1.0
- Package accuracy: 1.0
- Next-slot accuracy: 1.0
- Unsafe recommendation count: 0
- Outcome breakdown: ask_more=5, do_not_recommend=7, escalate=9, recommend=4

## Per-Category Breakdown

- recommend: 4
- ask_more: 5
- do_not_recommend: 7
- escalate: 9

## Scoring Policy

- Strictly scored: outcome, flow_id, package_id, next_slot_ids.
- Lenient by default: reason_flags are supporting evidence and do not fail a case unless a dataset row explicitly sets strict_reason_flags=true.

## Before Vs After

- Before: Frozen weaker recommendation-layer baseline: literal extraction only, no derived-slot inference, and narrower query understanding.
- After: Current recommendation-layer E2E-style adapter: extract current-schema slot state from text, derive a small set of aggregate slots conservatively, then call the unchanged controller.
- Outcome accuracy: 0.76 -> 1.0
- Flow accuracy: 1.0 -> 1.0
- Package accuracy: 0.84 -> 1.0
- Next-slot accuracy: 0.72 -> 1.0
- Unsafe recommendation count: 0 -> 0
- Improved / unchanged / regressed: 8 / 17 / 0

## What This Benchmark Proves

- The recommendation layer can be evaluated reproducibly from natural-language prompts into controller-level recommendation outcomes.
- Conservative derived-slot inference materially improves recommendation-layer routing, recommendation, suppression, and escalation behavior over the frozen weaker baseline.
- The current recommendation-layer benchmark produces no unsafe recommendations on this benchmark set.

## What This Benchmark Does Not Prove

- It does not prove full-system frontend/backend/runtime correctness.
- It does not prove model-level understanding beyond the deterministic benchmark adapter implemented in this runner.
- It does not validate future package semantics beyond the current controller, schema, and catalog contract.

## Failed Cases

- None.
