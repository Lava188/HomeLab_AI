const path = require("path");

const bookingRuntime = require("../src/services/booking-runtime/booking.service");
const availabilitySlotService = require("../src/services/booking-runtime/availability-slot.service");
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
        bookingCode: "HLB-5M8",
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
    }
];

packageCatalog.resolvePackageIntent = async (message = "") => {
    if (String(message).toLowerCase().includes("gan")) {
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

function makeDraft(overrides = {}) {
    return {
        testType: "Chức năng gan",
        testCatalogItemId: "pkg-liver",
        selectedPackage: makeLiverPackage(),
        packageConfirmed: true,
        appointmentDate: "2026-08-20",
        appointmentTime: null,
        address: null,
        addressPartial: null,
        patientName: null,
        phoneNumber: "0900000001",
        ...overrides
    };
}

function makeOllamaShadow(overrides = {}) {
    return {
        intentGroup: "booking",
        conversationAct: "info_detour",
        confidence: 0.9,
        target: { type: "current_booking_draft" },
        shouldMutateDraft: false,
        requiresClarification: false,
        safetyDecision: "allow_read_only",
        reason: "mock_ollama_shadow_5m8",
        provider: PROVIDERS.OLLAMA_SHADOW,
        providerUsed: PROVIDERS.OLLAMA_SHADOW,
        evidence: {
            provider: PROVIDERS.OLLAMA_SHADOW,
            providerUsed: PROVIDERS.OLLAMA_SHADOW
        },
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

async function runBookingCase({
    label,
    message,
    draft = makeDraft(),
    shadow,
    status = "collecting_info"
}) {
    const sessionId = uniqueId(label);
    const originalDraft = clone(draft);
    seedSession(sessionId, draft, status);

    const service = loadBookingService(async () => shadow);
    const beforeCreated = bookingRuntime.__createdCount;
    const beforeCleared = bookingRuntime.__clearedCount;

    const data = await withEnv({
        HOMELAB_INTENT_CLASSIFIER_SHADOW_ASYNC_ENABLED: "true",
        HOMELAB_INTENT_CLASSIFIER_PROVIDER: PROVIDERS.OLLAMA_SHADOW
    }, () => service.handleBookingMessage({
        message,
        sessionId,
        userSession: { phone: "0900000001" }
    }));

    const session = mockSessions.getSession(sessionId);

    assert(bookingRuntime.__createdCount === beforeCreated, `${label}: must not create booking`);
    assert(bookingRuntime.__clearedCount === beforeCleared, `${label}: must not clear draft`);
    assert(
        stableStringify(session.bookingDraft) === stableStringify(originalDraft),
        `${label}: draft mutated`
    );

    return {
        data,
        arbitration: data.meta?.semanticArbitration || data.meta?.conversationAct?.semanticArbitration,
        conversationAct: data.meta?.conversationAct || null,
        session
    };
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
    const cases = [
        ["A_unclear_semantic_info_detour_wins", async () => {
            const result = await runBookingCase({
                label: "semantic_info_5m8",
                message: "tôi muốn hiểu kỹ hơn về xét nghiệm này",
                shadow: makeOllamaShadow({ conversationAct: "info_detour", confidence: 0.91 })
            });

            assert(result.arbitration?.selectedAct === "info_detour", "selectedAct should be info_detour");
            assert(result.arbitration?.selectedSource === "semantic_arbitration", "semantic should win");
            assert(result.data.reply.includes("Chức năng gan"), "package detail missing");
        }],
        ["B_missing_field_semantic_availability_wins", async () => {
            const result = await runBookingCase({
                label: "semantic_availability_5m8",
                message: "giờ nào tiện nhất để lấy mẫu",
                shadow: makeOllamaShadow({
                    conversationAct: "availability_inquiry",
                    confidence: 0.88
                })
            });

            assert(result.arbitration?.selectedAct === "availability_inquiry", "selectedAct should be availability_inquiry");
            assert(result.arbitration?.selectedSource === "semantic_arbitration", "semantic availability should win");
            assert(result.data.reply.includes("08:30"), "availability reply missing slot");
            assert(!result.data.booking?.draft?.address, "availability parsed as address");
            assert(!result.data.booking?.draft?.patientName, "availability parsed as name");
        }],
        ["C_semantic_final_confirm_blocked_when_rule_not_confirm", async () => {
            const result = await runBookingCase({
                label: "semantic_final_block_5m8",
                message: "hmm vậy nha",
                shadow: makeOllamaShadow({
                    conversationAct: "final_confirm",
                    confidence: 0.96,
                    safetyDecision: "allow_guarded_mutation"
                })
            });

            assert(result.arbitration?.semanticBlockedReason?.includes("final_confirm"), "final_confirm not blocked");
            assert(result.arbitration?.selectedSource === "rule", "rule should remain selected");
        }],
        ["D_semantic_mutation_acts_blocked", async () => {
            for (const act of ["field_value", "edit_request", "cancel_or_abort"]) {
                const result = await runBookingCase({
                    label: `semantic_${act}_block_5m8`,
                    message: "hmm vậy nha",
                    shadow: makeOllamaShadow({
                        conversationAct: act,
                        confidence: 0.94,
                        safetyDecision: act === "field_value" ? "ask_clarification" : "block_mutation"
                    })
                });

                assert(result.arbitration?.semanticBlockedReason?.includes(act), `${act} not blocked`);
                assert(result.arbitration?.shouldUseSemantic === false, `${act} should not be used`);
            }
        }],
        ["E_semantic_fallback_does_not_crash", async () => {
            const result = await runBookingCase({
                label: "semantic_fallback_5m8",
                message: "mình cân nhắc thêm",
                shadow: makeOllamaShadow({
                    conversationAct: "info_detour",
                    fallbackReason: "provider_timeout_fallback_deterministic"
                })
            });

            assert(result.arbitration?.semanticFallbackReason === "provider_timeout_fallback_deterministic", "fallback reason missing");
            assert(result.arbitration?.semanticBlockedReason === "semantic_fallback_or_timeout", "fallback not blocked");
            assert(result.arbitration?.selectedSource === "rule", "rule should handle fallback");
        }],
        ["F_rule_and_semantic_info_match", async () => {
            const result = await runBookingCase({
                label: "semantic_match_5m8",
                message: "gói chức năng gan là gì",
                shadow: makeOllamaShadow({ conversationAct: "info_detour", confidence: 0.92 })
            });

            assert(result.arbitration?.match === true, "match metadata missing");
            assert(result.arbitration?.selectedSource === "rule", "matching rule response should be kept");
            assert(result.data.reply.includes("ALT"), "rule info response missing detail");
        }],
        ["G_unclear_low_confidence_semantic_blocked", async () => {
            const result = await runBookingCase({
                label: "semantic_low_conf_5m8",
                message: "hmm vậy nha",
                shadow: makeOllamaShadow({
                    conversationAct: "info_detour",
                    confidence: 0.3
                })
            });

            assert(result.arbitration?.semanticBlockedReason === "semantic_confidence_too_low", "low confidence not blocked");
            assert(result.arbitration?.shouldUseSemantic === false, "low confidence semantic should not be used");
        }],
        ["H_urgent_semantic_cannot_override_or_mutate", async () => {
            const result = await runBookingCase({
                label: "semantic_urgent_5m8",
                message: "tôi đau ngực khó thở vã mồ hôi",
                shadow: makeOllamaShadow({
                    intentGroup: "urgent_health",
                    conversationAct: "unclear",
                    confidence: 0.97,
                    safetyDecision: "block_mutation"
                })
            });

            assert(result.arbitration?.semanticBlockedReason === "semantic_safety_decision_not_readonly", "urgent semantic should be blocked in booking arbitration");
            assert(result.arbitration?.safeReadOnly === false, "urgent semantic should not be marked safe readonly");
        }]
    ];

    const results = [];

    try {
        for (const [id, fn] of cases) {
            results.push(await runCase(id, fn));
        }
    } finally {
        classifierService.classifySemanticIntentAsync = defaultClassifySemanticIntentAsync;
        delete require.cache[bookingServicePath];
    }

    const passed = results.filter((result) => result.passed).length;
    const failed = results.length - passed;

    console.log(`RESULT passed=${passed} failed=${failed} total=${results.length}`);

    if (failed > 0) {
        process.exitCode = 1;
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
