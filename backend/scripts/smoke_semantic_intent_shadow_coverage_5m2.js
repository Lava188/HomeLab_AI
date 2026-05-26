const mockSessions = require("../src/data/mockSessions");
const bookingRuntime = require("../src/services/booking-runtime/booking.service");
const packageCatalog = require("../src/services/booking-package-catalog.service");
const {
    classifySemanticIntent
} = require("../src/services/conversation-intent-classifier.service");

bookingRuntime.saveOrUpdateDraft = async () => ({ id: "mock-draft" });
bookingRuntime.clearDraft = async () => ({ count: 1 });
bookingRuntime.createConfirmedBooking = async (payload, options = {}) => ({
    id: "mock-booking",
    bookingCode: `HLB-20260526-${String(options.sessionId || "MOCK").slice(-4).toUpperCase()}`,
    status: "CONFIRMED",
    testTypeText: payload.testTypeText,
    sampleDate: payload.sampleDate,
    sampleTimeStart: payload.sampleTimeStart,
    address: payload.address,
    patientName: payload.patientName,
    phone: payload.phone
});

packageCatalog.resolvePackageIntent = async (message) => {
    const normalized = String(message || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/Đ/g, "D")
        .toLowerCase();

    if (!normalized.includes("chuc nang than") && !normalized.includes("goi nay")) {
        return { type: "none", package: null, candidates: [] };
    }

    return {
        type: normalized.includes("gom") ? "detail_question" : "selected",
        package: makePackage(),
        candidates: []
    };
};

const { handleBookingMessage } = require("../src/services/booking.service");

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function uniqueId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makePackage() {
    return {
        id: "pkg-kidney",
        code: "KIDNEY_FUNCTION",
        name: "Chức năng thận",
        description: "Đánh giá chức năng lọc thận ở mức thông tin chung.",
        components: ["Creatinine", "eGFR"],
        preparationNotes: []
    };
}

function makeReadyDraft(overrides = {}) {
    return {
        testType: "Chức năng thận",
        testCatalogItemId: "pkg-kidney",
        selectedPackage: makePackage(),
        packageConfirmed: true,
        appointmentDate: "2026-08-20",
        appointmentTime: "07:30",
        address: "12 Nguyễn Trãi, phường Bến Thành, Quận 1, TP Hồ Chí Minh",
        patientName: "Smoke Semantic",
        phoneNumber: "0900000001",
        ...overrides
    };
}

function seedSession({ sessionId, draft, status = "ready_for_confirmation" }) {
    mockSessions.clearSession(sessionId);
    mockSessions.upsertSession(sessionId, {
        currentFlow: "booking",
        status,
        bookingDraft: draft,
        confirmedBookingId: null,
        lastBookingFailure: null,
        pendingDraftEdit: null,
        pendingDraftCancel: null
    });
}

function assertConversationActMeta(data, label) {
    const conversationAct = data.meta?.conversationAct;

    assert(conversationAct, `${label}: missing meta.conversationAct`);
    assert(conversationAct.rule, `${label}: missing rule shadow meta`);
    assert(conversationAct.semanticShadow, `${label}: missing semanticShadow meta`);
    assert(typeof conversationAct.match === "boolean", `${label}: missing match`);
    assert(
        Object.prototype.hasOwnProperty.call(conversationAct, "disagreementReason"),
        `${label}: missing disagreementReason`
    );
    assert(conversationAct.act === conversationAct.rule.act, `${label}: legacy act does not mirror rule act`);
    assert(
        conversationAct.semanticShadow.evidence?.provider === "deterministic_stub",
        `${label}: semantic provider must stay deterministic_stub`
    );

    return conversationAct;
}

function assertClassifierDoesNotMutate({ message, session, draft, missingFields, label }) {
    const before = clone(draft);

    classifySemanticIntent({
        message,
        sessionContext: session,
        draft,
        lastBotAction: session.status || null,
        domainContext: {
            missingFields,
            nextExpectedField: missingFields[0] || null,
            selectedPackage: draft.selectedPackage || null,
            pendingDraftEdit: session.pendingDraftEdit || null,
            pendingDraftCancel: session.pendingDraftCancel || null
        }
    });

    assert(JSON.stringify(draft) === JSON.stringify(before), `${label}: classifier mutated draft`);
}

async function runCase(testCase) {
    const sessionId = uniqueId(testCase.label);
    const draft = testCase.draftFactory();

    seedSession({
        sessionId,
        draft,
        status: testCase.status || "ready_for_confirmation"
    });

    const sessionBefore = mockSessions.getSession(sessionId);
    const missingFields = testCase.missingFields || [];

    assertClassifierDoesNotMutate({
        message: testCase.message,
        session: sessionBefore,
        draft,
        missingFields,
        label: testCase.label
    });

    const beforeCreatedCount = bookingRuntime.__createdCount || 0;
    const data = await handleBookingMessage({
        message: testCase.message,
        sessionId,
        userSession: { phone: "0900000001" }
    });
    const actMeta = assertConversationActMeta(data, testCase.label);

    testCase.expect({ data, actMeta, beforeCreatedCount });

    return {
        label: testCase.label,
        ruleAct: actMeta.rule.act,
        semanticAct: actMeta.semanticShadow.conversationAct,
        semanticGroup: actMeta.semanticShadow.intentGroup,
        action: data.action,
        match: actMeta.match,
        disagreementReason: actMeta.disagreementReason
    };
}

