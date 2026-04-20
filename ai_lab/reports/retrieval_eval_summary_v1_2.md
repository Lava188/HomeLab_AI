# Retrieval Eval Summary v1_2

- Total eval rows: 59
- Baseline carry-over rows: 40
- New topic rows: 19
- Recall@1 overall: 0.5424
- Recall@3 overall: 0.7966
- Recall@1 baseline subset: 0.525
- Recall@3 baseline subset: 0.8
- Recall@1 new subset: 0.5789
- Recall@3 new subset: 0.7895

## Notes
- This run uses a lexical fallback retriever because the notebook embedding stack is unavailable in the current environment.
- Metrics are comparable inside this fallback run, but not equivalent to the frozen sentence-transformers + FAISS baseline.
