const path = require("path");

const bookingRuntime = require("../src/services/booking-runtime/booking.service");
const availabilitySlotService = require("../src/services/booking-runtime/availability-slot.service");
const mockSessions = require("../src/data/mockSessions");
const packageCatalog = require("../src/services/booking-package-catalog.service");
const classifierService = require("../src/services/conversation-intent-classifier.service");
const { PROVIDERS, CONVERSATION_ACTS } = classifierService;

const bookingServicePath = path.resolve(__dirname, "../src/services/booking.service.js");

bookingRuntime.__createdCount = 0;
bookingRuntime.__savedCount = 0;
bookingRuntime.__clearedCount = 0;
bookingRuntime.saveOrUpdateDraft = async () => {
    bookingRuntime.__savedCount += 1;
    return { id: "mock-draft" };
};
bookingRuntime.clearDraft = async () => {
    bookingRuntime.__clearedCount += 1;
    return { count: 1 };
};
bookingRuntime.createConfirmedBooking = async () => {
    bookingRuntime.__createdCount += 1;
    return {
        id: "mock-booking",
        bookingCode: "HLB-5M11",
        status: "CONFIRMED"
    };
};

availabilitySlotService.findAvailableNearbySlots = async ({ requestedDate }) => [
    {
        id: "slot-0830",
        date: requestedDate || "2026-08-20",
        timeStart: "08:30",
        timeEnd: "09:30",
        capacity: 8,
        bookedCount: 0,
        remainingCapacity: 8,
        active: true
    },
    {
        id: "slot-0930",
        date: requestedDate || "2026-08-20",
        timeStart: "09:30",
        timeEnd: "10:30",
        capacity: 8,
        bookedCount: 2,
        remainingCapacity: 6,
        active: true
    }
];

