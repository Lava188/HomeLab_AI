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

function userHeaders(phone) {
    return {
        "x-demo-role": "USER",
        "x-demo-user-id": `user-${phone}`,
        "x-demo-phone": phone
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

async function parseJsonResponse(response) {
    try {
        return await response.json();
    } catch {
        throw new Error(`API did not return JSON: ${response.status}`);
    }
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

async function countBookingsBySession(sessionId) {
    return prisma.booking.count({ where: { createdFromSessionId: sessionId } });
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

function assertUrgentResponse(payload, label) {
    const data = payload.data || {};
    const reply = data.reply || "";
    const normalizedReply = normalizeText(reply);
    const serialized = normalizeText(JSON.stringify(data));

    assert(data.flow !== "booking", `${label}: urgent routed to booking`);
    assert(!hasBookingCode(reply), `${label}: urgent reply has booking code`);
    assert(!data.booking?.bookingCode, `${label}: urgent payload has booking`);
    assert(
        !serialized.includes("xac nhan chon") &&
            !serialized.includes("ban xac nhan chon") &&
            !serialized.includes("packageconfirmation"),
        `${label}: urgent response returned package confirmation`
    );
    assert(
        normalizedReply.includes("cap cuu") ||
            normalizedReply.includes("khan cap") ||
            normalizedReply.includes("di kham"),
        `${label}: urgent response missing safety guidance`
    );
    assert(
        data.meta?.intentGroup === "urgent_health" ||
            data.meta?.primaryMode === "emergency_or_urgent" ||
            data.meta?.urgentOverride?.applied === true,
        `${label}: urgent metadata missing`
    );
}

function assertPackageConfirmation(payload, label) {
    const data = payload.data || {};
    const normalizedReply = normalizeText(data.reply || "");

    assert(data.flow === "booking", `${label}: package flow is not booking`);
    assert(!hasBookingCode(data.reply || ""), `${label}: package confirmation created booking`);
    assert(
        normalizedReply.includes("xac nhan chon") ||
            data.meta?.nextExpectedField === "packageConfirmation" ||
            data.action === "BOOKING_READY_TO_CONFIRM" ||
            (
                data.meta?.nextExpectedField === "appointmentTime" &&
                normalizedReply.includes("khong kha dung")
            ),
        `${label}: package confirmation did not continue: ${data.reply || ""} ${JSON.stringify(data.meta || {})}`
    );
    assert(
        data.meta?.intentGroup !== "urgent_health" &&
            data.meta?.primaryMode !== "emergency_or_urgent",
        `${label}: non-urgent package confirmation marked urgent`
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
        phone: makePhone("09")
    };

    const cases = [
        [
            "urgent_first_turn_still_wins",
            async () => {
                const sessionId = uniqueId("urgent_first_5g2b");
                const before = await countBookingsBySession(sessionId);
                const { response, payload } = await postChat(
                    "Tôi muốn xét nghiệm tổng quát nhưng đang đau ngực khó thở vã mồ hôi",
                    sessionId
                );
                const after = await countBookingsBySession(sessionId);

                assert(response.status === 200 && payload.success, "chat failed");
                assertUrgentResponse(payload, "urgent_first_turn_still_wins");
                assert(after === before, "urgent first turn created booking");
            }
        ],
        [
            "urgent_after_vague_package_selection_wins",
            async ({ phone }) => {
                const sessionId = uniqueId("urgent_after_vague_5g2b");
                const headers = userHeaders(phone);
                const before = await countBookingsBySession(sessionId);

                await postChat("Tôi muốn xét nghiệm máu", sessionId, headers);
                const urgent = await postChat(
                    "Tôi muốn xét nghiệm tổng quát nhưng đang đau ngực khó thở vã mồ hôi",
                    sessionId,
                    headers
                );
                const after = await countBookingsBySession(sessionId);

                assert(urgent.response.status === 200 && urgent.payload.success, "urgent chat failed");
                assertUrgentResponse(urgent.payload, "urgent_after_vague_package_selection_wins");
                assert(after === before, "urgent after vague created booking");
            }
        ],
        [
            "urgent_after_package_confirmation_prompt_wins",
            async ({ phone }) => {
                const sessionId = uniqueId("urgent_after_prompt_5g2b");
                const headers = userHeaders(phone);
                const before = await countBookingsBySession(sessionId);

                await postChat("Tôi muốn xét nghiệm máu", sessionId, headers);
                await postChat("Tôi muốn đặt lịch gói tổng quát cơ bản sáng mai", sessionId, headers);
                await postChat(
                    "Đặt lịch gói tổng quát cơ bản 8h sáng mai tại 12 Nguyễn Trãi",
                    sessionId,
                    headers
                );
                const urgent = await postChat(
                    "Tôi muốn xét nghiệm tổng quát nhưng đang đau ngực khó thở vã mồ hôi",
                    sessionId,
                    headers
                );
                const after = await countBookingsBySession(sessionId);

                assert(urgent.response.status === 200 && urgent.payload.success, "urgent chat failed");
                assertUrgentResponse(urgent.payload, "urgent_after_package_confirmation_prompt_wins");
                assert(after === before, "urgent after package confirmation created booking");
            }
        ],
        [
            "urgent_after_exact_package_selection_wins",
            async ({ phone }) => {
                const sessionId = uniqueId("urgent_after_exact_5g2b");
                const headers = userHeaders(phone);
                const before = await countBookingsBySession(sessionId);

                await postChat("Tôi muốn đặt lịch gói tổng quát cơ bản sáng mai", sessionId, headers);
                const urgent = await postChat(
                    "Tôi đang khó thở môi tím và rất mệt",
                    sessionId,
                    headers
                );
                const after = await countBookingsBySession(sessionId);

                assert(urgent.response.status === 200 && urgent.payload.success, "urgent chat failed");
                assertUrgentResponse(urgent.payload, "urgent_after_exact_package_selection_wins");
                assert(after === before, "urgent after exact selection created booking");
            }
        ],
        [
            "package_confirmation_still_works_when_no_urgent",
            async ({ phone }) => {
                const sessionId = uniqueId("package_nonurgent_5g2b");
                const headers = userHeaders(phone);

                await postChat("Tôi muốn đặt lịch gói tổng quát cơ bản sáng mai", sessionId, headers);
                const result = await postChat(
                    "Đặt lịch gói tổng quát cơ bản 8h sáng mai tại 12 Nguyễn Trãi, Quận 1, TP Hồ Chí Minh, tên: Smoke User",
                    sessionId,
                    headers
                );

                assert(result.response.status === 200 && result.payload.success, "chat failed");
                assertPackageConfirmation(result.payload, "package_confirmation_still_works_when_no_urgent");
            }
        ],
        [
            "auth_gate_still_works",
            async () => {
                const sessionId = uniqueId("auth_gate_5g2b");
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
