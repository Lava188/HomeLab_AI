const { formatDisplayDate } = require("../utils/text.util");
const packageCatalog = require("./booking-package-catalog.service");

const SOURCE = "semantic_shadow_readonly_5m5a";
const MIN_CONFIDENCE = 0.8;

const ALLOWED_PROVIDERS = new Set(["ollama_shadow"]);
const SAFE_SAFETY_DECISIONS = new Set([
    "allow_read_only",
    "ask_clarification",
    "block_mutation"
]);
const ASSIST_ACTS = new Set([
    "pause_or_hold",
    "info_detour",
    "help_next_step",
    "review_draft",
    "availability_inquiry"
]);
const BLOCKED_ACTS = new Set([
    "final_confirm",
    "field_value",
    "edit_request",
    "cancel_or_abort",
    "create_booking",
    "reschedule",
    "cancel_existing_booking"
]);
const SAFE_RULE_ACTIONS = new Set([
    "pause_or_hold",
    "info_detour",
    "help_next_step",
    "review_draft",
    "availability_inquiry",
    "unclear",
    "resume_after_pause"
]);

const ELIGIBLE_RULE_ACTIONS = new Set([
    "pause_or_hold",
    "info_detour",
    "help_next_step",
    "review_draft",
    "availability_inquiry",
    "unclear"
]);

const REQUIRED_FIELDS = [
    "testType",
    "appointmentDate",
    "appointmentTime",
    "address",
    "patientName",
    "phoneNumber"
];

const FIELD_LABELS = {
    testType: "Gói/xét nghiệm",
    appointmentDate: "Ngày lấy mẫu",
    appointmentTime: "Giờ lấy mẫu",
    address: "Địa chỉ",
    patientName: "Tên người đặt",
    phoneNumber: "Số điện thoại"
};

const FIELD_PROMPTS = {
    testType: `gói/xét nghiệm bạn muốn đặt. HomeLab hiện có: ${packageCatalog.buildPackageListText()}`,
    appointmentDate: "ngày lấy mẫu",
    appointmentTime: "giờ lấy mẫu",
    address: "địa chỉ lấy mẫu",
    patientName: "tên người đặt",
    phoneNumber: "số điện thoại liên hệ"
};

function disabled(reason, assistAct = null, blockedReason = null, meta = {}) {
    return {
        enabled: false,
        assistAct,
        reason,
        reply: null,
        ...(blockedReason ? { blockedReason } : {}),
        meta: {
            source: SOURCE,
            ...meta
        }
    };
}

function enabled(assistAct, reason, reply, meta = {}) {
    return {
        enabled: true,
        assistAct,
        reason,
        reply,
        meta: {
            source: SOURCE,
            ...meta
        }
    };
}

function getMissingFields(draft = {}) {
    return REQUIRED_FIELDS.filter((field) => !draft[field]);
}

function hasAllowedSemanticProvider(semanticShadow) {
    return (
        ALLOWED_PROVIDERS.has(semanticShadow?.providerUsed) ||
        ALLOWED_PROVIDERS.has(semanticShadow?.evidence?.provider)
    );
}

function isRuleEligible(ruleAct) {
    if (!ruleAct) return false;

    return ELIGIBLE_RULE_ACTIONS.has(ruleAct.act);
}

function buildKnownFieldsText(draft = {}) {
    const knownParts = [];

    if (draft.testType) knownParts.push(`${FIELD_LABELS.testType}: ${draft.testType}`);
    if (draft.appointmentDate) {
        knownParts.push(`${FIELD_LABELS.appointmentDate}: ${formatDisplayDate(draft.appointmentDate)}`);
    }
    if (draft.appointmentTime) knownParts.push(`${FIELD_LABELS.appointmentTime}: ${draft.appointmentTime}`);
    if (draft.address) knownParts.push(`${FIELD_LABELS.address}: ${draft.address}`);
    if (draft.patientName) knownParts.push(`${FIELD_LABELS.patientName}: ${draft.patientName}`);
    if (draft.phoneNumber) knownParts.push(`${FIELD_LABELS.phoneNumber}: ${draft.phoneNumber}`);

    return knownParts;
}

function buildPauseReply(draft, missingFields) {
    const knownFields = buildKnownFieldsText(draft);
    const summary = knownFields.length
        ? `Thông tin mình đang giữ: ${knownFields.join("; ")}.`
        : "Mình chưa ghi nhận đủ thông tin trong bản nháp này.";
    const next = missingFields.length
        ? `Khi quay lại, bạn có thể bổ sung ${FIELD_LABELS[missingFields[0]]}, sửa thông tin, hỏi thêm hoặc hủy bản nháp.`
        : "Khi quay lại, bạn có thể xác nhận, sửa thông tin, hỏi thêm hoặc hủy bản nháp.";

    return [
        "Được, HomeLab sẽ tạm giữ bản nháp và chưa tạo lịch.",
        summary,
        next
    ].join(" ");
}

