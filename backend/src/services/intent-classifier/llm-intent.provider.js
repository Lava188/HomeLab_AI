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
        "",
        "READ-ONLY INTENT CLASSIFICATION (safe, no mutation):",
        "- info_detour: User asks for package details, test explanations, medical information context.",
        "  Examples: 'gói này gồm gì', 'giải thích kỹ hơn', 'xét nghiệm này để làm gì', 'chức năng thán là gì'",
        "- availability_inquiry: User asks about available slots, time frames, open appointments.",
        "  Examples: 'mai còn slot nào', 'khung giờ nào còn trống', 'giờ nào lấy mẫu được', 'ca nào còn'",
        "- review_draft: User asks to see, summarize, or review current booking draft information.",
        "  Examples: 'xem lại thông tin', 'tóm tắt giúp tôi', 'đang có gì', 'thông tin hiện tại'",
        "- help_next_step: User asks what to do next, what's missing, or how to proceed.",
        "  Examples: 'tiếp theo làm gì', 'còn thiếu gì', 'giờ tôi cần làm gì', 'bước tiếp'",
        "- pause_or_hold: User wants to pause, think more, ask family, or delay decision.",
        "  Examples: 'để tôi xem lại', 'khoan đã', 'cân nhắc thêm', 'hỏi người thân', 'tạm dừng'",
        "- unclear: Message is ambiguous, too short, or intent cannot be confidently determined.",
        "",
        "MUTATION-SENSITIVE INTENT CLASSIFICATION (classify only, DO NOT perform action):",
        "- final_confirm: User confirms booking. Only classify, DO NOT create booking.",
        "- field_value: User provides booking field value. Only classify, DO NOT write to draft.",
        "- edit_request: User requests edit to booking. Only classify, DO NOT mutate draft.",
        "- cancel_or_abort: User wants to cancel. Only classify, DO NOT clear draft.",
        "",
        "Rules:",
        "1. Prioritize understanding the CURRENT message before considering draft context.",
        "2. If user asks information questions, classify as read-only intent (info_detour, availability_inquiry, review_draft, help_next_step, pause_or_hold).",
        "3. If user provides data (name, address, time), classify as field_value but set shouldMutateDraft=false.",
        "4. If user confirms/cancels/edits, classify the intent but set shouldMutateDraft=false.",
        "5. If uncertain, set requiresClarification=true and shouldMutateDraft=false.",
        "6. For urgent symptoms, set intentGroup=urgent_health, safetyDecision=block_mutation.",
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
            shouldMutateDraft: "boolean, ALWAYS false for shadow classifier",
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
