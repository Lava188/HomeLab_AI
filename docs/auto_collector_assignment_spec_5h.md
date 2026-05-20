# Auto Collector Assignment Workflow Spec 5H-0

## 1. Purpose

Milestone 5H-0 định nghĩa đặc tả cho luồng tự động phân công collector sau khi HomeLab đã có booking/package/auth gate tương đối đầy đủ. Ở trạng thái hiện tại, hệ thống đã có thể yêu cầu người dùng đăng nhập trước khi đặt, đổi, hủy lịch; xác nhận gói xét nghiệm; kiểm soát slot/capacity; và cho admin thao tác với booking/staff. Tuy nhiên, phần phân công người lấy mẫu vẫn cần một workflow riêng để biến booking đã xác nhận thành nhiệm vụ vận hành thực tế cho collector.

Auto collector assignment giúp:

- Giảm thao tác thủ công của admin khi có nhiều booking.
- Phân công đúng người theo thời gian, khu vực và năng lực làm việc.
- Cho collector quyền xác nhận hoặc từ chối nhiệm vụ có lý do.
- Giữ admin trong vòng kiểm soát khi có từ chối, quá tải hoặc cần override.
- Tạo nền tảng vận hành chuyên nghiệp cho lấy mẫu tại nhà mà không liên quan đến payment.

## 2. Current baseline

Baseline hiện tại của code trước 5H:

- Booking runtime DB đã có các thực thể chính như `Patient`, `TestCatalogItem`, `StaffProfile`, `AvailabilitySlot`, `Booking`, `BookingDraft`, `BookingStatusHistory`.
- Booking đã có slot/capacity enforcement để hạn chế đặt lịch vượt khả dụng.
- Admin đã có booking operations, bao gồm thao tác quản trị và phân công thủ công theo khả năng hiện có.
- Admin đã có staff management và workload rules ở mức phục vụ quản lý nhân sự/tải công việc.
- Admin đã có availability slot management.
- Collector đã có dashboard để nhìn phần việc liên quan.
- Booking đã có status transition matrix.
- Chưa có auto assignment thật sau khi booking được tạo/xác nhận.
- Chưa có mô hình riêng để collector đăng ký working area theo tỉnh/thành phố, quận/huyện, phường/xã.
- Chưa có mô hình riêng để collector đăng ký working schedule/working hours.
- Chưa có workflow collector accept/reject assignment.
- Chưa có bước admin review lý do từ chối assignment.

## 3. Target business workflow

Luồng mục tiêu end-to-end:

1. Patient/User đăng nhập và tạo booking thành công.
2. Booking đi qua package confirmation, auth gate, slot/capacity validation và được confirmed theo business rule hiện tại.
3. System gọi service nội bộ để tìm collector phù hợp.
4. System lọc collector theo role, active status, khu vực, lịch làm việc, workload/capacity và conflict assignment.
5. System chọn candidate tốt nhất và tạo `CollectorAssignment` ở trạng thái `PENDING_COLLECTOR_CONFIRMATION`.
6. Collector nhìn thấy nhiệm vụ chờ xác nhận trên collector dashboard.
7. Collector chấp nhận hoặc từ chối:
   - Nếu chấp nhận, assignment chuyển sang `ACCEPTED`; booking được xem là đã phân công hoặc giữ `CONFIRMED` kèm assignment accepted tùy phương án status.
   - Nếu từ chối, collector bắt buộc nhập lý do; assignment chuyển sang `REJECTED_PENDING_ADMIN_REVIEW`.
8. Admin xem danh sách rejection pending review.
9. Admin duyệt hoặc không duyệt lý do từ chối:
   - Nếu duyệt, hệ thống có thể tạo assignment mới cho collector khác hoặc admin gán thủ công.
   - Nếu không duyệt, admin xử lý thủ công theo tình huống vận hành.
10. Khi collector đã nhận nhiệm vụ, quy trình tiếp tục sang sample collection.
11. Sau lấy mẫu, booking tiếp tục đi qua lab processing, result và completed theo status flow hiện tại/tương lai.

## 4. Roles and permissions

### Patient/User

- Tạo booking sau khi đã đăng nhập.
- Xem trạng thái booking ở dashboard.
- Không chọn collector trực tiếp trong phase đầu.
- Không xem lý do từ chối nội bộ của collector/admin.
- Có thể được hiển thị trạng thái thân thiện như "Đang sắp xếp nhân viên lấy mẫu" nếu assignment chưa accepted.

