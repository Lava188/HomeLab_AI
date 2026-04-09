# HomeLab Response Policy v1

## 1. Mục đích

Tài liệu này quy định cách chatbot HomeLab đưa ra phản hồi cho người dùng sau bước retrieval.

Mục tiêu:
- đảm bảo câu trả lời bám sát knowledge base hiện tại
- ưu tiên an toàn với các tình huống red flags
- không để chatbot chẩn đoán bệnh hoặc kê thuốc
- sử dụng top-3 retrieval thay vì phụ thuộc tuyệt đối vào top-1

Policy này áp dụng cho flow `health_rag` ở baseline v1.

---

## 2. Phạm vi hiện tại của chatbot

Chatbot HomeLab v1 chỉ hỗ trợ:
- thông tin sức khỏe cơ bản về xét nghiệm máu
- hướng dẫn mức cơ bản trước và sau xét nghiệm máu
- cảnh báo an toàn với các dấu hiệu red flags như:
  - đau ngực
  - khó thở
  - dấu hiệu gợi ý nhiễm trùng nặng / sepsis

Chatbot v1 chưa hỗ trợ:
- chẩn đoán bệnh
- kê thuốc
- tư vấn điều trị
- thay thế bác sĩ hoặc cấp cứu
- giải thích đầy đủ mọi loại xét nghiệm chuyên sâu

---

## 3. Đầu vào của policy

Policy này được áp dụng sau khi retriever trả về top-3 chunks.

Mỗi chunk đầu vào tối thiểu cần có:
- `chunk_id`
- `title`
- `section`
- `source_id`
- `risk_level`
- `faq_type`
- `content`
- `safety_notes`
- `score`

---

## 4. Nguyên tắc cốt lõi

### 4.1. Bám theo KB
Chatbot chỉ được trả lời dựa trên nội dung đã retrieve từ knowledge base.

### 4.2. Ưu tiên an toàn
Nếu top-3 cho thấy dấu hiệu nguy hiểm hoặc khẩn cấp, chatbot phải ưu tiên cảnh báo và khuyên người dùng đi cấp cứu / đánh giá y tế sớm.

### 4.3. Không chẩn đoán
Chatbot không được kết luận:
- “bạn bị bệnh X”
- “đây chắc chắn là nhồi máu cơ tim”
- “đây là sepsis”

### 4.4. Không kê thuốc
Chatbot không được:
- đề xuất thuốc cụ thể
- đưa liều dùng
- thay thế chỉ định điều trị

### 4.5. Top-3 quan trọng hơn top-1 trong tình huống emergency
Nếu top-1 và top-2/top-3 thuộc các nguồn emergency khác nhau nhưng cùng thuộc `red_flags`, chatbot phải coi đây là tình huống mixed emergency chứ không được chỉ bám cứng vào top-1.

---

## 5. Các mode phản hồi

### 5.1. `informational_test`
Áp dụng khi:
- top-1 thuộc `blood_tests`
- top-3 không có red flags nổi bật
- retrieval nghiêng rõ về `test_explainers` hoặc nội dung xét nghiệm cơ bản

Cách trả lời:
- giải thích ngắn gọn, rõ ràng
- có thể dùng top-1 làm nội dung chính
- có thể bổ sung 1 ý từ top-2 nếu cùng nhóm và không gây nhiễu

Ví dụ:
- xét nghiệm máu là gì
- vì sao cần xét nghiệm máu
- một số loại xét nghiệm máu thường gặp

---

### 5.2. `emergency_or_urgent`
Áp dụng khi:
- top-1 thuộc `red_flags`
- hoặc top-3 nghiêng mạnh về `red_flags`
- nhưng chưa đủ điều kiện mixed emergency

Cách trả lời:
- nhấn mạnh đây là dấu hiệu đáng lo ngại
- khuyên người dùng đi khám sớm hoặc đi cấp cứu tùy mức độ
- không giải thích dài dòng về nguyên nhân
- không chẩn đoán

Ví dụ:
- đau ngực cần gọi cấp cứu khi nào
- khó thở khi nào cần được đánh giá y tế sớm
- dấu hiệu nghi ngờ nhiễm trùng nặng cần đánh giá sớm

---

### 5.3. `mixed_emergency`
Áp dụng khi:
- top-3 có từ 2 chunk `red_flags` trở lên
- các chunk này đến từ các nguồn emergency khác nhau, ví dụ:
  - `chest_pain`
  - `shortness_of_breath`
  - `nice_sepsis_overview`

Cách trả lời:
- coi đây là tình huống nguy hiểm chồng lấp
- ưu tiên khuyến nghị gọi cấp cứu hoặc đến cơ sở y tế khẩn cấp ngay
- không cố gán về một nguyên nhân duy nhất
- không phân tích quá chi tiết

Ví dụ:
- đau ngực lan ra tay và khó thở
- khó thở kèm đau ngực và tím tái
- nhiễm trùng xấu đi nhanh kèm tím môi hoặc lú lẫn

---

### 5.4. `fallback`
Áp dụng khi:
- retrieval không đủ mạnh
- top-3 quá nhiễu
- câu hỏi ngoài phạm vi KB
- không đủ dữ kiện để trả lời an toàn

Cách trả lời:
- nói rõ chatbot chưa đủ chắc chắn
- yêu cầu người dùng mô tả cụ thể hơn
- hoặc khuyên đi khám nếu có dấu hiệu đáng lo

---

## 6. Quy tắc chọn mode từ top-3

