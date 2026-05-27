const { ACTS } = require("./booking-conversation-act.service");
const {
    CONVERSATION_ACTS,
    PROVIDERS,
    SAFETY_DECISIONS
} = require("./intent-classifier/intent-classifier.types");

const MIN_SEMANTIC_CONFIDENCE = 0.72;
const SOURCE_RULE = "rule";
const SOURCE_SEMANTIC = "semantic_arbitration";
const SOURCE_FALLBACK = "fallback_policy";

const READ_ONLY_ACTS = new Set([
    CONVERSATION_ACTS.INFO_DETOUR,
    CONVERSATION_ACTS.AVAILABILITY_INQUIRY,
    CONVERSATION_ACTS.REVIEW_DRAFT,
    CONVERSATION_ACTS.HELP_NEXT_STEP,
    CONVERSATION_ACTS.PAUSE_OR_HOLD,
    CONVERSATION_ACTS.UNCLEAR,
    "ask_clarification"
]);

const MUTATION_SENSITIVE_ACTS = new Set([
    CONVERSATION_ACTS.FINAL_CONFIRM,
    CONVERSATION_ACTS.FIELD_VALUE,
    CONVERSATION_ACTS.EDIT_REQUEST,
    CONVERSATION_ACTS.CANCEL_OR_ABORT,
    "create_booking",
    "reschedule",
    "cancel_existing_booking"
]);

const RULE_READ_ONLY_ACTS = new Set([
    ACTS.INFO_DETOUR,
    ACTS.AVAILABILITY_CHECK,
    ACTS.REVIEW_DRAFT,
    ACTS.HELP_NEXT_STEP,
    ACTS.PAUSE_OR_HOLD,
    ACTS.UNCLEAR
]);

function canonicalAct(act) {
    if (act === ACTS.AVAILABILITY_CHECK) {
        return CONVERSATION_ACTS.AVAILABILITY_INQUIRY;
    }

    return act || null;
}

function getRuleAct(ruleAct) {
    return ruleAct?.rule || ruleAct || null;
}

function getSemanticProvider(semanticShadow) {
    return (
        semanticShadow?.providerUsed ||
        semanticShadow?.evidence?.providerUsed ||
        semanticShadow?.provider ||
        semanticShadow?.evidence?.provider ||
        null
    );
}

function isMissingFieldFallback(ruleAct) {
    const act = getRuleAct(ruleAct);

    return Boolean(
        act?.act === ACTS.UNCLEAR &&
            (
                act.blockedBy?.includes("field_value_not_confident") ||
                act.reason === "no_intent_signal_confident_enough"
            )
    );
}

function buildBaseResult({ ruleAct, semanticShadow }) {
    const rule = getRuleAct(ruleAct);
    const semanticAct = semanticShadow?.conversationAct || null;
    const semanticProvider = getSemanticProvider(semanticShadow);
    const semanticConfidence = Number(semanticShadow?.confidence || 0);
    const selectedAct = canonicalAct(rule?.act) || ACTS.UNCLEAR;

    return {
        ruleAct: rule,
        semanticAct,
        selectedAct,
        selectedSource: rule ? SOURCE_RULE : SOURCE_FALLBACK,
        source: rule ? SOURCE_RULE : SOURCE_FALLBACK,
        confidence: Number(rule?.confidence || 0),
        reason: rule?.reason || "rule_or_policy_selected",
        shouldUseSemantic: false,
        semanticBlockedReason: null,
        blockedReason: null,
        safeReadOnly: false,
        semanticConfidence,
        semanticProvider,
        semanticFallbackReason: semanticShadow?.fallbackReason || null,
        disagreementReason: semanticAct && canonicalAct(rule?.act) !== canonicalAct(semanticAct)
            ? `rule_${rule?.act || "none"}_semantic_${semanticAct}`
            : null,
        match: Boolean(semanticAct && canonicalAct(rule?.act) === canonicalAct(semanticAct))
    };
}

function block(base, reason, extra = {}) {
    return {
        ...base,
        semanticBlockedReason: reason,
        blockedReason: reason,
        reason: extra.reason || base.reason,
        ...extra
    };
}