function buildHelpNextStepReply(draft, missingFields) {
    const knownFields = buildKnownFieldsText(draft);
    const knownText = knownFields.length
        ? `Mình đang có: ${knownFields.join("; ")}.`
        : "Hiện bản nháp chưa có đủ thông tin đặt lịch.";

    if (missingFields.length > 0) {
        return [
            knownText,
            `Còn thiếu: ${missingFields.map((field) => FIELD_LABELS[field]).join(", ")}.`,
            `Bạn vui lòng cung cấp thêm ${FIELD_PROMPTS[missingFields[0]]}.`
        ].join(" ");
    }

    return [
        knownText,
        "Bản nháp đã đủ thông tin.",
        "Bạn có thể xác nhận đặt lịch, sửa thông tin, hỏi thêm hoặc hủy bản nháp. Mình sẽ không tự tạo lịch khi bạn chưa xác nhận rõ."
    ].join(" ");
}

function buildReviewDraftReply(draft, missingFields) {
    const knownFields = buildKnownFieldsText(draft);
    const knownText = knownFields.length
        ? `Thông tin mình đang giữ: ${knownFields.join("; ")}.`
        : "Mình chưa ghi nhận đủ thông tin đặt lịch nào trong bản nháp này.";
    const missingText = missingFields.length
        ? `Hiện còn thiếu: ${missingFields.map((field) => FIELD_LABELS[field]).join(", ")}.`
        : "Bản nháp đã đủ thông tin, nhưng lịch chưa được tạo.";
    const nextText = missingFields.length
        ? `Bạn muốn bổ sung ${FIELD_PROMPTS[missingFields[0]]} hay sửa thông tin nào?`
        : "Bạn muốn xác nhận đặt lịch hay sửa thông tin nào?";

    return [knownText, missingText, nextText].join(" ");
}

function buildNextFieldInstruction(field) {
    if (field === "address") return "Bạn gửi địa chỉ trước nhé.";
    if (field === "appointmentTime") return "Bạn chọn khung giờ giúp mình nhé.";
    if (field === "patientName") return "Bạn gửi tên người đặt giúp mình nhé.";
    if (field === "phoneNumber") return "Bạn gửi số điện thoại liên hệ giúp mình nhé.";
    if (field === "appointmentDate") return "Bạn chọn ngày lấy mẫu giúp mình nhé.";
    if (field === "testType") return "Bạn chọn gói/xét nghiệm giúp mình nhé.";
    return "Bạn gửi tiếp thông tin còn thiếu giúp mình nhé.";
}

function getPackageChoiceDisplayName(packageItem) {
    const name = String(packageItem?.name || "").replace(/^Gói\s+/i, "").trim();
    return name ? `${name.charAt(0).toUpperCase()}${name.slice(1)}` : name;
}

