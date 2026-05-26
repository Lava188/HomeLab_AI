const {
    INTENT_GROUPS,
    CONVERSATION_ACTS,
    TARGET_TYPES,
    SAFETY_DECISIONS,
    PROVIDERS
} = require("./intent-classifier.types");
const {
    normalizeIntentClassifierOutput,
    validateIntentClassifierOutput
} = require("./intent-output.validator");

function buildIntentClassifierPrompt(input = {}) {
    const context = {
        message: input.message || "",
        sessionContext: input.sessionContext || null,
        draft: input.draft || null,
        lastBotAction: input.lastBotAction || null,
        domainContext: input.domainContext || null,
        ruleAct: input.ruleAct || null
    };

    return [
        "You are a shadow intent classifier for HomeLab booking conversations.",
        "Return JSON only. Do not include markdown, comments, or explanations outside JSON.",
        "Do not provide medical advice. Do not decide, create, edit, cancel, or reschedule any booking.",
        "Only classify the user's current intent from the message and context.",
        "If uncertain, set requiresClarification=true and shouldMutateDraft=false.",
        "For urgent symptoms, set intentGroup=urgent_health, safetyDecision=block_mutation, and shouldMutateDraft=false.",
        "For booking mutation intents such as confirm, cancel, or edit, only classify the intent. Do not perform the action.",
        "",
        "Allowed output schema:",
        JSON.stringify({
            intentGroup: Object.values(INTENT_GROUPS).join(" | "),
            conversationAct: Object.values(CONVERSATION_ACTS).join(" | "),
            confidence: "number from 0 to 1",
            target: {
                type: Object.values(TARGET_TYPES).join(" | "),
                field: "optional: appointmentTime | appointmentDate | address | patientName | package"
            },
            shouldMutateDraft: "boolean, false unless clearly a safe field_value classification in shadow",
            requiresClarification: "boolean",
            safetyDecision: Object.values(SAFETY_DECISIONS).join(" | "),
            reason: "short machine-readable reason",
            evidence: "object with brief signals, no long prose"
        }, null, 2),
        "",
        "Classification context:",
        JSON.stringify(context, null, 2),
        "",
        "Respond with one JSON object matching the schema."
    ].join("\n");
}

function stripJsonFence(rawText) {
    const text = String(rawText || "").trim();
    const fenceMatch = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    return fenceMatch ? fenceMatch[1].trim() : text;
}

function parseLlmIntentOutput(rawText) {
    try {
        const text = stripJsonFence(rawText);
        if (!text) return null;

        return JSON.parse(text);
    } catch {
        return null;
    }
}

function classify(input = {}) {
    const provider = PROVIDERS.LLM_SHADOW_DISABLED;

    return {
        intentGroup: INTENT_GROUPS.UNKNOWN,
        conversationAct: CONVERSATION_ACTS.UNCLEAR,
        confidence: 0,
        target: { type: TARGET_TYPES.UNKNOWN },
        shouldMutateDraft: false,
        requiresClarification: true,
        safetyDecision: SAFETY_DECISIONS.ASK_CLARIFICATION,
        reason: "llm_shadow_provider_disabled",
        evidence: {
            provider,
            fallbackReason: "llm_provider_not_configured",
            providerDisabled: true,
            promptBuilt: true,
            promptLength: buildIntentClassifierPrompt(input).length
        },
        provider,
        fallbackReason: "llm_provider_not_configured"
    };
}

function normalizeLlmIntentOutput(output, input = {}) {
    return normalizeIntentClassifierOutput(output, {
        provider: PROVIDERS.LLM_SHADOW_DISABLED,
        context: {
            nextExpectedField: input.domainContext?.nextExpectedField,
            domainContext: input.domainContext || {}
        }
    });
}

module.exports = {
    classify,
    buildIntentClassifierPrompt,
    parseLlmIntentOutput,
    validateIntentClassifierOutput,
    normalizeLlmIntentOutput
};
