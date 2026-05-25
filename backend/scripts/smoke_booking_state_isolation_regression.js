const prisma = require("../src/services/booking-runtime/prisma-client");
const packageCatalog = require("../src/services/booking-package-catalog.service");
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

function isoDate(offsetDays = 120) {
    const date = new Date();
    date.setDate(date.getDate() + offsetDays);

    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0")
    ].join("-");
}

function displayDate(value) {
    const [year, month, day] = String(value).split("-");
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
        "x-demo-user-id": "admin-smoke-state-isolation"
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

async function createSlot({ date, timeStart, timeEnd, capacity = 5 }) {
    const existing = await request(
        `/api/admin/availability-slots?date=${encodeURIComponent(date)}&active=true`,
        { method: "GET", headers: adminHeaders() }
    );
    const existingSlot = (existing.payload.data?.slots || []).find(
        (slot) => slot.date === date && slot.timeStart === timeStart
    );

    if (existingSlot) {
        const { response, payload } = await request(
            `/api/admin/availability-slots/${existingSlot.id}`,
            {
                method: "PATCH",
                headers: adminHeaders(),
                body: JSON.stringify({ capacity: Math.max(capacity, 50), active: true })
            }
        );

        assert(response.status === 200 && payload.success, "slot update failed");
        return;
    }

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

function fullBookingMessage({ date, time, patientName, address }) {
    return [
        `Toi muon dat lich goi tong quat co ban ngay ${displayDate(date)} luc ${time}`,
        `dia chi: ${address}`,
        `ten: ${patientName}`
    ].join(", ");
}

async function countBookingsBySession(sessionId) {
    return prisma.booking.count({ where: { createdFromSessionId: sessionId } });
}

async function countBookingsByPhone(phone) {
    return prisma.booking.count({ where: { phone } });
}

async function createConfirmedBookingViaChat({ sessionId, phone, date, time, patientName, address }) {
    const first = await postChat(
        fullBookingMessage({ date, time, patientName, address }),
        sessionId,
        userHeaders(phone)
    );
    assert(first.response.status === 200 && first.payload.success, "create first turn failed");

    const second = await postChat("Xac nhan", sessionId, userHeaders(phone));
    assert(second.response.status === 200 && second.payload.success, "create confirm turn failed");

    const data = second.payload.data || {};
    const bookingCode = data.booking?.bookingCode || extractBookingCode(data.reply || "");
    assert(bookingCode, "confirmed booking did not return booking code");

    return { bookingCode, data };
}

function assertAsksForMissingInfo(data) {
    const reply = data.reply || "";
    const normalizedReply = normalizeText(reply);

    assert(!hasBookingCode(reply), "reply unexpectedly contains booking code");
    assert(data.action !== "BOOKING_CREATED", "booking was created unexpectedly");
    assert(
        normalizedReply.includes("goi") ||
            normalizedReply.includes("dia chi") ||
            normalizedReply.includes("ten") ||
            normalizedReply.includes("gio") ||
            normalizedReply.includes("vui long cung cap"),
        "reply did not ask for missing booking information"
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
        phone: makePhone("09"),
        oldDate: isoDate(150),
        validDate: isoDate(151),
        secondValidDate: isoDate(152),
        time: "08:37",
        timeEnd: "09:37",
        oldAddress: "99 Old State Street, phuong Ben Thanh, Quan 1, TP Ho Chi Minh",
        oldName: "Old State User"
    };

    await packageCatalog.ensureRequiredCatalogItems();
    await createSlot({ date: state.oldDate, timeStart: state.time, timeEnd: state.timeEnd });
    await createSlot({ date: state.validDate, timeStart: state.time, timeEnd: state.timeEnd });
    await createSlot({ date: state.secondValidDate, timeStart: state.time, timeEnd: state.timeEnd });

    const cases = [
        [
            "old_confirmed_booking_must_not_become_new_draft",
            async () => {
                const sessionId = uniqueId("old_confirmed_reused_session");
                await createConfirmedBookingViaChat({
                    sessionId,
                    phone: state.phone,
                    date: state.oldDate,
                    time: state.time,
                    patientName: state.oldName,
                    address: state.oldAddress
                });

                const before = await countBookingsBySession(sessionId);
                const { response, payload } = await postChat(
                    "Toi muon dat lich xet nghiem mau sang mai",
                    sessionId,
                    userHeaders(state.phone)
                );
                const after = await countBookingsBySession(sessionId);
                const data = payload.data || {};
                const reply = data.reply || "";

                assert(response.status === 200 && payload.success, "chat failed");
                assert(after === before, "new booking was created from old draft");
                assertAsksForMissingInfo(data);
                assert(!reply.includes(state.oldAddress), "reply reused old address");
                assert(!reply.includes(state.oldName), "reply reused old patient name");
            }
        ],
        [
            "edit_phrase_must_not_confirm_booking",
            async () => {
                const sessionId = uniqueId("edit_phrase_pending");
                const before = await countBookingsBySession(sessionId);
                const first = await postChat(
                    fullBookingMessage({
                        date: state.validDate,
                        time: state.time,
                        patientName: "Edit Phrase User",
                        address: "12 Nguyen Trai, phuong Ben Thanh, Quan 1, TP Ho Chi Minh"
                    }),
                    sessionId,
                    userHeaders(state.phone)
                );
                assert(first.response.status === 200 && first.payload.success, "pending draft setup failed");

                const edit = await postChat(
                    "khong phai, thay doi thong tin dat lich giup toi",
                    sessionId,
                    userHeaders(state.phone)
                );
                const after = await countBookingsBySession(sessionId);
                const data = edit.payload.data || {};
                const normalizedReply = normalizeText(data.reply || "");

                assert(edit.response.status === 200 && edit.payload.success, "edit chat failed");
                assert(after === before, "edit phrase created a booking");
                assert(!hasBookingCode(data.reply || ""), "edit reply contains new booking code");
                assert(
                    normalizedReply.includes("doi goi") ||
                        normalizedReply.includes("ngay gio") ||
                        normalizedReply.includes("dia chi") ||
                        normalizedReply.includes("nguoi dat"),
                    "edit reply did not ask which information to change"
                );
            }
        ],
        [
            "confirmation_still_works_when_valid",
            async () => {
                const sessionId = uniqueId("valid_confirm");
                const before = await countBookingsBySession(sessionId);
                const first = await postChat(
                    fullBookingMessage({
                        date: state.secondValidDate,
                        time: state.time,
                        patientName: "Valid Confirm User",
                        address: "34 Le Loi, phuong Ben Thanh, Quan 1, TP Ho Chi Minh"
                    }),
                    sessionId,
                    userHeaders(state.phone)
                );
                const second = await postChat("Xac nhan", sessionId, userHeaders(state.phone));
                const after = await countBookingsBySession(sessionId);
                const data = second.payload.data || {};
                const bookingCode = data.booking?.bookingCode || extractBookingCode(data.reply || "");
                const draftCount = await prisma.bookingDraft.count({ where: { sessionId } });

                assert(first.response.status === 200 && first.payload.success, "first chat failed");
                assert(second.response.status === 200 && second.payload.success, "confirm chat failed");
                assert(after === before + 1, "valid confirmation did not create exactly one booking");
                assert(bookingCode, "valid confirmation missing booking code");
                assert(draftCount === 0, "draft was not cleared after booking creation");
            }
        ],
        [
            "confirmation_without_active_draft_must_not_create_booking",
            async () => {
                const sessionId = uniqueId("confirm_no_draft");
                const before = await countBookingsByPhone(state.phone);
                const { response, payload } = await postChat(
                    "Xac nhan",
                    sessionId,
                    userHeaders(state.phone)
                );
                const after = await countBookingsByPhone(state.phone);
                const data = payload.data || {};
                const normalizedReply = normalizeText(data.reply || "");

                assert(response.status === 200 && payload.success, "chat failed");
                assert(after === before, "confirmation without draft created booking");
                assert(!hasBookingCode(data.reply || ""), "reply contains booking code");
                assert(
                    normalizedReply.includes("chua co thong tin") ||
                        normalizedReply.includes("dang cho xac nhan"),
                    "reply did not explain missing active draft"
                );
            }
        ],
        [
            "change_existing_booking_requires_booking_code_or_lookup_context",
            async () => {
                const sessionId = uniqueId("change_existing_no_code");
                const before = await countBookingsByPhone(state.phone);
                const { response, payload } = await postChat(
                    "Toi muon doi lich da dat",
                    sessionId,
                    userHeaders(state.phone)
                );
                const after = await countBookingsByPhone(state.phone);
                const data = payload.data || {};
                const normalizedReply = normalizeText(data.reply || "");

                assert(response.status === 200 && payload.success, "chat failed");
                assert(after === before, "change existing request created booking");
                assert(!hasBookingCode(data.reply || ""), "reply contains new booking code");
                assert(
                    normalizedReply.includes("ma dat lich") ||
                        normalizedReply.includes("hlb-yyyy") ||
                        normalizedReply.includes("cung cap"),
                    "reply did not ask for booking code or lookup info"
                );
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
