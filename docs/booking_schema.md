# Booking schema

Các trường bắt buộc:
- test_type
- appointment_date
- appointment_time
- address
- phone

Các trường tùy chọn:
- note
- patient_name

Luồng:
1. Nhận yêu cầu đặt lịch
2. Trích xuất thông tin có sẵn
3. Hỏi bổ sung nếu thiếu
4. Xác nhận lại
5. Gọi API create_appointment