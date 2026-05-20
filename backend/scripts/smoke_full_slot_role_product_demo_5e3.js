const prisma = require("../src/services/booking-runtime/prisma-client");
const { normalizeText } = require("../src/utils/text.util");

const API_BASE_URL = process.env.HOMELAB_API_BASE_URL || "http://localhost:5000";
const CHAT_URL = process.env.HOMELAB_CHAT_API_URL || `${API_BASE_URL}/api/chat`;

const ACTIVE_STATUSES = [
    "CONFIRMED",
    "RESCHEDULED",
    "ASSIGNED",
    "SAMPLE_COLLECTED",
    "IN_LAB_PROCESSING",
    "RESULT_READY"
];

function uniqueId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makePhone(prefix = "09") {
    const suffix = `${Date.now()}${Math.floor(Math.random() * 10000)}`
        .replace(/\D/g, "")
        .slice(-8)
        .padStart(8, "0");

    return `${prefix}${suffix}`;
}

function isoDate(offsetDays = 120) {
    const date = new Date();
    date.setDate(date.getDate() + offsetDays);

    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0")
    ].join("-");
}

function displayDate(isoDateValue) {
    const [year, month, day] = String(isoDateValue).split("-");

    return `${day}/${month}/${year}`;
}

function hasBookingCode(text) {
    return /\bHLB-\d{8}-[A-Z0-9]{4,}\b/i.test(String(text || ""));
}

function extractBookingCode(text) {
    return String(text || "").match(/\bHLB-\d{8}-[A-Z0-9]{4,}\b/i)?.[0] || null;
}

function hasVietnameseTone(text) {
    return /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(String(text || ""));
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
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

async function postChat(message, sessionId, headers = {}) {
    const response = await fetch(CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ message, sessionId }),
        signal: AbortSignal.timeout(20000)
    });
    const payload = await parseJsonResponse(response);

    return { response, payload };
}

function adminHeaders() {
    return {
        "x-demo-role": "ADMIN",
        "x-demo-user-id": "smoke_full_demo_admin_5e3"
    };
}

function userHeaders(phone) {
    return {
        "x-demo-role": "USER",
        "x-demo-user-id": "smoke_full_demo_user_5e3",
        "x-demo-phone": phone
    };
}

function collectorHeaders(phone) {
    return {
        "x-demo-role": "COLLECTOR",
        "x-demo-user-id": "smoke_full_demo_collector_5e3",
        "x-demo-phone": phone
    };
}

function bookingMessage({ date, time, phone, patientName }) {
    return [
        `Tôi muốn đặt lịch xét nghiệm CBC ngày ${displayDate(date)} lúc ${time}`,
        "address: 12 Nguyễn Trãi, Quận 1",
        `ten: ${patientName}`,
        `số điện thoại ${phone}`
    ].join(", ");
}

async function createSlotViaApi({ date, timeStart, timeEnd, capacity = 1, active = true }) {
    return request("/api/admin/availability-slots", {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({
            date,
            timeStart,
            timeEnd,
            capacity,
            area: "default",
            active
        })
    });
}

