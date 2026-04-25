# retriever_v1_3 Eval Report

## Scope

This eval loads the existing `retriever_v1_3` artifact only. It does not rebuild embeddings, FAISS, chunks, backend, frontend, runtime, policy, package catalog, or recommendation-layer logic.

## Artifact

- Retriever version: `v1_3`
- KB version: `v1_3`
- Artifact dir: `ai_lab/artifacts/retriever_v1_3`
- Model: `intfloat/multilingual-e5-small`
- Top-k: `3`

## Metrics

- Query count: `12`
- Hit@1: `1.0000`
- Hit@3: `1.0000`
- Expected source Hit@3: `1.0000`
- Expected keyword Hit@3: `1.0000`

## Failures

- None

## Per-Query Results

- `stomach_ache_emergency_001` / `dau_bung`
  - Hit@1: `True`; Hit@3: `True`
  - Top1: `kb_v1_2_035_c1`
  - Top3: `kb_v1_2_035_c1, kb_v1_2_036_c1, kb_v1_2_033_c1`
- `stomach_ache_urgent_002` / `dau_bung`
  - Hit@1: `True`; Hit@3: `True`
  - Top1: `kb_v1_2_036_c1`
  - Top3: `kb_v1_2_036_c1, kb_v1_011_c1, kb_v1_2_035_c1`
- `headache_emergency_001` / `dau_dau`
  - Hit@1: `True`; Hit@3: `True`
  - Top1: `kb_v1_2_033_c1`
  - Top3: `kb_v1_2_033_c1, kb_v1_2_034_c1, kb_v1_2_037_c1`
- `headache_urgent_002` / `dau_dau`
  - Hit@1: `True`; Hit@3: `True`
  - Top1: `kb_v1_2_034_c1`
  - Top3: `kb_v1_2_034_c1, kb_v1_2_036_c1, kb_v1_2_033_c1`
- `fainting_emergency_001` / `ngat_xiu`
  - Hit@1: `True`; Hit@3: `True`
  - Top1: `kb_v1_2_031_c1`
  - Top3: `kb_v1_2_031_c1, kb_v1_010_c1, kb_v1_013_c1`
- `fainting_urgent_002` / `ngat_xiu`
  - Hit@1: `True`; Hit@3: `True`
  - Top1: `kb_v1_2_032_c1`
  - Top3: `kb_v1_2_032_c1, kb_v1_2_034_c1, kb_v1_003_c1`
- `anaphylaxis_emergency_001` / `di_ung_nang_phan_ve`
  - Hit@1: `True`; Hit@3: `True`
  - Top1: `kb_v1_2_029_c1`
  - Top3: `kb_v1_2_029_c1, kb_v1_013_c1, kb_v1_3_040_c1`
- `anaphylaxis_adrenaline_002` / `di_ung_nang_phan_ve`
  - Hit@1: `True`; Hit@3: `True`
  - Top1: `kb_v1_2_030_c1`
  - Top3: `kb_v1_2_030_c1, kb_v1_2_029_c1, kb_v1_2_031_c1`
- `blood_test_results_001` / `giai_thich_xet_nghiem_pho_bien`
  - Hit@1: `True`; Hit@3: `True`
  - Top1: `kb_v1_3_042_c1`
  - Top3: `kb_v1_3_042_c1, kb_v1_006_c1, kb_v1_2_024_c1`
- `cbc_explainer_002` / `giai_thich_xet_nghiem_pho_bien`
  - Hit@1: `True`; Hit@3: `True`
  - Top1: `kb_v1_2_019_c1`
  - Top3: `kb_v1_2_019_c1, kb_v1_2_020_c1, kb_v1_2_016_c1`
- `bmp_explainer_003` / `giai_thich_xet_nghiem_pho_bien`
  - Hit@1: `True`; Hit@3: `True`
  - Top1: `kb_v1_2_018_c1`
  - Top3: `kb_v1_2_018_c1, kb_v1_2_017_c1, kb_v1_3_042_c1`
- `crp_explainer_004` / `giai_thich_xet_nghiem_pho_bien`
  - Hit@1: `True`; Hit@3: `True`
  - Top1: `kb_v1_2_021_c1`
  - Top3: `kb_v1_2_021_c1, kb_v1_2_022_c1, kb_v1_3_039_c1`

## Runtime Readiness Note

- Status: `candidate_ready_for_larger_eval_before_runtime_switch`
- Recommendation: run the larger retrieval eval v1_3/eval v2 before switching any runtime or recommendation behavior.
