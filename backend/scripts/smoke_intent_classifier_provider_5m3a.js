const {
    classifySemanticIntent,
    buildIntentClassifierPrompt,
    parseLlmIntentOutput,
    validateIntentClassifierOutput,
    normalizeIntentClassifierOutput,
    PROVIDERS
} = require("../src/services/conversation-intent-classifier.service");

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
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

function makeInput(message, overrides = {}) {
    const draft = overrides.draft || makeDraft();
    const missingFields = overrides.missingFields || [];

    return {
        message,
        sessionContext: {
            currentFlow: "booking",
            status: missingFields.length ? "collecting_info" : "ready_for_confirmation",
            bookingDraft: draft,
            pendingDraftEdit: null,
            pendingDraftCancel: null,
            ...(overrides.sessionContext || {})
        },
        draft,
        lastBotAction: overrides.lastBotAction || null,
        domainContext: {
            missingFields,
            nextExpectedField: missingFields[0] || null,
            selectedPackage: draft.selectedPackage || null,
            ...(overrides.domainContext || {})
        },
        ruleAct: overrides.ruleAct || null
    };
}

function assertContract(result, label) {
    assert(result && typeof result === "object", `${label}: result missing`);
    assert(typeof result.intentGroup === "string", `${label}: intentGroup missing`);
    assert(typeof result.conversationAct === "string", `${label}: conversationAct missing`);
    assert(typeof result.confidence === "number", `${label}: confidence missing`);
    assert(result.confidence >= 0 && result.confidence <= 1, `${label}: confidence out of range`);
    assert(result.target && typeof result.target.type === "string", `${label}: target missing`);
    assert(typeof result.shouldMutateDraft === "boolean", `${label}: shouldMutateDraft missing`);
    assert(typeof result.requiresClarification === "boolean", `${label}: requiresClarification missing`);
    assert(typeof result.safetyDecision === "string", `${label}: safetyDecision missing`);
    assert(typeof result.reason === "string", `${label}: reason missing`);
    assert(result.evidence && typeof result.evidence === "object", `${label}: evidence missing`);
}

function fullOutput(overrides = {}) {
    return {
        intentGroup: "booking",
        conversationAct: "help_next_step",
        confidence: 0.7,
        target: { type: "current_booking_draft" },
        shouldMutateDraft: false,
        requiresClarification: false,
        safetyDecision: "allow_read_only",
        reason: "smoke",
        evidence: { provider: "smoke" },
        ...overrides
    };
}

async function main() {
    const summaries = [];

    const deterministic = classifySemanticIntent(makeInput("giờ tôi cần làm gì"));
    assertContract(deterministic, "A");
    assert(deterministic.evidence.provider === PROVIDERS.DETERMINISTIC_STUB, "A: deterministic provider changed");
    summaries.push({ case: "A", result: "deterministic contract ok" });

    const prompt = buildIntentClassifierPrompt(makeInput("xác nhận đặt lịch"));
    for (const token of [
        "Return JSON only",
        "intentGroup",
        "conversationAct",
        "safetyDecision",
        "target",
        "urgent_health",
        "allow_guarded_mutation",
        "current_booking_draft"
    ]) {
        assert(prompt.includes(token), `B: prompt missing ${token}`);
    }
    summaries.push({ case: "B", result: "prompt schema ok" });

    const parsed = parseLlmIntentOutput(JSON.stringify(fullOutput({
        conversationAct: "review_draft",
        evidence: { provider: "llm_shadow_provider_disabled" }
    })));
    assert(parsed?.conversationAct === "review_draft", "C: parser did not read JSON");
    summaries.push({ case: "C", result: "parser valid JSON ok" });

    const malformedParsed = parseLlmIntentOutput("not json at all");
    assert(malformedParsed === null, "D: parser should return null for non JSON");
    summaries.push({ case: "D", result: "parser malformed safe" });

    const highConfidence = normalizeIntentClassifierOutput(fullOutput({ confidence: 7 }), {
        provider: "smoke"
    });
    const lowConfidence = normalizeIntentClassifierOutput(fullOutput({ confidence: -4 }), {
        provider: "smoke"
    });
    assert(highConfidence.confidence === 1, "E: high confidence not clamped");
    assert(lowConfidence.confidence === 0, "E: low confidence not clamped");
    summaries.push({ case: "E", result: "confidence clamp ok" });

    const urgent = normalizeIntentClassifierOutput(fullOutput({
        intentGroup: "urgent_health",
        conversationAct: "field_value",
        target: { type: "medical_topic" },
        shouldMutateDraft: true,
        safetyDecision: "allow_guarded_mutation"
    }), { provider: "smoke" });
    assert(urgent.shouldMutateDraft === false, "F: urgent mutation not blocked");
    assert(urgent.safetyDecision === "block_mutation", "F: urgent safety not blocked");
    summaries.push({ case: "F", result: "urgent mutation blocked" });

    for (const act of ["cancel_or_abort", "edit_request", "info_detour", "pause_or_hold"]) {
        const normalized = normalizeIntentClassifierOutput(fullOutput({
            conversationAct: act,
            shouldMutateDraft: true,
            safetyDecision: "allow_guarded_mutation"
        }), { provider: "smoke" });
        assert(normalized.shouldMutateDraft === false, `G: ${act} mutation not blocked`);
    }
    summaries.push({ case: "G", result: "read-only acts blocked mutation" });

    const finalConfirm = normalizeIntentClassifierOutput(fullOutput({
        conversationAct: "final_confirm",
        confidence: 0.95,
        shouldMutateDraft: true,
        safetyDecision: "allow_guarded_mutation"
    }), { provider: "smoke" });
    assert(finalConfirm.conversationAct === "final_confirm", "H: final_confirm changed");
    assert(finalConfirm.shouldMutateDraft === false, "H: shadow final_confirm must not mutate draft");
    summaries.push({ case: "H", result: "final_confirm shadow only" });

    const invalidValidation = validateIntentClassifierOutput({
        conversationAct: "not_real"
    });
    assert(invalidValidation.valid === false, "I: malformed output should be invalid");
    const invalidNormalized = normalizeIntentClassifierOutput({ conversationAct: "not_real" }, {
        provider: "smoke"
    });
    assert(invalidNormalized === null, "I: malformed normalization should return null");
    summaries.push({ case: "I", result: "malformed output safe" });

    const mainCases = [
        ["cancel_or_abort", "Tôi không muốn khám nữa bỏ lịch giúp tôi"],
        ["pause_or_hold", "Để tôi hỏi lại đã"],
        ["info_detour", "Cái này là sao, gói chức năng thận có ý nghĩa gì?"],
        ["edit_request", "xác nhận nhưng đổi sang 8h"],
        ["final_confirm", "xác nhận đặt lịch"],
        ["urgent_health", "đau ngực khó thở vã mồ hôi"]
    ];
    for (const [expected, message] of mainCases) {
        const result = classifySemanticIntent(makeInput(message));
        assertContract(result, `J_${expected}`);
        if (expected === "urgent_health") {
            assert(result.intentGroup === "urgent_health", "J: urgent intentGroup failed");
            assert(result.safetyDecision === "block_mutation", "J: urgent safety failed");
        } else {
            assert(result.conversationAct === expected, `J: expected ${expected}, got ${result.conversationAct}`);
        }
    }
    summaries.push({ case: "J", result: "5M main cases ok" });

    console.log("5M-3A intent classifier provider smoke passed");
    console.table(summaries);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
