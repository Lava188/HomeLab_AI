# retriever_v1_3 Encoding Clean Rebuild Report

## Scope

This rebuild fixes the `chunk_text` label encoding issue in `retriever_v1_3`. The previous issue was mojibake/question-mark labels such as `Ti?u ??`, `M?c ??`, `T? kh?a`, `N?i dung`, `Nh?n`, and `Lo?i FAQ` appearing in `chunk_text` while `embedding_config.json` uses `text_field=chunk_text`.

## Input KB

- `ai_lab/datasets/medical_kb_v1_3.json`

The KB file was parsed and used as-is. No medical KB content, item IDs, schema, backend, frontend, runtime adapter, recommendation layer, policy logic, or eval script was modified.

## Output Artifact Folder

- `ai_lab/artifacts/retriever_v1_3/`

## Files Rebuilt

- `ai_lab/artifacts/retriever_v1_3/kb_chunks_v1_3.json`
- `ai_lab/artifacts/retriever_v1_3/chunk_metadata.json`
- `ai_lab/artifacts/retriever_v1_3/chunk_embeddings.npy`
- `ai_lab/artifacts/retriever_v1_3/faiss.index`
- `ai_lab/artifacts/retriever_v1_3/retriever_manifest.json`
- `ai_lab/artifacts/retriever_v1_3/embedding_config.json`

## Label Fix

`chunk_text` was regenerated with explicit UTF-8 labels:

- `Tiêu đề:`
- `Mục:`
- `Mức độ rủi ro:`
- `Từ khóa:`
- `Nội dung:`
- `Gợi ý hành động:`
- `Nhãn:`
- `Loại FAQ:`

`Gợi ý hành động:` is populated from existing `safety_notes`; this changes only the chunk label text, not the source KB schema or medical content.

## Validation Summary

- medical_kb_v1_3.json parse: `PASS`
- item count = 42: `PASS`
- chunk count = 42: `PASS`
- metadata count = 42: `PASS`
- embeddings shape = 42 x 384: `PASS`
- no duplicate id: `PASS`
- no duplicate chunk_id: `PASS`
- FAISS index load: `PASS`
- FAISS ntotal = 42: `PASS`
- embedding dimension matches config: `PASS`
- chunk_text marker check: `PASS`

Marker set checked in all `chunk_text`: `Ti?u`, `M?c`, `T? kh`, `N?i dung`, `Nh?n`, `Lo?i`, `??`, `?`, `?`, `??`, `??`, `???`.

## Sample chunk_text After Rebuild

### Sample 1

```text
Tiêu đề: Khi có dấu hiệu nhiễm trùng và cảm giác rất mệt hoặc rất không ổn, cần được đánh giá sớm
Mục: red_flags
Mức độ rủi ro: high
Từ khóa: nhiễm trùng nặng, sepsis, dấu hiệu nặng
Nhãn: sepsis, red_flags, infection
Loại FAQ: red_flag_general
Gợi ý hành động: Không dùng nội dung này để tự kết luận sepsis.
Nội dung: Nếu một người có dấu hiệu nhiễm trùng và đồng thời cảm thấy rất mệt, rất yếu hoặc diễn tiến xấu nhanh, cần nghĩ đến khả năng bệnh nặng hơn bình thường và nên được đánh giá y tế sớm.
```

### Sample 2

```text
Tiêu đề: Khi nào đau ngực cần gọi cấp cứu ngay
Mục: red_flags
Mức độ rủi ro: high
Từ khóa: đau ngực, cấp cứu, call emergency
Nhãn: chest_pain, red_flags
Loại FAQ: emergency_warning
Gợi ý hành động: Nếu có dấu hiệu nghiêm trọng, cần gọi cấp cứu hoặc đến cơ sở y tế khẩn cấp ngay.
Nội dung: Cần gọi cấp cứu ngay nếu đau hoặc tức ngực xuất hiện đột ngột và không hết, có cảm giác bóp nghẹt, đè nặng hoặc nóng rát, đặc biệt nếu cơn đau lan ra tay, cổ, hàm, bụng hoặc lưng. Nguy cơ cũng cao hơn nếu đau ngực đi kèm vã mồ hôi, buồn nôn, choáng váng hoặc khó thở.
```

### Sample 3

```text
Tiêu đề: Kết quả xét nghiệm máu có thể cần nhân viên y tế giải thích và đôi khi cần bước tiếp theo
Mục: test_explainers
Mức độ rủi ro: low
Từ khóa: kết quả xét nghiệm máu, kết quả phức tạp, nhân viên y tế giải thích, xét nghiệm thêm, bước tiếp theo
Nhãn: xét_nghiệm_máu, giải_thích_kết_quả, nhân_viên_y_tế, xét_nghiệm_thêm
Loại FAQ: test_result_explainer
Gợi ý hành động: Nội dung này chỉ giải thích ở mức cơ bản cho người dùng. Không hàm ý xét nghiệm máu một mình có thể chẩn đoán, loại trừ bệnh hoặc thay thế đánh giá của nhân viên y tế.
Nội dung: Xét nghiệm máu có thể giúp kiểm tra sức khỏe, tìm hiểu nguyên nhân triệu chứng hoặc theo dõi một tình trạng, nhưng kết quả có thể phức tạp và không phải lúc nào cũng cho đủ câu trả lời. Hãy hỏi nhân viên y tế giải thích ý nghĩa kết quả và liệu có cần xét nghiệm thêm hoặc bước tiếp theo nào khác không.
```

## Runtime / Eval Confirmation

No chunks outside `retriever_v1_3`, old retriever artifacts, backend, frontend, runtime adapter, recommendation layer, package catalog, policy logic, eval script, or retrieval eval output was modified. Runtime has not been switched to `retriever_v1_3`.

## Next Step

Run retrieval eval v1_3/eval v2 in a separate explicit prompt before any runtime switch.
