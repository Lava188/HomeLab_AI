# HomeLab Booking Runtime Product Spec 5B

## 1. Purpose

5B turns the current chatbot booking draft/prototype into a persistent booking runtime for real lab operations. The goal is to support booking creation, booking codes, status lifecycle, reschedule/cancel, audit history, and later staff/admin operations.

This is a booking and lab operations module. It must not change HomeLab's RAG/retriever behavior, retriever v1.4 promotion status, recommendation runtime defaults, or medical answer policy.

## 2. Scope

### In scope

- User booking through the chatbot.
- Booking draft and slot collection across a conversation.
- Confirmation summary before creating a booking.
- Persistent booking record in the database.
- Human-readable booking code.
- Reschedule/cancel by booking code.
- Booking status lifecycle.
- Audit/status history.
- Staff/admin APIs in later phases.
- Safety gate: `urgent_health` must override booking.

### Out of scope for initial 5B

- Payment.
- SMS/email notification.
- Full authentication/RBAC.
- Real payment gateway.
- Real lab result upload.
- Production deployment.
- Clinical diagnosis.

## 3. Roles

### Patient/User

The person chatting with HomeLab to request a lab test booking. They provide test/package intent, sample date/time, patient name, phone number, address, and optional notes. They can later reschedule or cancel using a booking code.

### System/Chatbot

Collects booking slots, asks follow-up questions, applies safety and routing boundaries, shows a confirmation summary, creates the booking only after explicit confirmation, and returns the booking code. It must not infer unsafe medical conclusions or create bookings during urgent or medical-review-boundary flows.

### Staff/Sample Collector

Handles operational fulfillment after a booking is confirmed or assigned. In later phases, staff can view assigned bookings, update collection status, mark no-show, and record operational notes.

### Lab/Admin

Manages booking operations, catalog items, assignments, status changes, and audit review. Admin/staff APIs and UI are later-phase capabilities, not required for the first runtime slice.

## 4. Booking Lifecycle

### Proposed statuses

- `draft`: booking information is being collected and is not yet ready to confirm.
- `pending_confirmation`: required fields are present and the system has shown a confirmation summary.
- `confirmed`: user explicitly confirmed and the booking was persisted.
- `rescheduled`: booking date/time/address changed after confirmation.
- `assigned`: staff/sample collector assigned.
- `sample_collected`: sample collected from the patient.
- `in_lab_processing`: sample is being processed by the lab.
- `result_ready`: result is available in the lab system.
- `completed`: booking lifecycle is finished.
- `cancelled`: booking cancelled by user, staff, or system policy.
- `no_show`: collection could not happen because the patient was unavailable.

### Initial implementation subset

- `draft`
- `pending_confirmation`
- `confirmed`
- `rescheduled`
- `cancelled`
- `completed`

## 5. Required Booking Fields

### Required to create a confirmed booking

- `testType` or package/test catalog item.
- Sample date.
- Sample time.
- Patient name.
- Phone.
- Address.

### Optional fields

- Note.
- Gender/date of birth.
- Preferred collection type.
- Internal note.

## 6. Chatbot Booking Flow

### Flow

A. User asks to book a lab test.

B. System extracts available slots from the user message, such as test/package, date, time, name, phone, and address.

C. If required fields are missing, the system asks a targeted follow-up question.

D. If enough fields are present, the system shows a confirmation summary.

E. User explicitly confirms.

F. System creates a booking in the database and returns `bookingCode`.

G. User can reschedule/cancel using `bookingCode`.

### Vietnamese examples

User:

> Mình muốn đặt lịch xét nghiệm máu tổng quát sáng mai tại nhà.

System:

> Mình có thể hỗ trợ đặt lịch. Bạn cho mình xin họ tên, số điện thoại, địa chỉ lấy mẫu và khung giờ mong muốn sáng mai nhé.

User:

> Nguyễn Văn An, 0901234567, 12 Nguyễn Trãi, Quận 1, khoảng 8h.

System:

> Mình xác nhận thông tin đặt lịch:
> - Xét nghiệm: Máu tổng quát
> - Ngày lấy mẫu: ngày mai
> - Giờ lấy mẫu: 08:00
> - Họ tên: Nguyễn Văn An
> - Số điện thoại: 0901234567
> - Địa chỉ: 12 Nguyễn Trãi, Quận 1
>
> Bạn xác nhận đặt lịch này chứ?

User:

> Xác nhận.

System:

> Đã tạo lịch hẹn. Mã đặt lịch của bạn là `HLB-20260514-0001`. Bạn có thể dùng mã này để đổi lịch hoặc hủy lịch.

Reschedule example:

> Tôi muốn đổi lịch `HLB-20260514-0001` sang chiều thứ Sáu.

Cancel example:

> Hủy giúp tôi lịch `HLB-20260514-0001`.

