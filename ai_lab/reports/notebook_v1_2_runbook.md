# Notebook v1_2 Runbook

## Purpose
- Use the official notebook route for `v1_2` retriever build, retrieval eval, and grounded response simulation.
- Keep baseline `v1` artifacts frozen.
- Run only after the notebook dependency stack is available.

## Current Notebook Readiness
- `04_build_kb_chunks.ipynb` reads `medical_kb_v1_2.json` when `HOMELAB_KB_VERSION=v1_2`.
- `05_build_embeddings_and_faiss.ipynb` builds the official `retriever_v1_2` artifact folder and now fails clearly if core dependencies are missing.
- `06_eval_retriever.ipynb` defaults to `health_rag_eval_v1_2_release_candidate.json` and `retrieval_eval_v1_2.csv` when `HOMELAB_KB_VERSION=v1_2`.
- `08_simulate_grounded_response.ipynb` defaults to `final_answer_simulation_v1_2.csv` and now supports the broader `v1_2` test-explainer and red-flag coverage.

## Required Dependencies
- `pandas`
- `numpy`
- `faiss-cpu`
- `sentence-transformers`

## Run Order
1. `04_build_kb_chunks.ipynb`
2. `05_build_embeddings_and_faiss.ipynb`
3. `06_eval_retriever.ipynb`
4. `08_simulate_grounded_response.ipynb`

## Exact Commands
```bash
cd /home/vietdh/HomeLab_AI/ai_lab
HOMELAB_KB_VERSION=v1_2 HOMELAB_RETRIEVER_VERSION=v1_2 HOMELAB_REPORT_VERSION=v1_2 jupyter notebook notebooks/04_build_kb_chunks.ipynb
```

```bash
cd /home/vietdh/HomeLab_AI/ai_lab
HOMELAB_KB_VERSION=v1_2 HOMELAB_RETRIEVER_VERSION=v1_2 HOMELAB_EMBED_MODEL=intfloat/multilingual-e5-small jupyter notebook notebooks/05_build_embeddings_and_faiss.ipynb
```

```bash
cd /home/vietdh/HomeLab_AI/ai_lab
HOMELAB_KB_VERSION=v1_2 HOMELAB_RETRIEVER_VERSION=v1_2 HOMELAB_EVAL_SET_NAME=health_rag_eval_v1_2_release_candidate.json HOMELAB_EVAL_REPORT_NAME=retrieval_eval_v1_2.csv jupyter notebook notebooks/06_eval_retriever.ipynb
```

```bash
cd /home/vietdh/HomeLab_AI/ai_lab
HOMELAB_KB_VERSION=v1_2 HOMELAB_RETRIEVER_VERSION=v1_2 HOMELAB_FINAL_SIM_REPORT_NAME=final_answer_simulation_v1_2.csv jupyter notebook notebooks/08_simulate_grounded_response.ipynb
```

## Expected Official Outputs
- `ai_lab/artifacts/retriever_v1_2/kb_chunks_v1_2.json`
- `ai_lab/artifacts/retriever_v1_2/chunk_metadata.json`
- `ai_lab/artifacts/retriever_v1_2/chunk_embeddings.npy`
- `ai_lab/artifacts/retriever_v1_2/faiss.index`
- `ai_lab/artifacts/retriever_v1_2/embedding_config.json`
- `ai_lab/artifacts/retriever_v1_2/retriever_manifest.json`
- `ai_lab/reports/kb_chunk_stats_v1_2.csv`
- `ai_lab/reports/retrieval_eval_v1_2.csv`
- `ai_lab/reports/final_answer_simulation_v1_2.csv`

## Current Status
- The dependency stack is installed on the current machine.
- The official `v1_2` notebook route has already been executed successfully once.
- Re-running the notebooks is now an operational choice, not a blocker.
