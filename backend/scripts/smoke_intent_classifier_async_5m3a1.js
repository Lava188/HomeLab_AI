const {
    classifySemanticIntent,
    classifySemanticIntentAsync,
    buildIntentClassifierPrompt,
    PROVIDERS
} = require("../src/services/conversation-intent-classifier.service");
const llmProvider = require("../src/services/intent-classifier/llm-intent.provider");

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function makeDraft() {
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
        phoneNumber: "0900000001"
    };
}

function makeInput(message = "giờ tôi cần làm gì") {
    const draft = makeDraft();

    return {
        message,
        sessionContext: {
            currentFlow: "booking",
            status: "ready_for_confirmation",
            bookingDraft: draft
        },
        draft,
        lastBotAction: "ready_for_confirmation",
        domainContext: {
            missingFields: [],
            nextExpectedField: null,
            selectedPackage: draft.selectedPackage
        },
        ruleAct: null
    };
}

function validOutput(overrides = {}) {
    return {
        intentGroup: "booking",
        conversationAct: "review_draft",
        confidence: 0.7,
        target: { type: "current_booking_draft" },
        shouldMutateDraft: false,
        requiresClarification: false,
        safetyDecision: "allow_read_only",
        reason: "async_smoke",
        evidence: { provider: "async_test_provider" },
        provider: "async_test_provider",
        ...overrides
    };
}

function assertContract(result, label) {
    assert(result && typeof result === "object", `${label}: missing result`);
    assert(typeof result.intentGroup === "string", `${label}: missing intentGroup`);
    assert(typeof result.conversationAct === "string", `${label}: missing conversationAct`);
    assert(typeof result.confidence === "number", `${label}: missing confidence`);
    assert(result.confidence >= 0 && result.confidence <= 1, `${label}: confidence out of range`);
    assert(result.target && typeof result.target.type === "string", `${label}: missing target`);
    assert(typeof result.shouldMutateDraft === "boolean", `${label}: missing shouldMutateDraft`);
    assert(typeof result.requiresClarification === "boolean", `${label}: missing requiresClarification`);
    assert(typeof result.safetyDecision === "string", `${label}: missing safetyDecision`);
    assert(typeof result.reason === "string", `${label}: missing reason`);
    assert(result.evidence && typeof result.evidence === "object", `${label}: missing evidence`);
}

async function main() {
    const summaries = [];

    const syncResult = classifySemanticIntent(makeInput("giờ tôi cần làm gì"));
    assertContract(syncResult, "A");
    assert(syncResult.evidence.provider === PROVIDERS.DETERMINISTIC_STUB, "A: sync provider changed");
    summaries.push({ case: "A", result: "sync deterministic ok" });

    const asyncDeterministic = await classifySemanticIntentAsync(makeInput("giờ tôi cần làm gì"));
    assertContract(asyncDeterministic, "B");
    assert(asyncDeterministic.evidence.provider === PROVIDERS.DETERMINISTIC_STUB, "B: async deterministic provider changed");
    summaries.push({ case: "B", result: "async deterministic ok" });

    const asyncValid = await classifySemanticIntentAsync(makeInput("cho tôi xem lại thông tin"), {
        providerName: "async_test_provider",
        provider: {
            classify: async () => validOutput({ confidence: 1.4 })
        }
    });
    assertContract(asyncValid, "C");
    assert(asyncValid.conversationAct === "review_draft", "C: valid async output not used");
    assert(asyncValid.confidence === 1, "C: async output not normalized");
    summaries.push({ case: "C", result: "async valid provider normalized" });

    const asyncTimeout = await classifySemanticIntentAsync(makeInput("giờ tôi cần làm gì"), {
        providerName: "async_test_provider",
        timeoutMs: 20,
        provider: {
            classify: () => new Promise((resolve) => {
                setTimeout(() => resolve(validOutput()), 80);
            })
        }
    });
    assertContract(asyncTimeout, "D");
    assert(asyncTimeout.evidence.provider === PROVIDERS.DETERMINISTIC_STUB, "D: timeout did not fallback deterministic");
    assert(asyncTimeout.fallbackReason === "provider_timeout_fallback_deterministic", "D: timeout fallback reason missing");
    summaries.push({ case: "D", result: "async timeout fallback ok" });

    const asyncThrow = await classifySemanticIntentAsync(makeInput("giờ tôi cần làm gì"), {
        providerName: "async_test_provider",
        provider: {
            classify: async () => {
                throw new Error("boom");
            }
        }
    });
    assertContract(asyncThrow, "E");
    assert(asyncThrow.evidence.provider === PROVIDERS.DETERMINISTIC_STUB, "E: exception did not fallback deterministic");
    assert(asyncThrow.fallbackReason === "provider_exception_fallback_deterministic", "E: exception fallback reason missing");
    summaries.push({ case: "E", result: "async exception fallback ok" });

    const asyncMalformed = await classifySemanticIntentAsync(makeInput("giờ tôi cần làm gì"), {
        providerName: "async_test_provider",
        provider: {
            classify: async () => ({ conversationAct: "not_enough" })
        }
    });
    assertContract(asyncMalformed, "F");
    assert(asyncMalformed.evidence.provider === PROVIDERS.DETERMINISTIC_STUB, "F: malformed did not fallback deterministic");
    assert(asyncMalformed.fallbackReason === "provider_malformed_output_fallback_deterministic", "F: malformed fallback reason missing");
    summaries.push({ case: "F", result: "async malformed fallback ok" });

    const llmDisabled = llmProvider.classify(makeInput("xác nhận đặt lịch"));
    assert(llmDisabled.evidence.providerDisabled === true, "G: providerDisabled missing");
    assert(llmDisabled.evidence.promptBuilt === true, "G: promptBuilt missing");
    assert(typeof llmDisabled.evidence.promptLength === "number", "G: promptLength missing");
    assert(!Object.prototype.hasOwnProperty.call(llmDisabled.evidence, "promptPreview"), "G: promptPreview leaked");
    assert(buildIntentClassifierPrompt(makeInput("xác nhận đặt lịch")).length === llmDisabled.evidence.promptLength, "G: promptLength mismatch");
    summaries.push({ case: "G", result: "llm disabled evidence safe" });

    console.log("5M-3A.1 async intent classifier smoke passed");
    console.table(summaries);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
