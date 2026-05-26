const path = require("path");

const bookingRuntime = require("../src/services/booking-runtime/booking.service");
const mockSessions = require("../src/data/mockSessions");
const packageCatalog = require("../src/services/booking-package-catalog.service");
const classifierService = require("../src/services/conversation-intent-classifier.service");
const { PROVIDERS } = classifierService;
const defaultClassifySemanticIntentAsync = classifierService.classifySemanticIntentAsync;

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
        bookingCode: "HLB-5M5A",
        status: "CONFIRMED"
    };
};

packageCatalog.resolvePackageIntent = async (message = "") => {
    if (String(message).toLowerCase().includes("thận") || String(message).toLowerCase().includes("than")) {
        return {
            type: "detail_question",
            package: makeKidneyPackage(),
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

function makeKidneyPackage() {
    return {
        id: "pkg-kidney",
        code: "KIDNEY_FUNCTION",
        name: "Chức năng thận",
        description: "Đánh giá chức năng lọc thận ở mức thông tin chung.",
        category: "Biochemistry",
        sampleType: "Blood",
        components: ["Creatinine", "eGFR"],
        suitableFor: "Đánh giá chức năng lọc thận ở mức thông tin chung.",
        preparationNotes: ["Kết quả cần đọc cùng bác sĩ/nhân viên y tế."]
    };
}

function makeReadyDraft(overrides = {}) {
    return {
        testType: "Chức năng thận",
        testCatalogItemId: "pkg-kidney",
        selectedPackage: makeKidneyPackage(),
        packageConfirmed: true,
        appointmentDate: "2026-08-20",
        appointmentTime: "07:30",
        address: "12 Nguyễn Trãi, Quận 1, TP Hồ Chí Minh",
        addressPartial: null,
        patientName: "Smoke Semantic",
        phoneNumber: "0900000001",
        ...overrides
    };
}

function makePartialDraft() {
    const draft = makeReadyDraft({
        address: null,
        patientName: null
    });

    return draft;
}

function makeOllamaShadow(overrides = {}) {
    return {
        intentGroup: "booking",
        conversationAct: "pause_or_hold",
        confidence: 0.9,
        target: { type: "current_booking_draft" },
        shouldMutateDraft: false,
        requiresClarification: false,
        safetyDecision: "allow_read_only",
        reason: "mock_ollama_shadow_5m5a",
        providerUsed: PROVIDERS.OLLAMA_SHADOW,
        provider: PROVIDERS.OLLAMA_SHADOW,
        evidence: { provider: PROVIDERS.OLLAMA_SHADOW },
        fallbackReason: null,
        ...overrides
    };
}

function seedSession(sessionId, draft, status = "collecting_info") {
    mockSessions.clearSession(sessionId);
    mockSessions.upsertSession(sessionId, {
        currentFlow: "booking",
        status,
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

function loadBookingService(asyncClassifier) {
    classifierService.classifySemanticIntentAsync = asyncClassifier;
    delete require.cache[bookingServicePath];
    return require(bookingServicePath);
}

async function runCase({ label, message, draft = makeReadyDraft(), shadow, status = "collecting_info" }) {
    const sessionId = uniqueId(label);
    const originalDraft = clone(draft);
    seedSession(sessionId, draft, status);

    const service = loadBookingService(async () => shadow);
    const beforeCreated = bookingRuntime.__createdCount;
    const beforeCleared = bookingRuntime.__clearedCount;
    const beforeSaved = bookingRuntime.__savedCount;

    const data = await withEnv({
        HOMELAB_INTENT_CLASSIFIER_SHADOW_ASYNC_ENABLED: "true",
        HOMELAB_INTENT_CLASSIFIER_PROVIDER: PROVIDERS.OLLAMA_SHADOW
    }, () => service.handleBookingMessage({
        message,
        sessionId,
        userSession: { phone: "0900000001" }
    }));

    const session = mockSessions.getSession(sessionId);
    assert(data.meta?.conversationAct?.rule?.act === "unclear", `${label}: rule must stay unclear`);
    assert(bookingRuntime.__createdCount === beforeCreated, `${label}: must not create booking`);
    assert(bookingRuntime.__clearedCount === beforeCleared, `${label}: must not clear draft`);
    assert(
        stableStringify(session.bookingDraft) === stableStringify(originalDraft),
        `${label}: draft mutated`
    );

    return {
        data,
        assist: data.meta.conversationAct.semanticAssist,
        savedDelta: bookingRuntime.__savedCount - beforeSaved,
        session
    };
}

async function main() {
    const summaries = [];

    try {
        const pause = await runCase({
            label: "A_pause",
            message: "mình lăn tăn thêm chút",
            shadow: makeOllamaShadow({ conversationAct: "pause_or_hold", confidence: 0.9 })
        });
        assert(pause.assist.enabled === true, "A: semantic assist not enabled");
        assert(pause.data.reply.includes("tạm giữ bản nháp"), "A: pause reply missing hold wording");
        assert(pause.savedDelta === 0, "A: should not persist/mutate draft");
        summaries.push({ case: "A", result: "pause_or_hold readonly assist" });

        const help = await runCase({
            label: "B_help",
            message: "...",
            draft: makePartialDraft(),
            shadow: makeOllamaShadow({ conversationAct: "help_next_step" })
        });
        assert(help.assist.enabled === true, "B: semantic assist not enabled");
        assert(help.data.reply.includes("Địa chỉ"), "B: missing address not surfaced");
        assert(help.data.reply.includes("Tên người đặt"), "B: missing patientName not surfaced");
        summaries.push({ case: "B", result: "help_next_step lists missing fields" });

        const review = await runCase({
            label: "C_review",
            message: "ờ để xem",
            shadow: makeOllamaShadow({ conversationAct: "review_draft" })
        });
        assert(review.assist.enabled === true, "C: semantic assist not enabled");
        assert(review.data.reply.includes("Thông tin mình đang giữ"), "C: review reply missing draft summary");
        assert(review.data.reply.includes("Chức năng thận"), "C: review reply missing package");
        summaries.push({ case: "C", result: "review_draft reads draft only" });

        const info = await runCase({
            label: "D_info",
            message: "hmm",
            shadow: makeOllamaShadow({ conversationAct: "info_detour" })
        });
        assert(info.assist.enabled === true, "D: semantic assist not enabled");
        assert(info.data.reply.includes("Chức năng thận"), "D: info reply missing package detail");
        assert(info.data.reply.includes("Creatinine"), "D: info reply missing detail");
        summaries.push({ case: "D", result: "info_detour answers package detail readonly" });

        const finalConfirm = await runCase({
            label: "E_final_confirm_blocked",
            message: "vậy đó",
            shadow: makeOllamaShadow({ conversationAct: "final_confirm", confidence: 0.95 })
        });
        assert(finalConfirm.assist.enabled === false, "E: final_confirm must be blocked");
        assert(finalConfirm.assist.blockedReason?.includes("final_confirm"), "E: blockedReason missing");
        summaries.push({ case: "E", result: "final_confirm blocked" });

        const fieldValue = await runCase({
            label: "F_field_value_blocked",
            message: "vậy đó nha",
            shadow: makeOllamaShadow({
                conversationAct: "field_value",
                targetField: "address",
                targetValue: "99 Test",
                shouldMutateDraft: false
            })
        });
        assert(fieldValue.assist.enabled === false, "F: field_value must be blocked");
        summaries.push({ case: "F", result: "field_value blocked, draft unchanged" });

        const edit = await runCase({
            label: "G_edit_blocked",
            message: "hmm",
            shadow: makeOllamaShadow({
                conversationAct: "edit_request",
                shouldMutateDraft: false
            })
        });
        assert(edit.assist.enabled === false, "G: edit_request must be blocked");
        summaries.push({ case: "G", result: "edit_request blocked, draft unchanged" });

        const cancel = await runCase({
            label: "H_cancel_blocked",
            message: "hmm",
            shadow: makeOllamaShadow({
                conversationAct: "cancel_or_abort",
                safetyDecision: "block_mutation"
            })
        });
        assert(cancel.assist.enabled === false, "H: cancel_or_abort must be blocked");
        summaries.push({ case: "H", result: "cancel_or_abort blocked, draft retained" });

        const fallback = await runCase({
            label: "I_fallback_blocked",
            message: "mình cân nhắc sau",
            shadow: makeOllamaShadow({
                conversationAct: "pause_or_hold",
                fallbackReason: "llm_provider_missing_config_fallback_deterministic"
            })
        });
        assert(fallback.assist.enabled === false, "I: fallback shadow must be disabled");
        assert(fallback.assist.reason === "semantic_shadow_fallback", "I: wrong disabled reason");
        summaries.push({ case: "I", result: "fallbackReason disables assist" });

        const provider = await runCase({
            label: "J_provider_blocked",
            message: "mình cân nhắc thêm",
            shadow: makeOllamaShadow({
                conversationAct: "pause_or_hold",
                providerUsed: "cloud_shadow",
                provider: "cloud_shadow",
                evidence: { provider: "cloud_shadow" }
            })
        });
        assert(provider.assist.enabled === false, "J: non-ollama provider must be disabled");
        assert(provider.assist.reason === "semantic_provider_not_allowed", "J: wrong disabled reason");
        summaries.push({ case: "J", result: "non-ollama provider disables assist" });

        const lowConfidence = await runCase({
            label: "K_low_confidence_blocked",
            message: "mình tính thêm",
            shadow: makeOllamaShadow({
                conversationAct: "pause_or_hold",
                confidence: 0.5
            })
        });
        assert(lowConfidence.assist.enabled === false, "K: low confidence must be disabled");
        assert(lowConfidence.assist.reason === "semantic_confidence_too_low", "K: wrong disabled reason");
        summaries.push({ case: "K", result: "low confidence disables assist" });

        console.log(JSON.stringify({
            ok: true,
            script: "smoke_semantic_readonly_assist_5m5a",
            summaries
        }, null, 2));
    } finally {
        classifierService.classifySemanticIntentAsync = defaultClassifySemanticIntentAsync;
    }
}

main().catch((error) => {
    console.error(JSON.stringify({
        ok: false,
        script: "smoke_semantic_readonly_assist_5m5a",
        error: error.message,
        stack: error.stack
    }, null, 2));
    process.exit(1);
});