async function createBookingViaChat({ date, time, phone, patientName, sessionId }) {
    const infoResult = await postChat(
        bookingMessage({ date, time, phone, patientName }),
        sessionId,
        userHeaders(phone)
    );
    assert(infoResult.response.status === 200 && infoResult.payload.success, "booking info chat failed");

    const confirmResult = await postChat("Xác nhận", sessionId, userHeaders(phone));
    assert(confirmResult.response.status === 200 && confirmResult.payload.success, "booking confirm chat failed");

    return confirmResult.payload.data || {};
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

async function countConfirmedForSession(sessionId) {
    return prisma.booking.count({
        where: {
            createdFromSessionId: sessionId,
            status: "CONFIRMED"
        }
    });
}

async function countActiveForPhone(phone) {
    return prisma.booking.count({
        where: {
            phone,
            status: { in: ACTIVE_STATUSES }
        }
    });
}

function assertHistoryHas(bookingOrPayload, expectedStatuses) {
    const history = bookingOrPayload?.statusHistory || [];
    const statuses = history.map((item) => item.toStatus);

    for (const status of expectedStatuses) {
        assert(statuses.includes(status), `history missing ${status}`);
    }
}

function assertNoTechnicalSlotLeak(payload, forbiddenCode) {
    const serialized = JSON.stringify(payload);

    assert(!serialized.includes(forbiddenCode), `payload leaked ${forbiddenCode}`);
}

function assertFriendlyReply(payload, phrase, forbiddenCode) {
    const reply = payload.data?.reply || "";

    assert(!hasBookingCode(reply), "reply unexpectedly contains booking code");
    assert(hasVietnameseTone(reply), "reply does not contain Vietnamese tone marks");
    assert(normalizeText(reply).includes(normalizeText(phrase)), `reply missing phrase ${phrase}`);
    assertNoTechnicalSlotLeak(payload, forbiddenCode);
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
    const offsetBase = 120 + Math.floor(Math.random() * 180);
    const state = {
        slotDate: isoDate(offsetBase),
        unopenedDate: isoDate(offsetBase + 1),
        slotTime: "08:33",
        slotEnd: "09:33",
        userAPhone: makePhone("09"),
        userBPhone: makePhone("09"),
        userCPhone: makePhone("09"),
        userDPhone: makePhone("09"),
        collectorPhone: makePhone("08"),
        bookingCode: null,
        userBSession: null,
        urgentSession: uniqueId("smoke_full_demo_urgent_5e3")
    };

    const cases = [
        [
            "admin_creates_capacity_one_slot",
            async () => {
                const { response, payload } = await createSlotViaApi({
                    date: state.slotDate,
                    timeStart: state.slotTime,
                    timeEnd: state.slotEnd,
                    capacity: 1,
                    active: true
                });

                assert(response.status === 201 && payload.success, "slot create failed");
                assert(payload.data?.capacity === 1, "slot capacity is not 1");
                assert(payload.data?.active === true, "slot is not active");
                assert(payload.data?.date === state.slotDate, "slot date mismatch");
                assert(payload.data?.timeStart === state.slotTime, "slot time mismatch");
            }
        ],
        [
            "first_user_booking_confirmed_with_open_slot",
            async () => {
                const sessionId = uniqueId("smoke_full_demo_user_a_5e3");
                const data = await createBookingViaChat({
                    date: state.slotDate,
                    time: state.slotTime,
                    phone: state.userAPhone,
                    patientName: "Smoke Demo User A",
                    sessionId
                });
                const reply = data.reply || "";
                const bookingCode = data.booking?.bookingCode || extractBookingCode(reply);

                state.bookingCode = bookingCode;

                assert(/^HLB-\d{8}-[A-Z0-9]{4,}$/i.test(bookingCode), "bookingCode is invalid");
                assert(data.booking?.status === "CONFIRMED", `booking status is ${data.booking?.status}`);
                assert(data.booking?.sampleDate === state.slotDate, "sampleDate mismatch");
                assert(data.booking?.sampleTimeStart === state.slotTime, "sampleTimeStart mismatch");
                assert(!JSON.stringify(data).includes("BOOKING_SLOT_"), "successful booking leaked slot error");

                const record = await getBookingRecord(bookingCode);
                assert(record?.status === "CONFIRMED", "DB booking is not CONFIRMED");
                assertHistoryHas(record, ["CONFIRMED"]);
            }
        ],
        [
            "second_user_same_slot_rejected_as_full",
            async () => {
                state.userBSession = uniqueId("smoke_full_demo_user_b_5e3");
                const before = await countConfirmedForSession(state.userBSession);
                const data = await createBookingViaChat({
                    date: state.slotDate,
                    time: state.slotTime,
                    phone: state.userBPhone,
                    patientName: "Smoke Demo User B",
                    sessionId: state.userBSession
                });
                const after = await countConfirmedForSession(state.userBSession);

                assertFriendlyReply({ data }, "hết chỗ", "BOOKING_SLOT_FULL");
                assert(after === before, "User B got a confirmed booking in full slot");
            }
        ],
        [
            "admin_can_see_first_booking",
            async () => {
                const { response, payload } = await request(
                    `/api/admin/bookings?bookingCode=${encodeURIComponent(state.bookingCode)}`,
                    { headers: adminHeaders() }
                );

                assert(response.status === 200 && payload.success, "admin list failed");
                assert(
                    payload.data?.bookings?.some((booking) => booking.bookingCode === state.bookingCode),
                    "admin list does not include User A booking"
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
                            staffName: "Smoke Demo Collector",
                            staffPhone: state.collectorPhone,
                            role: "SAMPLE_COLLECTOR"
                        })
                    }
                );

                assert(response.status === 200 && payload.success, "admin assign failed");
                assert(payload.data?.assignedStaff?.phone === state.collectorPhone, "assignedStaff phone mismatch");
                assert(payload.data?.status === "ASSIGNED", `assign status is ${payload.data?.status}`);
            }
        ],
        [
            "collector_sees_assigned_booking",
            async () => {
                const listResult = await request(
                    `/api/collector/bookings?phone=${encodeURIComponent(state.collectorPhone)}`,
                    { headers: collectorHeaders(state.collectorPhone) }
                );

                assert(listResult.response.status === 200 && listResult.payload.success, "collector list failed");
                assert(
                    listResult.payload.data?.bookings?.some((booking) => booking.bookingCode === state.bookingCode),
                    "collector list missing booking"
                );

                const detailResult = await request(
                    `/api/collector/bookings/${state.bookingCode}?phone=${encodeURIComponent(state.collectorPhone)}`,
                    { headers: collectorHeaders(state.collectorPhone) }
                );

                assert(detailResult.response.status === 200 && detailResult.payload.success, "collector detail failed");
                assert(detailResult.payload.data?.bookingCode === state.bookingCode, "collector detail mismatch");
            }
        ],
        [
            "collector_marks_sample_collected",
            async () => {
                const { response, payload } = await request(
                    `/api/collector/bookings/${state.bookingCode}/sample-collected?phone=${encodeURIComponent(state.collectorPhone)}`,
                    {
                        method: "PATCH",
                        headers: collectorHeaders(state.collectorPhone),
                        body: JSON.stringify({ note: "Smoke full demo sample collected" })
                    }
                );

                assert(response.status === 200 && payload.success, "collector sample collected failed");
                assert(payload.data?.status === "SAMPLE_COLLECTED", `status is ${payload.data?.status}`);
                assertHistoryHas(payload.data, ["SAMPLE_COLLECTED"]);
            }
        ],
        [
            "admin_progresses_lab_workflow",
            async () => {
                for (const [status, reason] of [
                    ["IN_LAB_PROCESSING", "Smoke full demo in lab"],
                    ["RESULT_READY", "Smoke full demo result ready"],
                    ["COMPLETED", "Smoke full demo completed"]
                ]) {
                    const { response, payload } = await request(
                        `/api/admin/bookings/${state.bookingCode}/status`,
                        {
                            method: "PATCH",
                            headers: adminHeaders(),
                            body: JSON.stringify({ status, reason })
                        }
                    );

                    assert(response.status === 200 && payload.success, `admin ${status} failed`);
                    assert(payload.data?.status === status, `expected ${status}, got ${payload.data?.status}`);
                }

                const record = await getBookingRecord(state.bookingCode);
                assert(record.status === "COMPLETED", "DB booking is not COMPLETED");
                assert(Boolean(record.completedAt), "completedAt missing");
            }
        ],
        [
            "user_sees_completed_booking",
            async () => {
                const { response, payload } = await request(
                    `/api/user/bookings/${state.bookingCode}?phone=${encodeURIComponent(state.userAPhone)}`,
                    { headers: userHeaders(state.userAPhone) }
                );

                assert(response.status === 200 && payload.success, "user detail failed");
                assert(payload.data?.status === "COMPLETED", `user sees ${payload.data?.status}`);
                assertHistoryHas(payload.data, [
                    "CONFIRMED",
                    "ASSIGNED",
                    "SAMPLE_COLLECTED",
                    "IN_LAB_PROCESSING",
                    "RESULT_READY",
                    "COMPLETED"
                ]);
                assert(!Object.prototype.hasOwnProperty.call(payload.data || {}, "internalNote"), "user response leaked internalNote");
            }
        ],
        [
            "completed_booking_no_longer_holds_capacity",
            async () => {
                const sessionId = uniqueId("smoke_full_demo_user_c_5e3");
                const data = await createBookingViaChat({
                    date: state.slotDate,
                    time: state.slotTime,
                    phone: state.userCPhone,
                    patientName: "Smoke Demo User C",
                    sessionId
                });
                const bookingCode = data.booking?.bookingCode || extractBookingCode(data.reply || "");

                assert(bookingCode, "User C booking did not get bookingCode after User A completed");
                assert(data.booking?.status === "CONFIRMED", `User C status is ${data.booking?.status}`);
                assert(data.booking?.sampleDate === state.slotDate, "User C sampleDate mismatch");
                assert(data.booking?.sampleTimeStart === state.slotTime, "User C sampleTimeStart mismatch");
            }
        ],
        [
            "unopened_slot_rejected_friendly",
            async () => {
                const sessionId = uniqueId("smoke_full_demo_user_d_5e3");
                const data = await createBookingViaChat({
                    date: state.unopenedDate,
                    time: state.slotTime,
                    phone: state.userDPhone,
                    patientName: "Smoke Demo User D",
                    sessionId
                });

                assertFriendlyReply({ data }, "chưa mở lịch", "BOOKING_SLOT_NOT_OPEN");
            }
        ],
        [
            "urgent_booking_still_does_not_create",
            async () => {
                const before = await prisma.booking.count({
                    where: { createdFromSessionId: state.urgentSession }
                });
                const { response, payload } = await postChat(
                    "Tôi muốn đặt lịch xét nghiệm vì đau ngực khó thở vã mồ hôi",
                    state.urgentSession
                );
                const after = await prisma.booking.count({
                    where: { createdFromSessionId: state.urgentSession }
                });
                const data = payload.data || {};
                const reply = data.reply || "";
                const normalizedReply = normalizeText(reply);

                assert(response.status === 200 && payload.success, "urgent chat failed");
                assert(!hasBookingCode(reply), "urgent reply unexpectedly has bookingCode");
                assert(data.flow !== "booking", "urgent query routed to booking");
                assert(
                    normalizedReply.includes("cap cuu") ||
                        normalizedReply.includes("khan cap") ||
                        normalizedReply.includes("di kham"),
                    "urgent response missing emergency guidance"
                );
                assert(after === before, "urgent created booking");
            }
        ],
        [
            "final_admin_detail_has_audit_history",
            async () => {
                const { response, payload } = await request(
                    `/api/admin/bookings/${state.bookingCode}`,
                    { headers: adminHeaders() }
                );

                assert(response.status === 200 && payload.success, "admin final detail failed");
                assert(payload.data?.status === "COMPLETED", "final admin detail is not completed");
                assertHistoryHas(payload.data, [
                    "CONFIRMED",
                    "ASSIGNED",
                    "SAMPLE_COLLECTED",
                    "IN_LAB_PROCESSING",
                    "RESULT_READY",
                    "COMPLETED"
                ]);
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
