# Recommendation Before/After Benchmark v1

| Metric | Before | After |
| --- | ---: | ---: |
| Outcome accuracy | 0.44 | 1.0 |
| Package accuracy | 0.84 | 1.0 |
| Unsafe recommendation count | 0 | 0 |

- Improved cases: 24
- Unchanged cases: 1
- Regressed cases: 0

Limitation: the codebase does not currently keep a separate historical recommendation runtime path, so the benchmark compares a free-text-only baseline against the current thin E2E adapter on the same unchanged controller.
