const {
    normalizeText,
    detectDateFromMessage,
    detectTimeFromMessage
} = require("../../utils/text.util");
const {
    INTENT_GROUPS,
    CONVERSATION_ACTS,
    TARGET_TYPES,
    SAFETY_DECISIONS,
    PROVIDERS,
    normalizeFieldName
} = require("./intent-classifier.types");
const {
    normalizeIntentClassifierOutput,
    buildFallbackIntentOutput
} = require("./intent-output.validator");

function includesAny(text, signals) {
    return signals.some((signal) => text.includes(signal));
}

function testAny(text, patterns) {
    return patterns.some((pattern) => pattern.test(text));
}

function buildSessionFacts({ sessionContext = {}, draft = {}, domainContext = {} }) {
    const missingFields = Array.isArray(domainContext.missingFields)
        ? domainContext.missingFields
        : [];
    const status = sessionContext.status || null;

    return {
        activeDraft: Boolean(draft && Object.keys(draft).length > 0),
        readyDraft: missingFields.length === 0 && Boolean(draft && Object.keys(draft).length > 0),
        paused: status === "booking_paused" || Boolean(sessionContext.paused),
        pendingEdit: sessionContext.pendingDraftEdit || null,
        pendingCancel: Boolean(sessionContext.pendingDraftCancel),
        missingFields,
        nextExpectedField: domainContext.nextExpectedField || missingFields[0] || null,
        selectedPackage: domainContext.selectedPackage || draft.selectedPackage || null
    };
}

function targetForField(field) {
    const normalizedField = normalizeFieldName(field);

    return {
        type: normalizedField ? TARGET_TYPES.FIELD : TARGET_TYPES.UNKNOWN,
        ...(normalizedField ? { field: normalizedField } : {})
    };
}

function makeProviderResult(overrides = {}, context = {}) {
    const output = {
        intentGroup: INTENT_GROUPS.UNKNOWN,
        conversationAct: CONVERSATION_ACTS.UNCLEAR,
        confidence: 0.4,
        target: { type: TARGET_TYPES.UNKNOWN },
        shouldMutateDraft: false,
        requiresClarification: true,
        safetyDecision: SAFETY_DECISIONS.ASK_CLARIFICATION,
        reason: "semantic_stub_no_clear_intent",
        evidence: {
            provider: PROVIDERS.DETERMINISTIC_STUB
        },
        ...overrides
    };

    return normalizeIntentClassifierOutput(output, {
        provider: PROVIDERS.DETERMINISTIC_STUB,
        context
    }) || buildFallbackIntentOutput({
        provider: PROVIDERS.DETERMINISTIC_STUB,
        fallbackReason: "deterministic_stub_normalization_failed"
    });
}

function detectEditField({ message, normalized }) {
    const timeValue = detectTimeFromMessage(message);
    const dateValue = detectDateFromMessage(message);

    if (
        timeValue &&
        (
            normalized.includes("doi sang") ||
            normalized.includes("chuyen sang") ||
            normalized.includes("doi gio") ||
            normalized.includes("sua gio") ||
            normalized.includes("sang")
        )
    ) {
        return "appointmentTime";
    }

    if (
        dateValue &&
        (
            normalized.includes("doi sang") ||
            normalized.includes("chuyen sang") ||
            normalized.includes("doi ngay") ||
            normalized.includes("sua ngay")
        )
    ) {
        return "appointmentDate";
    }

    if (includesAny(normalized, ["doi dia chi", "sua dia chi", "dia chi moi"])) {
        return "address";
    }

    if (includesAny(normalized, ["doi ten", "sua ten", "ten nguoi dat"])) {
        return "patientName";
    }

    if (includesAny(normalized, ["doi goi", "sua goi", "chuyen goi"])) {
        return "package";
    }

    return null;
}