### Admin

- Xem trạng thái assignment trong booking detail.
- Xem danh sách collector assignment.
- Gán collector thủ công khi auto assignment không tìm được người phù hợp hoặc khi cần override.
- Xem các rejection pending review.
- Duyệt hoặc không duyệt lý do từ chối của collector.
- Kích hoạt reassign sau khi rejection được duyệt.
- Quản lý hoặc giám sát working area/working schedule của collector nếu business chọn admin-managed mode.
- Mọi manual override phải được ghi audit/history.

### Collector/Sample collector

- Đăng ký hoặc cập nhật vùng làm việc.
- Đăng ký hoặc cập nhật lịch làm việc/khung giờ làm việc.
- Xem nhiệm vụ đang chờ xác nhận.
- Chấp nhận nhiệm vụ được giao.
- Từ chối nhiệm vụ và bắt buộc nhập lý do.
- Xem nhiệm vụ đã nhận và thực hiện quy trình lấy mẫu.
- Không được tự gán booking cho mình nếu không qua assignment flow hoặc admin permission.

## 5. Proposed status model

### A. Existing BookingStatus

`BookingStatus` nên tiếp tục đại diện cho trạng thái nghiệp vụ cấp booking như confirmed, cancelled, sample collection, lab processing, result, completed hoặc các trạng thái hiện có trong transition matrix. Không nên nhồi quá nhiều trạng thái chi tiết của phân công collector vào `BookingStatus`, vì assignment có vòng đời riêng và có thể có nhiều lần thử phân công cho cùng một booking.

Nếu cần mở rộng nhẹ, có thể thêm:

- `WAITING_COLLECTOR_ASSIGNMENT`

Tuy nhiên, để giảm migration và tránh làm phình booking state machine, phase đầu có thể dùng phương án:

- Booking giữ `CONFIRMED`.
- Trạng thái phân công được biểu diễn bằng `CollectorAssignmentStatus`.
- UI hiển thị trạng thái tổng hợp dựa trên booking status + assignment status.

### B. New CollectorAssignmentStatus

Đề xuất tạo status riêng:

- `PENDING_COLLECTOR_CONFIRMATION`: assignment đã tạo, đang chờ collector xác nhận.
- `ACCEPTED`: collector đã nhận nhiệm vụ.
- `REJECTED_PENDING_ADMIN_REVIEW`: collector đã từ chối và lý do chờ admin duyệt.
- `REJECTION_APPROVED`: admin đồng ý với lý do từ chối.
- `REJECTION_REJECTED`: admin không đồng ý với lý do từ chối.
- `CANCELLED`: assignment bị hủy do booking bị hủy hoặc admin hủy.
- `EXPIRED`: collector không phản hồi trong thời hạn.
- `SUPERSEDED`: assignment cũ bị thay thế bởi assignment mới.

## 6. Proposed database model draft

Đây là draft model, chưa code và chưa tạo migration ở 5H-0.

### CollectorWorkingArea

Mục tiêu: lưu vùng làm việc mà collector có thể nhận nhiệm vụ.

Fields chính:

- `id`
- `staffProfileId`
- `province`
- `district`
- `ward`
- `active`
- `createdAt`
- `updatedAt`

Ghi chú:

- Ban đầu ưu tiên dữ liệu cho Hà Nội và TP.HCM.
- `ward` có thể nullable nếu collector nhận toàn quận/huyện.
- `district` có thể nullable nếu collector nhận toàn tỉnh/thành phố, nhưng phase đầu nên cân nhắc bắt buộc district để matching rõ ràng hơn.

### CollectorWorkingSchedule hoặc CollectorAvailabilityRule

Mục tiêu: lưu lịch làm việc định kỳ hoặc theo ngày cụ thể.

Fields chính:

- `id`
- `staffProfileId`
- `dayOfWeek` hoặc `workDate`
- `startTime`
- `endTime`
- `active`
- `createdAt`
- `updatedAt`

Ghi chú:

- `dayOfWeek` phù hợp với lịch lặp hàng tuần.
- `workDate` phù hợp với đăng ký lịch theo từng ngày.
- Có thể bắt đầu với `workDate` để dễ kiểm soát vận hành thực tế, sau đó mở rộng rule lặp.

### CollectorAssignment

Mục tiêu: lưu từng lần phân công collector cho một booking.

Fields chính:

- `id`
- `bookingId`
- `collectorId`
- `status`
- `assignmentSource` (`AUTO` hoặc `ADMIN`)
- `assignedAt`
- `acceptedAt`
- `rejectedAt`
- `rejectReason`
- `adminReviewStatus`
- `adminReviewedById`
- `adminReviewedAt`
- `expiresAt`
- `metadata`
- `createdAt`
- `updatedAt`

Ghi chú:

- `collectorId` trỏ tới `StaffProfile`.
- Một booking có thể có nhiều assignment theo thời gian, nhưng chỉ nên có tối đa một active assignment chưa terminal.
- `metadata` có thể lưu score, matching reason, candidate rank hoặc context phục vụ audit.

### CollectorAssignmentHistory

Mục tiêu: audit transition riêng cho assignment.

Fields chính:

- `id`
- `assignmentId`
- `fromStatus`
- `toStatus`
- `actorType`
- `actorId`
- `reason`
- `metadata`
- `createdAt`

Ghi chú:

- Nên dùng history riêng thay vì reuse `BookingStatusHistory` nếu muốn audit rõ trạng thái assignment.
- Có thể liên kết booking history ở mức summary khi assignment accepted/cancelled/reassigned ảnh hưởng trạng thái booking.

### Notification hoặc AssignmentNotification

Mục tiêu: thông báo collector/admin khi có nhiệm vụ mới, assignment sắp hết hạn hoặc rejection pending review.

Fields có thể cần về sau:

- `id`
- `recipientUserId` hoặc `staffProfileId`
- `assignmentId`
- `type`
- `channel`
- `readAt`
- `metadata`
- `createdAt`

Ghi chú:

- Có thể để future, chưa bắt buộc trong phase schema đầu nếu dashboard polling đủ dùng.

## 7. Matching algorithm

Service nội bộ đề xuất: `autoAssignCollectorForBooking(bookingId)`.

Các bước lọc:

1. Load booking và địa chỉ lấy mẫu.
2. Không chạy nếu booking ở trạng thái terminal như cancelled, completed hoặc no-show.
3. Validate slot vẫn hợp lệ và booking có ngày/giờ lấy mẫu rõ ràng.
4. Lấy danh sách staff active có role `SAMPLE_COLLECTOR`.
5. Filter collector có working area match với province/district/ward của booking.
6. Filter collector có working schedule bao phủ ngày/giờ lấy mẫu.
7. Exclude collector quá tải theo workload/capacity hiện tại.
8. Exclude collector có assignment active conflict cùng khung giờ hoặc gần khung giờ theo buffer vận hành.
9. Exclude hoặc giảm điểm collector có pending assignment quá hạn, nhiều rejection gần đây hoặc admin flag.
10. Score candidate và chọn collector tốt nhất.

Pseudo-score:

```text
score =
  areaMatchScore
  + availabilityFitScore
  + workloadScore
  + reliabilityScore
  - activeAssignmentPenalty
  - recentRejectionPenalty
  - distanceOrTravelPenalty
```

Gợi ý scoring:

- `areaMatchScore`: ward exact match cao nhất, district match trung bình, province-only thấp hơn.
- `availabilityFitScore`: khung giờ nằm gọn trong schedule cao hơn khung sát biên.
- `workloadScore`: collector ít task trong ngày được ưu tiên.
- `reliabilityScore`: collector ít từ chối/ít expired assignment được ưu tiên.
- `recentRejectionPenalty`: giảm điểm nếu collector vừa từ chối booking tương tự hoặc cùng khu vực trong thời gian gần.

Nếu không có candidate:

- Không tạo assignment auto.
- Ghi log/audit reason.
- Booking hiển thị cần admin manual assignment hoặc trạng thái tổng hợp "waiting collector assignment".

## 8. API plan

### Admin

- `GET /api/admin/collector-assignments`: danh sách assignment, filter theo status, ngày, collector, booking.
- `POST /api/admin/bookings/:bookingCode/assignments/manual`: admin gán collector thủ công.
- `POST /api/admin/collector-assignments/:id/approve-rejection`: duyệt lý do từ chối.
- `POST /api/admin/collector-assignments/:id/reject-rejection`: không duyệt lý do từ chối.
- `GET /api/admin/collector-working-areas`: xem vùng làm việc collector.
- `POST /api/admin/collector-working-areas`: tạo vùng làm việc nếu admin quản lý.
- `PATCH /api/admin/collector-working-areas/:id`: cập nhật vùng làm việc.
- `GET /api/admin/collector-working-schedules`: xem lịch làm việc collector.
- `POST /api/admin/collector-working-schedules`: tạo lịch làm việc nếu admin quản lý.
- `PATCH /api/admin/collector-working-schedules/:id`: cập nhật lịch làm việc.