bookingRuntime.__createdCount = 0;
const originalCreateConfirmedBooking = bookingRuntime.createConfirmedBooking;
bookingRuntime.createConfirmedBooking = async (...args) => {
    bookingRuntime.__createdCount += 1;
    return originalCreateConfirmedBooking(...args);
};

async function main() {
    const cases = [
        {
            label: "a_field_value_normal",
            message: "Nguyễn Văn A",
            draftFactory: () => makeReadyDraft({ patientName: null }),
            status: "collecting_info",
            missingFields: ["patientName"],
            expect: ({ data, actMeta, beforeCreatedCount }) => {
                assert(actMeta.rule.act === "field_value", "a: behavior should follow rule field_value");
                assert(data.booking?.draft?.patientName === "Nguyễn Văn A", "a: rule flow did not collect patientName");
                assert(bookingRuntime.__createdCount === beforeCreatedCount, "a: should not create booking");
            }
        },
        {
            label: "b_info_detour",
            message: "mà gói này gồm những gì",
            draftFactory: makeReadyDraft,
            expect: ({ actMeta, beforeCreatedCount }) => {
                assert(actMeta.rule.act === "info_detour", "b: behavior should follow rule info_detour");
                assert(bookingRuntime.__createdCount === beforeCreatedCount, "b: should not create booking");
            }
        },
        {
            label: "c_pause",
            message: "khoan đã",
            draftFactory: makeReadyDraft,
            expect: ({ data, actMeta, beforeCreatedCount }) => {
                assert(actMeta.rule.act === "pause_or_hold", "c: behavior should follow rule pause");
                assert(data.meta.sessionState === "booking_paused", "c: should pause by rule");
                assert(bookingRuntime.__createdCount === beforeCreatedCount, "c: should not create booking");
            }
        },
        {
            label: "d_natural_cancel",
            message: "tôi không muốn khám nữa bỏ lịch giúp tôi",
            draftFactory: makeReadyDraft,
            expect: ({ data, actMeta, beforeCreatedCount }) => {
                assert(actMeta.rule.act === "cancel_or_abort", "d: behavior should follow rule cancel");
                assert(data.meta.sessionState === "booking_cancel_confirmation", "d: should only ask cancel confirmation");
                assert(bookingRuntime.__createdCount === beforeCreatedCount, "d: should not create booking");
            }
        },
        {
            label: "e_edit_time",
            message: "đổi sang 8h nhé",
            draftFactory: makeReadyDraft,
            expect: ({ data, actMeta, beforeCreatedCount }) => {
                assert(actMeta.rule.act === "edit_request", "e: behavior should follow rule edit");
                assert(data.meta.sessionState === "editing_booking_draft", "e: should ask edit confirmation");
                assert(bookingRuntime.__createdCount === beforeCreatedCount, "e: should not create booking");
            }
        },
        {
            label: "f_final_confirm",
            message: "đúng, xác nhận lịch này",
            draftFactory: makeReadyDraft,
            expect: ({ data, actMeta, beforeCreatedCount }) => {
                assert(actMeta.rule.act === "final_confirm", "f: behavior should follow rule final_confirm");
                assert(data.action === "BOOKING_CREATED", "f: rule final_confirm should create booking");
                assert(bookingRuntime.__createdCount === beforeCreatedCount + 1, "f: expected one booking creation");
            }
        },
        {
            label: "g_unclear",
            message: "ừ vậy cũng được",
            draftFactory: makeReadyDraft,
            expect: ({ data, actMeta, beforeCreatedCount }) => {
                assert(actMeta.rule.act === "unclear", "g: behavior should follow rule unclear");
                assert(data.action === "ASK_BOOKING_INFO", "g: should ask for clarification");
                assert(bookingRuntime.__createdCount === beforeCreatedCount, "g: should not create booking");
            }
        },
        {
            label: "h_urgent_interruption",
            message: "tôi đau ngực khó thở vã mồ hôi",
            draftFactory: makeReadyDraft,
            expect: ({ data, actMeta, beforeCreatedCount }) => {
                assert(actMeta.semanticShadow.intentGroup === "urgent_health", "h: semantic shadow should flag urgent health");
                assert(actMeta.semanticShadow.safetyDecision === "block_mutation", "h: semantic shadow should block mutation");
                assert(data.action === "ASK_BOOKING_INFO", "h: booking.service behavior still follows rule shadow milestone");
                assert(bookingRuntime.__createdCount === beforeCreatedCount, "h: should not create booking");
            }
        },
        {
            label: "i_help_next_step",
            message: "giờ tôi cần làm gì",
            draftFactory: makeReadyDraft,
            expect: ({ actMeta, beforeCreatedCount }) => {
                assert(actMeta.rule.act === "help_next_step", "i: behavior should follow rule help");
                assert(bookingRuntime.__createdCount === beforeCreatedCount, "i: should not create booking");
            }
        },
        {
            label: "j_review_draft",
            message: "xem lại thông tin giúp tôi",
            draftFactory: makeReadyDraft,
            expect: ({ actMeta, beforeCreatedCount }) => {
                assert(actMeta.rule.act === "review_draft", "j: behavior should follow rule review");
                assert(bookingRuntime.__createdCount === beforeCreatedCount, "j: should not create booking");
            }
        }
    ];

    const summaries = [];
    for (const testCase of cases) {
        summaries.push(await runCase(testCase));
    }

    console.log("5M-2 semantic intent shadow coverage smoke passed");
    console.table(summaries);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
