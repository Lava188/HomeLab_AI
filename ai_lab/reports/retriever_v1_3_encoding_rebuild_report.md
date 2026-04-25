# retriever_v1_3 Encoding Clean Rebuild Report

## Scope

This step fixed mojibake/encoding issues in the current KB v1_3 file and rebuilt the existing `retriever_v1_3` artifact folder from the cleaned KB. No retrieval eval was run, and runtime/recommendation behavior was not switched.

## Input / Output

- KB file repaired in place: `ai_lab/datasets/medical_kb_v1_3.json`
- Artifact folder rebuilt: `ai_lab/artifacts/retriever_v1_3/`

## Files Updated

- `ai_lab/datasets/medical_kb_v1_3.json`
- `ai_lab/artifacts/retriever_v1_3/kb_chunks_v1_3.json`
- `ai_lab/artifacts/retriever_v1_3/chunk_metadata.json`
- `ai_lab/artifacts/retriever_v1_3/chunk_embeddings.npy`
- `ai_lab/artifacts/retriever_v1_3/faiss.index`
- `ai_lab/artifacts/retriever_v1_3/embedding_config.json`
- `ai_lab/artifacts/retriever_v1_3/retriever_manifest.json`

## Encoding Repair Summary

- KB items affected before repair: `17`
- String fields affected before repair: `17`
- String fields repaired in KB: `17`
- Protected fields preserved: `id`, `source_id`, `source_url`, `review_status`, `runtime_enabled`, `promotion_status`, `use_in_v1`, `kb_version`, `release_version`
- Build label source: inline rebuild code uses explicit Unicode labels for `Tiêu đề`, `Mục`, `Mức độ rủi ro`, `Từ khóa`, and `Nội dung`; no persistent backend/runtime/policy code was modified.

## Validation Summary

- medical_kb_v1_3.json parse: `PASS`
- item count = 42: `PASS`
- chunk count = 42: `PASS`
- metadata count = 42: `PASS`
- no duplicate id: `PASS`
- no duplicate chunk_id: `PASS`
- FAISS index load: `PASS`
- FAISS ntotal = 42: `PASS`
- embedding dimension matches config: `PASS`
- KB text has no bad encoding markers: `PASS`
- chunk_text has no bad encoding markers: `PASS`
- metadata text has no bad encoding markers: `PASS`

Bad marker set checked in KB/chunks/metadata text fields: `Ã`, `Â`, `Ä`, `Æ`, `áº`, `á»`, `ï¿½`, `Ti?u ??`, `M?c ??`, `T? kh?a`, `N?i dung`, plus common `â€` mojibake sequences.

## Smoke Test Result

- Query: `kết quả xét nghiệm máu phức tạp cần hỏi ai`
  - rank 1: `kb_v1_3_042` / `kb_v1_3_042_c1` / score `0.9280` / Kết quả xét nghiệm máu có thể cần nhân viên y tế giải thích và đôi khi cần bước tiếp theo
  - rank 2: `kb_v1_2_024` / `kb_v1_2_024_c1` / score `0.8930` / D-dimer bất thường thường cần xét nghiệm tiếp chứ không đủ để tự kết luận
  - rank 3: `kb_v1_006` / `kb_v1_006_c1` / score `0.8928` / Vì sao bác sĩ có thể chỉ định xét nghiệm máu
- Query: `đau ngực vã mồ hôi khó thở cần làm gì`
  - rank 1: `kb_v1_3_040` / `kb_v1_3_040_c1` / score `0.9268` / Đau ngực kèm vã mồ hôi, buồn nôn, choáng váng hoặc khó thở cần được cấp cứu
  - rank 2: `kb_v1_010` / `kb_v1_010_c1` / score `0.8854` / Khi nào đau ngực cần gọi cấp cứu ngay
  - rank 3: `kb_v1_013` / `kb_v1_013_c1` / score `0.8844` / Khi nào khó thở cần hỗ trợ khẩn cấp
- Query: `khó thở môi xanh tím lú lẫn`
  - rank 1: `kb_v1_3_041` / `kb_v1_3_041_c1` / score `0.9264` / Khó thở kèm môi hoặc da rất nhợt, xanh tím, xám, hoặc lú lẫn đột ngột cần cấp cứu
  - rank 2: `kb_v1_013` / `kb_v1_013_c1` / score `0.8712` / Khi nào khó thở cần hỗ trợ khẩn cấp
  - rank 3: `kb_v1_015` / `kb_v1_015_c1` / score `0.8680` / Không nên tự chẩn đoán nguyên nhân khó thở
- Query: `nhiễm trùng nặng rất mệt xấu đi nhanh sepsis`
  - rank 1: `kb_v1_001` / `kb_v1_001_c1` / score `0.9174` / Khi có dấu hiệu nhiễm trùng và cảm giác rất mệt hoặc rất không ổn, cần được đánh giá sớm
  - rank 2: `kb_v1_3_039` / `kb_v1_3_039_c1` / score `0.9104` / Nghi ngờ nhiễm trùng nặng hoặc sepsis ở người từ 16 tuổi trở lên cần được đánh giá y tế sớm
  - rank 3: `kb_v1_004` / `kb_v1_004_c1` / score `0.8892` / Khi có dấu hiệu nguy cơ cao của nhiễm trùng nặng, cần chuyển cấp cứu ngay

## Runtime / Eval Confirmation

No backend, frontend, runtime adapter, recommendation layer, package catalog, policy logic, eval logic, or retrieval eval output was modified. `retriever_v1_3` was rebuilt as an artifact only and was not activated in runtime.

## Next Recommended Step

Run retrieval eval v1_3 or eval v2 in a separate explicit prompt. Do not switch runtime or recommendation behavior to `retriever_v1_3` until eval results are reviewed.