async function buildInfoDetourAssist({ message, draft = {}, missingFields, context = {} }) {
    const packageIntent = await packageCatalog.resolvePackageIntent(message || "");
    const selectedFromMessage = packageIntent.package || null;
    const selectedFromDraft =
        draft.selectedPackage ||
        draft.testCatalogItem ||
        context.selectedPackage ||
        context.testCatalogItem ||
        null;
    const selectedFromSession = context.lastDiscussedPackage || null;

    const normalizedMessage = (message || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const hasReferencePhrase =
        normalizedMessage.includes("cai goi nay") ||
        normalizedMessage.includes("goi nay") ||
        normalizedMessage.includes("cai nay") ||
        normalizedMessage.includes("no") ||
        normalizedMessage.includes("cai goi vua roi") ||
        normalizedMessage.includes("goi vua roi") ||
        normalizedMessage.includes("goi do");

    let targetPackage = selectedFromMessage || selectedFromDraft;
    let fromSessionContext = false;

    if (!targetPackage && hasReferencePhrase && selectedFromSession) {
        targetPackage = selectedFromSession;
        fromSessionContext = true;
    }

    if (!targetPackage) {
        return {
            reply: (
                "Bạn muốn hỏi thêm về gói/xét nghiệm nào, hay muốn mình xem lại thông tin lịch đang giữ? " +
                "Mình sẽ không thay đổi bản nháp khi bạn chỉ hỏi thông tin."
            ),
            packageIntent: { type: "none", package: null, candidates: [] }
        };
    }

    const detail = packageCatalog.buildPackageDetailReply(targetPackage);
    const followUp = (selectedFromMessage || fromSessionContext) && missingFields[0] === "testType"
        ? `Bạn muốn chọn gói ${getPackageChoiceDisplayName(targetPackage)} cho lịch này không?`
        : missingFields.length
            ? `Mình vẫn giữ bản nháp đặt lịch. ${buildNextFieldInstruction(missingFields[0])}`
            : "Mình vẫn giữ bản nháp đặt lịch. Bạn có thể xác nhận, sửa thông tin hoặc hỏi thêm.";

    return {
        reply: [detail, followUp].join("\n\n"),
        packageIntent: selectedFromMessage
            ? { ...packageIntent, type: "detail_question" }
            : fromSessionContext
                ? {
                    type: "detail_question",
                    package: targetPackage,
                    candidates: []
                }
                : {
                    type: "detail_question",
                    package: targetPackage,
                    candidates: []
                },
        fromSessionContext
    };
}

async function buildSemanticReadonlyAssist({
    ruleAct,
    semanticShadow,
    draft = {},
    context = {},
    message = ""
} = {}) {
    const assistAct = semanticShadow?.conversationAct || null;

    if (!isRuleEligible(ruleAct)) {
        return disabled("rule_action_not_eligible", assistAct);
    }

    if (!semanticShadow) {
        return disabled("semantic_shadow_missing", null);
    }

    if (!hasAllowedSemanticProvider(semanticShadow)) {
        return disabled("semantic_provider_not_allowed", assistAct);
    }

    if (semanticShadow.fallbackReason != null) {
        return disabled("semantic_shadow_fallback", assistAct);
    }

    if (Number(semanticShadow.confidence || 0) < MIN_CONFIDENCE) {
        return disabled("semantic_confidence_too_low", assistAct);
    }

    if (semanticShadow.shouldMutateDraft === true) {
        return disabled(
            "semantic_act_blocked",
            assistAct,
            "semantic_should_mutate_draft"
        );
    }

    if (BLOCKED_ACTS.has(assistAct)) {
        return disabled(
            "semantic_act_blocked",
            assistAct,
            `semantic_act_${assistAct}_blocked_readonly_5m5a`
        );
    }

    if (!SAFE_SAFETY_DECISIONS.has(semanticShadow.safetyDecision)) {
        return disabled("semantic_safety_decision_not_allowed", assistAct);
    }

    if (!ASSIST_ACTS.has(assistAct)) {
        return disabled("semantic_act_not_whitelisted", assistAct);
    }

    const missingFields = Array.isArray(context.missingFields)
        ? context.missingFields
        : getMissingFields(draft);

    if (assistAct === "pause_or_hold") {
        return enabled(
            assistAct,
            "semantic_shadow_readonly_pause_or_hold",
            buildPauseReply(draft, missingFields)
        );
    }

    if (assistAct === "help_next_step") {
        return enabled(
            assistAct,
            "semantic_shadow_readonly_help_next_step",
            buildHelpNextStepReply(draft, missingFields)
        );
    }

    if (assistAct === "review_draft") {
        return enabled(
            assistAct,
            "semantic_shadow_readonly_review_draft",
            buildReviewDraftReply(draft, missingFields)
        );
    }

    if (assistAct === "info_detour") {
        const infoAssist = await buildInfoDetourAssist({
            message,
            draft,
            missingFields,
            context
        });

        return enabled(
            assistAct,
            "semantic_shadow_readonly_info_detour",
            infoAssist.reply,
            { packageIntent: infoAssist.packageIntent }
        );
    }

    if (assistAct === "availability_inquiry") {
        const availabilityReply = typeof context.buildAvailabilityInquiryReply === "function"
            ? await context.buildAvailabilityInquiryReply()
            : null;

        return enabled(
            assistAct,
            "semantic_shadow_readonly_availability_inquiry",
            availabilityReply || (
                "Mình sẽ giữ bản nháp hiện tại và chỉ kiểm tra khung giờ trống. " +
                "Bạn muốn xem lịch trống cho ngày nào?"
            )
        );
    }

    return disabled("semantic_act_not_handled", assistAct);
}

function buildSemanticAssistMeta(assistResult) {
    return {
        enabled: Boolean(assistResult?.enabled),
        assistAct: assistResult?.assistAct || null,
        reason: assistResult?.reason || "semantic_assist_not_evaluated",
        ...(assistResult?.blockedReason
            ? { blockedReason: assistResult.blockedReason }
            : {}),
        source: SOURCE
    };
}

module.exports = {
    SOURCE,
    buildSemanticReadonlyAssist,
    buildSemanticAssistMeta
};
