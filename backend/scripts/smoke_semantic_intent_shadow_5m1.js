const {
    classifySemanticIntent
} = require("../src/services/conversation-intent-classifier.service");
const {
    classifyConversationAct
} = require("../src/services/booking-conversation-act.service");

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function makeDraft(overrides = {}) {
    return {
        testType: "Chức năng thận",
        selectedPackage: {
            code: "KIDNEY_FUNCTION",
            name: "Chức năng thận"
        },
        packageConfirmed: true,
        appointmentDate: "2026-08-20",
        appointmentTime: "07:30",
        address: "12 Nguyễn Trãi, phường Bến Thành, Quận 1, TP Hồ Chí Minh",
        patientName: "Smoke Semantic",
        phoneNumber: "0900000001",
        ...overrides
    };
}

function makeSession(overrides = {}) {
    return {
        currentFlow: "booking",
        status: "ready_for_confirmation",
        pendingDraftEdit: null,
        pendingDraftCancel: null,
        ...overrides
    };
}

function validateContract(result, label) {
    assert(result && typeof result === "object", `${label}: classifier returned null`);
    assert(typeof result.intentGroup === "string", `${label}: missing intentGroup`);
    assert(typeof result.conversationAct === "string", `${label}: missing conversationAct`);
    assert(typeof result.confidence === "number", `${label}: missing confidence`);
    assert(result.confidence >= 0 && result.confidence <= 1, `${label}: invalid confidence`);
    assert(result.target && typeof result.target.type === "string", `${label}: missing target`);
    assert(typeof result.shouldMutateDraft === "boolean", `${label}: missing shouldMutateDraft`);
    assert(typeof result.requiresClarification === "boolean", `${label}: missing requiresClarification`);
    assert(typeof result.safetyDecision === "string", `${label}: missing safetyDecision`);
    assert(typeof result.reason === "string", `${label}: missing reason`);
    assert(result.evidence && typeof result.evidence === "object", `${label}: missing evidence`);
}

function runCase(testCase) {
    const beforeDraft = clone(testCase.draft);
    const result = classifySemanticIntent({
        message: testCase.message,
        sessionContext: testCase.session,
        draft: testCase.draft,
        lastBotAction: testCase.lastBotAction || testCase.session.status,
        domainContext: {
            missingFields: testCase.missingFields,
            nextExpectedField: testCase.missingFields[0] || null,
            selectedPackage: testCase.draft.selectedPackage || null,
            pendingDraftEdit: testCase.session.pendingDraftEdit || null,
            pendingDraftCancel: testCase.session.pendingDraftCancel || null
        }
    });
    const rule = classifyConversationAct({
        message: testCase.message,
        session: testCase.session,
        draft: testCase.draft,
        missingFields: testCase.missingFields
    });

    validateContract(result, testCase.label);
    assert(
        JSON.stringify(testCase.draft) === JSON.stringify(beforeDraft),
        `${testCase.label}: classifier mutated draft`
    );

    testCase.expect(result, rule);

    const match = result.safetyDecision === "block_mutation"
        ? false
        : rule.act === result.conversationAct;

    return {
        label: testCase.label,
        message: testCase.message,
        ruleAct: rule.act,
        semanticAct: result.conversationAct,
        semanticIntentGroup: result.intentGroup,
        match,
        disagreementReason: match
            ? null
            : result.safetyDecision === "block_mutation"
                ? "semantic_shadow_safety_block_differs_from_rule"
                : `rule_${rule.act}_semantic_${result.conversationAct}`
    };
}

