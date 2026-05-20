const bookingRuntime = require("../src/services/booking-runtime/booking.service");
const availabilitySlotService = require("../src/services/booking-runtime/availability-slot.service");
const prisma = require("../src/services/booking-runtime/prisma-client");

const API_BASE_URL = process.env.HOMELAB_API_BASE_URL || "http://localhost:5000";
const CHAT_URL = process.env.HOMELAB_CHAT_API_URL || `${API_BASE_URL}/api/chat`;

function uniqueId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makePhone(prefix = "09") {
    const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`
        .replace(/\D/g, "")
        .slice(-8)
        .padStart(8, "0");

    return `${prefix}${suffix}`;
}

function tomorrowIsoDate(offsetDays = 1) {
    const date = new Date();
    date.setDate(date.getDate() + offsetDays);

    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0")
    ].join("-");
}

function randomFutureOffset(baseDays = 60) {
    return baseDays + Math.floor(Math.random() * 120);
}

function hasBookingCode(text) {
    return /\bHLB-\d{8}-[A-Z0-9]{4,}\b/i.test(String(text || ""));
}

async function parseJsonResponse(response) {
    try {
        return await response.json();
    } catch (error) {
        throw new Error(`API did not return JSON: ${response.status}`);
    }
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
    const payload = await parseJsonResponse(response);

    return { response, payload };
}

async function postChat(message, sessionId) {
    const response = await fetch(CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, sessionId }),
        signal: AbortSignal.timeout(20000)
    });
    const payload = await parseJsonResponse(response);

    return { response, payload };
}

function userHeaders(state) {
    return {
        "x-demo-role": "USER",
        "x-demo-user-id": "smoke_role_user_5c5",
        "x-demo-phone": state.userPhone
    };
}

function adminHeaders() {
    return {
        "x-demo-role": "ADMIN",
        "x-demo-user-id": "smoke_role_admin_5c5"
    };
}

function collectorHeaders(state, phone = state.collectorPhone) {
    return {
        "x-demo-role": "COLLECTOR",
        "x-demo-user-id": "smoke_role_collector_5c5",
        "x-demo-phone": phone
    };
}

async function getBookingRecord(bookingCode) {
    return prisma.booking.findUnique({
        where: { bookingCode },
        include: {
            patient: true,
            testCatalogItem: true,
            assignedStaff: true,
            statusHistory: {
                orderBy: { createdAt: "asc" }
            }
        }
    });
}

async function prepareSlot(date, timeStart, capacity = 5) {
    return availabilitySlotService.createAvailabilitySlot({
        date,
        timeStart,
        timeEnd: "09:45",
        capacity,
        area: "default"
    });
}

async function countConfirmedBySession(sessionId) {
    return prisma.booking.count({
        where: {
            createdFromSessionId: sessionId,
            status: "CONFIRMED"
        }
    });
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function assertControlledNotFound(response, payload, label) {
    assert(response.status === 404, `${label} returned ${response.status}, expected 404`);
    assert(payload.success === false, `${label} was not controlled JSON`);
    assert(payload.code === "BOOKING_NOT_FOUND" || payload.message, `${label} missing code/message`);
}

function assertHistoryHas(bookingOrPayload, expectedStatuses) {
    const history = bookingOrPayload?.statusHistory || [];
    const statuses = history.map((item) => item.toStatus);

    for (const status of expectedStatuses) {
        assert(statuses.includes(status), `history missing ${status}`);
    }
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
        userPhone: makePhone("09"),
        wrongUserPhone: makePhone("07"),
        collectorPhone: makePhone("08"),
        wrongCollectorPhone: makePhone("06"),
        sampleDate: tomorrowIsoDate(randomFutureOffset()),
        sampleTimeStart: "08:45",
        bookingCode: null,
        urgentSession: uniqueId("smoke_role_urgent_5c5")
    };

    const cases = [
        [
            "create_or_prepare_user_booking",
            async () => {
                await prepareSlot(state.sampleDate, state.sampleTimeStart);

                const booking = await bookingRuntime.createConfirmedBooking(
                    {
                        patientName: "Smoke Role User",
                        phone: state.userPhone,
                        testTypeText: "Cong thuc mau CBC",
                        sampleDate: state.sampleDate,
                        sampleTimeStart: state.sampleTimeStart,
                        address: "12 Nguyen Trai, Smoke Role Based Operations"
                    },
                    {
                        sessionId: uniqueId("smoke_role_booking_5c5"),
                        createdSource: "CHAT",
                        reason: "smoke_role_based_booking_operations_5c5"
                    }
                );

                state.bookingCode = booking.bookingCode;

                assert(/^HLB-\d{8}-[A-Z0-9]{4,}$/i.test(state.bookingCode), "bookingCode is invalid");
                assert(booking.status === "CONFIRMED", `booking status is ${booking.status}`);

                const record = await getBookingRecord(state.bookingCode);
                assert(record, "DB booking not found");
                assert(record.patientName === "Smoke Role User", "patientName mismatch");
                assert(record.phone === state.userPhone, "phone mismatch");
                assertHistoryHas(record, ["CONFIRMED"]);
            }
        ],
        [
            "user_can_see_own_booking",
            async () => {
                const { response, payload } = await request(
                    `/api/user/bookings?phone=${encodeURIComponent(state.userPhone)}`,
                    { headers: userHeaders(state) }
                );

                assert(response.status === 200 && payload.success, "user list failed");
                assert(Array.isArray(payload.data?.bookings), "user list shape invalid");
                assert(
                    payload.data.bookings.some((booking) => booking.bookingCode === state.bookingCode),
                    "user list does not contain booking"
                );
            }
        ],
        [
            "user_wrong_phone_cannot_see_detail",
            async () => {
                const { response, payload } = await request(
                    `/api/user/bookings/${state.bookingCode}?phone=${encodeURIComponent(state.wrongUserPhone)}`,
                    {
                        headers: {
                            ...userHeaders(state),
                            "x-demo-phone": state.wrongUserPhone
                        }
                    }
                );

                assertControlledNotFound(response, payload, "wrong user phone detail");
            }
        ],
        [
            "admin_can_see_booking",
            async () => {
                const { response, payload } = await request(
                    `/api/admin/bookings?bookingCode=${state.bookingCode}`,
                    { headers: adminHeaders() }
                );

                assert(response.status === 200 && payload.success, "admin list failed");
                assert(Array.isArray(payload.data?.bookings), "admin list shape invalid");
                assert(
                    payload.data.bookings.some((booking) => booking.bookingCode === state.bookingCode),
                    "admin list does not contain booking"
                );
            }
        ],
        [
            "admin_assigns_collector",
            async () => {
                const { response, payload } = await request(
                    `/api/admin/bookings/${state.bookingCode}/assign`,
                    {
                        method: "PATCH",
                        headers: adminHeaders(),
                        body: JSON.stringify({
                            staffName: "Smoke Role Collector",
                            staffPhone: state.collectorPhone,
                            role: "SAMPLE_COLLECTOR"
                        })
                    }
                );

                assert(response.status === 200 && payload.success, "admin assign failed");
                assert(payload.data?.assignedStaff, "assignedStaff missing");
                assert(payload.data.assignedStaff.fullName === "Smoke Role Collector", "collector name mismatch");
                assert(payload.data.assignedStaff.phone === state.collectorPhone, "collector phone mismatch");
                assert(payload.data.status === "ASSIGNED", `assign status is ${payload.data?.status}`);

                const record = await getBookingRecord(state.bookingCode);
                assert(record.assignedStaff?.phone === state.collectorPhone, "DB assigned collector mismatch");
                assertHistoryHas(record, ["ASSIGNED"]);
            }
        ],
        [
            "collector_can_see_assigned_booking",
            async () => {
                const listResult = await request(
                    `/api/collector/bookings?phone=${encodeURIComponent(state.collectorPhone)}`,
                    { headers: collectorHeaders(state) }
                );

                assert(listResult.response.status === 200 && listResult.payload.success, "collector list failed");
                assert(Array.isArray(listResult.payload.data?.bookings), "collector list shape invalid");
                assert(
                    listResult.payload.data.bookings.some((booking) => booking.bookingCode === state.bookingCode),
                    "collector list does not contain booking"
                );

                const detailResult = await request(
                    `/api/collector/bookings/${state.bookingCode}?phone=${encodeURIComponent(state.collectorPhone)}`,
                    { headers: collectorHeaders(state) }
                );

                assert(detailResult.response.status === 200 && detailResult.payload.success, "collector detail failed");
                assert(detailResult.payload.data?.bookingCode === state.bookingCode, "collector detail bookingCode mismatch");
            }
        ],
        [
            "collector_wrong_phone_cannot_see_booking",
            async () => {
                const { response, payload } = await request(
                    `/api/collector/bookings/${state.bookingCode}?phone=${encodeURIComponent(state.wrongCollectorPhone)}`,
                    { headers: collectorHeaders(state, state.wrongCollectorPhone) }
                );

                assertControlledNotFound(response, payload, "wrong collector detail");
            }
        ],
        [
            "collector_marks_sample_collected",
            async () => {
                const { response, payload } = await request(
                    `/api/collector/bookings/${state.bookingCode}/sample-collected?phone=${encodeURIComponent(state.collectorPhone)}`,
                    {
                        method: "PATCH",
                        headers: collectorHeaders(state),
                        body: JSON.stringify({
                            note: "Smoke role-based sample collected"
                        })
                    }
                );

                assert(response.status === 200 && payload.success, "collector sample-collected failed");
                assert(payload.data?.status === "SAMPLE_COLLECTED", `status is ${payload.data?.status}`);

                const record = await getBookingRecord(state.bookingCode);
                assert(record.status === "SAMPLE_COLLECTED", `DB status is ${record.status}`);
                assertHistoryHas(record, ["SAMPLE_COLLECTED"]);
            }
        ],
        [
            "admin_sees_sample_collected",
            async () => {
                const { response, payload } = await request(
                    `/api/admin/bookings/${state.bookingCode}`,
                    { headers: adminHeaders() }
                );

                assert(response.status === 200 && payload.success, "admin detail failed");
                assert(payload.data?.status === "SAMPLE_COLLECTED", `admin sees ${payload.data?.status}`);
            }
        ],
        [
            "admin_progresses_to_in_lab_processing",
            async () => {
                const { response, payload } = await request(
                    `/api/admin/bookings/${state.bookingCode}/status`,
                    {
                        method: "PATCH",
                        headers: adminHeaders(),
                        body: JSON.stringify({
                            status: "IN_LAB_PROCESSING",
                            reason: "Smoke in lab processing"
                        })
                    }
                );

                assert(response.status === 200 && payload.success, "admin IN_LAB_PROCESSING failed");
                assert(payload.data?.status === "IN_LAB_PROCESSING", `status is ${payload.data?.status}`);
            }
        ],
        [
            "admin_progresses_to_result_ready",
            async () => {
                const { response, payload } = await request(
                    `/api/admin/bookings/${state.bookingCode}/status`,
                    {
                        method: "PATCH",
                        headers: adminHeaders(),
                        body: JSON.stringify({
                            status: "RESULT_READY",
                            reason: "Smoke result ready"
                        })
                    }
                );

                assert(response.status === 200 && payload.success, "admin RESULT_READY failed");
                assert(payload.data?.status === "RESULT_READY", `status is ${payload.data?.status}`);
            }
        ],
        [
            "admin_completes_booking",
            async () => {
                const { response, payload } = await request(
                    `/api/admin/bookings/${state.bookingCode}/status`,
                    {
                        method: "PATCH",
                        headers: adminHeaders(),
                        body: JSON.stringify({
                            status: "COMPLETED",
                            reason: "Smoke completed"
                        })
                    }
                );

                assert(response.status === 200 && payload.success, "admin COMPLETED failed");
                assert(payload.data?.status === "COMPLETED", `status is ${payload.data?.status}`);

                const record = await getBookingRecord(state.bookingCode);
                assert(record.status === "COMPLETED", `DB status is ${record.status}`);
                assert(Boolean(record.completedAt || payload.data?.completedAt), "completedAt missing");
            }
        ],
        [
            "user_sees_completed_status",
            async () => {
                const { response, payload } = await request(
                    `/api/user/bookings/${state.bookingCode}?phone=${encodeURIComponent(state.userPhone)}`,
                    { headers: userHeaders(state) }
                );

                assert(response.status === 200 && payload.success, "user completed detail failed");
                assert(payload.data?.status === "COMPLETED", `user sees ${payload.data?.status}`);
                assertHistoryHas(payload.data, [
                    "CONFIRMED",
                    "ASSIGNED",
                    "SAMPLE_COLLECTED",
                    "IN_LAB_PROCESSING",
                    "RESULT_READY",
                    "COMPLETED"
                ]);
            }
        ],
        [
            "user_cannot_cancel_completed_booking",
            async () => {
                const { response, payload } = await request(
                    `/api/user/bookings/${state.bookingCode}/cancel?phone=${encodeURIComponent(state.userPhone)}`,
                    {
                        method: "PATCH",
                        headers: userHeaders(state),
                        body: JSON.stringify({
                            reason: "should reject completed booking"
                        })
                    }
                );

                assert(response.status >= 400, "completed cancel unexpectedly succeeded");
                assert(payload.success === false, "completed cancel response was not controlled");
                assert(
                    payload.code === "BOOKING_STATUS_TRANSITION_REJECTED" || payload.message,
                    "completed cancel missing code/message"
                );

                const record = await getBookingRecord(state.bookingCode);
                assert(record.status === "COMPLETED", `DB status changed to ${record.status}`);
            }
        ],
        [
            "urgent_booking_still_does_not_create",
            async () => {
                const before = await countConfirmedBySession(state.urgentSession);
                const { response, payload } = await postChat(
                    "Tôi muốn đặt lịch xét nghiệm vì đau ngực khó thở vã mồ hôi",
                    state.urgentSession
                );
                const after = await countConfirmedBySession(state.urgentSession);
                const data = payload.data || {};
                const reply = data.reply || payload.reply || "";

                assert(response.status === 200 && payload.success, "urgent chat request failed");
                assert(!hasBookingCode(reply), "urgent reply unexpectedly has bookingCode");
                assert(data.flow !== "booking", "urgent query routed to booking flow");
                assert(data.meta?.intentGroup !== "booking", "urgent query intentGroup is booking");
                assert(after === before, "urgent session created a confirmed booking");
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
