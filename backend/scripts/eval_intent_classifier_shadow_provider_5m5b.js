const {
    classifySemanticIntentAsync,
    getProviderName,
    PROVIDERS
} = require("../src/services/conversation-intent-classifier.service");

const CASES = [
    {
        caseId: "pause_hold",
        message: "Để tôi hỏi lại đã",
        expectedActs: ["pause_or_hold"],
        draft: readyDraft()
    },
    {
        caseId: "package_info",
        message: "Gói chức năng thận có ý nghĩa gì",
        expectedActs: ["info_detour"],
        draft: readyDraft()
    },
    {
        caseId: "help_next",
        message: "Giờ tôi cần làm gì",
        expectedActs: ["help_next_step", "review_draft"],
        draft: readyDraft({ address: null, patientName: null })
    },
    {
        caseId: "urgent_chest",
        message: "Tôi đau ngực khó thở vã mồ hôi",
        expectedActs: ["unclear"],
        expectedSafetyDecision: "block_mutation",
        draft: readyDraft()
    },
    {
        caseId: "edit_time",
        message: "Xác nhận nhưng đổi sang 8h",
        expectedActs: ["edit_request"],
        draft: readyDraft()
    }
];

function readyDraft(overrides = {}) {
    return {
        testType: "Chức năng thận",
        selectedPackage: {
            code: "KIDNEY_FUNCTION",
            name: "Chức năng thận"
        },
        packageConfirmed: true,
        appointmentDate: "2026-08-20",
        appointmentTime: "07:30",
        address: "12 Nguyễn Trãi, Quận 1, TP Hồ Chí Minh",
        patientName: "Eval Ollama",
        phoneNumber: "0900000001",
        ...overrides
    };
}

function getLimit() {
    const value = Number(process.env.HOMELAB_INTENT_CLASSIFIER_LIVE_EVAL_LIMIT || CASES.length);
    return Number.isFinite(value) && value > 0
        ? Math.min(CASES.length, Math.floor(value))
        : CASES.length;
}

function buildInput(testCase) {
    const missingFields = ["testType", "appointmentDate", "appointmentTime", "address", "patientName", "phoneNumber"]
        .filter((field) => !testCase.draft[field]);

    return {
        message: testCase.message,
        sessionContext: {
            currentFlow: "booking",
            status: missingFields.length ? "collecting_info" : "ready_for_confirmation",
            bookingDraft: testCase.draft
        },
        draft: testCase.draft,
        lastBotAction: missingFields.length ? "collecting_info" : "ready_for_confirmation",
        domainContext: {
            missingFields,
            nextExpectedField: missingFields[0] || null,
            selectedPackage: testCase.draft.selectedPackage || null
        },
        ruleAct: null
    };
}

function isExpected(testCase, result) {
    if (!result || result.fallbackReason) return false;
    if (!testCase.expectedActs.includes(result.conversationAct)) return false;
    if (
        testCase.expectedSafetyDecision &&
        result.safetyDecision !== testCase.expectedSafetyDecision
    ) {
        return false;
    }

    return true;
}

async function main() {
    const provider = getProviderName();
    const model = process.env.HOMELAB_INTENT_CLASSIFIER_MODEL || "qwen2.5:3b";
    const limit = getLimit();
    const selectedCases = CASES.slice(0, limit);
    const rows = [];

    for (const testCase of selectedCases) {
        const startedAt = Date.now();
        const result = await classifySemanticIntentAsync(buildInput(testCase), {
            providerName: provider
        });
        const elapsedMs = result?.evidence?.elapsedMs || Date.now() - startedAt;
        const fallback = Boolean(result?.fallbackReason);

        rows.push({
            caseId: testCase.caseId,
            message: testCase.message,
            expectedAct: testCase.expectedActs.join("|"),
            semanticAct: result?.conversationAct || null,
            confidence: result?.confidence,
            safetyDecision: result?.safetyDecision || null,
            provider,
            model,
            providerUsed: result?.providerUsed || result?.evidence?.providerUsed || result?.provider || null,
            fallback,
            fallbackReason: result?.fallbackReason || null,
            elapsedMs,
            matchExpected: isExpected(testCase, result)
        });
    }

    const nonFallbackRows = rows.filter((row) => !row.fallback);
    const matchExpected = nonFallbackRows.filter((row) => row.matchExpected).length;

    console.log(JSON.stringify({
        ok: true,
        script: "eval_intent_classifier_shadow_provider_5m5b",
        provider,
        model,
        cases: rows.length,
        liveNonFallback: `${nonFallbackRows.length}/${rows.length}`,
        fallback: `${rows.length - nonFallbackRows.length}/${rows.length}`,
        matchExpected: `${matchExpected}/${nonFallbackRows.length}`,
        note: provider === PROVIDERS.OLLAMA_SHADOW
            ? "Fallback deterministic rows are not counted as provider pass."
            : "Provider is not ollama_shadow; check HOMELAB_INTENT_CLASSIFIER_PROVIDER."
    }, null, 2));
    console.table(rows);

    if (provider !== PROVIDERS.OLLAMA_SHADOW) {
        process.exitCode = 1;
    }
}

main().catch((error) => {
    console.error(JSON.stringify({
        ok: false,
        script: "eval_intent_classifier_shadow_provider_5m5b",
        error: error.message,
        stack: error.stack
    }, null, 2));
    process.exit(1);
});
