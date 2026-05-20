# HomeLab Role-Based Booking Operations UI Spec 5C

## 1. Purpose

5C turns the current Admin Booking Dashboard into a role-based booking operations UI for three operational views: User/Patient, Admin, and Collector/Sample Collector.

The goal is to make booking operations easier to use after the 5B runtime work: users can track their own bookings, admins can manage all bookings and assignments, and collectors can focus on assigned sample collection work.

This milestone is UI and workflow oriented. It must not change RAG/retriever/recommendation/router/answer/policy logic, must not promote retriever v1.4/default runtime, must not enable live package recommendation by default, and must not introduce payment.

## 2. Roles and Responsibilities

### User/Patient

- View their own booking schedule.
- Track booking status and status history.
- Open booking details by booking code.
- Request cancellation or reschedule when the current booking status allows it.
- Return to the chatbot to create a new booking.
- See clear empty, loading, and error states.

### Admin

- View all bookings across the system.
- Search and filter bookings by status, booking code, patient, phone, date, test, and assigned collector.
- Assign or reassign a collector.
- Update operational booking status.
- Add internal notes.
- View booking detail and status history.
- Keep the existing `/admin/bookings` dashboard working while improving the UI.

### Collector/Sample Collector

- View bookings assigned to them.
- Focus on today's assigned collection work, with upcoming and completed views.
- See patient phone, address, requested time, test/package, and collection notes.
- Mark a booking as `SAMPLE_COLLECTED` when collection is complete.
- Add collector-facing collection notes.
- Avoid access to unrelated admin-only actions such as assigning collectors, broad status changes, or viewing all system bookings.

## 3. Route Plan

Do not use one shared `/login` route. Each role has a dedicated login and dashboard entry point.

### User/Patient

- `/user/login`
- `/user/dashboard`
- `/user/bookings`
- `/user/bookings/:bookingCode`

### Admin

- `/admin/login`
- `/admin/bookings`

### Collector/Sample Collector

- `/collector/login`
- `/collector/dashboard`
- `/collector/bookings/:bookingCode`

## 4. Demo Auth Plan

5C does not implement production authentication or production RBAC. Use demo/internal auth only, with clear naming and comments so it is not mistaken for production security.

### Frontend demo auth

- Store demo role/session state in `localStorage`.
- Suggested keys:
  - `homelab_demo_role`
  - `homelab_demo_token`
  - `homelab_demo_user_id`
  - `homelab_demo_phone`
- Add frontend route guards that check the expected role before rendering protected role pages.
- Redirect role mismatch to that role's login page, not a generic `/login`.

### API client headers

The frontend API client can send demo headers:

- `x-demo-role`
- `x-demo-user-id`
- `x-demo-phone` when user booking lookup needs phone scoping.

### Security boundary

This is only a demo/internal auth mechanism for milestone workflow validation. It must not be described as production-ready authentication, authorization, or RBAC.

## 5. User/Patient UI Requirements

### Dashboard

- Summary cards:
  - upcoming bookings
  - active bookings
  - completed bookings
  - cancelled bookings
- Recent or next booking preview.
- CTA to return to the chatbot and create a new booking.

### Booking list

- List user bookings scoped by phone or demo user identity.
- Show booking code, test/package, appointment date/time, address summary, and status badge.
- Support empty state when no bookings exist.
- Support loading and error states.

### Booking detail

- Show booking code, patient name, phone, test/package, requested collection date/time, address, notes, and current status.
- Show status timeline from `BookingStatusHistory`.
- Show cancel/reschedule actions only when the current status allows those actions.
- Use clear disabled states or helper text when actions are no longer allowed.
- Provide a CTA back to chatbot for a new booking or follow-up booking.

## 6. Admin UI Requirements

### Layout

- Professional dashboard shell with header, sidebar and/or topbar where suitable.
- Keep `/admin/bookings` as the admin operations route.
- Preserve existing admin booking capabilities while polishing the interface.

### Summary

- Booking summary cards:
  - total bookings
  - confirmed/pending
  - assigned
  - sample collected
  - cancelled/no-show if available
- Cards should be operational, not decorative only.

### Booking table

- Professional table with readable density, sticky header if useful, clear status badges, and responsive behavior.
- Columns should include booking code, patient, phone, test/package, scheduled time, address area, status, collector, and updated time.
- Improve responsive table behavior for narrower screens by using compact columns, horizontal scroll, or a detail-first card layout.

### Filters and search

- Search by booking code, patient name, and phone.
- Filter by status, date range, test/package, assigned collector, and unassigned bookings.
- Keep filter state understandable and easy to reset.

### Detail panel/modal

