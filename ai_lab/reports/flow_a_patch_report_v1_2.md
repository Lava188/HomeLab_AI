# Flow A Patch Report v1_2

## Clean Hybrid State
- `flow_a_expand.py` now stops at data / KB expansion outputs.
- `medical_kb_v1_2.json` is explicitly marked as a draft KB version and not runtime-enabled.
- `health_rag_eval_v1_2_release_candidate.json` is the official eval set used for the notebook retriever run.
- Official notebook artifacts for `v1_2` are now built under `ai_lab/artifacts/retriever_v1_2/`.
- Official retrieval eval and grounded simulation reports for `v1_2` are now present under `ai_lab/reports/`.

## Current Safe Outputs
- ai_lab/datasets/medical_kb_v1_2.json
- ai_lab/normalized/docs_v1_2.jsonl
- ai_lab/datasets/eval/health_rag_eval_v1_2_release_candidate.json
- ai_lab/review/approved_chunk_v1_2.jsonl

## Pending Official Notebook Route
- No blocking notebook step remains on the current machine.
- If rollback is needed, set `HOMELAB_HEALTH_RAG_VERSION=v1` in the backend runtime.
