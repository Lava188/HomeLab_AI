const path = require("path");

const bookingRuntime = require("../src/services/booking-runtime/booking.service");
const mockSessions = require("../src/data/mockSessions");
const classifierService = require("../src/services/conversation-intent-classifier.service");
const ollamaProvider = require("../src/services/intent-classifier/ollama-intent.provider");
const { PROVIDERS } = classifierService;
const defaultClassifySemanticIntentAsync = classifierService.classifySemanticIntentAsync;

const bookingServicePath = path.resolve(__dirname, "../src/services/booking.service.js");

bookingRuntime.__createdCount = 0;
bookingRuntime.__clearedCount = 0;
bookingRuntime.saveOrUpdateDraft = async () => ({ id: "mock-draft" });
bookingRuntime.clearDraft = async () => {
    bookingRuntime.__clearedCount += 1;
    return { count: 1 };
};
bookingRuntime.createConfirmedBooking = async () => {
    bookingRuntime.__createdCount += 1;
    return {
        id: "mock-booking",
        bookingCode: "HLB-OLLAMA",
        status: "CONFIRMED"
    };
};

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
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

function makeDraft() {
    return {
        testType: "Chức năng thận",
        testCatalogItemId: "pkg-kidney",
        selectedPackage: {
            id: "pkg-kidney",
            code: "KIDNEY_FUNCTION",
            name: "Chức năng thận",
            description: "Đánh giá chức năng lọc thận ở mức thông tin chung.",
            components: ["Creatinine", "eGFR"],
            suitableFor: "Đánh giá chức năng lọc thận ở mức thông tin chung.",
            preparationNotes: ["Kết quả cần đọc cùng bác sĩ/nhân viên y tế."]
        },
        packageConfirmed: true,
        appointmentDate: "2026-08-20",
        appointmentTime: "07:30",
        address: "12 Nguyễn Trãi, Quận 1, TP Hồ Chí Minh",
        addressPartial: null,
        patientName: "Smoke Ollama",
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

function llmOutput(overrides = {}) {
    return {
        intentGroup: "booking",
        conversationAct: "review_draft",
        confidence: 0.9,
        target: { type: "current_booking_draft" },
        shouldMutateDraft: false,
        requiresClarification: false,
        safetyDecision: "allow_read_only",
        reason: "ollama_smoke",
        evidence: { signal: "mock_ollama_json" },
        ...overrides
    };
}

function mockFetchJson(output) {
    return async () => ({
        ok: true,
        status: 200,
        json: async () => ({
            response: typeof output === "string" ? output : JSON.stringify(output),
            done: true
        })
    });
}

async function classifyWithMockFetch(message, fetchImpl) {
    return classifierService.classifySemanticIntentAsync(makeInput(message), {
        providerName: PROVIDERS.OLLAMA_SHADOW,
        timeoutMs: 1000,
        provider: {
            classify: (input) => ollamaProvider.classify(input, {
                fetchImpl,
                baseUrl: "http://127.0.0.1:11434",
                model: "qwen2.5:3b",
                timeoutMs: 1000
            })
        }
    });
}

function seedSession(sessionId, draft) {
    mockSessions.clearSession(sessionId);
    mockSessions.upsertSession(sessionId, {
        currentFlow: "booking",
        status: "collecting_info",
        bookingDraft: clone(draft),
        confirmedBookingId: null,
        lastBookingFailure: null,
        pendingDraftEdit: null,
        pendingDraftCancel: null
    });
}

function withEnv(values, fn) {
    const previous = {};

    for (const [key, value] of Object.entries(values)) {
        previous[key] = process.env[key];
        if (value === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = value;
        }
    }

    return Promise.resolve()
        .then(fn)
        .finally(() => {
            for (const [key, value] of Object.entries(previous)) {
                if (value === undefined) {
                    delete process.env[key];
                } else {
                    process.env[key] = value;
                }
            }
        });
}

async function runBookingSemanticOnlyCase(conversationAct) {
    const sessionId = `ollama_semantic_${conversationAct}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const draft = makeDraft();
    seedSession(sessionId, draft);

    classifierService.classifySemanticIntentAsync = async () => ({
        ...llmOutput({
            conversationAct,
            confidence: 0.95,
            safetyDecision: conversationAct === "final_confirm"
                ? "ask_confirmation"
                : "block_mutation"
        }),
        provider: PROVIDERS.OLLAMA_SHADOW,
        providerUsed: PROVIDERS.OLLAMA_SHADOW,
        evidence: {
            provider: PROVIDERS.OLLAMA_SHADOW,
            providerUsed: PROVIDERS.OLLAMA_SHADOW,
            requestShape: "ollama_generate"
        }
    });
    delete require.cache[bookingServicePath];
    const bookingService = require(bookingServicePath);
    const beforeCreated = bookingRuntime.__createdCount;
    const beforeCleared = bookingRuntime.__clearedCount;

    const data = await withEnv({
        HOMELAB_INTENT_CLASSIFIER_SHADOW_ASYNC_ENABLED: "true",
        HOMELAB_INTENT_CLASSIFIER_PROVIDER: PROVIDERS.OLLAMA_SHADOW
    }, () => bookingService.handleBookingMessage({
        sessionId,
        message: "hmm",
        userSession: { phone: "0900000001" }
    }));
    const session = mockSessions.getSession(sessionId);

    assert(data.meta?.conversationAct?.semanticShadow?.conversationAct === conversationAct, `E/${conversationAct}: semantic shadow missing`);
    assert(data.meta.conversationAct.semanticAssist.enabled === false, `E/${conversationAct}: assist must be blocked`);
    assert(bookingRuntime.__createdCount === beforeCreated, `E/${conversationAct}: must not create booking`);
    assert(bookingRuntime.__clearedCount === beforeCleared, `E/${conversationAct}: must not clear draft`);
    assert(stableStringify(session.bookingDraft) === stableStringify(draft), `E/${conversationAct}: draft mutated`);

    return data.meta.conversationAct.semanticAssist.blockedReason || data.meta.conversationAct.semanticAssist.reason;
}

async function main() {
    const summaries = [];

    try {
        const unavailable = await withEnv({
            HOMELAB_OLLAMA_BASE_URL: "http://127.0.0.1:1",
            HOMELAB_INTENT_CLASSIFIER_MODEL: "qwen2.5:3b",
            HOMELAB_INTENT_CLASSIFIER_TIMEOUT_MS: "500"
        }, () => classifierService.classifySemanticIntentAsync(makeInput("giờ tôi cần làm gì"), {
            providerName: PROVIDERS.OLLAMA_SHADOW,
            timeoutMs: 1000
        }));
        assert(unavailable.fallbackReason === "provider_connection_failed_fallback_deterministic", "A: wrong unavailable fallbackReason");
        assert(unavailable.evidence.provider === PROVIDERS.DETERMINISTIC_STUB, "A: fallback should use deterministic output");
        summaries.push({ case: "A", result: "ollama unavailable falls back deterministic" });

        const valid = await classifyWithMockFetch("cho tôi xem lại thông tin", mockFetchJson(llmOutput({
            conversationAct: "review_draft",
            confidence: 1.4
        })));
        assert(valid.providerUsed === PROVIDERS.OLLAMA_SHADOW, "B: providerUsed not surfaced");
        assert(valid.conversationAct === "review_draft", "B: conversationAct changed");
        assert(valid.confidence === 1, "B: confidence not normalized");
        summaries.push({ case: "B", result: "valid ollama-like JSON normalizes" });

        const malformed = await classifyWithMockFetch("giờ tôi cần làm gì", mockFetchJson("not json"));
        assert(malformed.fallbackReason === "provider_malformed_output_fallback_deterministic", "C: wrong malformed fallbackReason");
        assert(malformed.evidence.provider === PROVIDERS.DETERMINISTIC_STUB, "C: malformed should fallback deterministic");
        summaries.push({ case: "C", result: "malformed output falls back deterministic" });

        const urgent = await classifyWithMockFetch("Tôi đau ngực khó thở vã mồ hôi", mockFetchJson(llmOutput({
            intentGroup: "urgent_health",
            conversationAct: "unclear",
            confidence: 0.97,
            safetyDecision: "block_mutation",
            shouldMutateDraft: true
        })));
        assert(urgent.intentGroup === "urgent_health", "D: urgent intent not preserved");
        assert(urgent.safetyDecision === "block_mutation", "D: urgent safety not blocked");
        assert(urgent.shouldMutateDraft === false, "D: urgent must not mutate");
        summaries.push({ case: "D", result: "urgent_health blocks mutation" });

        const blockedActs = [];
        for (const act of ["final_confirm", "edit_request", "cancel_or_abort"]) {
            blockedActs.push({ act, blockedReason: await runBookingSemanticOnlyCase(act) });
        }
        summaries.push({ case: "E", result: "semantic final/edit/cancel do not mutate booking", blockedActs });

        console.log(JSON.stringify({
            ok: true,
            script: "smoke_ollama_intent_provider_5m5b",
            summaries
        }, null, 2));
    } finally {
        classifierService.classifySemanticIntentAsync = defaultClassifySemanticIntentAsync;
        delete require.cache[bookingServicePath];
    }
}

main().catch((error) => {
    console.error(JSON.stringify({
        ok: false,
        script: "smoke_ollama_intent_provider_5m5b",
        error: error.message,
        stack: error.stack
    }, null, 2));
    process.exit(1);
});
