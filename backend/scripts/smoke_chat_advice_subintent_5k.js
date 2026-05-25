const prisma = require("../src/services/booking-runtime/prisma-client");
const { normalizeText } = require("../src/utils/text.util");
const packageCatalog = require("../src/services/booking-package-catalog.service");
const availabilitySlotService = require("../src/services/booking-runtime/availability-slot.service");
const bookingRuntime = require("../src/services/booking-runtime/booking.service");

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

function isoDate(offsetDays = 1) {
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

async function getDraftBySession(sessionId) {
    return prisma.bookingDraft.findFirst({ where: { sessionId } });
}

async function createSlot({
    date,
    timeStart = "08:00",
    timeEnd = "09:00",
    capacity = 4,
    resetDate = true
}) {
    if (resetDate) {
        await prisma.availabilitySlot.updateMany({
            where: {
                date: new Date(`${date}T00:00:00.000Z`),
                area: "default",
                active: true
            },
            data: {
                active: false
            }
        });
    }
    await availabilitySlotService.createAvailabilitySlot({
        date,
        timeStart,
        timeEnd,
        capacity,
        area: "default",
        active: true
    });
}

async function createOccupyingBooking({ date, timeStart, phone = "0999999999" }) {
    return bookingRuntime.createConfirmedBooking(
        {
            patientName: "Smoke Slot Occupant",
            phone,
            testTypeText: "Chức năng thận",
            sampleDate: date,
            sampleTimeStart: timeStart,
            address: "1 Smoke Occupied Slot"
        },
        {
            sessionId: uniqueId("slot_occupant"),
            createdSource: "CHAT"
        }
    );
}

async function findDateWindowWithoutSlots(offsetStart = 700) {
    for (let offset = offsetStart; offset < offsetStart + 120; offset += 8) {
        const start = isoDate(offset);
        const end = isoDate(offset + 7);
        const count = await prisma.availabilitySlot.count({
            where: {
                date: {
                    gte: new Date(`${start}T00:00:00.000Z`),
                    lte: new Date(`${end}T00:00:00.000Z`)
                },
                active: true
            }
        });

        if (count === 0) {
            return start;
        }
    }

    throw new Error("could not find empty slot window for smoke");
}

async function findDateWithoutBookings(offsetStart = 460) {
    for (let offset = offsetStart; offset < offsetStart + 160; offset += 3) {
        const date = isoDate(offset);
        const count = await prisma.booking.count({
            where: {
                sampleDate: new Date(`${date}T00:00:00.000Z`)
            }
        });

        if (count === 0) {
            return date;
        }
    }

    throw new Error("could not find date without bookings for smoke");
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
    await packageCatalog.ensureRequiredCatalogItems();

    const cases = [
        [
            "symptom_only_fatigue_poor_appetite_no_generic_fallback",
            async () => {
                const sessionId = uniqueId("symptom_only");
                const before = await countBookingsBySession(sessionId);
                const data = await postChat(
                    "tôi hay mệt và ăn uống kém",
                    sessionId,
                    userHeaders()
                );
                const after = await countBookingsBySession(sessionId);
                const answer = data.reply || "";
                const normalized = normalizeText(answer);

                assert(data.meta?.intentGroup === "test_advice", "symptom-only did not route to test_advice");
                assert(normalized.includes("met"), "symptom-only did not mention fatigue");
                assert(normalized.includes("an uong kem") || normalized.includes("chan an"), "symptom-only did not mention appetite");
                assert(normalized.includes("keo dai bao lau"), "symptom-only did not ask duration");
                assert(!normalized.includes("chua du chac chan"), "symptom-only returned generic fallback");
                assert(!containsGenericChestTemplate(answer), "symptom-only used generic chest/dyspnea template");
                assert(after === before, "symptom-only created booking");
            }
        ],
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
            "booking_multiturn_keeps_draft_through_package_detail_detour",
            async () => {
                const sessionId = uniqueId("booking_multiturn");
                const headers = userHeaders();
                const tomorrow = isoDate(1);
                await createSlot({ date: tomorrow, capacity: 50 });
                const before = await countBookingsBySession(sessionId);

                const first = await postChat(
                    "tôi muốn đặt lịch xét nghiệm máu sáng mai",
                    sessionId,
                    headers
                );
                const firstText = normalizeText(first.reply || "");
                assert(first.flow === "booking", "first turn did not enter booking");
                assert(first.meta?.nextExpectedField === "testType", "first turn did not ask for testType");
                assert(firstText.includes("chon") || firstText.includes("goi/xet nghiem"), "first turn did not ask package");

                const second = await postChat(
                    "tên tôi là Nguyễn Văn A, lấy mẫu lúc 8 giờ sáng, địa chỉ 12 Nguyễn Trãi, Hà Nội",
                    sessionId,
                    headers
                );
                const secondText = normalizeText(second.reply || "");
                assert(second.flow === "booking", "second turn did not stay in booking");
                assert(second.meta?.missingFields?.includes("testType"), "second turn did not keep only testType missing");
                assert(second.meta?.extractedSlots?.appointmentTime === "08:00", "second turn did not extract appointment time");
                assert(second.meta?.extractedSlots?.address, "second turn did not extract address");
                assert(second.meta?.extractedSlots?.patientName, "second turn did not extract patient name");
                assert(secondText.includes("da ghi nhan") || secondText.includes("ghi nhan"), "second turn did not acknowledge known fields");
                assert(secondText.includes("08:00"), "second turn did not reflect time");
                assert(secondText.includes("12 nguyen trai"), "second turn did not reflect address");

                const detail = await postChat(
                    "gói chức năng thận, giải thích xem gói chức năng thận gồm những gì",
                    sessionId,
                    headers
                );
                const detailText = normalizeText(detail.reply || "");
                const afterDetail = await countBookingsBySession(sessionId);
                const draftAfterDetail = await getDraftBySession(sessionId);
                const draftSlots = draftAfterDetail?.slotsJson || {};

                assert(detail.flow === "booking", "package detail did not stay in booking draft");
                assert(detail.meta?.packageIntent === "detail_question", "package detail intent missing");
                assert(detailText.includes("creatinine") || detailText.includes("egfr"), "package detail missing kidney components");
                assert(detail.meta?.missingFields?.includes("testType"), "package detail detour should not set testType");
                assert(detailText.includes("goi/xet nghiem") || detailText.includes("chon goi"), "package detail did not ask for missing package field");
                assert(afterDetail === before, "package detail detour created booking");
                assert(draftSlots.appointmentTime === "08:00", "draft lost appointment time after detail detour");
                assert(String(draftSlots.address || "").includes("12"), "draft lost address after detail detour");
                assert(draftSlots.appointmentDate === tomorrow, "draft lost appointment date after detail detour");

                const packageTurn = await postChat(
                    "giúp tôi đặt lịch xét nghiệm gói chức năng thận",
                    sessionId,
                    headers
                );
                const packageText = normalizeText(packageTurn.reply || "");
                const afterPackage = await countBookingsBySession(sessionId);

                assert(packageTurn.flow === "booking", "package selection did not return to booking");
                assert(packageTurn.meta?.selectedPackage?.code === "KIDNEY_FUNCTION", "kidney package not selected");
                assert(packageText.includes("chuc nang than"), "package confirmation missing package");
                assert(packageText.includes("08:00"), "package confirmation did not reuse time");
                assert(packageText.includes("12 nguyen trai"), "package confirmation did not reuse address");
                assert(afterPackage === before, "package selection created booking before confirmation");

                const confirmed = await postChat("xác nhận", sessionId, headers);
                const afterConfirm = await countBookingsBySession(sessionId);

                assert(confirmed.action === "BOOKING_CREATED", "confirmation did not create booking");
                assert(confirmed.booking?.bookingCode, "confirmed booking code missing");
                assert(afterConfirm === before + 1, "confirmation did not create exactly one booking");
            }
        ],
        [
            "urgent_override_during_open_booking_draft_wins",
            async () => {
                const sessionId = uniqueId("urgent_open_draft");
                const headers = userHeaders();
                const before = await countBookingsBySession(sessionId);

                await postChat("tôi muốn đặt lịch xét nghiệm máu sáng mai", sessionId, headers);
                const urgent = await postChat("tôi đau ngực khó thở vã mồ hôi", sessionId, headers);
                const after = await countBookingsBySession(sessionId);
                const normalized = normalizeText(urgent.reply || "");

                assert(urgent.flow === "health_rag", "urgent did not route to health_rag");
                assert(urgent.meta?.intentGroup === "urgent_health", "urgent intent missing during draft");
                assert(normalized.includes("cap cuu") || normalized.includes("khan cap") || normalized.includes("di kham"), "urgent reply missing safety guidance");
                assert(!urgent.booking?.bookingCode, "urgent returned booking");
                assert(after === before, "urgent created booking");
            }
        ],
        [
            "slot_not_open_suggests_nearby_reason_and_rebooks",
            async () => {
                const sessionId = uniqueId("slot_not_open");
                const headers = userHeaders();
                const baseOffset = 300 + Math.floor(Math.random() * 120);
                const requestedDate = isoDate(baseOffset);
                const suggestedDate = isoDate(baseOffset + 1);
                await createSlot({ date: suggestedDate, timeStart: "08:00", timeEnd: "09:00" });
                await createSlot({ date: suggestedDate, timeStart: "09:00", timeEnd: "10:00", resetDate: false });
                const before = await countBookingsBySession(sessionId);

                await postChat(
                    `tôi muốn đặt lịch gói chức năng thận ngày ${displayDate(requestedDate)} lúc 14:00, địa chỉ 766 Đê La Thành, Quận Đống Đa, Hà Nội, tên Trần Văn C`,
                    sessionId,
                    headers
                );
                const failed = await postChat("xác nhận", sessionId, headers);
                const failedText = normalizeText(failed.reply || "");
                const afterFailure = await countBookingsBySession(sessionId);

                assert(failed.action === "BOOKING_READY_TO_CONFIRM", "slot not open did not stay pending");
                assert(failed.meta?.lastBookingFailure?.reasonCode === "SLOT_NOT_OPEN", "slot not open reason missing");
                assert(failedText.includes("chua duoc homelab mo lich") || failedText.includes("chua mo lich"), "slot not open reason not clear");
                assert((failed.meta?.lastBookingFailure?.suggestedSlots || []).length > 0, "slot not open suggestions missing");
                assert(!hasBookingCode(failed.reply || ""), "slot not open returned booking code");
                assert(afterFailure === before, "slot not open created booking");

                const why = await postChat("tại sao chưa thể tạo lịch hẹn?", sessionId, headers);
                const whyText = normalizeText(why.reply || "");
                assert(whyText.includes("chua duoc homelab mo lich") || whyText.includes("chua mo lich"), "why reply did not reuse reason");

                const chosen = await postChat("chọn khung đầu tiên", sessionId, headers);
                const chosenText = normalizeText(chosen.reply || "");
                const afterChoose = await countBookingsBySession(sessionId);
                assert(chosen.action === "BOOKING_READY_TO_CONFIRM", "choosing suggested slot did not ask confirmation");
                assert(chosenText.includes("08:00"), "chosen slot time not reflected");
                assert(afterChoose === before, "choosing suggested slot created booking too early");

                const confirmed = await postChat("xác nhận", sessionId, headers);
                const afterConfirm = await countBookingsBySession(sessionId);
                assert(confirmed.action === "BOOKING_CREATED", "suggested slot confirmation did not create booking");
                assert(confirmed.booking?.bookingCode, "suggested slot booking code missing");
                assert(afterConfirm === before + 1, "suggested slot confirmation did not create exactly one booking");
            }
        ],
        [
            "slot_full_suggests_available_slot",
            async () => {
                const sessionId = uniqueId("slot_full");
                const headers = userHeaders();
                const requestedDate = await findDateWithoutBookings();
                await createSlot({ date: requestedDate, timeStart: "14:00", timeEnd: "15:00", capacity: 1 });
                await createSlot({ date: requestedDate, timeStart: "15:00", timeEnd: "16:00", resetDate: false });
                await createOccupyingBooking({
                    date: requestedDate,
                    timeStart: "14:00",
                    phone: "0987654321"
                });
                const before = await countBookingsBySession(sessionId);

                await postChat(
                    `tôi muốn đặt lịch gói chức năng thận ngày ${displayDate(requestedDate)} lúc 14:00, địa chỉ 766 Đê La Thành, Quận Đống Đa, Hà Nội, tên Trần Văn C`,
                    sessionId,
                    headers
                );
                const failed = await postChat("xác nhận", sessionId, headers);
                const failedText = normalizeText(failed.reply || "");
                const afterFailure = await countBookingsBySession(sessionId);

                assert(failed.meta?.lastBookingFailure?.reasonCode === "SLOT_FULL", "slot full reason missing");
                assert(failedText.includes("het cho"), "slot full reason not clear");
                assert((failed.meta?.lastBookingFailure?.suggestedSlots || []).some((slot) => slot.timeStart === "15:00"), "slot full did not suggest open capacity");
                assert(afterFailure === before, "slot full created booking");
            }
        ],
        [
            "slot_failure_without_nearby_slots_does_not_invent_options",
            async () => {
                const sessionId = uniqueId("slot_none_nearby");
                const headers = userHeaders();
                const requestedDate = await findDateWindowWithoutSlots();
                const before = await countBookingsBySession(sessionId);

                await postChat(
                    `tôi muốn đặt lịch gói chức năng thận ngày ${displayDate(requestedDate)} lúc 14:00, địa chỉ 766 Đê La Thành, Quận Đống Đa, Hà Nội, tên Trần Văn C`,
                    sessionId,
                    headers
                );
                const failed = await postChat("xác nhận", sessionId, headers);
                const failedText = normalizeText(failed.reply || "");
                const afterFailure = await countBookingsBySession(sessionId);

                assert(failed.meta?.lastBookingFailure?.reasonCode === "NO_AVAILABLE_NEARBY_SLOT", "no nearby slot reason missing");
                assert(
                    failedText.includes("chua co khung gio lay mau kha dung gan ngay") ||
                        failedText.includes("chua mo lich lay mau"),
                    "no nearby slot message missing"
                );
                assert((failed.meta?.lastBookingFailure?.suggestedSlots || []).length === 0, "no nearby slot invented suggestions");
                assert(afterFailure === before, "no nearby slot created booking");
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

                assert(
                    normalized.includes("chon goi") ||
                        normalized.includes("goi xet nghiem nao") ||
                        normalized.includes("goi/xet nghiem"),
                    "vague booking did not ask package"
                );
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
