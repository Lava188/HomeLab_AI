const {
    INTENT_GROUPS,
    CONVERSATION_ACTS,
    TARGET_TYPES,
    SAFETY_DECISIONS,
    INTENT_GROUP_VALUES,
    CONVERSATION_ACT_VALUES,
    TARGET_TYPE_VALUES,
    SAFETY_DECISION_VALUES,
    normalizeFieldName
} = require("./intent-classifier.types");

const READ_ONLY_OR_CONFIRMATION_ACTS = new Set([
    CONVERSATION_ACTS.CANCEL_OR_ABORT,
    CONVERSATION_ACTS.EDIT_REQUEST,
    CONVERSATION_ACTS.AVAILABILITY_INQUIRY,
    CONVERSATION_ACTS.INFO_DETOUR,
    CONVERSATION_ACTS.PAUSE_OR_HOLD,
    CONVERSATION_ACTS.REVIEW_DRAFT,
    CONVERSATION_ACTS.HELP_NEXT_STEP,
    CONVERSATION_ACTS.UNCLEAR
]);

function clampConfidence(value) {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) return 0;
    return Math.max(0, Math.min(1, numberValue));
}

function hasContextField(context = {}) {
    return Boolean(
        normalizeFieldName(context.nextExpectedField) ||
            normalizeFieldName(context.domainContext?.nextExpectedField) ||
            normalizeFieldName(context.domainContext?.missingFields?.[0])
    );
}

function validateIntentClassifierOutput(output) {
    const errors = [];

    if (!output || typeof output !== "object" || Array.isArray(output)) {
        return {
            valid: false,
            errors: ["output_not_object"]
        };
    }

    for (const field of [
        "intentGroup",
        "conversationAct",
        "confidence",
        "target",
        "shouldMutateDraft",
        "requiresClarification",
        "safetyDecision",
        "reason",
        "evidence"
    ]) {
        if (!Object.prototype.hasOwnProperty.call(output, field)) {
            errors.push(`missing_${field}`);
        }
    }

    if (output.target && typeof output.target !== "object") {
        errors.push("target_not_object");
    }

    if (output.evidence && typeof output.evidence !== "object") {
        errors.push("evidence_not_object");
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

function normalizeTarget(target = {}) {
    const type = TARGET_TYPE_VALUES.includes(target.type)
        ? target.type
        : TARGET_TYPES.UNKNOWN;
    const field = normalizeFieldName(target.field);

    return {
        type,
        ...(field ? { field } : {})
    };
}

function normalizeIntentClassifierOutput(output, options = {}) {
    const validation = validateIntentClassifierOutput(output);
    if (!validation.valid) {
        return null;
    }

    const provider = options.provider || output.provider || output.evidence?.provider || null;
    const providerUsed = output.providerUsed || output.evidence?.providerUsed || provider;
    const context = options.context || {};
    const conversationAct = CONVERSATION_ACT_VALUES.includes(output.conversationAct)
        ? output.conversationAct
        : CONVERSATION_ACTS.UNCLEAR;
    const intentGroup = INTENT_GROUP_VALUES.includes(output.intentGroup)
        ? output.intentGroup
        : INTENT_GROUPS.UNKNOWN;
    let confidence = clampConfidence(output.confidence);
    let target = normalizeTarget(output.target);
    let safetyDecision = SAFETY_DECISION_VALUES.includes(output.safetyDecision)
        ? output.safetyDecision
        : SAFETY_DECISIONS.ASK_CLARIFICATION;
    let shouldMutateDraft = Boolean(output.shouldMutateDraft);
    let requiresClarification = Boolean(output.requiresClarification);

    if (READ_ONLY_OR_CONFIRMATION_ACTS.has(conversationAct)) {
        shouldMutateDraft = false;
    }

    if (conversationAct === CONVERSATION_ACTS.FIELD_VALUE) {
        const hasField = target.type === TARGET_TYPES.FIELD && Boolean(target.field);
        if (!hasField && !hasContextField(context)) {
            shouldMutateDraft = false;
            requiresClarification = true;
            safetyDecision = SAFETY_DECISIONS.ASK_CLARIFICATION;
        }
    }

    if (conversationAct === CONVERSATION_ACTS.FINAL_CONFIRM) {
        if (confidence >= 0.8 && safetyDecision === SAFETY_DECISIONS.ALLOW_GUARDED_MUTATION) {
            shouldMutateDraft = false;
        } else {
            shouldMutateDraft = false;
            requiresClarification = true;
            safetyDecision = SAFETY_DECISIONS.ASK_CONFIRMATION;
        }
    }

    if (target.type === TARGET_TYPES.FIELD && !target.field) {
        target = { type: TARGET_TYPES.UNKNOWN };
    }

    if (intentGroup === INTENT_GROUPS.URGENT_HEALTH) {
        shouldMutateDraft = false;
        safetyDecision = SAFETY_DECISIONS.BLOCK_MUTATION;
        requiresClarification = false;
    }

    return {
        intentGroup,
        conversationAct,
        confidence,
        target,
        shouldMutateDraft,
        requiresClarification,
        safetyDecision,
        reason: String(output.reason || "intent_classifier_normalized_output"),
        evidence: {
            ...(output.evidence && typeof output.evidence === "object" ? output.evidence : {}),
            ...(provider ? { provider } : {}),
            ...(providerUsed ? { providerUsed } : {}),
            ...(options.fallbackReason ? { fallbackReason: options.fallbackReason } : {})
        },
        ...(provider ? { provider } : {}),
        ...(providerUsed ? { providerUsed } : {}),
        ...(options.fallbackReason ? { fallbackReason: options.fallbackReason } : {})
    };
}

function buildFallbackIntentOutput({ provider = "intent_classifier", fallbackReason = "fallback" } = {}) {
    return {
        intentGroup: INTENT_GROUPS.UNKNOWN,
        conversationAct: CONVERSATION_ACTS.UNCLEAR,
        confidence: 0,
        target: { type: TARGET_TYPES.UNKNOWN },
        shouldMutateDraft: false,
        requiresClarification: true,
        safetyDecision: SAFETY_DECISIONS.ASK_CLARIFICATION,
        reason: fallbackReason,
        evidence: {
            provider,
            providerUsed: provider,
            fallbackReason
        },
        provider,
        providerUsed: provider,
        fallbackReason
    };
}

module.exports = {
    clampConfidence,
    validateIntentClassifierOutput,
    normalizeIntentClassifierOutput,
    buildFallbackIntentOutput
};
