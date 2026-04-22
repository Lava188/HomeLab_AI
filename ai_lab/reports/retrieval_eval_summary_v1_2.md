# Retrieval Eval Summary v1_2

- Eval rows: 65
- Strict Recall@1: 0.9385
- Strict Recall@3: 1.0000
- Strict Source Accuracy@1: 0.9692
- Strict Section Accuracy@1: 1.0000
- Acceptable Top-3 Match: 1.0000

## Notes
- The official `v1_2` retriever was built via notebooks `04/05/06`.
- The main residual retrieval misses at strict top-1 are cross-red-flag overlaps where the top result is still clinically relevant and remains acceptable within top-3.
