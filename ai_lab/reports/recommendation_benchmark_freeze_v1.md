# Recommendation Benchmark Freeze v1

## Freeze Note

This document freezes the current recommendation-layer benchmark state for thesis reporting. It records the benchmark outputs as they exist in the current codebase without changing controller logic, schema, runtime behavior, benchmark methodology, or benchmark cases.

## Benchmark Scope

This is recommendation-layer benchmark evidence. It evaluates natural-language recommendation queries through the benchmark runner into recommendation-controller inputs and outputs. It is not full frontend/backend/AI production runtime validation.

## Source-of-Truth Artifacts

- `ai_lab/reports/recommendation_e2e_summary_v1.md`
- `ai_lab/reports/recommendation_e2e_eval_v1.json`

## Derived Reporting Artifacts

- `ai_lab/reports/recommendation_upgrade_narrative_v1.md`
- `ai_lab/reports/recommendation_benchmark_freeze_v1.md`
- `ai_lab/reports/recommendation_benchmark_manifest_v1.json`

## Frozen Metrics

- Total cases: `25`
- Passed cases: `25`
- Failed cases: `0`
- Pass rate: `1.0`
- Outcome accuracy: `0.76 -> 1.0`
- Flow accuracy: `1.0 -> 1.0`
- Package accuracy: `0.84 -> 1.0`
- Next-slot accuracy: `0.72 -> 1.0`
- Unsafe recommendation count: `0 -> 0`
- Improved / unchanged / regressed: `8 / 17 / 0`
- Current outcome breakdown: `recommend=4`, `ask_more=5`, `do_not_recommend=7`, `escalate=9`

## Scope Boundary

These frozen results support a claim of measurable improvement in the recommendation layer. They do not, by themselves, validate the full deployed system runtime across frontend, backend routing, and live AI integration.