### Collector

- `GET /api/collector/assignments`: xem nhiệm vụ của collector hiện tại.
- `POST /api/collector/assignments/:id/accept`: chấp nhận nhiệm vụ.
- `POST /api/collector/assignments/:id/reject`: từ chối nhiệm vụ, body bắt buộc có `rejectReason`.
- `GET /api/collector/working-areas`: xem vùng làm việc của bản thân.
- `POST /api/collector/working-areas`: đăng ký vùng làm việc.
- `PATCH /api/collector/working-areas/:id`: cập nhật vùng làm việc.
- `GET /api/collector/working-schedules`: xem lịch làm việc của bản thân.
- `POST /api/collector/working-schedules`: đăng ký lịch làm việc.
- `PATCH /api/collector/working-schedules/:id`: cập nhật lịch làm việc.

### System

- `autoAssignCollectorForBooking(bookingId)`: service nội bộ được gọi sau khi booking đủ điều kiện phân công.

## 9. Frontend UI plan

### Collector UI

Collector dashboard cần thêm:

- Khu vực "Nhiệm vụ chờ xác nhận".
- Hiển thị booking code, thời gian lấy mẫu, khu vực lấy mẫu, thông tin liên hệ cần thiết theo permission.
- Nút "Chấp nhận".
- Nút "Từ chối" mở form nhập lý do.
- Validation bắt buộc lý do khi từ chối.
- Danh sách nhiệm vụ đã nhận.
- Màn đăng ký vùng làm việc theo tỉnh/thành phố, quận/huyện, phường/xã.
- Màn đăng ký lịch làm việc theo ngày/khung giờ.

### Admin UI

Admin cần thêm/sửa:

- Booking detail hiển thị assignment state hiện tại.
- Danh sách collector assignment, filter theo status.
- Danh sách rejection pending review.
- Nút duyệt lý do từ chối.
- Nút không duyệt lý do từ chối.
- Nút gán thủ công collector khác.
- Bảng candidate collector phù hợp nếu backend trả về candidate preview.
- Màn quản lý working area/working schedule nếu chọn admin-managed mode.

## 10. State transition rules

Assignment transition hợp lệ:

- `PENDING_COLLECTOR_CONFIRMATION -> ACCEPTED`
- `PENDING_COLLECTOR_CONFIRMATION -> REJECTED_PENDING_ADMIN_REVIEW`
- `REJECTED_PENDING_ADMIN_REVIEW -> REJECTION_APPROVED`
- `REJECTED_PENDING_ADMIN_REVIEW -> REJECTION_REJECTED`
- `REJECTION_APPROVED -> SUPERSEDED` hoặc tạo assignment mới và đánh dấu assignment cũ terminal
- `PENDING_COLLECTOR_CONFIRMATION -> EXPIRED`
- `PENDING_COLLECTOR_CONFIRMATION -> CANCELLED` nếu booking bị cancelled
- `PENDING_COLLECTOR_CONFIRMATION -> SUPERSEDED` nếu admin gán collector khác trước khi collector phản hồi

Quan hệ với `BookingStatus`:

- Booking chỉ được auto assign khi booking ở trạng thái đủ điều kiện, ví dụ `CONFIRMED` hoặc trạng thái tương đương.
- Assignment `ACCEPTED` có thể làm booking chuyển sang trạng thái "assigned" nếu sau này thêm booking status phù hợp.
- Nếu không thêm booking status mới, booking vẫn giữ `CONFIRMED` và UI suy ra "đã phân công" từ assignment accepted.
- Assignment rejected không nên tự động cancel booking.
- Booking cancelled phải cancel mọi assignment active.
- Booking completed/no-show/cancelled không được tạo assignment mới.

## 11. Safety and business constraints

- Không auto assign nếu booking cancelled, completed hoặc no-show.
- Không auto assign nếu slot invalid, booking thiếu ngày/giờ lấy mẫu hoặc booking không còn nằm trong capacity hợp lệ.
- Không assign inactive staff.
- Không assign staff không có role `SAMPLE_COLLECTOR`.
- Không assign collector ngoài vùng làm việc đã active.
- Không assign collector ngoài lịch/khung giờ làm việc đã active.
- Không assign collector đang quá tải hoặc có active assignment conflict.
- Collector reject bắt buộc có reason.
- Admin manual override bắt buộc ghi audit/history.
- Reassign phải đánh dấu assignment cũ là terminal (`SUPERSEDED`, `CANCELLED` hoặc trạng thái phù hợp).
- Không ảnh hưởng urgent red flags flow; urgent flow vẫn phải override booking/package state theo logic hiện tại.
- Không đưa payment vào workflow này.