function classify(input = {}) {
    try {
        const {
            message,
            sessionContext = {},
            draft = {},
            lastBotAction = null,
            domainContext = {}
        } = input;
        const normalized = normalizeText(message).trim();
        const facts = buildSessionFacts({ sessionContext, draft, domainContext });
        const context = {
            nextExpectedField: facts.nextExpectedField,
            domainContext
        };
        const evidence = {
            provider: PROVIDERS.DETERMINISTIC_STUB,
            normalized,
            facts: {
                activeDraft: facts.activeDraft,
                readyDraft: facts.readyDraft,
                paused: facts.paused,
                pendingEdit: Boolean(facts.pendingEdit),
                pendingCancel: facts.pendingCancel,
                missingFields: facts.missingFields,
                nextExpectedField: facts.nextExpectedField,
                selectedPackageCode: facts.selectedPackage?.code || null
            },
            lastBotAction: lastBotAction || null
        };

        if (!normalized) {
            return makeProviderResult({
                confidence: 0.2,
                reason: "semantic_stub_empty_message",
                evidence
            }, context);
        }

        const urgentSymptoms = [
            "dau nguc",
            "kho tho",
            "va mo hoi",
            "vã mồ hôi",
            "ngat",
            "bat tinh",
            "co giat",
            "khong tho duoc",
            "te nua nguoi",
            "liet nua nguoi",
            "dau dau du doi",
            "dau dau dot ngot",
            "yeu mot ben",
            "yeu nua nguoi",
            "te mot ben",
            "meo mieng",
            "noi kho",
            "lo mo",
            "non lien tuc"
        ];
        const urgentHits = urgentSymptoms.filter((signal) =>
            normalized.includes(normalizeText(signal))
        );
        const neurologicalRedFlag = (
            includesAny(normalized, [
                "dau dau du doi",
                "dau dau dot ngot",
                "meo mieng",
                "noi kho",
                "lo mo",
                "co giat"
            ]) ||
            (
                includesAny(normalized, ["yeu mot ben", "yeu nua nguoi", "te mot ben", "te nua nguoi", "liet nua nguoi"]) &&
                includesAny(normalized, ["nguoi", "tay", "chan", "mat"])
            ) ||
            (
                normalized.includes("non lien tuc") &&
                includesAny(normalized, ["dau dau", "yeu", "te", "meo mieng", "noi kho", "lo mo", "co giat"])
            )
        );
        if (
            neurologicalRedFlag ||
            urgentHits.length >= 2 ||
            includesAny(normalized, ["dau nguc kho tho", "kho tho va mo hoi", "dau nguc va mo hoi"])
        ) {
            return makeProviderResult({
                intentGroup: INTENT_GROUPS.URGENT_HEALTH,
                conversationAct: CONVERSATION_ACTS.UNCLEAR,
                confidence: 0.94,
                target: { type: TARGET_TYPES.MEDICAL_TOPIC },
                shouldMutateDraft: false,
                requiresClarification: false,
                safetyDecision: SAFETY_DECISIONS.BLOCK_MUTATION,
                reason: neurologicalRedFlag
                    ? "semantic_stub_urgent_neurological_red_flags"
                    : "semantic_stub_urgent_health_red_flags",
                evidence: { ...evidence, urgentHits, neurologicalRedFlag }
            }, context);
        }

        const cancelLike = (
            testAny(normalized, [
                /\bkhong\s+muon\s+(?:kham|dat|xet\s+nghiem|lay\s+mau)(?:\s+nua)?\b/,
                /\bthoi\s+(?:khoi\s+)?dat\s+nua\b/,
                /\bthoi\s+khoi\s+dat\b/,
                /\bkhoi\s+dat\s+nua\b/,
                /\bbo\s+lich\b/,
                /\bhuy\s+lich\b/,
                /\bkhong\s+can\s+(?:dat|kham|xet\s+nghiem)\b/
            ]) ||
            (
                includesAny(normalized, ["thoi", "khoi", "huy", "bo"]) &&
                includesAny(normalized, ["lich", "dat", "kham", "xet nghiem", "lay mau"])
            )
        );
        if (cancelLike) {
            return makeProviderResult({
                intentGroup: INTENT_GROUPS.BOOKING,
                conversationAct: CONVERSATION_ACTS.CANCEL_OR_ABORT,
                confidence: facts.activeDraft ? 0.9 : 0.78,
                target: {
                    type: facts.activeDraft
                        ? TARGET_TYPES.CURRENT_BOOKING_DRAFT
                        : TARGET_TYPES.EXISTING_BOOKING
                },
                shouldMutateDraft: false,
                requiresClarification: true,
                safetyDecision: SAFETY_DECISIONS.ASK_CONFIRMATION,
                reason: facts.activeDraft
                    ? "semantic_stub_cancel_current_booking_draft"
                    : "semantic_stub_cancel_existing_booking_or_unknown_target",
                evidence: { ...evidence, cancelLike: true }
            }, context);
        }

        const pauseLike = includesAny(normalized, [
            "de toi hoi lai",
            "hoi lai da",
            "de toi xem da",
            "de toi xem lai",
            "khoan da",
            "doi chut",
            "cho chut",
            "tam dung",
            "de sau"
        ]);
        if (pauseLike) {
            return makeProviderResult({
                intentGroup: INTENT_GROUPS.BOOKING,
                conversationAct: CONVERSATION_ACTS.PAUSE_OR_HOLD,
                confidence: 0.86,
                target: { type: TARGET_TYPES.CURRENT_BOOKING_DRAFT },
                shouldMutateDraft: false,
                requiresClarification: false,
                safetyDecision: SAFETY_DECISIONS.ALLOW_READ_ONLY,
                reason: "semantic_stub_pause_or_hold_current_booking",
                evidence: { ...evidence, pauseLike: true }
            }, context);
        }

        const infoLike = includesAny(normalized, [
            "la sao",
            "la gi",
            "y nghia gi",
            "y nghia",
            "giai thich",
            "gom gi",
            "gom nhung gi",
            "bao gom",
            "chi tiet"
        ]);
        const packageMention = includesAny(normalized, [
            "goi",
            "xet nghiem",
            "chuc nang than",
            "chuc nang gan",
            "mo mau",
            "cong thuc mau",
            "hba1c",
            "tong quat"
        ]);
        if (infoLike && packageMention) {
            return makeProviderResult({
                intentGroup: INTENT_GROUPS.PACKAGE_INFO,
                conversationAct: CONVERSATION_ACTS.INFO_DETOUR,
                confidence: 0.88,
                target: { type: TARGET_TYPES.PACKAGE },
                shouldMutateDraft: false,
                requiresClarification: false,
                safetyDecision: SAFETY_DECISIONS.ALLOW_READ_ONLY,
                reason: "semantic_stub_package_information_detour",
                evidence: { ...evidence, infoLike: true, packageMention: true }
            }, context);
        }

        const editField = detectEditField({ message, normalized });
        const editLike = Boolean(editField) || includesAny(normalized, [
            "doi sang",
            "chuyen sang",
            "sua",
            "doi lai",
            "thay doi"
        ]);
        if (editLike) {
            return makeProviderResult({
                intentGroup: INTENT_GROUPS.BOOKING,
                conversationAct: CONVERSATION_ACTS.EDIT_REQUEST,
                confidence: editField ? 0.88 : 0.78,
                target: editField
                    ? targetForField(editField)
                    : { type: TARGET_TYPES.CURRENT_BOOKING_DRAFT },
                shouldMutateDraft: false,
                requiresClarification: true,
                safetyDecision: SAFETY_DECISIONS.ASK_CONFIRMATION,
                reason: editField
                    ? "semantic_stub_edit_request_with_field"
                    : "semantic_stub_edit_request_needs_target_field",
                evidence: { ...evidence, editLike: true, editField }
            }, context);
        }

        if (includesAny(normalized, [
            "xem lai thong tin",
            "cho toi xem lai",
            "tom tat lai",
            "thong tin hien tai",
            "con thieu thong tin gi",
            "toi con thieu thong tin gi",
            "dang thieu thong tin gi"
        ])) {
            return makeProviderResult({
                intentGroup: INTENT_GROUPS.BOOKING,
                conversationAct: CONVERSATION_ACTS.REVIEW_DRAFT,
                confidence: 0.86,
                target: { type: TARGET_TYPES.CURRENT_BOOKING_DRAFT },
                shouldMutateDraft: false,
                requiresClarification: false,
                safetyDecision: SAFETY_DECISIONS.ALLOW_READ_ONLY,
                reason: "semantic_stub_review_current_draft",
                evidence: { ...evidence, reviewLike: true }
            }, context);
        }

        if (includesAny(normalized, [
            "gio toi can lam gi",
            "toi can lam gi",
            "can lam gi",
            "tiep theo lam gi",
            "con thieu gi",
            "can bo sung gi",
            "toi can bo sung gi"
        ])) {
            return makeProviderResult({
                intentGroup: INTENT_GROUPS.BOOKING,
                conversationAct: CONVERSATION_ACTS.HELP_NEXT_STEP,
                confidence: 0.84,
                target: { type: TARGET_TYPES.CURRENT_BOOKING_DRAFT },
                shouldMutateDraft: false,
                requiresClarification: false,
                safetyDecision: SAFETY_DECISIONS.ALLOW_READ_ONLY,
                reason: "semantic_stub_help_next_step",
                evidence: { ...evidence, helpLike: true }
            }, context);
        }

        if (includesAny(normalized, [
            "khung gio nao trong",
            "khung gio nao dang trong",
            "co khung gio nao trong",
            "con slot nao",
            "con lich trong",
            "gio nao trong"
        ])) {
            return makeProviderResult({
                intentGroup: INTENT_GROUPS.BOOKING,
                conversationAct: CONVERSATION_ACTS.AVAILABILITY_INQUIRY,
                confidence: 0.84,
                target: { type: TARGET_TYPES.CURRENT_BOOKING_DRAFT },
                shouldMutateDraft: false,
                requiresClarification: false,
                safetyDecision: SAFETY_DECISIONS.ALLOW_READ_ONLY,
                reason: "semantic_stub_availability_inquiry",
                evidence: { ...evidence, availabilityLike: true }
            }, context);
        }

        const finalConfirmLike = includesAny(normalized, [
            "xac nhan dat lich",
            "xac nhan lich",
            "dong y dat lich",
            "chot lich",
            "tao lich giup toi"
        ]);
        if (finalConfirmLike) {
            return makeProviderResult({
                intentGroup: INTENT_GROUPS.BOOKING,
                conversationAct: CONVERSATION_ACTS.FINAL_CONFIRM,
                confidence: facts.readyDraft ? 0.92 : 0.68,
                target: { type: TARGET_TYPES.CURRENT_BOOKING_DRAFT },
                shouldMutateDraft: false,
                requiresClarification: !facts.readyDraft,
                safetyDecision: facts.readyDraft
                    ? SAFETY_DECISIONS.ALLOW_GUARDED_MUTATION
                    : SAFETY_DECISIONS.ASK_CLARIFICATION,
                reason: facts.readyDraft
                    ? "semantic_stub_final_confirm_ready_draft"
                    : "semantic_stub_final_confirm_blocked_by_missing_context",
                evidence: { ...evidence, finalConfirmLike: true }
            }, context);
        }

        if ([
            "u",
            "uh",
            "um",
            "ok",
            "oke",
            "ok nhe",
            "oke nhe",
            "duoc",
            "vay cung duoc"
        ].includes(normalized)) {
            return makeProviderResult({
                intentGroup: INTENT_GROUPS.BOOKING,
                conversationAct: CONVERSATION_ACTS.UNCLEAR,
                confidence: 0.52,
                target: { type: TARGET_TYPES.CURRENT_BOOKING_DRAFT },
                shouldMutateDraft: false,
                requiresClarification: true,
                safetyDecision: SAFETY_DECISIONS.ASK_CLARIFICATION,
                reason: facts.readyDraft
                    ? "semantic_stub_ambiguous_ack_ready_draft"
                    : "semantic_stub_ambiguous_ack_missing_field",
                evidence: { ...evidence, ambiguousAck: true }
            }, context);
        }

        const nextField = facts.nextExpectedField;
        if (nextField && !infoLike) {
            const field = normalizeFieldName(nextField);

            return makeProviderResult({
                intentGroup: INTENT_GROUPS.BOOKING,
                conversationAct: CONVERSATION_ACTS.FIELD_VALUE,
                confidence: 0.56,
                target: targetForField(field),
                shouldMutateDraft: false,
                requiresClarification: true,
                safetyDecision: SAFETY_DECISIONS.ASK_CLARIFICATION,
                reason: "semantic_stub_possible_field_value_low_confidence",
                evidence: { ...evidence, nextExpectedField: nextField }
            }, context);
        }

        return makeProviderResult({
            evidence
        }, context);
    } catch (error) {
        return null;
    }
}

module.exports = {
    classify,
    buildSessionFacts,
    detectEditField
};
