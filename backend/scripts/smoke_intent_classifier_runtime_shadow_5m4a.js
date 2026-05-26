const path = require("path");

const bookingRuntime = require("../src/services/booking-runtime/booking.service");
const mockSessions = require("../src/data/mockSessions");
const packageCatalog = require("../src/services/booking-package-catalog.service");
const classifierService = require("../src/services/conversation-intent-classifier.service");
const { PROVIDERS } = classifierService;
const defaultClassifySemanticIntentAsync = classifierService.classifySemanticIntentAsync;

const bookingServicePath = path.resolve(__dirname, "../src/services/booking.service.js");

bookingRuntime.saveOrUpdateDraft = async () => ({ id: "mock-draft" });
bookingRuntime.clearDraft = async () => ({ count: 1 });
bookingRuntime.createConfirmedBooking = async (payload, options = {}) => {
    bookingRuntime.__createdCount = (bookingRuntime.__createdCount || 0) + 1;

    return {
        id: "mock-booking",
        bookingCode: `HLB-20260526-${String(options.sessionId || "MOCK").slice(-4).toUpperCase()}`,
        status: "CONFIRMED",
        testTypeText: payload.testTypeText,
        sampleDate: payload.sampleDate,
        sampleTimeStart: payload.sampleTimeStart,
        address: payload.address,
        patientName: payload.patientName,
        phone: payload.phone
    };
};

packageCatalog.resolvePackageIntent = async () => ({ type: "none", package: null, candidates: [] });

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function uniqueId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeReadyDraft(overrides = {}) {
    return {
        testType: "Tổng phân tích máu",
        appointmentDate: "2026-08-20",
        appointmentTime: "07:30",
        address: "12 Nguyễn Trãi, Quận 1, TP Hồ Chí Minh",
        patientName: "Smoke Runtime",
        phoneNumber: "0900000001",
        ...overrides
    };
}

