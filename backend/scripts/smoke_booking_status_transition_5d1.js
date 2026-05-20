const bookingRuntime = require("../src/services/booking-runtime/booking.service");
const availabilitySlotService = require("../src/services/booking-runtime/availability-slot.service");
const prisma = require("../src/services/booking-runtime/prisma-client");

const API_BASE_URL = process.env.HOMELAB_API_BASE_URL || "http://localhost:5000";

function makePhone(prefix = "09") {
    const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`
        .replace(/\D/g, "")
        .slice(-8)
        .padStart(8, "0");

    return `${prefix}${suffix}`;
}

function isoDate(offsetDays = 1) {
    const date = new Date();
    date.setDate(date.getDate() + offsetDays);

    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0")
    ].join("-");
}

function adminHeaders() {
    return {
        "Content-Type": "application/json",
        "x-demo-role": "ADMIN",
        "x-demo-user-id": "smoke_status_5d1_admin"
    };
}

function userHeaders(phone) {
    return {
        "Content-Type": "application/json",
        "x-demo-role": "USER",
        "x-demo-user-id": "smoke_status_5d1_user",
        "x-demo-phone": phone
    };
}

function collectorHeaders(phone) {
    return {
        "Content-Type": "application/json",
        "x-demo-role": "COLLECTOR",
        "x-demo-user-id": "smoke_status_5d1_collector",
        "x-demo-phone": phone
    };
}

async function request(path, options = {}) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {})
        },
        signal: AbortSignal.timeout(20000)
    });
    const payload = await response.json();

    return { response, payload };
}

async function createBooking({
    patientName = "Smoke Status Transition",
    phone = makePhone("09"),
    offsetDays = 1
} = {}) {
    await availabilitySlotService.createAvailabilitySlot({
        date: isoDate(offsetDays),
        timeStart: "08:30",
        timeEnd: "09:30",
        capacity: 20,
        area: "default"
    });

    return bookingRuntime.createConfirmedBooking(
        {
            patientName,
            phone,
            testTypeText: "Cong thuc mau",
            sampleDate: isoDate(offsetDays),
            sampleTimeStart: "08:30",
            address: "12 Nguyen Trai, Smoke Status Transition"
        },
        {
            sessionId: `smoke_status_5d1_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            createdSource: "CHAT",
            reason: "smoke_booking_status_transition_5d1"
        }
    );
}

async function getBookingRecord(bookingCode) {
    return prisma.booking.findUnique({
        where: { bookingCode },
        include: {
            assignedStaff: true,
            statusHistory: {
                orderBy: { createdAt: "asc" }
            }
        }
    });
}

async function adminUpdateStatus(bookingCode, status, reason) {
    return request(`/api/admin/bookings/${bookingCode}/status`, {
        method: "PATCH",
        headers: adminHeaders(),
        body: JSON.stringify({ status, reason })
    });
}

