const prisma = require("../src/services/booking-runtime/prisma-client");
const { normalizeText } = require("../src/utils/text.util");

const API_BASE_URL = process.env.HOMELAB_API_BASE_URL || "http://localhost:5000";
const CHAT_URL = process.env.HOMELAB_CHAT_API_URL || `${API_BASE_URL}/api/chat`;

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

function isoDate(offsetDays = 90) {
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

function userHeaders(phone) {
    return {
        "x-demo-role": "USER",
        "x-demo-user-id": `user-${phone}`,
        "x-demo-phone": phone
    };
}

function adminHeaders() {
    return {
        "x-demo-role": "ADMIN",
        "x-demo-user-id": "admin-smoke-5g1"
    };
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function hasBookingCode(text) {
    return /\bHLB-\d{8}-[A-Z0-9]{4,}\b/i.test(String(text || ""));
}

function extractBookingCode(text) {
    return String(text || "").match(/\bHLB-\d{8}-[A-Z0-9]{4,}\b/i)?.[0] || null;
}

function isLoginRequired(payload) {
    const data = payload.data || {};
    const normalizedReply = normalizeText(data.reply || "");

    return (
        data.action === "AUTH_REQUIRED" ||
        data.meta?.authRequired === true ||
        (normalizedReply.includes("dang nhap") && normalizedReply.includes("tao tai khoan"))
    );
}

async function parseJsonResponse(response) {
    try {
        return await response.json();
    } catch {
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

async function createSlot({ date, timeStart, timeEnd, capacity = 4 }) {
    const { response, payload } = await request("/api/admin/availability-slots", {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({
            date,
            timeStart,
            timeEnd,
            capacity,
            area: "default",
            active: true
        })
    });

    assert(response.status === 201 && payload.success, "slot create failed");
}

function bookingMessage({ date, time, phone, patientName, address = "12 Nguyễn Trãi, Quận 1" }) {
    return [
        `Tôi muốn đặt lịch xét nghiệm CBC ngày ${displayDate(date)} lúc ${time}`,
        `địa chỉ: ${address}`,
        `tên: ${patientName}`,
        phone ? `số điện thoại ${phone}` : ""
    ].filter(Boolean).join(", ");
}

async function createBookingViaChat({ date, time, phone, patientName, sessionId, includePhone = false }) {
    const info = await postChat(
        bookingMessage({
            date,
            time,
            phone: includePhone ? phone : "",
            patientName
        }),
        sessionId,
        userHeaders(phone)
    );
    assert(info.response.status === 200 && info.payload.success, "booking info chat failed");

    const confirm = await postChat("Xác nhận", sessionId, userHeaders(phone));
    assert(confirm.response.status === 200 && confirm.payload.success, "booking confirm chat failed");

    const data = confirm.payload.data || {};
    const bookingCode = data.booking?.bookingCode || extractBookingCode(data.reply || "");
    assert(bookingCode, "booking code missing");

    return { data, bookingCode };
}

async function countBookingsBySession(sessionId) {
    return prisma.booking.count({ where: { createdFromSessionId: sessionId } });
}

async function getBooking(bookingCode) {
    return prisma.booking.findUnique({ where: { bookingCode } });
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
        date: isoDate(100 + Math.floor(Math.random() * 60)),
        cancelDate: isoDate(170 + Math.floor(Math.random() * 60)),
        time: "08:41",
        timeEnd: "09:41",
        phoneA: makePhone("09"),
        phoneB: makePhone("09"),
        bookingA: null,
        ownerCancelBooking: null
    };

    await createSlot({
        date: state.date,
        timeStart: state.time,
        timeEnd: state.timeEnd,
        capacity: 5
    });
    await createSlot({
        date: state.cancelDate,
        timeStart: state.time,
        timeEnd: state.timeEnd,
        capacity: 5
    });

    const cases = [
        [
            "public_lab_question_allowed",
            async () => {
                const { response, payload } = await postChat("CBC là gì?", uniqueId("public_lab_5g1"));
                const reply = payload.data?.reply || "";

                assert(response.status === 200 && payload.success, "chat failed");
                assert(!isLoginRequired(payload), "public lab question required login");
                assert(!hasBookingCode(reply), "public lab reply has booking code");
                assert(reply.length > 20, "public lab reply too short");
            }
        ],
        [
            "public_urgent_allowed",
            async () => {
                const { response, payload } = await postChat("Tôi đau ngực khó thở vã mồ hôi", uniqueId("urgent_5g1"));
                const reply = payload.data?.reply || "";
                const normalized = normalizeText(reply);

                assert(response.status === 200 && payload.success, "urgent chat failed");
                assert(!isLoginRequired(payload), "urgent required login");
                assert(!hasBookingCode(reply), "urgent reply has booking code");
                assert(
                    normalized.includes("cap cuu") ||
                        normalized.includes("khan cap") ||
                        normalized.includes("di kham"),
                    "urgent reply missing safety guidance"
                );
            }
        ],
        [
            "unauthenticated_booking_requires_login",
            async () => {
                const sessionId = uniqueId("unauth_booking_5g1");
                const before = await countBookingsBySession(sessionId);
                const { response, payload } = await postChat("Tôi muốn đặt lịch xét nghiệm máu sáng mai", sessionId);
                const after = await countBookingsBySession(sessionId);

                assert(response.status === 200 && payload.success, "chat failed");
                assert(isLoginRequired(payload), "booking did not require login");
                assert(!hasBookingCode(payload.data?.reply || ""), "reply has booking code");
                assert(after === before, "unauth booking created DB record");
            }
        ],
        [
            "unauthenticated_full_booking_does_not_create",
            async () => {
                const sessionId = uniqueId("unauth_full_booking_5g1");
                const before = await countBookingsBySession(sessionId);
                const { response, payload } = await postChat(
                    "Đặt lịch lấy mẫu máu tại nhà, 8h sáng mai, địa chỉ 12 Nguyễn Trãi",
                    sessionId
                );
                const after = await countBookingsBySession(sessionId);

                assert(response.status === 200 && payload.success, "chat failed");
                assert(isLoginRequired(payload), "full booking did not require login");
                assert(!hasBookingCode(payload.data?.reply || ""), "reply has booking code");
                assert(after === before, "unauth full booking created DB record");
            }
        ],
        [
            "unauthenticated_cancel_requires_login",
            async () => {
                const { response, payload } = await postChat("Tôi muốn hủy lịch HLB-20260101-ABCD", uniqueId("unauth_cancel_5g1"));

                assert(response.status === 200 && payload.success, "chat failed");
                assert(isLoginRequired(payload), "cancel did not require login");
            }
        ],
        [
            "unauthenticated_confirmation_requires_login",
            async () => {
                const sessionId = uniqueId("unauth_confirm_5g1");
                const before = await countBookingsBySession(sessionId);
                const { response, payload } = await postChat("Đúng rồi, xác nhận đặt lịch", sessionId);
                const after = await countBookingsBySession(sessionId);

                assert(response.status === 200 && payload.success, "chat failed");
                assert(isLoginRequired(payload), "confirmation did not require login");
                assert(after === before, "unauth confirmation created DB record");
            }
        ],
        [
            "authenticated_booking_uses_session_phone",
            async () => {
                const sessionId = uniqueId("auth_booking_a_5g1");
                const { data, bookingCode } = await createBookingViaChat({
                    date: state.date,
                    time: state.time,
                    phone: state.phoneA,
                    patientName: "Nguyễn Văn A",
                    sessionId
                });
                const booking = await getBooking(bookingCode);

                state.bookingA = bookingCode;

                assert(data.booking?.status === "CONFIRMED", "chat booking not confirmed");
                assert(booking?.phone === state.phoneA, `booking phone ${booking?.phone} is not session phone`);
            }
        ],
        [
            "authenticated_booking_rejects_other_phone",
            async () => {
                const sessionId = uniqueId("auth_other_phone_5g1");
                const beforeB = await prisma.booking.count({ where: { phone: state.phoneB, createdFromSessionId: sessionId } });
                const { response, payload } = await postChat(
                    bookingMessage({
                        date: state.date,
                        time: state.time,
                        phone: state.phoneB,
                        patientName: "Nguyễn Văn B"
                    }),
                    sessionId,
                    userHeaders(state.phoneA)
                );
                const afterB = await prisma.booking.count({ where: { phone: state.phoneB, createdFromSessionId: sessionId } });
                const normalized = normalizeText(payload.data?.reply || "");

                assert(response.status === 200 && payload.success, "chat failed");
                assert(!hasBookingCode(payload.data?.reply || ""), "other phone reply has booking code");
                assert(afterB === beforeB, "booking was created for other phone");
                assert(
                    normalized.includes("tai khoan dang dang nhap") ||
                        normalized.includes("dang nhap bang tai khoan phu hop"),
                    "other phone response missing account guidance"
                );
            }
        ],
        [
            "authenticated_wrong_phone_cannot_cancel",
            async () => {
                const before = await getBooking(state.bookingA);
                const { response, payload } = await postChat(
                    `Tôi muốn hủy lịch ${state.bookingA}`,
                    uniqueId("wrong_cancel_5g1"),
                    userHeaders(state.phoneB)
                );
                const after = await getBooking(state.bookingA);
                const normalized = normalizeText(payload.data?.reply || "");

                assert(response.status === 200 && payload.success, "chat failed");
                assert(normalized.includes("khong co quyen"), "wrong phone cancel did not reject with ownership message");
                assert(after.status === before.status, "wrong phone cancel changed booking status");
            }
        ],
        [
            "authenticated_owner_can_cancel_valid_booking",
            async () => {
                const sessionId = uniqueId("owner_cancel_create_5g1");
                const { bookingCode } = await createBookingViaChat({
                    date: state.cancelDate,
                    time: state.time,
                    phone: state.phoneA,
                    patientName: "Nguyễn Văn A",
                    sessionId
                });
                state.ownerCancelBooking = bookingCode;

                const { response, payload } = await postChat(
                    `Tôi muốn hủy lịch ${bookingCode}`,
                    uniqueId("owner_cancel_5g1"),
                    userHeaders(state.phoneA)
                );
                const booking = await getBooking(bookingCode);

                assert(response.status === 200 && payload.success, "cancel chat failed");
                assert(booking.status === "CANCELLED", `owner cancel status is ${booking.status}`);
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