## 7. Safety and Boundary Rules

- `urgent_health` overrides booking. If the user describes urgent danger signs, HomeLab must provide urgent safety guidance and must not create a booking.
- `medical_review_boundary` overrides booking when the user asks about dangerous, abnormal, or high-risk results that need clinician review.
- Generic requests such as “lấy mẫu máu tại nhà” must not infer a specific `testType`; the chatbot must ask which test/package the user wants.
- Booking creation only happens after explicit user confirmation.
- The chatbot must not present booking as a substitute for emergency care or clinical diagnosis.
- Recommendation/package suggestions must remain controlled by existing recommendation policy and must not be promoted by this module.

## 8. Database Model Draft

Do not implement schema yet. This is a product-level draft for later database design.

### `patients`

- `id`
- `full_name`
- `phone`
- `date_of_birth`
- `gender`
- `default_address`
- `created_at`
- `updated_at`

### `test_catalog_items`

- `id`
- `code`
- `name`
- `description`
- `category`
- `sample_type`
- `active`
- `created_at`
- `updated_at`

### `bookings`

- `id`
- `booking_code`
- `patient_id`
- `test_catalog_item_id`
- `test_type_text`
- `sample_date`
- `sample_time`
- `address`
- `phone`
- `status`
- `note`
- `internal_note`
- `assigned_staff_id`
- `created_from_session_id`
- `created_at`
- `updated_at`
- `cancelled_at`
- `completed_at`

### `booking_status_history`

- `id`
- `booking_id`
- `from_status`
- `to_status`
- `reason`
- `changed_by_type`
- `changed_by_id`
- `metadata`
- `created_at`

### `booking_drafts`

- `id`
- `session_id`
- `patient_id`
- `slots_json`
- `missing_fields`
- `status`
- `expires_at`
- `created_at`
- `updated_at`

### `availability_slots`

- `id`
- `date`
- `start_time`
- `end_time`
- `capacity`
- `booked_count`
- `area`
- `active`
- `created_at`
- `updated_at`

### `staff_users` or `staff_profiles`

- `id`
- `full_name`
- `phone`
- `role`
- `service_area`
- `active`
- `created_at`
- `updated_at`

## 9. API Plan

### Chatbot entry point

- `POST /api/chat`
  - Remains the main entry point for chatbot booking.
  - Handles booking draft slot collection, confirmation prompt, explicit confirmation, and booking creation.
  - Must preserve routing gates for urgent and medical-review-boundary cases.

### Booking APIs

- `GET /api/bookings`
  - List bookings. Later phase, staff/admin oriented.

- `GET /api/bookings/:bookingCode`
  - Retrieve booking details by booking code.

- `PATCH /api/bookings/:bookingCode/reschedule`
  - Change date/time and possibly address.

- `PATCH /api/bookings/:bookingCode/cancel`
  - Cancel a booking with reason.

- `PATCH /api/bookings/:bookingCode/status`
  - Update operational status. Later phase, staff/admin oriented.

- `PATCH /api/bookings/:bookingCode/assign`
  - Assign staff/sample collector. Later phase, staff/admin oriented.

## 10. Implementation Phases

- `5B-0 Product spec`: create this product and technical design document.
- `5B-1 Database schema + seed catalog`: add persistent models and minimal test catalog seed data.
- `5B-2 Booking repository/service`: implement booking code generation, create/read/update, status history, reschedule, cancel.
- `5B-3 Chat booking integration with confirmation`: connect booking drafts and explicit confirmation to DB booking creation.
- `5B-4 Reschedule/cancel DB integration`: make reschedule/cancel use persistent bookings by `bookingCode`.
- `5B-5 Staff/admin booking APIs`: add list/detail/status/assign endpoints for operations.
- `5B-6 Admin booking UI`: build staff/admin booking management surface.
- `5B-7 Smoke test and docs`: add lean smoke coverage and update implementation documentation.

## 11. Minimal Test Strategy

Keep testing focused during incremental 5B work:

- Do not rerun all RAG tests after every booking change.
- Test booking draft collection and explicit confirmation.
- Test booking creation with required fields.
- Test reschedule by `bookingCode`.
- Test cancel by `bookingCode`.
- Test one urgent safety case to ensure `urgent_health` overrides booking and does not create a booking.
- At final milestone, run a broader regression covering chat routing, urgent safety, booking, and existing RAG answer behavior.

## 12. Current Decision

This booking module is a new product/business module for HomeLab lab operations. It should preserve HomeLab's safety-first routing and RAG-first medical-answer posture.

5B must not change retriever v1.4 promotion status. Retriever v1.4 remains controlled-only unless a separate release decision changes it.

5B must not change live recommendation promotion status. Live package recommendation should not become the default as part of booking runtime work.

The booking runtime should improve operational persistence and user booking workflows without overclaiming production readiness.
