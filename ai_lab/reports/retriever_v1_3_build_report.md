# retriever_v1_3 Build Report

## Input KB

- `ai_lab/datasets/medical_kb_v1_3.json`

## Output Artifact Folder

- `ai_lab/artifacts/retriever_v1_3/`

## Files Created / Updated

- `ai_lab/artifacts/retriever_v1_3/kb_chunks_v1_3.json`
- `ai_lab/artifacts/retriever_v1_3/chunk_metadata.json`
- `ai_lab/artifacts/retriever_v1_3/chunk_embeddings.npy`
- `ai_lab/artifacts/retriever_v1_3/faiss.index`
- `ai_lab/artifacts/retriever_v1_3/embedding_config.json`
- `ai_lab/artifacts/retriever_v1_3/retriever_manifest.json`

## Build Convention

- Strategy: one KB item = one chunk.
- Chunk ID convention: `<kb_id>_c1`.
- Embedding model: `intfloat/multilingual-e5-small`.
- FAISS index type: `IndexFlatIP` with normalized embeddings.
- Default top-k: `3`.

## Validation Summary

- JSON KB parse: `PASS`
- Item count = 42: `PASS`
- Chunk count matches 1 item = 1 chunk: `PASS`
- No duplicate chunk_id: `PASS`
- New Batch A IDs in chunks: `PASS`
- New Batch A IDs in metadata: `PASS`
- FAISS index loads: `PASS`
- FAISS index count matches chunks: `PASS`
- Embedding dimension matches config: `PASS`
- Retriever manifest fields valid: `PASS`

## Smoke Test Result

- Query: `kết quả xét nghiệm máu phức tạp cần hỏi ai`
  - rank 1: `kb_v1_3_042` / `kb_v1_3_042_c1` / score `0.9222` / Kết quả xét nghiệm máu có thể cần nhân viên y tế giải thích và đôi khi cần bước tiếp theo
  - rank 2: `kb_v1_006` / `kb_v1_006_c1` / score `0.8924` / Vì sao bác sĩ có thể chỉ định xét nghiệm máu
  - rank 3: `kb_v1_009` / `kb_v1_009_c1` / score `0.8918` / Sau khi xét nghiệm máu và khi nhận kết quả
- Query: `đau ngực vã mồ hôi khó thở cần làm gì`
  - rank 1: `kb_v1_3_040` / `kb_v1_3_040_c1` / score `0.9203` / Đau ngực kèm vã mồ hôi, buồn nôn, choáng váng hoặc khó thở cần được cấp cứu
  - rank 2: `kb_v1_010` / `kb_v1_010_c1` / score `0.8891` / Khi nào đau ngực cần gọi cấp cứu ngay
  - rank 3: `kb_v1_013` / `kb_v1_013_c1` / score `0.8832` / Khi nào khó thở cần hỗ trợ khẩn cấp
- Query: `khó thở môi xanh tím lú lẫn`
  - rank 1: `kb_v1_3_041` / `kb_v1_3_041_c1` / score `0.9207` / Khó thở kèm môi hoặc da rất nhợt, xanh tím, xám, hoặc lú lẫn đột ngột cần cấp cứu
  - rank 2: `kb_v1_013` / `kb_v1_013_c1` / score `0.8769` / Khi nào khó thở cần hỗ trợ khẩn cấp
  - rank 3: `kb_v1_015` / `kb_v1_015_c1` / score `0.8715` / Không nên tự chẩn đoán nguyên nhân khó thở
- Query: `nhiễm trùng nặng rất mệt xấu đi nhanh sepsis`
  - rank 1: `kb_v1_001` / `kb_v1_001_c1` / score `0.9155` / Khi có dấu hiệu nhiễm trùng và cảm giác rất mệt hoặc rất không ổn, cần được đánh giá sớm
  - rank 2: `kb_v1_3_039` / `kb_v1_3_039_c1` / score `0.9084` / Nghi ngờ nhiễm trùng nặng hoặc sepsis ở người từ 16 tuổi trở lên cần được đánh giá y tế sớm
  - rank 3: `kb_v1_004` / `kb_v1_004_c1` / score `0.8890` / Khi có dấu hiệu nguy cơ cao của nhiễm trùng nặng, cần chuyển cấp cứu ngay

## Scope Confirmation

No backend, frontend, runtime adapter, package catalog, recommendation layer, policy logic, eval logic, old retriever artifact, chunks for older versions, embeddings for older versions, FAISS index for older versions, or full eval output was modified.

## Next Recommended Step

Run retrieval eval v1_3 or eval v2 in a separate explicit prompt. Do not switch recommendation/runtime behavior to `retriever_v1_3` yet.