function arbitrateBookingSemanticReadOnly({
    ruleAct,
    semanticShadow,
    draft = {},
    missingFields = [],
    sessionStatus = null,
    lastBotAction = null,
    selectedPackage = null
} = {}) {
    const base = buildBaseResult({ ruleAct, semanticShadow });
    const rule = base.ruleAct;
    const semanticAct = semanticShadow?.conversationAct || null;
    const semanticProvider = base.semanticProvider;
    const semanticConfidence = base.semanticConfidence;
    const canonicalRuleAct = canonicalAct(rule?.act);
    const canonicalSemanticAct = canonicalAct(semanticAct);
    const ruleIsMutationSensitive = MUTATION_SENSITIVE_ACTS.has(canonicalRuleAct);
    const ruleIsReadOnly = RULE_READ_ONLY_ACTS.has(rule?.act);
    const semanticIsMutationSensitive = MUTATION_SENSITIVE_ACTS.has(canonicalSemanticAct);
    const semanticIsReadOnly = READ_ONLY_ACTS.has(canonicalSemanticAct);

    if (!semanticShadow) {
        return block(base, "semantic_shadow_missing");
    }

    if (semanticProvider !== PROVIDERS.OLLAMA_SHADOW) {
        return block(base, "semantic_provider_not_allowed");
    }

    if (semanticShadow.fallbackReason != null) {
        return block(base, "semantic_fallback_or_timeout");
    }

    if (semanticConfidence < MIN_SEMANTIC_CONFIDENCE) {
        return block(base, "semantic_confidence_too_low");
    }

    if (semanticShadow.shouldMutateDraft === true) {
        return block(base, "semantic_should_mutate_draft");
    }

    if (semanticIsMutationSensitive) {
        return block(base, `semantic_act_${canonicalSemanticAct}_blocked_mutation_sensitive`);
    }

    if (!semanticIsReadOnly) {
        return block(base, "semantic_act_not_readonly_whitelisted");
    }

    if (
        ![
            SAFETY_DECISIONS.ALLOW_READ_ONLY,
            SAFETY_DECISIONS.ASK_CLARIFICATION
        ].includes(semanticShadow.safetyDecision)
    ) {
        return block(base, "semantic_safety_decision_not_readonly");
    }

    if (ruleIsMutationSensitive) {
        return block(base, "rule_mutation_sensitive_wins", {
            safeReadOnly: false
        });
    }

    if (
        ruleIsReadOnly &&
        canonicalRuleAct === canonicalSemanticAct
    ) {
        return {
            ...base,
            selectedAct: canonicalRuleAct,
            selectedSource: SOURCE_RULE,
            source: SOURCE_RULE,
            confidence: Number(rule?.confidence || semanticConfidence),
            reason: "rule_and_semantic_readonly_match",
            safeReadOnly: true,
            match: true,
            semanticBlockedReason: null,
            blockedReason: null
        };
    }

    if (
        rule?.act === ACTS.UNCLEAR ||
        isMissingFieldFallback(rule) ||
        !ruleIsReadOnly
    ) {
        return {
            ...base,
            selectedAct: canonicalSemanticAct,
            selectedSource: SOURCE_SEMANTIC,
            source: SOURCE_SEMANTIC,
            confidence: semanticConfidence,
            reason: "semantic_readonly_wins_over_unclear_or_field_prompt",
            shouldUseSemantic: true,
            safeReadOnly: true,
            semanticBlockedReason: null,
            blockedReason: null,
            context: {
                hasDraft: Boolean(draft && Object.keys(draft).length),
                missingFields,
                sessionStatus,
                lastBotAction,
                selectedPackageCode: selectedPackage?.code || draft?.selectedPackage?.code || null
            }
        };
    }

    return block(base, "rule_readonly_policy_kept");
}

function buildSemanticArbitrationMeta(arbitration) {
    return {
        ruleAct: arbitration?.ruleAct?.act || null,
        semanticAct: arbitration?.semanticAct || null,
        selectedAct: arbitration?.selectedAct || null,
        selectedSource: arbitration?.selectedSource || arbitration?.source || null,
        semanticConfidence: arbitration?.semanticConfidence || 0,
        semanticProvider: arbitration?.semanticProvider || null,
        ...(arbitration?.semanticFallbackReason
            ? { semanticFallbackReason: arbitration.semanticFallbackReason }
            : {}),
        ...(arbitration?.semanticBlockedReason
            ? { semanticBlockedReason: arbitration.semanticBlockedReason }
            : {}),
        ...(arbitration?.disagreementReason
            ? { disagreementReason: arbitration.disagreementReason }
            : {}),
        match: Boolean(arbitration?.match),
        shouldUseSemantic: Boolean(arbitration?.shouldUseSemantic),
        safeReadOnly: Boolean(arbitration?.safeReadOnly),
        reason: arbitration?.reason || null
    };
}

module.exports = {
    MIN_SEMANTIC_CONFIDENCE,
    READ_ONLY_ACTS,
    MUTATION_SENSITIVE_ACTS,
    arbitrateBookingSemanticReadOnly,
    buildSemanticArbitrationMeta
};