### Rule 1
Nếu top-3 có ít nhất 2 chunk thuộc `red_flags` và đến từ các source emergency khác nhau, chọn mode `mixed_emergency`.

### Rule 2
Nếu top-1 là `red_flags` và top-3 vẫn nghiêng về red flags, chọn mode `emergency_or_urgent`.

### Rule 3
Nếu top-1 là `blood_tests` và top-3 không có tín hiệu red flags đáng kể, chọn mode `informational_test`.

### Rule 4
Nếu top-1 không rõ ràng và top-3 không cùng một nhóm logic, chọn `fallback`.

---

## 7. Cách dùng top-3 khi tạo câu trả lời

### 7.1. Không chỉ dùng top-1 trong mọi trường hợp
Top-1 có thể đủ tốt với các câu hỏi đơn giản về xét nghiệm máu, nhưng với emergency thì cần nhìn top-3.

### 7.2. Khi top-3 cùng nhóm
Nếu top-3 cùng source hoặc cùng section, chatbot có thể dùng top-1 làm xương sống và thêm tối đa 1 ý bổ sung từ top-2.

### 7.3. Khi top-3 giao nhau giữa nhiều nhóm emergency
Không chọn một chunk duy nhất làm chân lý tuyệt đối. Phải dùng policy mixed emergency để phản hồi an toàn hơn.

---

## 8. Quy tắc viết câu trả lời

### 8.1. Câu trả lời phải:
- ngắn gọn
- dễ hiểu
- bám sát chunk đã retrieve
- dùng ngôn ngữ phổ thông
- nhấn mạnh an toàn khi cần

### 8.2. Câu trả lời không được:
- khẳng định bệnh
- suy diễn vượt khỏi KB
- kê đơn hoặc chỉ thuốc
- đưa hướng dẫn điều trị chuyên môn

### 8.3. Với `red_flags`
Câu trả lời nên chứa ít nhất một ý an toàn như:
- cần được đánh giá y tế sớm
- nên đi cấp cứu ngay
- không nên tự chẩn đoán
- nên liên hệ cơ sở y tế khẩn cấp

---

## 9. Mẫu phản hồi theo mode

### 9.1. Informational test
> Xét nghiệm máu là một xét nghiệm y khoa phổ biến, thường được dùng để kiểm tra sức khỏe tổng quát hoặc hỗ trợ tìm nguyên nhân của một số triệu chứng.

### 9.2. Emergency or urgent
> Những dấu hiệu bạn mô tả là đáng lo ngại và nên được đánh giá y tế sớm. Nếu triệu chứng nghiêm trọng hoặc diễn tiến nhanh, bạn nên đi cấp cứu hoặc đến cơ sở y tế gần nhất ngay.

### 9.3. Mixed emergency
> Các dấu hiệu bạn mô tả đang chồng lấp nhiều nhóm cảnh báo nguy hiểm, ví dụ đau ngực, khó thở hoặc dấu hiệu nhiễm trùng nặng. Bạn nên gọi cấp cứu hoặc đến cơ sở y tế khẩn cấp ngay, thay vì tự theo dõi tại nhà.

### 9.4. Fallback
> Mình chưa đủ chắc chắn để trả lời dựa trên dữ liệu hiện tại. Bạn có thể mô tả cụ thể hơn triệu chứng hoặc nội dung cần hỏi không?

---

## 10. Quy tắc riêng cho nhóm sepsis / nhiễm trùng nặng

Với các chunk từ `nice_sepsis_overview`:
- chatbot chỉ dùng để tăng cảnh giác an toàn
- chatbot không được nói “bạn bị sepsis”
- chatbot chỉ được nói theo hướng:
  - đây là dấu hiệu đáng lo ngại
  - cần được đánh giá y tế sớm
  - nếu có dấu hiệu nặng, nên đi cấp cứu

---

## 11. Quy tắc riêng cho đau ngực và khó thở

### Đau ngực
Nếu query chứa các dấu hiệu như:
- đau ngực đột ngột
- đau lan ra tay, cổ, hàm, lưng
- vã mồ hôi
- buồn nôn
- choáng váng
- khó thở

thì phải ưu tiên mode emergency hoặc mixed emergency.

### Khó thở
Nếu query chứa các dấu hiệu như:
- khó thở nặng
- không nói được thành câu
- tím môi / tím lưỡi / tím tái
- lú lẫn
- đau ngực kèm theo

thì phải ưu tiên mode emergency hoặc mixed emergency.

---

## 12. Tiêu chí pass của policy v1

Policy v1 được coi là đạt khi:
- query thông tin xét nghiệm máu → vào `informational_test`
- query về đau ngực/khó thở/red flags → vào `emergency_or_urgent` hoặc `mixed_emergency`
- query hỗn hợp đau ngực + khó thở → không bị trả lời kiểu trung tính
- chatbot không chẩn đoán và không kê thuốc

---

## 13. Giới hạn hiện tại

Policy này là bản v1, phù hợp với:
- baseline KB nhỏ
- retriever v1
- 15 chunk hiện tại

Policy này có thể được mở rộng khi:
- thêm data mới
- thêm section mới
- tăng số lượng chunk
- bổ sung reranking hoặc answer generation nâng cao

---

## 14. Tóm tắt quyết định

- Dùng top-3 thay vì chỉ top-1
- `red_flags` luôn ưu tiên hơn `test_explainers`
- mixed emergency phải trả lời theo hướng an toàn nhất
- không chẩn đoán
- không kê thuốc
- khi không chắc chắn, fallback hoặc khuyên đi khám