## 12. Implementation phases

- 5H-1 Schema + migration for assignment/collector availability.
- 5H-2 Collector availability/working area API + UI.
- 5H-3 Candidate matching service + smoke.
- 5H-4 Auto assignment on booking creation.
- 5H-5 Collector accept/reject workflow.
- 5H-6 Admin rejection review + manual fallback.
- 5H-7 UI polish + E2E role flow smoke.
- 5H-8 Handoff/metrics/decision log update.

## 13. Minimal smoke strategy

### 5H-1

- Verify Prisma schema/migration creates assignment and collector availability tables.
- Verify enum/status values exist.
- Verify one booking can have assignment rows while preserving existing booking data.

### 5H-2

- Collector can create, list and update working areas.
- Collector can create, list and update working schedules.
- Admin can view or manage these records if admin-managed endpoints are implemented.
- Non-collector cannot access collector self-management endpoints.

### 5H-3

- Matching returns active `SAMPLE_COLLECTOR` in correct area and schedule.
- Matching excludes inactive staff.
- Matching excludes non-collector staff.
- Matching excludes overloaded/conflicting collector.
- Matching returns no candidate with clear reason when none match.

### 5H-4

- Creating eligible booking triggers auto assignment.
- Booking outside collector area does not create assignment.
- Booking outside collector schedule does not create assignment.
- Existing slot/capacity behavior remains unchanged.

### 5H-5

- Collector sees pending assignment.
- Collector accepts assignment and status becomes `ACCEPTED`.
- Collector rejects assignment with reason and status becomes `REJECTED_PENDING_ADMIN_REVIEW`.
- Reject without reason fails validation.
- Other collector cannot accept/reject someone else's assignment.

### 5H-6

- Admin sees rejection pending review.
- Admin approves rejection and system allows reassign/manual assignment.
- Admin rejects rejection and audit history records action.
- Manual assignment supersedes previous active assignment.

### 5H-7

- End-to-end smoke: user booking -> auto assignment -> collector accept -> booking remains operational.
- End-to-end smoke: user booking -> auto assignment -> collector reject -> admin approve -> reassignment/manual assignment.
- UI smoke for admin and collector role access.

### 5H-8

- Handoff updated after implementation.
- Metrics/benchmarks updated with smoke results.
- Decision log records final design decisions and deviations from this spec.

## 14. Thesis wording note

Trước 5H, HomeLab chưa có auto assignment thật. Hệ thống có các nền tảng liên quan như booking runtime, slot/capacity, admin staff management, workload rules và collector dashboard, nhưng chưa có workflow tự động tìm collector, tạo assignment, collector accept/reject và admin review rejection.

Chỉ sau khi triển khai đầy đủ các phase 5H cần thiết mới nên mô tả trong khóa luận là hệ thống có "auto collector assignment" hoặc "tự động phân công nhân viên lấy mẫu".

Nếu chưa hoàn thành toàn bộ 5H, khóa luận nên dùng wording thận trọng hơn:

- "hỗ trợ phân công có kiểm soát"
- "hỗ trợ quản trị phân công nhân viên lấy mẫu"
- "định hướng mở rộng tự động phân công collector"
- "nền tảng dữ liệu và giao diện cho phân công collector"

Không nên mô tả là auto assignment hoàn chỉnh nếu chưa có matching service, assignment lifecycle, collector accept/reject và admin fallback.

## 15. Current decision

- 5H-0 không sửa backend runtime.
- 5H-0 không sửa frontend.
- 5H-0 không sửa Prisma schema.
- 5H-0 không tạo migration.
- 5H-0 không tạo smoke script.
- 5H-0 không sửa RAG/retriever/recommendation.
- 5H-0 không sửa payment.
- 5H-0 không promote retriever.
- 5H-0 không cập nhật handoff/metrics/decision docs.
- 5H-0 chỉ tạo spec tại `docs/auto_collector_assignment_spec_5h.md`.
- Bước code tiếp theo sau 5H-0 là 5H-1 schema/migration cho assignment và collector availability.