async function adminAssign(bookingCode, collectorPhone = makePhone("08")) {
    return request(`/api/admin/bookings/${bookingCode}/assign`, {
        method: "PATCH",
        headers: adminHeaders(),
        body: JSON.stringify({
            staffName: "Smoke Status Collector",
            staffPhone: collectorPhone,
            role: "SAMPLE_COLLECTOR"
        })
    });
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function assertTransitionRejected(response, payload, label) {
    assert(response.status === 409, `${label} returned ${response.status}, expected 409`);
    assert(payload.success === false, `${label} was not controlled JSON`);
    assert(payload.code === "BOOKING_STATUS_TRANSITION_REJECTED", `${label} code mismatch`);
    assert(String(payload.message || "").includes("Không thể chuyển trạng thái"), `${label} message mismatch`);
}

function assertHistoryContains(record, fromStatus, toStatus) {
    assert(
        record.statusHistory.some(
            (item) => item.fromStatus === fromStatus && item.toStatus === toStatus
        ),
        `missing history ${fromStatus || "START"} -> ${toStatus}`
    );
}

async function runCase(id, fn, state) {
    try {
        await fn(state);
        console.log(`PASS ${id}`);
        return { id, passed: true };
    } catch (error) {
        console.error(`FAIL ${id}: ${error.message}`);
        return { id, passed: false, error };
    }
}

async function main() {
    const state = {
        chainBookingCode: null,
        chainCollectorPhone: makePhone("08"),
        userCancelPhone: makePhone("09"),
        confirmedCollectorPhone: makePhone("08")
    };

    const cases = [
        [
            "valid_confirmed_to_assigned",
            async () => {
                const booking = await createBooking();
                state.chainBookingCode = booking.bookingCode;

                const { response, payload } = await adminAssign(
                    state.chainBookingCode,
                    state.chainCollectorPhone
                );

                assert(response.status === 200 && payload.success, "assign failed");
                assert(payload.data?.status === "ASSIGNED", `status is ${payload.data?.status}`);

                const record = await getBookingRecord(state.chainBookingCode);
                assertHistoryContains(record, "CONFIRMED", "ASSIGNED");
            }
        ],
        [
            "valid_assigned_to_sample_collected",
            async () => {
                const { response, payload } = await request(
                    `/api/collector/bookings/${state.chainBookingCode}/sample-collected?phone=${encodeURIComponent(state.chainCollectorPhone)}`,
                    {
                        method: "PATCH",
                        headers: collectorHeaders(state.chainCollectorPhone),
                        body: JSON.stringify({ note: "smoke 5d1 sample collected" })
                    }
                );

                assert(response.status === 200 && payload.success, "sample-collected failed");
                assert(payload.data?.status === "SAMPLE_COLLECTED", `status is ${payload.data?.status}`);
            }
        ],
        [
            "valid_sample_collected_to_in_lab_processing",
            async () => {
                const { response, payload } = await adminUpdateStatus(
                    state.chainBookingCode,
                    "IN_LAB_PROCESSING",
                    "smoke in lab"
                );

                assert(response.status === 200 && payload.success, "IN_LAB_PROCESSING failed");
                assert(payload.data?.status === "IN_LAB_PROCESSING", `status is ${payload.data?.status}`);
            }
        ],
        [
            "valid_in_lab_processing_to_result_ready",
            async () => {
                const { response, payload } = await adminUpdateStatus(
                    state.chainBookingCode,
                    "RESULT_READY",
                    "smoke result ready"
                );

                assert(response.status === 200 && payload.success, "RESULT_READY failed");
                assert(payload.data?.status === "RESULT_READY", `status is ${payload.data?.status}`);
            }
        ],
        [
            "valid_result_ready_to_completed",
            async () => {
                const { response, payload } = await adminUpdateStatus(
                    state.chainBookingCode,
                    "COMPLETED",
                    "smoke completed"
                );

                assert(response.status === 200 && payload.success, "COMPLETED failed");
                assert(payload.data?.status === "COMPLETED", `status is ${payload.data?.status}`);
                assert(Boolean(payload.data?.completedAt), "completedAt missing");
            }
        ],
        [
            "invalid_completed_to_assigned_rejected",
            async () => {
                const { response, payload } = await adminUpdateStatus(
                    state.chainBookingCode,
                    "ASSIGNED",
                    "should reject completed to assigned"
                );

                assertTransitionRejected(response, payload, "COMPLETED -> ASSIGNED");
            }
        ],
        [
            "invalid_cancelled_to_sample_collected_rejected",
            async () => {
                const booking = await createBooking({ offsetDays: 2 });
                await adminUpdateStatus(booking.bookingCode, "CANCELLED", "prepare cancelled");

                const { response, payload } = await adminUpdateStatus(
                    booking.bookingCode,
                    "SAMPLE_COLLECTED",
                    "should reject cancelled to sample collected"
                );

                assertTransitionRejected(response, payload, "CANCELLED -> SAMPLE_COLLECTED");
            }
        ],
        [
            "invalid_result_ready_to_confirmed_rejected",
            async () => {
                const booking = await createBooking({ offsetDays: 3 });
                const collectorPhone = makePhone("08");

                await adminAssign(booking.bookingCode, collectorPhone);
                await request(
                    `/api/collector/bookings/${booking.bookingCode}/sample-collected?phone=${encodeURIComponent(collectorPhone)}`,
                    {
                        method: "PATCH",
                        headers: collectorHeaders(collectorPhone),
                        body: JSON.stringify({ note: "prepare result ready" })
                    }
                );
                await adminUpdateStatus(booking.bookingCode, "IN_LAB_PROCESSING", "prepare in lab");
                await adminUpdateStatus(booking.bookingCode, "RESULT_READY", "prepare result ready");

                const { response, payload } = await adminUpdateStatus(
                    booking.bookingCode,
                    "CONFIRMED",
                    "should reject result ready to confirmed"
                );

                assertTransitionRejected(response, payload, "RESULT_READY -> CONFIRMED");
            }
        ],
        [
            "user_cancel_confirmed_valid",
            async () => {
                const booking = await createBooking({
                    phone: state.userCancelPhone,
                    offsetDays: 4
                });

                const { response, payload } = await request(
                    `/api/user/bookings/${booking.bookingCode}/cancel?phone=${encodeURIComponent(state.userCancelPhone)}`,
                    {
                        method: "PATCH",
                        headers: userHeaders(state.userCancelPhone),
                        body: JSON.stringify({ reason: "smoke user cancel confirmed" })
                    }
                );

                assert(response.status === 200 && payload.success, "user cancel failed");
                assert(payload.data?.status === "CANCELLED", `status is ${payload.data?.status}`);
            }
        ],
        [
            "user_cancel_completed_rejected",
            async () => {
                const phone = makePhone("09");
                const booking = await createBooking({ phone, offsetDays: 5 });
                const collectorPhone = makePhone("08");

                await adminAssign(booking.bookingCode, collectorPhone);
                await request(
                    `/api/collector/bookings/${booking.bookingCode}/sample-collected?phone=${encodeURIComponent(collectorPhone)}`,
                    {
                        method: "PATCH",
                        headers: collectorHeaders(collectorPhone),
                        body: JSON.stringify({ note: "prepare completed" })
                    }
                );
                await adminUpdateStatus(booking.bookingCode, "IN_LAB_PROCESSING", "prepare in lab");
                await adminUpdateStatus(booking.bookingCode, "RESULT_READY", "prepare result ready");
                await adminUpdateStatus(booking.bookingCode, "COMPLETED", "prepare completed");

                const { response, payload } = await request(
                    `/api/user/bookings/${booking.bookingCode}/cancel?phone=${encodeURIComponent(phone)}`,
                    {
                        method: "PATCH",
                        headers: userHeaders(phone),
                        body: JSON.stringify({ reason: "should reject completed cancel" })
                    }
                );

                assertTransitionRejected(response, payload, "user cancel COMPLETED");
            }
        ],
        [
            "collector_sample_collected_only_assigned_or_valid_status",
            async () => {
                const booking = await createBooking({ offsetDays: 6 });
                const collectorPhone = state.confirmedCollectorPhone;

                await bookingRuntime.assignStaffToBooking(
                    booking.bookingCode,
                    {
                        staffName: "Smoke Confirmed Collector",
                        staffPhone: collectorPhone,
                        role: "SAMPLE_COLLECTOR"
                    },
                    {
                        role: "ADMIN",
                        userId: "smoke_status_5d1_admin",
                        reason: "prepare collector"
                    }
                );

                await bookingRuntime.updateBookingStatus(
                    booking.bookingCode,
                    "RESCHEDULED",
                    {
                        role: "ADMIN",
                        userId: "smoke_status_5d1_admin",
                        reason: "prepare rescheduled"
                    }
                ).catch(() => null);

                const fresh = await createBooking({ offsetDays: 7 });

                const { response, payload } = await request(
                    `/api/collector/bookings/${fresh.bookingCode}/sample-collected?phone=${encodeURIComponent(collectorPhone)}`,
                    {
                        method: "PATCH",
                        headers: collectorHeaders(collectorPhone),
                        body: JSON.stringify({ note: "should reject unassigned confirmed" })
                    }
                );

                assert(response.status === 404 || response.status === 409, `unexpected status ${response.status}`);
                assert(payload.success === false, "collector invalid response was not controlled");

                const assigned = await createBooking({ offsetDays: 8 });
                await adminAssign(assigned.bookingCode, collectorPhone);

                const valid = await request(
                    `/api/collector/bookings/${assigned.bookingCode}/sample-collected?phone=${encodeURIComponent(collectorPhone)}`,
                    {
                        method: "PATCH",
                        headers: collectorHeaders(collectorPhone),
                        body: JSON.stringify({ note: "assigned valid" })
                    }
                );

                assert(valid.response.status === 200 && valid.payload.success, "assigned collector sample-collected failed");
                assert(valid.payload.data?.status === "SAMPLE_COLLECTED", "assigned booking was not SAMPLE_COLLECTED");
            }
        ],
        [
            "status_history_created_for_each_valid_transition",
            async () => {
                const record = await getBookingRecord(state.chainBookingCode);

                assertHistoryContains(record, null, "CONFIRMED");
                assertHistoryContains(record, "CONFIRMED", "ASSIGNED");
                assertHistoryContains(record, "ASSIGNED", "SAMPLE_COLLECTED");
                assertHistoryContains(record, "SAMPLE_COLLECTED", "IN_LAB_PROCESSING");
                assertHistoryContains(record, "IN_LAB_PROCESSING", "RESULT_READY");
                assertHistoryContains(record, "RESULT_READY", "COMPLETED");
            }
        ]
    ];

    const results = [];

    for (const [id, fn] of cases) {
        results.push(await runCase(id, fn, state));
    }

    const passed = results.filter((result) => result.passed).length;
    const failed = results.length - passed;

    console.log(`TOTAL ${results.length} PASSED ${passed} FAILED ${failed}`);

    if (failed > 0) {
        process.exitCode = 1;
    }
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
