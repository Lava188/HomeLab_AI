const prisma = require("../src/services/booking-runtime/prisma-client");
const availabilitySlotService = require("../src/services/booking-runtime/availability-slot.service");

const API_BASE_URL = process.env.HOMELAB_API_BASE_URL || "http://localhost:5000";
const CHAT_URL = process.env.HOMELAB_CHAT_API_URL || `${API_BASE_URL}/api/chat`;
const ADMIN_HEADERS = {
    "Content-Type": "application/json",
    "x-demo-role": "ADMIN",
    "x-demo-user-id": "smoke_booking_e2e_5b6"
};

function uniqueSession(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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

async function prepareChatBookingSlot() {
    return availabilitySlotService.createAvailabilitySlot({
        date: isoDate(1),
        timeStart: "08:00",
        timeEnd: "09:00",
        capacity: 10,
        area: "default"
    });
}

function vi(escapedText) {
    return JSON.parse(`"${escapedText}"`);
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function includesAny(text, words) {
    const value = String(text || "").toLowerCase();

    return words.some((word) => value.includes(String(word).toLowerCase()));
}

function hasBookingCode(text) {
    return /\bHLB-\d{8}-[A-Z0-9]{4,}\b/i.test(String(text || ""));
}

function extractBookingCode(text) {
    const match = String(text || "").match(/\bHLB-\d{8}-[A-Z0-9]{4,}\b/i);

    return match ? match[0].toUpperCase() : null;
}

async function parseJsonResponse(response) {
    try {
        return await response.json();
    } catch (error) {
        throw new Error(`API did not return JSON: ${response.status}`);
    }
}

async function postChat(message, sessionId) {
    const response = await fetch(CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, sessionId }),
        signal: AbortSignal.timeout(20000)
    });
    const payload = await parseJsonResponse(response);

    if (!response.ok || !payload.success) {
        throw new Error(`Chat API failed: ${response.status} ${JSON.stringify(payload)}`);
    }

    return payload.data;
}

async function adminRequest(path, options = {}) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers: {
            ...ADMIN_HEADERS,
            ...(options.headers || {})
        },
        signal: AbortSignal.timeout(20000)
    });
    const payload = await parseJsonResponse(response);

    return { response, payload };
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