function seedSession(sessionId, draft, status = "ready_for_confirmation") {
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

function loadBookingService({ asyncClassifier } = {}) {
    classifierService.classifySemanticIntentAsync = asyncClassifier ||
        defaultClassifySemanticIntentAsync;
    delete require.cache[bookingServicePath];
    return require(bookingServicePath);
}

async function runBookingCase({
    label,
    message,
    draft = makeReadyDraft(),
    status,
    asyncClassifier,
    env
}) {
    const sessionId = uniqueId(label);
    seedSession(sessionId, draft, status);

    const service = loadBookingService({ asyncClassifier });
    const beforeCreatedCount = bookingRuntime.__createdCount || 0;
    const data = await withEnv(env || {}, () => service.handleBookingMessage({
        message,
        sessionId,
        userSession: { phone: "0900000001" }
    }));

    assert(data.meta?.conversationAct, `${label}: missing conversationAct meta`);
    return {
        data,
        actMeta: data.meta.conversationAct,
        beforeCreatedCount,
        session: mockSessions.getSession(sessionId)
    };
}

function makeMockShadow(overrides = {}) {
    return {
        intentGroup: "booking",
        conversationAct: "pause_or_hold",
        confidence: 0.91,
        target: { type: "current_booking_draft" },
        shouldMutateDraft: false,
        requiresClarification: false,
        safetyDecision: "allow_read_only",
        reason: "mock_async_shadow",
        provider: "mock_async_shadow",
        evidence: { provider: "mock_async_shadow" },
        ...overrides
    };
}

async function main() {
    const summaries = [];
    const originalAsync = defaultClassifySemanticIntentAsync;

    try {
        let asyncCalls = 0;
        const flagOff = await runBookingCase({
            label: "A_flag_off",
            message: "giờ tôi cần làm gì",
            env: {
                HOMELAB_INTENT_CLASSIFIER_SHADOW_ASYNC_ENABLED: undefined,
                HOMELAB_INTENT_CLASSIFIER_PROVIDER: PROVIDERS.DETERMINISTIC_STUB
            },
            asyncClassifier: async () => {
                asyncCalls += 1;
                throw new Error("async classifier must not run when flag is off");
            }
        });
        assert(asyncCalls === 0, "A: async provider was called while flag is off");
        assert(flagOff.actMeta.shadowAsyncEnabled === false, "A: shadowAsyncEnabled should be false");
        assert(flagOff.actMeta.semanticShadow?.conversationAct, "A: deterministic semanticShadow missing");
        assert(flagOff.actMeta.rule.act === "help_next_step", "A: rule behavior changed");
        summaries.push({ case: "A", result: "flag off uses sync deterministic shadow" });

        asyncCalls = 0;
        const flagOnDeterministic = await runBookingCase({
            label: "B_flag_on_deterministic",
            message: "xem lại thông tin giúp tôi",
            env: {
                HOMELAB_INTENT_CLASSIFIER_SHADOW_ASYNC_ENABLED: "true",
                HOMELAB_INTENT_CLASSIFIER_PROVIDER: PROVIDERS.DETERMINISTIC_STUB
            },
            asyncClassifier: async (input) => {
                asyncCalls += 1;
                return originalAsync(input, { providerName: PROVIDERS.DETERMINISTIC_STUB });
            }
        });
        assert(asyncCalls === 1, "B: async path was not called");
        assert(flagOnDeterministic.actMeta.shadowAsyncEnabled === true, "B: async meta missing");
        assert(flagOnDeterministic.actMeta.semanticShadow.evidence.provider === PROVIDERS.DETERMINISTIC_STUB, "B: wrong provider");
        assert(flagOnDeterministic.actMeta.rule.act === "review_draft", "B: rule behavior changed");
        summaries.push({ case: "B", result: "flag on deterministic async shadow ok" });

        const ollamaUnavailable = await runBookingCase({
            label: "C_ollama_unavailable",
            message: "xác nhận đặt lịch",
            env: {
                HOMELAB_INTENT_CLASSIFIER_SHADOW_ASYNC_ENABLED: "true",
                HOMELAB_INTENT_CLASSIFIER_PROVIDER: PROVIDERS.OLLAMA_SHADOW,
                HOMELAB_OLLAMA_BASE_URL: "http://127.0.0.1:1",
                HOMELAB_INTENT_CLASSIFIER_MODEL: "qwen2.5:3b",
                HOMELAB_INTENT_CLASSIFIER_TIMEOUT_MS: "500"
            }
        });
        assert(
            ollamaUnavailable.actMeta.semanticShadow?.fallbackReason === "provider_connection_failed_fallback_deterministic",
            "C: ollama unavailable fallbackReason not surfaced"
        );
        assert(ollamaUnavailable.data.action === "BOOKING_CREATED", "C: rule final confirm should still create booking");
        summaries.push({ case: "C", result: "ollama_shadow unavailable falls back without crash" });

        asyncCalls = 0;
        const mockValid = await runBookingCase({
            label: "D_mock_valid",
            message: "xác nhận đặt lịch",
            env: {
                HOMELAB_INTENT_CLASSIFIER_SHADOW_ASYNC_ENABLED: "true",
                HOMELAB_INTENT_CLASSIFIER_PROVIDER: PROVIDERS.DETERMINISTIC_STUB
            },
            asyncClassifier: async () => {
                asyncCalls += 1;
                return makeMockShadow({ conversationAct: "pause_or_hold" });
            }
        });
        assert(asyncCalls === 1, "D: mock async provider was not called");
        assert(mockValid.actMeta.semanticShadow.provider === "mock_async_shadow", "D: mock provider not surfaced");
        assert(mockValid.actMeta.rule.act === "final_confirm", "D: rule act changed");
        assert(mockValid.data.action === "BOOKING_CREATED", "D: semantic shadow changed primary response");
        summaries.push({ case: "D", result: "mock async output is meta-only" });

        const disagreement = await runBookingCase({
            label: "E_disagreement",
            message: "Nguyễn Văn A",
            draft: makeReadyDraft({ patientName: null }),
            status: "collecting_info",
            env: {
                HOMELAB_INTENT_CLASSIFIER_SHADOW_ASYNC_ENABLED: "true",
                HOMELAB_INTENT_CLASSIFIER_PROVIDER: PROVIDERS.DETERMINISTIC_STUB
            },
            asyncClassifier: async () => makeMockShadow({ conversationAct: "pause_or_hold" })
        });
        assert(disagreement.actMeta.rule.act === "field_value", "E: rule should collect field value");
        assert(disagreement.actMeta.semanticShadow.conversationAct === "pause_or_hold", "E: semantic shadow mismatch");
        assert(disagreement.actMeta.match === false, "E: expected disagreement");
        assert(disagreement.session.bookingDraft.patientName === "Nguyễn Văn A", "E: rule field mutation did not happen");
        summaries.push({ case: "E", result: "disagreement is visible while rule behavior wins" });

        const urgentShadow = await runBookingCase({
            label: "F_urgent_shadow",
            message: "giờ tôi cần làm gì",
            env: {
                HOMELAB_INTENT_CLASSIFIER_SHADOW_ASYNC_ENABLED: "true",
                HOMELAB_INTENT_CLASSIFIER_PROVIDER: PROVIDERS.DETERMINISTIC_STUB
            },
            asyncClassifier: async () => makeMockShadow({
                intentGroup: "urgent_health",
                conversationAct: "unclear",
                safetyDecision: "block_mutation",
                reason: "mock_urgent_shadow"
            })
        });
        assert(urgentShadow.actMeta.semanticShadow.intentGroup === "urgent_health", "F: urgent shadow not surfaced");
        assert(urgentShadow.actMeta.semanticShadow.safetyDecision === "block_mutation", "F: block_mutation missing");
        assert(urgentShadow.actMeta.rule.act === "help_next_step", "F: rule act changed");
        assert(bookingRuntime.__createdCount === urgentShadow.beforeCreatedCount, "F: booking mutation should not occur");
        summaries.push({ case: "F", result: "urgent shadow stays metadata-only" });
    } finally {
        classifierService.classifySemanticIntentAsync = originalAsync;
        delete require.cache[bookingServicePath];
    }

    console.log("5M-4A runtime async semantic shadow smoke passed");
    console.table(summaries);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