async function main() {
    const readyDraft = makeDraft();
    const readySession = makeSession({ bookingDraft: readyDraft });
    const missingNameDraft = makeDraft({ patientName: null });
    const missingNameSession = makeSession({
        status: "collecting_info",
        bookingDraft: missingNameDraft
    });

    const cases = [
        {
            label: "A_natural_cancel_current_draft",
            message: "Tôi không muốn khám nữa bỏ lịch giúp tôi",
            session: readySession,
            draft: readyDraft,
            missingFields: [],
            expect: (result) => {
                assert(result.conversationAct === "cancel_or_abort", "A: expected cancel_or_abort");
                assert(result.target.type === "current_booking_draft", "A: expected current draft target");
                assert(result.requiresClarification === true, "A: expected clarification");
                assert(result.shouldMutateDraft === false, "A: should not mutate");
            }
        },
        {
            label: "B_short_cancel_natural",
            message: "Thôi khỏi đặt nữa",
            session: readySession,
            draft: readyDraft,
            missingFields: [],
            expect: (result) => {
                assert(result.conversationAct === "cancel_or_abort", "B: expected cancel_or_abort");
            }
        },
        {
            label: "C_pause_ask_again",
            message: "Để tôi hỏi lại đã",
            session: readySession,
            draft: readyDraft,
            missingFields: [],
            expect: (result) => {
                assert(result.conversationAct === "pause_or_hold", "C: expected pause_or_hold");
            }
        },
        {
            label: "D_package_info_detour",
            message: "Cái này là sao, gói chức năng thận có ý nghĩa gì?",
            session: readySession,
            draft: readyDraft,
            missingFields: [],
            expect: (result) => {
                assert(result.conversationAct === "info_detour", "D: expected info_detour");
                assert(result.target.type === "package", "D: expected package target");
            }
        },
        {
            label: "E_confirm_but_edit_time",
            message: "xác nhận nhưng đổi sang 8h",
            session: readySession,
            draft: readyDraft,
            missingFields: [],
            expect: (result) => {
                assert(result.conversationAct === "edit_request", "E: expected edit_request priority");
                assert(result.conversationAct !== "final_confirm", "E: must not be final_confirm");
            }
        },
        {
            label: "F_review_draft",
            message: "cho tôi xem lại thông tin",
            session: readySession,
            draft: readyDraft,
            missingFields: [],
            expect: (result) => {
                assert(result.conversationAct === "review_draft", "F: expected review_draft");
            }
        },
        {
            label: "G_help_next_step",
            message: "giờ tôi cần làm gì",
            session: readySession,
            draft: readyDraft,
            missingFields: [],
            expect: (result) => {
                assert(result.conversationAct === "help_next_step", "G: expected help_next_step");
            }
        },
        {
            label: "H_bot_asks_name_user_pauses",
            message: "để tôi xem đã",
            session: missingNameSession,
            draft: missingNameDraft,
            missingFields: ["patientName"],
            lastBotAction: "ask_patientName",
            expect: (result) => {
                assert(
                    ["pause_or_hold", "unclear"].includes(result.conversationAct),
                    "H: expected pause_or_hold or unclear"
                );
                assert(result.conversationAct !== "field_value", "H: must not be field_value");
                assert(result.target.field !== "patientName", "H: must not target patientName as value");
            }
        },
        {
            label: "I_ready_draft_final_confirm",
            message: "xác nhận đặt lịch",
            session: readySession,
            draft: readyDraft,
            missingFields: [],
            expect: (result) => {
                assert(result.conversationAct === "final_confirm", "I: expected final_confirm");
                assert(result.confidence >= 0.9, "I: expected high confidence");
            }
        },
        {
            label: "J_urgent_health_blocks_mutation",
            message: "đau ngực khó thở vã mồ hôi",
            session: readySession,
            draft: readyDraft,
            missingFields: [],
            expect: (result) => {
                assert(result.intentGroup === "urgent_health", "J: expected urgent_health");
                assert(result.safetyDecision === "block_mutation", "J: expected block_mutation");
                assert(result.shouldMutateDraft === false, "J: should not mutate");
            }
        }
    ];

    const summaries = cases.map(runCase);
    const disagreements = summaries.filter((item) => !item.match);

    console.log("5M-1 semantic intent shadow smoke passed");
    console.table(summaries);

    if (disagreements.length > 0) {
        console.log("Rule vs semantic disagreements:");
        console.table(disagreements.map((item) => ({
            label: item.label,
            ruleAct: item.ruleAct,
            semanticAct: item.semanticAct,
            reason: item.disagreementReason
        })));
    } else {
        console.log("Rule vs semantic disagreements: none");
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
