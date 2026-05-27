const path = require("path");

const bookingRuntime = require("../src/services/booking-runtime/booking.service");
const availabilitySlotService = require("../src/services/booking-runtime/availability-slot.service");
const mockSessions = require("../src/data/mockSessions");
const packageCatalog = require("../src/services/booking-package-catalog.service");
const classifierService = require("../src/services/conversation-intent-classifier.service");
const { PROVIDERS, CONVERSATION_ACTS } = classifierService;
const {
    isReadOnlySemanticAct,
    isMutationSensitiveAct,
    shouldUseSemanticReadOnly
} = require("../src/services/booking-semantic-arbitration.service");
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
        bookingCode: "HLB-5M10",
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
    if (lower.includes("thận") || lower.includes("than")) {
        return {
            type: "detail_question",
            package: makeKidneyPackage(),
            candidates: []
        };
    }
    if (lower.includes("gan") || lower.includes("men gan")) {
        return {
            type: "detail_question",
            package: makeLiverPackage(),
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

function makeLiverPackage() {
    return {
        id: "pkg-liver",
        code: "LIVER_FUNCTION",
        name: "Chức năng gan",
        description: "Đánh giá men gan và một số chỉ dấu chức năng gan.",
        category: "Biochemistry",
        sampleType: "Blood",
        components: ["ALT", "AST", "GGT", "Bilirubin"],
        suitableFor: "Theo dõi men gan và sức khỏe gan ở mức thông tin chung.",
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
    return makeReadyDraft({
        address: null,
        patientName: null
    });
}

function makeOllamaShadow(overrides = {}) {
    return {
        intentGroup: "booking",
        conversationAct: "info_detour",
        confidence: 0.85,
        target: { type: "current_booking_draft" },
        shouldMutateDraft: false,
        requiresClarification: false,
        safetyDecision: "allow_read_only",
        reason: "mock_ollama_shadow_5m10",
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

async function runCase({
    label,
    message,
    draft = makeReadyDraft(),
    shadow,
    status = "collecting_info",
    expectedRuleAct = null
}) {
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
    const arbitration = data.meta?.semanticArbitration || data.meta?.conversationAct?.semanticArbitration;

    if (expectedRuleAct) {
        assert(data.meta?.conversationAct?.rule?.act === expectedRuleAct, `${label}: rule must be ${expectedRuleAct}, got ${data.meta?.conversationAct?.rule?.act}`);
    }

    assert(bookingRuntime.__createdCount === beforeCreated, `${label}: must not create booking`);
    assert(bookingRuntime.__clearedCount === beforeCleared, `${label}: must not clear draft`);
    assert(
        stableStringify(session.bookingDraft) === stableStringify(originalDraft),
        `${label}: draft mutated`
    );

    return {
        data,
        arbitration,
        assist: data.meta.conversationAct?.semanticAssist,
        savedDelta: bookingRuntime.__savedCount - beforeSaved,
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
    const summaries = [];
    const testResults = [];

    try {
        testResults.push(await runTestCase("A_info_detour_semantic_wins", async () => {
            const result = await runCase({
                label: "A_info_detour",
                message: "nói kỹ hơn về cái gói xét nghiệm này được không",
                shadow: makeOllamaShadow({ conversationAct: CONVERSATION_ACTS.INFO_DETOUR, confidence: 0.88 })
            });
            assert(result.arbitration.selectedAct === "info_detour", "A: selectedAct should be info_detour");
            assert(result.arbitration.selectedSource === "semantic_arbitration", "A: semantic should win");
            assert(result.data.reply.includes("Chức năng thận"), "A: package detail missing");
            assert(result.data.reply.includes("Creatinine"), "A: component detail missing");
            summaries.push({ case: "A", result: "info_detour semantic wins over unclear rule" });
        }));

        testResults.push(await runTestCase("B_availability_inquiry_semantic_wins", async () => {
            const result = await runCase({
                label: "B_availability",
                message: "mai còn ca nào lấy mẫu được không",
                shadow: makeOllamaShadow({ conversationAct: CONVERSATION_ACTS.AVAILABILITY_INQUIRY, confidence: 0.86 })
            });
            assert(result.arbitration.selectedAct === "availability_inquiry", "B: selectedAct should be availability_inquiry");
            assert(result.arbitration.selectedSource === "semantic_arbitration", "B: semantic should win");
            assert(result.data.reply.includes("08:30") || result.data.reply.includes("09:30"), "B: slot info missing");
            summaries.push({ case: "B", result: "availability_inquiry semantic wins, slots returned" });
        }));

        testResults.push(await runTestCase("C_review_draft_semantic_wins", async () => {
            const result = await runCase({
                label: "C_review",
                message: "nhắc lại giúp tôi đang có những thông tin gì",
                shadow: makeOllamaShadow({ conversationAct: CONVERSATION_ACTS.REVIEW_DRAFT, confidence: 0.91 })
            });
            assert(result.arbitration.selectedAct === "review_draft", "C: selectedAct should be review_draft");
            assert(result.arbitration.selectedSource === "semantic_arbitration", "C: semantic should win");
            assert(result.data.reply.includes("Thông tin mình đang giữ"), "C: review header missing");
            assert(result.data.reply.includes("Chức năng thận"), "C: package missing");
            summaries.push({ case: "C", result: "review_draft semantic wins, draft summarized" });
        }));

        testResults.push(await runTestCase("D_help_next_step_semantic_wins", async () => {
            const result = await runCase({
                label: "D_help",
                message: "ờ",
                draft: makePartialDraft(),
                shadow: makeOllamaShadow({ conversationAct: CONVERSATION_ACTS.HELP_NEXT_STEP, confidence: 0.84 })
            });
            assert(result.arbitration.selectedAct === "help_next_step", `D: selectedAct should be help_next_step, got ${result.arbitration.selectedAct}`);
            assert(result.arbitration.selectedSource === "semantic_arbitration", `D: semantic should win, got ${result.arbitration.selectedSource}`);
            assert(result.data.reply.includes("Địa chỉ") || result.data.reply.includes("Tên"), "D: missing fields not listed");
            summaries.push({ case: "D", result: "help_next_step semantic wins over short message rule" });
        }));

        testResults.push(await runTestCase("E_pause_or_hold_semantic_wins", async () => {
            const result = await runCase({
                label: "E_pause",
                message: "để tôi bàn lại với gia đình rồi tính",
                shadow: makeOllamaShadow({ conversationAct: CONVERSATION_ACTS.PAUSE_OR_HOLD, confidence: 0.89 })
            });
            assert(result.arbitration.selectedAct === "pause_or_hold", "E: selectedAct should be pause_or_hold");
            assert(result.arbitration.selectedSource === "semantic_arbitration", "E: semantic should win");
            assert(result.data.reply.includes("tạm giữ") || result.data.reply.includes("lưu lại"), "E: pause wording missing");
            summaries.push({ case: "E", result: "pause_or_hold semantic wins, draft preserved" });
        }));

        testResults.push(await runTestCase("F_field_value_semantic_blocked", async () => {
            const result = await runCase({
                label: "F_field_value",
                message: "vậy đó nha",
                draft: makePartialDraft(),
                shadow: makeOllamaShadow({
                    conversationAct: CONVERSATION_ACTS.FIELD_VALUE,
                    confidence: 0.82,
                    targetField: "address",
                    targetValue: "123 ABC"
                })
            });
            assert(result.arbitration.semanticBlockedReason?.includes("field_value") || result.arbitration.semanticBlockedReason?.includes("mutation_sensitive"), "F: field_value should be blocked");
            assert(result.arbitration.shouldUseSemantic === false, "F: field_value should not be used");
            assert(result.arbitration.selectedSource !== "semantic_arbitration", "F: semantic should not win");
            summaries.push({ case: "F", result: "field_value semantic blocked, not used for mutation" });
        }));

        testResults.push(await runTestCase("G_final_confirm_semantic_blocked", async () => {
            const result = await runCase({
                label: "G_final_confirm",
                message: "vậy là chốt nha",
                shadow: makeOllamaShadow({
                    conversationAct: CONVERSATION_ACTS.FINAL_CONFIRM,
                    confidence: 0.95,
                    safetyDecision: "allow_guarded_mutation"
                })
            });
            assert(result.arbitration.semanticBlockedReason?.includes("final_confirm") || result.arbitration.semanticBlockedReason?.includes("mutation_sensitive"), "G: final_confirm should be blocked");
            assert(bookingRuntime.__createdCount === 0, "G: booking should not be created");
            summaries.push({ case: "G", result: "final_confirm semantic blocked, no booking created" });
        }));

        testResults.push(await runTestCase("H_cancel_or_abort_semantic_blocked", async () => {
            const result = await runCase({
                label: "H_cancel",
                message: "hủy bỏ cái này đi",
                shadow: makeOllamaShadow({
                    conversationAct: CONVERSATION_ACTS.CANCEL_OR_ABORT,
                    confidence: 0.88,
                    safetyDecision: "block_mutation"
                })
            });
            assert(result.arbitration.semanticBlockedReason?.includes("cancel") || result.arbitration.semanticBlockedReason?.includes("mutation_sensitive"), "H: cancel should be blocked");
            assert(bookingRuntime.__clearedCount === 0, "H: draft should not be cleared");
            summaries.push({ case: "H", result: "cancel_or_abort semantic blocked, draft retained" });
        }));

        testResults.push(await runTestCase("I_low_confidence_fallback", async () => {
            const result = await runCase({
                label: "I_low_conf",
                message: "hmm cái đó",
                shadow: makeOllamaShadow({
                    conversationAct: CONVERSATION_ACTS.INFO_DETOUR,
                    confidence: 0.65
                })
            });
            assert(result.arbitration.semanticBlockedReason === "semantic_confidence_too_low", "I: low confidence should be blocked");
            assert(result.arbitration.selectedSource === "rule", "I: should fallback to rule");
            summaries.push({ case: "I", result: "low confidence fallback to rule" });
        }));

        testResults.push(await runTestCase("J_fallback_reason_fallback", async () => {
            const result = await runCase({
                label: "J_fallback",
                message: "để tôi xem lại",
                shadow: makeOllamaShadow({
                    conversationAct: CONVERSATION_ACTS.PAUSE_OR_HOLD,
                    confidence: 0.9,
                    fallbackReason: "provider_timeout_fallback_deterministic"
                })
            });
            assert(result.arbitration.semanticBlockedReason === "semantic_fallback_or_timeout", "J: fallback should be blocked");
            assert(result.arbitration.selectedSource === "rule", "J: should fallback to rule");
            summaries.push({ case: "J", result: "fallbackReason triggers fallback to rule" });
        }));

        testResults.push(await runTestCase("K_non_ollama_provider_blocked", async () => {
            const result = await runCase({
                label: "K_provider",
                message: "thôi để tôi tính",
                shadow: makeOllamaShadow({
                    conversationAct: CONVERSATION_ACTS.PAUSE_OR_HOLD,
                    confidence: 0.87,
                    providerUsed: "cloud_llm",
                    provider: "cloud_llm"
                })
            });
            assert(result.arbitration.semanticBlockedReason === "semantic_provider_not_allowed", "K: non-ollama should be blocked");
            summaries.push({ case: "K", result: "non-ollama provider blocked" });
        }));

        testResults.push(await runTestCase("L_helper_isReadOnlySemanticAct", async () => {
            assert(isReadOnlySemanticAct(CONVERSATION_ACTS.INFO_DETOUR) === true, "L1: info_detour is readonly");
            assert(isReadOnlySemanticAct(CONVERSATION_ACTS.AVAILABILITY_INQUIRY) === true, "L2: availability_inquiry is readonly");
            assert(isReadOnlySemanticAct(CONVERSATION_ACTS.REVIEW_DRAFT) === true, "L3: review_draft is readonly");
            assert(isReadOnlySemanticAct(CONVERSATION_ACTS.HELP_NEXT_STEP) === true, "L4: help_next_step is readonly");
            assert(isReadOnlySemanticAct(CONVERSATION_ACTS.PAUSE_OR_HOLD) === true, "L5: pause_or_hold is readonly");
            assert(isReadOnlySemanticAct(CONVERSATION_ACTS.UNCLEAR) === true, "L6: unclear is readonly");
            assert(isReadOnlySemanticAct(CONVERSATION_ACTS.FIELD_VALUE) === false, "L7: field_value is not readonly");
            assert(isReadOnlySemanticAct(CONVERSATION_ACTS.FINAL_CONFIRM) === false, "L8: final_confirm is not readonly");
            assert(isReadOnlySemanticAct(CONVERSATION_ACTS.EDIT_REQUEST) === false, "L9: edit_request is not readonly");
            assert(isReadOnlySemanticAct(CONVERSATION_ACTS.CANCEL_OR_ABORT) === false, "L10: cancel_or_abort is not readonly");
            summaries.push({ case: "L", result: "helper isReadOnlySemanticAct works correctly" });
        }));

        testResults.push(await runTestCase("M_helper_isMutationSensitiveAct", async () => {
            assert(isMutationSensitiveAct(CONVERSATION_ACTS.FINAL_CONFIRM) === true, "M1: final_confirm is mutation-sensitive");
            assert(isMutationSensitiveAct(CONVERSATION_ACTS.FIELD_VALUE) === true, "M2: field_value is mutation-sensitive");
            assert(isMutationSensitiveAct(CONVERSATION_ACTS.EDIT_REQUEST) === true, "M3: edit_request is mutation-sensitive");
            assert(isMutationSensitiveAct(CONVERSATION_ACTS.CANCEL_OR_ABORT) === true, "M4: cancel_or_abort is mutation-sensitive");
            assert(isMutationSensitiveAct(CONVERSATION_ACTS.INFO_DETOUR) === false, "M5: info_detour is not mutation-sensitive");
            assert(isMutationSensitiveAct(CONVERSATION_ACTS.AVAILABILITY_INQUIRY) === false, "M6: availability_inquiry is not mutation-sensitive");
            summaries.push({ case: "M", result: "helper isMutationSensitiveAct works correctly" });
        }));

        testResults.push(await runTestCase("N_helper_shouldUseSemanticReadOnly", async () => {
            const validShadow = makeOllamaShadow({ conversationAct: CONVERSATION_ACTS.INFO_DETOUR, confidence: 0.85 });
            assert(shouldUseSemanticReadOnly({ ruleAct: { act: "unclear" }, semanticShadow: validShadow }) === true, "N1: valid readonly semantic should be allowed");

            const fallbackShadow = makeOllamaShadow({ conversationAct: CONVERSATION_ACTS.INFO_DETOUR, confidence: 0.85, fallbackReason: "timeout" });
            assert(shouldUseSemanticReadOnly({ ruleAct: { act: "unclear" }, semanticShadow: fallbackShadow }) === false, "N2: fallback should not be allowed");

            const lowConfidenceShadow = makeOllamaShadow({ conversationAct: CONVERSATION_ACTS.INFO_DETOUR, confidence: 0.6 });
            assert(shouldUseSemanticReadOnly({ ruleAct: { act: "unclear" }, semanticShadow: lowConfidenceShadow }) === false, "N3: low confidence should not be allowed");

            const mutationShadow = makeOllamaShadow({ conversationAct: CONVERSATION_ACTS.FIELD_VALUE, confidence: 0.9 });
            assert(shouldUseSemanticReadOnly({ ruleAct: { act: "unclear" }, semanticShadow: mutationShadow }) === false, "N4: mutation act should not be allowed");

            const nonOllamaShadow = makeOllamaShadow({ conversationAct: CONVERSATION_ACTS.INFO_DETOUR, confidence: 0.85, providerUsed: "cloud" });
            assert(shouldUseSemanticReadOnly({ ruleAct: { act: "unclear" }, semanticShadow: nonOllamaShadow }) === false, "N5: non-ollama should not be allowed");

            summaries.push({ case: "N", result: "helper shouldUseSemanticReadOnly works correctly" });
        }));

        console.log(JSON.stringify({
            ok: true,
            script: "smoke_semantic_readonly_arbitration_5m10",
            summaries,
            testResults: {
                passed: testResults.filter((r) => r.passed).length,
                failed: testResults.filter((r) => !r.passed).length,
                total: testResults.length
            }
        }, null, 2));
    } finally {
        classifierService.classifySemanticIntentAsync = defaultClassifySemanticIntentAsync;
        delete require.cache[bookingServicePath];
    }
}

main().catch((error) => {
    console.error(JSON.stringify({
        ok: false,
        script: "smoke_semantic_readonly_arbitration_5m10",
        error: error.message,
        stack: error.stack
    }, null, 2));
    process.exit(1);
});
