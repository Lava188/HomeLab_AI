# retriever_v1_3 Eval v2 Report

## Scope

This larger retrieval eval loads the existing `retriever_v1_3` artifact only. It does not modify KB source data, chunking, embeddings, FAISS, backend, frontend, runtime, policy, package catalog, or recommendation-layer logic.

## Artifact Loaded

- Retriever version: `v1_3`
- KB version: `v1_3`
- Artifact dir: `ai_lab/artifacts/retriever_v1_3`
- Model: `intfloat/multilingual-e5-small`
- Text field: `chunk_text`
- Eval top-k: `5`
- Chunk count: `42`

## Metrics Summary

- Query count: `52`
- Hit@1: `0.9038`
- Hit@3: `0.9808`
- Hit@5: `0.9808`
- MRR@5: `0.9359`
- Expected source Hit@3: `0.9808`
- Expected source Hit@5: `0.9808`
- Keyword coverage@3: `0.9551`

## Group Breakdown

| Group | Queries | Hit@1 | Hit@3 | Hit@5 | MRR@5 | Source@3 | Source@5 | Keyword@3 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `cau_hoi_mo_ho_thieu_thong_tin` | 5 | 0.6000 | 0.8000 | 0.8000 | 0.7000 | 0.8000 | 0.8000 | 0.9333 |
| `cau_hoi_nhieu_dien_dat_doi_thuong` | 5 | 0.8000 | 1.0000 | 1.0000 | 0.8667 | 1.0000 | 1.0000 | 1.0000 |
| `dau_bung` | 5 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 1.0000 |
| `dau_dau` | 5 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 1.0000 |
| `di_ung_nang_phan_ve` | 5 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 1.0000 |
| `giai_thich_xet_nghiem_mau_pho_bien` | 10 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 0.9667 |
| `ngat_xiu` | 5 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 1.0000 |
| `nhiem_trung_nang_sepsis` | 7 | 0.8571 | 1.0000 | 1.0000 | 0.9286 | 1.0000 | 1.0000 | 0.9524 |
| `nhu_cau_khach_hang_tu_van_xet_nghiem` | 5 | 0.8000 | 1.0000 | 1.0000 | 0.8667 | 1.0000 | 1.0000 | 0.7333 |

## Failure Cases

- `v2_ambiguous_005` / `cau_hoi_mo_ho_thieu_thong_tin`
  - Query: triệu chứng của tôi có cần đi viện ngay hay chỉ theo dõi
  - Expected chunks: `kb_v1_004_c1, kb_v1_2_029_c1, kb_v1_2_031_c1`
  - Expected sources: `nice_sepsis_overview, nhs_anaphylaxis, nhs_fainting_adults`
  - Top5: `kb_v1_2_038_c1, kb_v1_010_c1, kb_v1_2_033_c1, kb_v1_2_022_c1, kb_v1_2_024_c1`
  - Keyword coverage@3: `0.6667`
- `v2_customer_need_003` / `nhu_cau_khach_hang_tu_van_xet_nghiem`
  - Query: tôi muốn xét nghiệm vì nghi nhiễm trùng thì chỉ số nào liên quan
  - Expected chunks: `kb_v1_2_019_c1, kb_v1_2_021_c1, kb_v1_2_016_c1`
  - Expected sources: `medlineplus_cbc_test, medlineplus_crp_test, medlineplus_blood_culture_test`
  - Top5: `kb_v1_3_039_c1, kb_v1_3_042_c1, kb_v1_2_016_c1, kb_v1_001_c1, kb_v1_2_020_c1`
  - Keyword coverage@3: `0.3333`

## Runtime Readiness Note

- Status: `not_ready_for_runtime_switch`
- Recommendation: Không nên switch runtime sau eval này; cần review các failure case và/hoặc mở rộng kiểm thử trước.
- Runtime has not been switched to `retriever_v1_3` by this eval step.
