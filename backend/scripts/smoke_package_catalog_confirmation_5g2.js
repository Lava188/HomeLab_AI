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

function isoDate(offsetDays = 100) {
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
        "x-demo-user-id": "admin-smoke-5g2"
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

async function countBookingsBySession(sessionId) {
    return prisma.booking.count({ where: { createdFromSessionId: sessionId } });
}

async function getBooking(bookingCode) {
    return prisma.booking.findUnique({
        where: { bookingCode },
        include: { testCatalogItem: true }
    });
}

function isLoginRequired(payload) {
    const data = payload.data || {};
    const normalizedReply = normalizeText(data.reply || "");

    return (
        data.action === "AUTH_REQUIRED" ||
        data.meta?.authRequired === true ||
        normalizedReply.includes("dang nhap")
    );
}

function assertPackagePrompt(data) {
    const reply = data.reply || "";
    const normalizedReply = normalizeText(reply);

    assert(!hasBookingCode(reply), "reply unexpectedly has booking code");
    assert(
        normalizedReply.includes("chon goi") ||
            normalizedReply.includes("goi xet nghiem nao") ||
            normalizedReply.includes("goi/xet nghiem"),
        "reply did not ask user to choose package"
    );
    assert(
        Array.isArray(data.meta?.packageCandidates) &&
            data.meta.packageCandidates.length >= 6,
        "package candidates missing"
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
        date: isoDate(130 + Math.floor(Math.random() * 60)),
        time: "08:52",
        timeEnd: "09:52",
        phone: makePhone("09")
    };

    await packageCatalog.ensureRequiredCatalogItems();
    await createSlot({
        date: state.date,
        timeStart: state.time,
        timeEnd: state.timeEnd,
        capacity: 5
    });

    const cases = [
        [
            "catalog_seed_has_required_packages",
            async () => {
                const required = packageCatalog.getRequiredPackages();
                const records = await prisma.testCatalogItem.findMany({
                    where: {
                        code: { in: required.map((item) => item.code) },
                        active: true
                    }
                });
                const codes = new Set(records.map((item) => item.code));

                assert(records.length >= 6, "catalog has fewer than 6 required items");
                for (const item of required) {
                    assert(codes.has(item.code), `catalog missing ${item.code}`);
                }
            }
        ],
        [
            "vague_blood_test_asks_package",
            async () => {
                const sessionId = uniqueId("vague_blood_5g2");
                const before = await countBookingsBySession(sessionId);
                const { response, payload } = await postChat(
                    "Tôi muốn xét nghiệm máu",
                    sessionId,
                    userHeaders(state.phone)
                );
                const after = await countBookingsBySession(sessionId);

                assert(response.status === 200 && payload.success, "chat failed");
                assertPackagePrompt(payload.data || {});
                assert(after === before, "vague blood test created booking");
            }
        ],
        [
            "general_checkup_shows_package_detail",
            async () => {
                const sessionId = uniqueId("general_detail_5g2");
                const before = await countBookingsBySession(sessionId);
                const { response, payload } = await postChat(
                    "Gói tổng quát cơ bản gồm những gì?",
                    sessionId,
                    userHeaders(state.phone)
                );
                const data = payload.data || {};
                const normalizedReply = normalizeText(data.reply || "");
                const after = await countBookingsBySession(sessionId);

                assert(response.status === 200 && payload.success, "chat failed");
                assert(normalizedReply.includes("cong thuc mau"), "detail missing CBC");
                assert(normalizedReply.includes("mo mau"), "detail missing lipid");
                assert(data.meta?.selectedPackage?.code === "GENERAL_CHECKUP", "selectedPackage missing");
                assert(!hasBookingCode(data.reply || ""), "detail reply has booking code");
                assert(after === before, "package detail created booking");
            }
        ],
        [
            "booking_general_checkup_requires_confirmation",
            async () => {
                const sessionId = uniqueId("general_confirm_5g2");
                const before = await countBookingsBySession(sessionId);
                const { response, payload } = await postChat(
                    "Tôi muốn đặt lịch xét nghiệm tổng quát sáng mai",
                    sessionId,
                    userHeaders(state.phone)
                );
                const data = payload.data || {};
                const normalizedReply = normalizeText(data.reply || "");
                const after = await countBookingsBySession(sessionId);

                assert(response.status === 200 && payload.success, "chat failed");
                assert(data.meta?.selectedPackage?.code === "GENERAL_CHECKUP", "selectedPackage missing");
                assert(
                    normalizedReply.includes("gio lay mau") ||
                        normalizedReply.includes("gio") ||
                        normalizedReply.includes("thieu"),
                    "package selection should ask for missing field (time), not confirmation"
                );
                assert(!normalizedReply.includes("xac nhan chon") && !normalizedReply.includes("xac nhan dat lich"),
                    "package selection should NOT ask for confirmation when fields are missing");
                assert(!hasBookingCode(data.reply || ""), "reply has booking code");
                assert(after === before, "booking created before confirmation");
            }
        ],
        [
            "booking_draft_package_detail_detour_keeps_missing_time",
            async () => {
                const sessionId = uniqueId("liver_detail_detour_5g2");
                const before = await countBookingsBySession(sessionId);
                const first = await postChat(
                    `tôi muốn đặt lịch gói chức năng gan ngày ${displayDate(state.date)}, địa chỉ: 12 Nguyễn Trãi, Quận 1, tên: Smoke Liver User`,
                    sessionId,
                    userHeaders(state.phone)
                );
                const second = await postChat(
                    "chức năng gan là gì",
                    sessionId,
                    userHeaders(state.phone)
                );
                const data = second.payload.data || {};
                const normalizedReply = normalizeText(data.reply || "");
                const after = await countBookingsBySession(sessionId);

                assert(first.response.status === 200 && first.payload.success, "first chat failed");
                assert(second.response.status === 200 && second.payload.success, "detail detour failed");
                assert(normalizedReply.includes("chuc nang gan"), "detour missing package name");
                assert(normalizedReply.includes("alt") && normalizedReply.includes("ast"), "detour missing ALT/AST");
                assert(normalizedReply.includes("gio lay mau"), "detour did not ask for missing time");
                assert(data.booking?.draft?.testType, "draft lost package");
                assert(data.booking?.draft?.appointmentDate, "draft lost date");
                assert(data.booking?.draft?.phoneNumber === state.phone, "draft lost session phone");
                assert((data.booking?.missingFields || []).includes("appointmentTime"), "missingFields lost appointmentTime");
                assert(!hasBookingCode(data.reply || ""), "detour reply has booking code");
                assert(after === before, "detail detour created booking");
            }
        ],
        [
            "booking_draft_oke_explain_is_not_confirmation",
            async () => {
                const sessionId = uniqueId("liver_oke_explain_5g2");
                const before = await countBookingsBySession(sessionId);
                await postChat(
                    `tôi muốn đặt lịch gói chức năng gan ngày ${displayDate(state.date)}, địa chỉ: 12 Nguyễn Trãi, Quận 1, tên: Smoke Liver User`,
                    sessionId,
                    userHeaders(state.phone)
                );
                const { response, payload } = await postChat(
                    "oke giải thích giúp tôi về gói chức năng gan",
                    sessionId,
                    userHeaders(state.phone)
                );
                const data = payload.data || {};
                const normalizedReply = normalizeText(data.reply || "");
                const after = await countBookingsBySession(sessionId);

                assert(response.status === 200 && payload.success, "oke explain chat failed");
                assert(normalizedReply.includes("chuc nang gan"), "oke explain missing package detail");
                assert(normalizedReply.includes("alt") && normalizedReply.includes("ast"), "oke explain missing ALT/AST");
                assert(!normalizedReply.includes("minh chua the tao lich vi con thieu"), "oke explain was treated as confirmation block");
                assert(!hasBookingCode(data.reply || ""), "oke explain reply has booking code");
                assert(after === before, "oke explain created booking");
            }
        ],
        [
            "booking_draft_invalid_address_reply_is_specific_utf8",
            async () => {
                const sessionId = uniqueId("invalid_address_5g2");
                const before = await countBookingsBySession(sessionId);
                await postChat(
                    `tôi muốn đặt lịch gói chức năng gan ngày ${displayDate(state.date)} lúc ${state.time}, tên: Smoke Address User`,
                    sessionId,
                    userHeaders(state.phone)
                );
                const { response, payload } = await postChat(
                    "abc, xyz, ymn",
                    sessionId,
                    userHeaders(state.phone)
                );
                const data = payload.data || {};
                const reply = data.reply || "";
                const normalizedReply = normalizeText(reply);
                const after = await countBookingsBySession(sessionId);

                assert(response.status === 200 && payload.success, "invalid address chat failed");
                assert(!data.booking?.draft?.address, "invalid address was set on draft");
                assert(normalizedReply.includes("mo ta dia chi"), "reply missing specific invalid-address reason");
                assert(normalizedReply.includes("chua du chinh xac"), "reply did not say address is not valid enough");
                assert(!/[ÃÄÆ]|á»|áº|Â/.test(reply), "reply contains mojibake");
                assert(after === before, "invalid address created booking");
            }
        ],
        [
            "confirmed_package_booking_creates_booking",
            async () => {
                const sessionId = uniqueId("create_general_5g2");
                const infoMessage = [
                    `Tôi muốn đặt lịch gói tổng quát cơ bản ngày ${displayDate(state.date)} lúc ${state.time}`,
                    "địa chỉ: 12 Nguyễn Trãi, Quận 1",
                    "tên: Smoke Package User"
                ].join(", ");
                const before = await countBookingsBySession(sessionId);
                const first = await postChat(infoMessage, sessionId, userHeaders(state.phone));
                const second = await postChat("Xác nhận", sessionId, userHeaders(state.phone));
                const data = second.payload.data || {};
                const bookingCode =
                    data.booking?.bookingCode || extractBookingCode(data.reply || "");
                const after = await countBookingsBySession(sessionId);
                const booking = await getBooking(bookingCode);

                assert(first.response.status === 200 && first.payload.success, "first chat failed");
                assert(second.response.status === 200 && second.payload.success, "package confirm failed");
                assert(bookingCode, "booking code missing");
                assert(after === before + 1, "confirmed package booking did not create one booking");
                assert(booking?.testCatalogItem?.code === "GENERAL_CHECKUP", "booking missing package catalog item");
                assert(booking?.testTypeText === "Gói tổng quát cơ bản", "booking testTypeText not specific package");
            }
        ],
        [
            "vague_booking_without_package_does_not_create",
            async () => {
                const sessionId = uniqueId("vague_full_5g2");
                const before = await countBookingsBySession(sessionId);
                const { response, payload } = await postChat(
                    "Đặt lịch xét nghiệm máu 8h sáng mai tại 12 Nguyễn Trãi",
                    sessionId,
                    userHeaders(state.phone)
                );
                const after = await countBookingsBySession(sessionId);

                assert(response.status === 200 && payload.success, "chat failed");
                assertPackagePrompt(payload.data || {});
                assert(after === before, "vague full booking created booking");
            }
        ],
        [
            "urgent_overrides_package",
            async () => {
                const sessionId = uniqueId("urgent_package_5g2");
                const before = await countBookingsBySession(sessionId);
                const { response, payload } = await postChat(
                    "Tôi muốn xét nghiệm tổng quát nhưng đang đau ngực khó thở vã mồ hôi",
                    sessionId
                );
                const data = payload.data || {};
                const normalizedReply = normalizeText(data.reply || "");
                const after = await countBookingsBySession(sessionId);

                assert(response.status === 200 && payload.success, "urgent chat failed");
                assert(data.flow !== "booking", "urgent routed to booking");
                assert(!data.meta?.selectedPackage, "urgent returned package confirmation");
                assert(
                    normalizedReply.includes("cap cuu") ||
                        normalizedReply.includes("khan cap") ||
                        normalizedReply.includes("di kham"),
                    "urgent response missing safety guidance"
                );
                assert(after === before, "urgent created booking");
            }
        ],
        [
            "auth_gate_still_required",
            async () => {
                const sessionId = uniqueId("auth_gate_5g2");
                const before = await countBookingsBySession(sessionId);
                const { response, payload } = await postChat(
                    "Tôi muốn đặt lịch gói tổng quát cơ bản sáng mai",
                    sessionId
                );
                const after = await countBookingsBySession(sessionId);

                assert(response.status === 200 && payload.success, "chat failed");
                assert(isLoginRequired(payload), "booking did not require login");
                assert(!hasBookingCode(payload.data?.reply || ""), "auth gate reply has booking code");
                assert(after === before, "unauth booking created DB record");
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