- Show full booking detail without leaving the table context.
- Show patient information, address, test/package, appointment window, notes, current status, assigned collector, and status history.
- Include status history timeline.

### Operations

- Assign or reassign collector.
- Update status through allowed operational transitions.
- Add or edit internal note.
- Avoid payment controls or payment state.

## 7. Collector UI Requirements

### Dashboard

- Show today's assigned bookings first.
- Include counts for today, upcoming, and completed/sample collected.
- Use booking cards or a compact table optimized for field operations.

### Assigned bookings

- Show booking code, patient phone, address, requested time, test/package, current status, and collection note.
- Provide filters:
  - today
  - upcoming
  - completed
- Open booking detail at `/collector/bookings/:bookingCode`.

### Collection actions

- Provide action: `Đã lấy mẫu`.
- On submit, update booking to `SAMPLE_COLLECTED`.
- Allow a collector note, for example access issue, patient unavailable detail, or sample handoff note.
- Do not expose unrelated admin actions such as assigning collectors, viewing all bookings, broad status management, or internal admin notes unless specifically required later.

## 8. Backend/API Gaps

The current 5B runtime already supports booking creation, booking codes, status history, reschedule/cancel through chatbot, Admin Booking API, and `/admin/bookings`.

5C may need the following demo/internal API additions:

- `POST /api/auth/user-login`
- `POST /api/auth/admin-login`
- `POST /api/auth/collector-login`
- `GET /api/user/bookings`
- `GET /api/user/bookings/:bookingCode`
- `GET /api/collector/bookings`
- `GET /api/collector/bookings/:bookingCode`
- `PATCH /api/collector/bookings/:bookingCode/sample-collected`

These endpoints should be treated as demo/internal auth and role-routing support, not production RBAC. Any server-side checks based on `x-demo-role`, `x-demo-user-id`, or `x-demo-phone` are milestone scaffolding only.

Prefer reusing existing booking models and status history. Do not change the booking database schema unless a later implementation step proves it is necessary.

## 9. Visual Design Direction

- Use a professional healthcare/lab operations dashboard style.
- Use a soft background with white or lightly tinted surfaces.
- Use status color badges for booking state.
- Use cards for summary metrics and individual repeated booking items.
- Keep spacing clear and readable.
- Use sidebar/topbar layout when it improves navigation by role.
- Avoid plain black-white only UI.
- Keep the interface simple and operational, not over-designed.
- Visual polish must support booking/lab workflows, not just decoration.

Suggested visual tone:

- calm healthcare palette with blue, teal, green, amber, and red status accents
- readable typography
- clear action hierarchy
- compact but comfortable tables
- responsive behavior for tablet and mobile review

## 10. Implementation Phases

### 5C-1 Demo auth + role routing/layout

- Add separate login routes for user, admin, and collector.
- Add demo auth localStorage handling.
- Add API client demo headers.
- Add role-based route guards.
- Add role-specific layout shells.

### 5C-2 User dashboard

- Build `/user/dashboard`, `/user/bookings`, and `/user/bookings/:bookingCode`.
- Add booking list scoped by demo phone/user identity.
- Add status timeline and cancel/reschedule entry points where allowed.
- Add CTA back to chatbot for new booking.

### 5C-3 Collector dashboard

- Build `/collector/dashboard` and `/collector/bookings/:bookingCode`.
- Add assigned booking list with today/upcoming/completed filters.
- Add `Đã lấy mẫu` action and collector note.
- Ensure collector pages do not expose admin-only operations.

### 5C-4 Admin dashboard polish

- Improve existing `/admin/bookings` UI.
- Add professional layout, summary cards, filters/search, responsive table behavior, detail panel/modal, collector assignment, status update, internal note, and history timeline.
- Preserve current Admin Booking API behavior.

### 5C-5 Role-based E2E smoke/manual checklist

- Verify each role login route.
- Verify route guard behavior for role mismatch.
- Verify user can view only their bookings.
- Verify admin can manage all bookings.
- Verify collector can view assigned bookings and mark sample collected.
- Verify `/api/chat` booking flow still works.
- Verify `/admin/bookings` still works.
- Verify no payment UI was introduced.

## 11. Constraints

- Do not modify RAG/retriever/recommendation/router/answer/policy logic.
- Do not promote retriever v1.4/default runtime.
- Do not enable live package recommendation by default.
- Do not touch payment.
- Do not introduce payment UI.
- Do not change booking DB schema unless a later implementation step proves it is necessary.
- Do not modify Prisma migrations for this spec-only milestone.
- Do not break `/api/chat`.
- Do not break the existing `/admin/bookings` route.
- Do not modify `.env`.
- Do not modify backend, frontend, database schema, migrations, or runtime logic while creating this spec.
