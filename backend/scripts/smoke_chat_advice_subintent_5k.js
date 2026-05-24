const prisma = require("../src/services/booking-runtime/prisma-client");
const { normalizeText } = require("../src/utils/text.util");

const API_BASE_URL = process.env.HOMELAB_API_BASE_URL || "http://localhost:5000";
const CHAT_URL = process.env.HOMELAB_CHAT_API_URL || `${API_BASE_URL}/api/chat`;

function uniqueId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function userHeaders() {
    return {
        "x-demo-role": "USER",
        "x-demo-user-id": `user-subintent-${Date.now()}`,
        "x-demo-phone": "0900000001"
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

    assert(response.status === 200 && payload.success, `chat failed: ${response.status}`);
    return payload.data || {};
}

async function countBookingsBySession(sessionId) {
    return prisma.booking.count({ where: { createdFromSessionId: sessionId } });
}

function getRecommendation(data) {
    return data.meta?.recommendation || null;
}

function containsGenericChestTemplate(answer) {
    const text = normalizeText(answer);

    return (
        text.includes("hien tai ban co dau nguc khong") ||
        text.includes("hien tai ban co kho tho khong") ||
        text.includes("ngat/l")
    );
}

async function runCase(id, fn) {
    try {
        await fn();
        console.log(`PASS ${id}`);
        return { id, passed: true };
    } catch (error) {
        console.error(`FAIL ${id}: ${error.message}`);
        return { id, passed: false, error };
    }
}

async function main() {
    console.log(`Chat advice sub-intent smoke: POST ${CHAT_URL}`);

    const cases = [
        [
            "catalog_listing_lists_packages_no_booking",
            async () => {
                const sessionId = uniqueId("catalog_listing");
                const before = await countBookingsBySession(sessionId);
                const data = await postChat(
                    "hiện tại đang có những gói xét nghiệm gì",
                    sessionId,
                    userHeaders()
                );
                const after = await countBookingsBySession(sessionId);
                const answer = data.reply || "";
                const normalized = normalizeText(answer);

                assert(data.flow === "health_rag", "listing did not stay in health_rag");
                assert(data.meta?.packageIntent === "listing", "listing sub-intent missing");
                assert(normalized.includes("cong thuc mau"), "listing missing CBC");
                assert(normalized.includes("hba1c"), "listing missing HbA1c");
                assert(normalized.includes("goi tong quat co ban"), "listing missing general package");
                assert(!containsGenericChestTemplate(answer), "listing asked generic red flags");
                assert(!getRecommendation(data)?.recommendedPackage, "listing returned recommendation");
                assert(!hasBookingCode(answer), "listing returned booking code");
                assert(after === before, "listing created booking");
            }
        ],
        [
            "headache_nausea_symptom_advice_is_specific",
            async () => {
                const sessionId = uniqueId("headache_symptom");
                const data = await postChat(
                    "dạo gần đây tôi thường xuyên nhức đầu, chán ăn, hay nôn, tôi nên đặt xét nghiệm gì",
                    sessionId,
                    userHeaders()
                );
                const answer = data.reply || "";
                const normalized = normalizeText(answer);

                assert(data.meta?.intentGroup === "test_advice", "symptom advice intent missing");
                assert(normalized.includes("nhuc dau"), "answer did not reflect headache");
                assert(normalized.includes("chan an"), "answer did not reflect poor appetite");
                assert(normalized.includes("non"), "answer did not reflect vomiting");
                assert(normalized.includes("cung co") || normalized.includes("co giat") || normalized.includes("mat nuoc"), "answer missing related red flags");
                assert(!containsGenericChestTemplate(answer), "answer used generic chest/dyspnea template");
                assert(
                    !["ban bi ", "chac chan la", "chan doan la", "mac benh "]
                        .some((phrase) => normalized.includes(phrase)),
                    "answer diagnosed"
                );
            }
        ],
        [
            "context_followup_after_catalog_uses_new_symptoms",
            async () => {
                const sessionId = uniqueId("catalog_followup");
                await postChat("hiện tại có những gói xét nghiệm gì", sessionId, userHeaders());
                const data = await postChat(
                    "vậy tôi nên chọn gói nào nếu gần đây hay mệt và ăn uống kém",
                    sessionId,
                    userHeaders()
                );
                const answer = data.reply || "";
                const normalized = normalizeText(answer);

                assert(data.meta?.intentGroup === "test_advice", "follow-up did not route to test_advice");
                assert(normalized.includes("met"), "follow-up did not use fatigue symptom");
                assert(normalized.includes("an uong kem") || normalized.includes("chan an"), "follow-up did not use appetite symptom");
                assert(normalized.includes("keo dai bao lau"), "follow-up did not ask duration");
                assert(!normalized.startsWith("hien homelab dang ho tro"), "follow-up repeated catalog listing");
            }
        ],
        [
            "context_followup_reuses_prior_symptoms",
            async () => {
                const sessionId = uniqueId("symptom_followup");
                const headers = userHeaders();
                const before = await countBookingsBySession(sessionId);

                await postChat("tôi hay mệt và ăn uống kém", sessionId, headers);
                const data = await postChat("vậy đặt gói nào", sessionId, headers);

                const after = await countBookingsBySession(sessionId);
                const answer = data.reply || "";
                const normalized = normalizeText(answer);

                assert(data.meta?.intentGroup === "test_advice", "follow-up did not route to test_advice");
                assert(normalized.includes("met"), "follow-up did not reuse fatigue symptom");
                assert(normalized.includes("an uong kem") || normalized.includes("chan an"), "follow-up did not reuse appetite symptom");
                assert(!normalized.startsWith("hien homelab dang ho tro"), "follow-up returned catalog listing");
                assert(!containsGenericChestTemplate(answer), "follow-up used generic chest/dyspnea template");
                assert(!hasBookingCode(answer), "follow-up returned booking code");
                assert(after === before, "follow-up created booking");
            }
        ],
        [
            "vague_blood_booking_still_asks_package",
            async () => {
                const sessionId = uniqueId("vague_blood_booking");
                const before = await countBookingsBySession(sessionId);
                const data = await postChat(
                    "tôi muốn đặt lịch xét nghiệm máu sáng mai",
                    sessionId,
                    userHeaders()
                );
                const after = await countBookingsBySession(sessionId);
                const normalized = normalizeText(data.reply || "");

                assert(normalized.includes("chon goi") || normalized.includes("goi xet nghiem nao"), "vague booking did not ask package");
                assert(data.meta?.packageIntent !== "listing", "vague booking was hijacked by listing");
                assert(!hasBookingCode(data.reply || ""), "vague booking created booking code");
                assert(after === before, "vague booking created DB booking");
            }
        ],
        [
            "urgent_chest_dyspnea_still_wins",
            async () => {
                const sessionId = uniqueId("urgent_chest");
                const before = await countBookingsBySession(sessionId);
                const data = await postChat("tôi đau ngực khó thở", sessionId, userHeaders());
                const after = await countBookingsBySession(sessionId);
                const normalized = normalizeText(data.reply || "");

                assert(data.meta?.intentGroup === "urgent_health", "urgent intent missing");
                assert(normalized.includes("cap cuu") || normalized.includes("khan cap") || normalized.includes("di kham"), "urgent safety missing");
                assert(!getRecommendation(data), "urgent returned recommendation");
                assert(!data.booking?.bookingCode, "urgent returned booking");
                assert(after === before, "urgent created booking");
            }
        ],
        [
            "recommendation_gate_still_blocks_live_package_by_default",
            async () => {
                const sessionId = uniqueId("gate_semantics");
                const data = await postChat(
                    "nam 35 tuổi, hay mệt 2 tháng, muốn kiểm tra tổng quát, không đau ngực, không khó thở, không ngất",
                    sessionId,
                    userHeaders()
                );
                const recommendation = getRecommendation(data);

                if (recommendation) {
                    assert(!recommendation.recommendedPackage, "gate unexpectedly returned live recommendedPackage");
                    assert(
                        recommendation.decisionType !== "recommend_package",
                        "gate unexpectedly promoted a package recommendation"
                    );
                }
            }
        ]
    ];

    const results = [];
    for (const [id, fn] of cases) {
        results.push(await runCase(id, fn));
    }

    const passed = results.filter((result) => result.passed).length;
    const failed = results.length - passed;

    console.log(`TOTAL ${results.length} PASSED ${passed} FAILED ${failed}`);
    process.exitCode = failed === 0 ? 0 : 1;
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