packageCatalog.resolvePackageIntent = async (message = "") => {
    const lower = String(message).toLowerCase();
    const normalized = lower.normalize("NFD").replace(/[̀-ͯ]/g, "");
    const reviewKeywords = ["nhac lai", "xem lai", "tom tat", "toi dang nhap", "toi o dau", "tien do"];
    const isReviewQuestion = reviewKeywords.some(kw => normalized.includes(kw));

    if (isReviewQuestion) {
        return { type: "none", package: null, candidates: [] };
    }

    if (normalized.includes("la gi") && normalized.includes("tong quat")) {
        const pkg = {
            id: "pkg-general",
            code: "GENERAL_CHECKUP",
            name: "Gói tổng quát cơ bản",
            description: "Gói xét nghiệm hỗ trợ kiểm tra sức khỏe cơ bản.",
            category: "General",
            sampleType: "Blood",
            components: ["Công thức máu", "Đường huyết/HbA1c", "Mỡ máu", "Chức năng gan", "Chức năng thận"],
            suitableFor: "Người muốn kiểm tra sức khỏe cơ bản.",
            preparationNotes: ["Không thay thế khám lâm sàng."]
        };
        console.log(`mock_resolvePackageIntent: message="${message}" normalized="${normalized}" returning package`);
        return {
            type: "selected",
            package: pkg,
            candidates: []
        };
    }
    if (normalized.includes("than")) {
        return {
            type: "selected",
            package: {
                id: "pkg-kidney",
                code: "KIDNEY_FUNCTION",
                name: "Chức năng thận",
                description: "Đánh giá chức năng lọc thận ở mức thông tin chung.",
                category: "Biochemistry",
                sampleType: "Blood",
                components: ["Creatinine", "eGFR"],
                suitableFor: "Đánh giá chức năng lọc thận ở mức thông tin chung.",
                preparationNotes: ["Kết quả cần đọc cùng bác sĩ/nhân viên y tế."]
            },
            candidates: []
        };
    }
    return { type: "none", package: null, candidates: [] };
};

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function uniqueId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function stableStringify(value) {
    if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(",")}]`;
    }
    if (value && typeof value === "object") {
        return `{${Object.keys(value).sort().map((key) =>
            `${JSON.stringify(key)}:${stableStringify(value[key])}`
        ).join(",")}}`;
    }
    return JSON.stringify(value);
}

function makeReadyDraft(overrides = {}) {
    return {
        testType: "Chức năng thận",
        testCatalogItemId: "pkg-kidney",
        selectedPackage: null,
        packageConfirmed: true,
        appointmentDate: "2026-08-20",
        appointmentTime: "07:30",
        address: "12 Nguyễn Trãi, Quận 1, TP Hồ Chí Minh",
        addressPartial: null,
        patientName: "Smoke 5M11",
        phoneNumber: "0900000011",
        ...overrides
    };
}

function makePartialDraft() {
    return makeReadyDraft({
        address: null,
        patientName: null
    });
}

function seedSession(sessionId, draft, status = "collecting_info", lastDiscussedPackage = null) {
    mockSessions.clearSession(sessionId);
    mockSessions.upsertSession(sessionId, {
        currentFlow: "booking",
        status,
        bookingDraft: clone(draft),
        confirmedBookingId: null,
        lastBookingFailure: null,
        pendingDraftEdit: null,
        pendingDraftCancel: null,
        lastDiscussedPackage: lastDiscussedPackage || null
    });
}

function loadBookingService() {
    delete require.cache[bookingServicePath];
    return require(bookingServicePath);
}

async function runCase({
    label,
    message,
    draft = makePartialDraft(),
    status = "collecting_info",
    lastDiscussedPackage = null,
    expectedReplyIncludes = [],
    expectedReplyExcludes = [],
    expectedDraftField = null,
    expectedDraftValue = null,
    expectNoCreate = true,
    expectNoClear = true
}) {
    const sessionId = uniqueId(label);
    const originalDraft = clone(draft);
    seedSession(sessionId, draft, status, lastDiscussedPackage);

    const service = loadBookingService();
    const beforeCreated = bookingRuntime.__createdCount;
    const beforeCleared = bookingRuntime.__clearedCount;

    const data = await service.handleBookingMessage({
        message,
        sessionId,
        userSession: { phone: "0900000011" }
    });

    const session = mockSessions.getSession(sessionId);

    if (expectNoCreate) {
        assert(bookingRuntime.__createdCount === beforeCreated, `${label}: must not create booking`);
    }
    if (expectNoClear) {
        assert(bookingRuntime.__clearedCount === beforeCleared, `${label}: must not clear draft`);
    }

    for (const str of expectedReplyIncludes) {
        assert(data.reply.includes(str), `${label}: reply must include "${str}"`);
    }
    for (const str of expectedReplyExcludes) {
        assert(!data.reply.includes(str), `${label}: reply must NOT include "${str}"`);
    }

    if (expectedDraftField) {
        const actualValue = session.bookingDraft?.[expectedDraftField];
        assert(
            actualValue === expectedDraftValue,
            `${label}: draft.${expectedDraftField} must be ${expectedDraftValue}, got ${actualValue}`
        );
    }

    return {
        data,
        session,
        actualRuleAct: data.meta?.conversationAct?.rule?.act
    };
}

async function runTestCase(id, fn) {
    try {
        await fn();
        console.log(`PASS ${id}`);
        return { id, passed: true };
    } catch (error) {
        console.error(`FAIL ${id}: ${error.message}`);
        return { id, passed: false, error: error.message };
    }
}

async function main() {
    const testResults = [];

    try {
        testResults.push(await runTestCase("A_package_follow_up_with_context", async () => {
            const sessionId = uniqueId("A_package_follow_up");
            seedSession(sessionId, makePartialDraft());

            const service = loadBookingService();
            const data = await service.handleBookingMessage({
                message: "gói xét nghiệm tổng quát là gì",
                sessionId,
                userSession: { phone: "0900000011" }
            });

            console.log(`A_debug: reply="${data.reply.substring(0, 100)}"`);
            console.log(`A_debug: act=${data.meta?.conversationAct?.rule?.act}`);

            const session = mockSessions.getSession(sessionId);
            console.log(`A_debug: session=${JSON.stringify(session)}`);

            const lastPackage = session?.lastDiscussedPackage;
            console.log(`A_debug: lastPackage=${JSON.stringify(lastPackage)}`);

            assert(lastPackage?.code === "GENERAL_CHECKUP", "A: lastDiscussedPackage should be set");

            const followUp = await service.handleBookingMessage({
                message: "nói kĩ hơn cho tôi về cái gói này được không",
                sessionId,
                userSession: { phone: "0900000011" }
            });

            console.log(`A_followup_debug: reply="${followUp.reply.substring(0, 100)}"`);
            assert(followUp.reply.includes("Gói tổng quát cơ bản"), "A_followup: should mention package");
            assert(!followUp.reply.includes("chưa có gói nào"), "A_followup: should not fallback");
        }));

        testResults.push(await runTestCase("B_no_draft_review", async () => {
            const sessionId = uniqueId("B_no_draft");
            mockSessions.clearSession(sessionId);

            const service = loadBookingService();
            const data = await service.handleBookingMessage({
                message: "nhắc lại giúp tôi tôi đang nhập tới đâu rồi",
                sessionId,
                userSession: { phone: "0900000011" }
            });

            assert(
                data.reply.includes("chưa có thông tin") ||
                data.reply.includes("chưa có bản nháp") ||
                data.reply.includes("chưa ghi nhận đủ thông tin"),
                "B: should say no draft"
            );
            assert(!data.reply.includes("đau ngực"), "B: should NOT route to medical RAG");
            assert(!data.reply.includes("khó thở"), "B: should NOT route to medical RAG");
        }));

        testResults.push(await runTestCase("C_active_draft_missing_address_question", async () => {
            await runCase({
                label: "C_missing_field",
                message: "tôi còn phải đưa thêm thông tin gì nữa",
                draft: makePartialDraft(),
                expectedReplyIncludes: ["thiếu", "Địa chỉ", "Tên"],
                expectedDraftField: "address",
                expectedDraftValue: null
            });
        }));

        testResults.push(await runTestCase("D_active_draft_missing_address_pause", async () => {
            const result = await runCase({
                label: "D_pause",
                message: "để tôi bàn lại với nhà rồi tính",
                draft: makePartialDraft(),
                expectedReplyIncludes: [],
                expectedReplyExcludes: [],
                expectedDraftField: "address",
                expectedDraftValue: null
            });

            console.log(`D_debug: reply="${result.data.reply}"`);
            console.log(`D_debug: act=${result.actualRuleAct}`);

            const hasPauseKeyword = result.data.reply.includes("tạm giữ") ||
                                 result.data.reply.includes("giữ") ||
                                 result.data.reply.includes("lưu");
            assert(hasPauseKeyword, "D: reply should mention keeping/pausing draft");
        }));

        testResults.push(await runTestCase("E_availability_question", async () => {
            await runCase({
                label: "E_availability",
                message: "mai còn ca nào lấy mẫu được không",
                draft: makePartialDraft(),
                expectedReplyIncludes: ["08:30", "09:30"],
                expectedReplyExcludes: ["thiếu gói", "Bạn muốn xem"],
                expectedDraftField: "address",
                expectedDraftValue: null
            });
        }));

        testResults.push(await runTestCase("F_real_address_still_works", async () => {
            const sessionId = uniqueId("F_address");
            seedSession(sessionId, makePartialDraft());

            const service = loadBookingService();
            const data = await service.handleBookingMessage({
                message: "766 Đê La Thành, Đống Đa, Hà Nội",
                sessionId,
                userSession: { phone: "0900000011" }
            });

            console.log(`F_debug: reply="${data.reply}"`);
            console.log(`F_debug: act=${data.meta?.conversationAct?.rule?.act}`);
            const session = mockSessions.getSession(sessionId);
            console.log(`F_debug: address="${session.bookingDraft?.address}"`);

            const hasAddress = session.bookingDraft?.address === "766 Đê La Thành, Đống Đa, Hà Nội";
            assert(hasAddress, "F: should save address");
        }));

        testResults.push(await runTestCase("G_pause_variants", async () => {
            await runCase({
                label: "G_pause1",
                message: "để tôi suy nghĩ thêm",
                draft: makePartialDraft(),
                expectedReplyIncludes: ["giữ"],
                expectedDraftField: "address",
                expectedDraftValue: null
            });
        }));

        testResults.push(await runTestCase("H_review_variants", async () => {
            await runCase({
                label: "H_review1",
                message: "tôi đang ở đâu rồi",
                draft: makePartialDraft(),
                expectedReplyIncludes: ["Chức năng thận", "thiếu"],
                expectedDraftField: "address",
                expectedDraftValue: null
            });
        }));

        testResults.push(await runTestCase("I_help_variants", async () => {
            await runCase({
                label: "I_help1",
                message: "giờ tôi cần làm gì",
                draft: makePartialDraft(),
                expectedReplyIncludes: ["thiếu"],
                expectedDraftField: "address",
                expectedDraftValue: null
            });
        }));

        testResults.push(await runTestCase("J_package_this_reference", async () => {
            const generalPackage = {
                id: "pkg-general",
                code: "GENERAL_CHECKUP",
                name: "Gói tổng quát cơ bản",
                description: "Gói xét nghiệm hỗ trợ kiểm tra sức khỏe cơ bản."
            };

            await runCase({
                label: "J_package_ref",
                message: "nói kĩ hơn về cái gói này",
                draft: makePartialDraft(),
                lastDiscussedPackage: generalPackage,
                expectedReplyIncludes: ["Gói tổng quát cơ bản", "Công thức máu"],
                expectedDraftField: "address",
                expectedDraftValue: null
            });
        }));

        const passed = testResults.filter((r) => r.passed).length;
        const failed = testResults.length - passed;

        console.log(`RESULT passed=${passed} failed=${failed} total=${testResults.length}`);

        if (failed > 0) {
            process.exitCode = 1;
        }

        console.log(JSON.stringify({
            ok: failed === 0,
            script: "smoke_context_carryover_and_field_guard_5m11",
            testResults: { passed, failed, total: testResults.length }
        }, null, 2));
    } catch (error) {
        console.error(JSON.stringify({
            ok: false,
            script: "smoke_context_carryover_and_field_guard_5m11",
            error: error.message,
            stack: error.stack
        }, null, 2));
        process.exit(1);
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