async function countConfirmedBySession(sessionId) {
    return prisma.booking.count({
        where: {
            createdFromSessionId: sessionId,
            status: "CONFIRMED"
        }
    });
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

const MISSING_INFO_QUERY = vi("\\u0110\\u1eb7t l\\u1ecbch l\\u1ea5y m\\u1eabu m\\u00e1u t\\u1ea1i nh\\u00e0");
const FULL_INFO_QUERY = vi("T\\u00f4i mu\\u1ed1n \\u0111\\u1eb7t l\\u1ecbch x\\u00e9t nghi\\u1ec7m c\\u00f4ng th\\u1ee9c m\\u00e1u ng\\u00e0y mai l\\u00fac 8h t\\u1ea1i 12 Nguy\\u1ec5n Tr\\u00e3i, t\\u00ean Nguy\\u1ec5n V\\u0103n A, s\\u1ed1 \\u0111i\\u1ec7n tho\\u1ea1i 0912345678");
const CONFIRM_QUERY = vi("X\\u00e1c nh\\u1eadn");
const URGENT_BOOKING_QUERY = vi("T\\u00f4i mu\\u1ed1n \\u0111\\u1eb7t l\\u1ecbch x\\u00e9t nghi\\u1ec7m v\\u00ec \\u0111au ng\\u1ef1c kh\\u00f3 th\\u1edf v\\u00e3 m\\u1ed3 h\\u00f4i");

async function main() {
    const state = {
        missingSession: uniqueSession("smoke_5b6_missing"),
        bookingSession: uniqueSession("smoke_5b6_booking"),
        urgentSession: uniqueSession("smoke_5b6_urgent"),
        bookingCode: null,
        internalNote: "Smoke E2E internal note 5B-6"
    };

    const cases = [
        [
            "chat_missing_info_no_confirmed_booking",
            async () => {
                const before = await countConfirmedBySession(state.missingSession);
                const data = await postChat(MISSING_INFO_QUERY, state.missingSession);
                const after = await countConfirmedBySession(state.missingSession);
                const reply = data.reply || "";

                assert(!hasBookingCode(reply), "missing-info reply unexpectedly has bookingCode");
                assert(
                    includesAny(reply, [
                        vi("lo\\u1ea1i x\\u00e9t nghi\\u1ec7m"),
                        vi("g\\u00f3i x\\u00e9t nghi\\u1ec7m"),
                        vi("cung c\\u1ea5p th\\u00eam")
                    ]),
                    "reply does not ask for missing booking information"
                );
                assert(after === before, "confirmed booking count changed for missing-info session");
            }
        ],
        [
            "chat_full_info_asks_confirmation",
            async () => {
                const before = await countConfirmedBySession(state.bookingSession);
                const data = await postChat(FULL_INFO_QUERY, state.bookingSession);
                const after = await countConfirmedBySession(state.bookingSession);
                const reply = data.reply || "";

                assert(!hasBookingCode(reply), "confirmation prompt unexpectedly has bookingCode");
                assert(
                    includesAny(reply, [vi("x\\u00e1c nh\\u1eadn"), vi("\\u0111\\u1ed3ng \\u00fd")]),
                    "reply does not ask for explicit confirmation"
                );

                for (const expected of [
                    vi("C\\u00f4ng th\\u1ee9c m\\u00e1u"),
                    "0912345678",
                    vi("Nguy\\u1ec5n V\\u0103n A"),
                    vi("12 Nguy\\u1ec5n Tr\\u00e3i")
                ]) {
                    assert(reply.includes(expected), `confirmation summary missing ${expected}`);
                }

                assert(after === before, "confirmed booking was created before confirmation");
            }
        ],
        [
            "chat_confirm_creates_booking",
            async () => {
                await prepareChatBookingSlot();

                const data = await postChat(CONFIRM_QUERY, state.bookingSession);
                const bookingCode = data.booking?.bookingCode || extractBookingCode(data.reply);

                assert(bookingCode, "confirmation did not return HLB bookingCode");

                const booking = await getBookingRecord(bookingCode);

                assert(booking, "DB booking not found");
                assert(booking.status === "CONFIRMED", `DB booking status is ${booking.status}`);
                assert(booking.patient, "DB patient relation missing");
                assert(
                    booking.statusHistory.some(
                        (item) => item.fromStatus === null && item.toStatus === "CONFIRMED"
                    ),
                    "missing null -> CONFIRMED status history"
                );

                state.bookingCode = bookingCode;
            }
        ],
        [
            "admin_list_contains_booking",
            async () => {
                const { response, payload } = await adminRequest(
                    `/api/admin/bookings?bookingCode=${state.bookingCode}&limit=10`
                );

                assert(response.status === 200 && payload.success, "admin list failed");
                assert(Array.isArray(payload.data?.bookings), "admin list data shape invalid");
                assert(
                    payload.data.bookings.some(
                        (booking) => booking.bookingCode === state.bookingCode
                    ),
                    "admin list does not contain created booking"
                );
            }
        ],
        [
            "admin_detail_contains_history",
            async () => {
                const { response, payload } = await adminRequest(
                    `/api/admin/bookings/${state.bookingCode}`
                );

                assert(response.status === 200 && payload.success, "admin detail failed");
                assert(payload.data?.bookingCode === state.bookingCode, "detail bookingCode mismatch");
                assert(payload.data?.patient || payload.data?.patientName, "detail missing patient");
                assert(payload.data?.testCatalogItem || payload.data?.testName || payload.data?.testTypeText, "detail missing test");
                assert(payload.data?.status, "detail missing status");
                assert(Array.isArray(payload.data?.statusHistory), "detail missing statusHistory");
                assert(payload.data.statusHistory.length >= 1, "detail statusHistory is empty");
            }
        ],
        [
            "admin_assign_staff",
            async () => {
                const { response, payload } = await adminRequest(
                    `/api/admin/bookings/${state.bookingCode}/assign`,
                    {
                        method: "PATCH",
                        body: JSON.stringify({
                            staffName: "Smoke E2E Collector",
                            staffPhone: "0987654321",
                            role: "SAMPLE_COLLECTOR"
                        })
                    }
                );

                assert(response.status === 200 && payload.success, "assign endpoint failed");
                assert(payload.data?.assignedStaff?.fullName === "Smoke E2E Collector", "assignedStaff missing in response");
                assert(payload.data?.status === "ASSIGNED", `assign did not set ASSIGNED, got ${payload.data?.status}`);

                const booking = await getBookingRecord(state.bookingCode);
                assert(booking.assignedStaff?.fullName === "Smoke E2E Collector", "DB assignedStaff mismatch");
                assert(
                    booking.statusHistory.some((item) => item.toStatus === "ASSIGNED"),
                    "missing ASSIGNED status history"
                );
            }
        ],
        [
            "admin_update_status_sample_collected",
            async () => {
                const { response, payload } = await adminRequest(
                    `/api/admin/bookings/${state.bookingCode}/status`,
                    {
                        method: "PATCH",
                        body: JSON.stringify({
                            status: "SAMPLE_COLLECTED",
                            reason: "smoke sample collected"
                        })
                    }
                );

                assert(response.status === 200 && payload.success, "status update endpoint failed");
                assert(payload.data?.status === "SAMPLE_COLLECTED", "response status is not SAMPLE_COLLECTED");

                const booking = await getBookingRecord(state.bookingCode);
                assert(booking.status === "SAMPLE_COLLECTED", "DB status is not SAMPLE_COLLECTED");
                assert(
                    booking.statusHistory.some((item) => item.toStatus === "SAMPLE_COLLECTED"),
                    "missing SAMPLE_COLLECTED status history"
                );
            }
        ],
        [
            "admin_save_internal_note",
            async () => {
                const { response, payload } = await adminRequest(
                    `/api/admin/bookings/${state.bookingCode}/internal-note`,
                    {
                        method: "PATCH",
                        body: JSON.stringify({
                            internalNote: state.internalNote
                        })
                    }
                );

                assert(response.status === 200 && payload.success, "internal-note endpoint failed");
                assert(payload.data?.internalNote === state.internalNote, "internalNote mismatch in response");

                const { payload: detailPayload } = await adminRequest(
                    `/api/admin/bookings/${state.bookingCode}`
                );
                assert(detailPayload.data?.internalNote === state.internalNote, "detail internalNote mismatch");
            }
        ],
        [
            "admin_complete_booking",
            async () => {
                let payload = null;

                for (const status of ["IN_LAB_PROCESSING", "RESULT_READY", "COMPLETED"]) {
                    const result = await adminRequest(
                        `/api/admin/bookings/${state.bookingCode}/status`,
                        {
                            method: "PATCH",
                            body: JSON.stringify({
                                status,
                                reason: `smoke ${status.toLowerCase()}`
                            })
                        }
                    );

                    assert(result.response.status === 200 && result.payload.success, `${status} endpoint failed`);
                    payload = result.payload;
                }

                assert(payload.data?.status === "COMPLETED", "response status is not COMPLETED");

                const booking = await getBookingRecord(state.bookingCode);
                assert(booking.status === "COMPLETED", "DB status is not COMPLETED");
                assert(Boolean(booking.completedAt || payload.data?.completedAt), "completedAt was not set");
            }
        ],
        [
            "chat_cancel_completed_booking_should_be_controlled",
            async () => {
                const cancelSession = uniqueSession("smoke_5b6_cancel_completed");
                const data = await postChat(
                    vi("T\\u00f4i mu\\u1ed1n h\\u1ee7y l\\u1ecbch ") + state.bookingCode,
                    cancelSession
                );
                const booking = await getBookingRecord(state.bookingCode);

                assert(data && typeof data.reply === "string", "chat cancel response missing reply");
                assert(booking.status === "COMPLETED", `completed booking changed to ${booking.status}`);
            }
        ],
        [
            "urgent_booking_does_not_create_booking",
            async () => {
                const before = await countConfirmedBySession(state.urgentSession);
                const data = await postChat(URGENT_BOOKING_QUERY, state.urgentSession);
                const after = await countConfirmedBySession(state.urgentSession);
                const reply = data.reply || "";

                assert(!hasBookingCode(reply), "urgent reply unexpectedly has bookingCode");
                assert(data.flow !== "booking", "urgent booking query routed to booking flow");
                assert(data.meta?.intentGroup !== "booking", "urgent booking query intentGroup is booking");
                assert(after === before, "urgent session created a confirmed booking");
            }
        ],
        [
            "invalid_booking_code_admin_404",
            async () => {
                const { response, payload } = await adminRequest(
                    "/api/admin/bookings/HLB-20990101-XXXX"
                );

                assert(response.status === 404, `invalid booking returned ${response.status}`);
                assert(payload.success === false, "invalid booking response is not controlled JSON");
                assert(payload.code === "BOOKING_NOT_FOUND" || payload.message, "invalid booking response missing code/message");
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

    await prisma.$disconnect();

    if (failed > 0) {
        process.exit(1);
    }
}

main().catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
});
