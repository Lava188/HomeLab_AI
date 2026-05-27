const {
    normalizeText,
    detectDateFromMessage,
    detectTimeFromMessage
} = require("../utils/text.util");

const ACTS = {
    FINAL_CONFIRM: "final_confirm",
    PAUSE_OR_HOLD: "pause_or_hold",
    RESUME_AFTER_PAUSE: "resume_after_pause",
    INFO_DETOUR: "info_detour",
    AVAILABILITY_CHECK: "availability_check",
    EDIT_REQUEST: "edit_request",
    CANCEL_OR_ABORT: "cancel_or_abort",
    REVIEW_DRAFT: "review_draft",
    HELP_NEXT_STEP: "help_next_step",
    FIELD_VALUE: "field_value",
    UNCLEAR: "unclear"
};

const SIGNALS = {
    finalConfirm: [
        "xac nhan",
        "xac nhan dat lich",
        "dong y dat lich",
        "dung roi dat lich",
        "tao lich giup toi",
        "xong dat lich"
    ],
    shortAmbiguous: [
        "u",
        "uh",
        "um",
        "ok",
        "oke",
        "roi",
        "the nhe",
        "cai do",
        "nhu tren"
    ],
    pause: [
        "khoan da",
        "khoan",
        "doi chut",
        "cho chut",
        "de toi xem lai",
        "de toi hoi lai",
        "hoi lai nguoi than",
        "hoi lai da",
        "suy nghi them",
        "can nhac them",
        "lat nua toi dat",
        "tam thoi chua",
        "chua dat voi",
        "tu tu",
        "tam dung",
        "dung lai",
        "de toi ban lai voi nguoi nha",
        "ban lai voi nha",
        "ban voi nha",
        "ban voi nguoi than",
        "de roi tinh",
        "roi tinh",
        "de toi tinh",
        "roi se tra loi",
        "tu minh se noi",
        "chua chot ngay",
        "chua chot ngay",
        "de toi xem xet",
        "doi mot chut"
    ],
    info: [
        "la gi",
        "giai thich",
        "gom gi",
        "gom nhung gi",
        "bao gom gi",
        "bao gom",
        "y nghia",
        "noi ro",
        "xem chi tiet",
        "chi tiet",
        "cai goi nay",
        "goi nay",
        "noi ki hon",
        "giai thich ki hon",
        "chi tiet hon ve",
        "nhieu hon ve",
        "cu the hon ve",
        "tim hieu ve",
        "biet them ve",
        "thong tin ve"
    ],
    availability: [
        "khung gio nao trong",
        "khung gio nao con trong",
        "con khung gio nao",
        "gio nao trong",
        "gio nao con trong",
        "co khung nao khac",
        "khung nao khac",
        "gio nao khac",
        "lich nao trong",
        "slot nao trong",
        "con ca nao",
        "co ca nao",
        "ca nao con",
        "ca lay mau nao",
        "lay mau luc nao",
        "gio nao lay mau duoc",
        "khung nao con trong",
        "van còn khung",
        "van con ca"
    ],
    edit: [
        "doi sang",
        "chuyen sang",
        "doi thanh",
        "doi gio",
        "doi ngay",
        "doi dia chi",
        "doi goi",
        "doi ten",
        "doi ten nguoi dat",
        "sua gio",
        "sua ngay",
        "sua dia chi",
        "sua goi",
        "sua ten",
        "sua thong tin",
        "thay doi thong tin",
        "khong dung",
        "chua dung",
        "sai roi",
        "khong phai"
    ],
    cancel: [
        "huy di",
        "huy lich nay",
        "thoi khong dat nua",
        "bo lich nay",
        "khong dat nua"
    ],
    review: [
        "xem lai thong tin",
        "cho toi xem lai",
        "tom tat lai",
        "thong tin hien tai",
        "lich nay dang co thong tin gi",
        "nhac lai toi",
        "nhac giup toi",
        "toi dang nhap toi dau",
        "toi dang o dau",
        "tien do the nao",
        "da nhap gi roi",
        "dang co gi",
        "thong tin dang co",
        "ban nhap hien tai",
        "nhap den gio",
        "xem lại giúp tôi",
        "cho tôi xem lại",
        "tóm tắt giúp tôi"
    ],
    help: [
        "can lam gi",
        "toi can lam gi",
        "gio toi can lam gi",
        "tiep theo lam gi",
        "con thieu gi",
        "con thieu thong tin gi",
        "can bo sung gi",
        "toi con phai dua them thong tin gi",
        "can them gi nua",
        "phai cung cap them gi",
        "can gi them",
        "thieu gi nua",
        "con phai nhap gi",
        "toi phai nhap them gi"
    ]
};

const VAGUE_FIELD_VALUE_SIGNALS = [
    "toi chua biet",
    "chua biet",
    "de toi hoi lai",
    "khong ro",
    "sao cung duoc",
    "vay cung duoc",
    "duoc",
    "ok nhe",
    "oke nhe",
    "tiep tuc di",
    "nhu tren",
    "de sau",
    "hoi lai da",
    "de toi ban lai voi nguoi nha",
    "ban voi nha",
    "ban voi nguoi than",
    "de toi tinh",
    "roi se tra loi",
    "toi con phai dua them thong tin gi",
    "con thieu gi",
    "toi can lam gi",
    "nhac lai toi",
    "toi dang nhap toi dau",
    "toi muon hoi them",
    "toi van chua chac",
    "chua chac",
    "de toi suy nghi"
];

const PENDING_CANCEL_REJECT_SIGNALS = [
    "khong",
    "khong huy",
    "khong huy nua",
    "tiep tuc dat",
    "quay lai",
    "giu lai"
];

const CANCEL_ABORT_CONFIRM_QUESTION =
    "Được, mình sẽ chưa tạo lịch này. Bạn muốn hủy bản nháp đặt lịch hiện tại đúng không? Nếu đúng, hãy trả lời 'Đúng hủy bản nháp'. Nếu không, hãy trả lời 'Tiếp tục đặt lịch'.";

const PENDING_CANCEL_EXPLICIT_QUESTION =
    "Bạn muốn hủy bản nháp đặt lịch này đúng không? Hãy trả lời 'Đúng hủy bản nháp' để xác nhận.";

const CANCEL_ABORT_VERB_PATTERNS = [
    /\bhuy\b/,
    /\bbo\b/,
    /\bthoi\b/,
    /\bkhong\s+can\b/,
    /\bkhong\s+muon\b/,
    /\bdoi\s+y\b/,
    /\bkhoi\b/,
    /\bdung\s+(?:dat|viec\s+dat|lich|kham|xet\s+nghiem|lay\s+mau)\b/
];

const CANCEL_ABORT_CONTEXT_PATTERNS = [
    /\blich\b/,
    /\bdat\s+lich\b/,
    /\bkham\b/,
    /\bxet\s+nghiem\b/,
    /\blay\s+mau\b/,
    /\bgoi\s+nay\b/,
    /\bban\s+nhap\b/
];

const CANCEL_ABORT_NATURAL_PATTERNS = [
    /\bkhong\s+muon\s+(?:kham|dat|xet\s+nghiem|lay\s+mau)(?:\s+nua)?\b/,
    /\bkhong\s+dat\s+nua\b/,
    /\bthoi\s+(?:khoi\s+)?dat\b/,
    /\bkhoi\s+dat\b/,
    /\bbo\s+lich\b/,
    /\bhuy\s+lich\b/,
    /\bhuy\s+dat\s+lich\b/
];

const SHORT_CANCEL_ABORT_SIGNALS = new Set([
    "huy",
    "bo",
    "thoi",
    "khoi"
]);

const PENDING_EDIT_REJECT_SIGNALS = [
    "khong",
    "khong sua",
    "khong sua nua",
    "giu nhu cu",
    "giu gio cu",
    "giu lich cu",
    "thoi khong doi"
];

const PENDING_EDIT_CONFIRM_SIGNALS = [
    "dung",
    "dong y",
    "ok",
    "oke",
    "dong y doi",
    "dung roi sua",
    "dung roi doi"
];

function baseResult(overrides) {
    return {
        act: ACTS.UNCLEAR,
        confidence: 0.4,
        reason: "no_clear_current_intent",
        shouldMutateDraft: false,
        requiresClarification: true,
        targetField: null,
        targetValue: null,
        blockedBy: [],
        suggestedNextQuestion:
            "Ý bạn là muốn tiếp tục đặt lịch, sửa thông tin, hay hỏi thêm về gói xét nghiệm?",
        ...overrides
    };
}

function includesAny(text, signals) {
    return signals.some((signal) => text.includes(signal));
}

function exactAny(text, signals) {
    return signals.includes(text.trim());
}

function testAnyPattern(text, patterns) {
    return patterns.some((pattern) => pattern.test(text));
}

function detectCancelAbortEvidence({ normalized, context }) {
    const trimmed = String(normalized || "").trim();
    const activeDraft = Boolean(context?.activeDraft);

    if (!trimmed) {
        return {
            detected: false,
            confidence: 0,
            reason: null,
            suggestedNextQuestion: CANCEL_ABORT_CONFIRM_QUESTION
        };
    }

    const hasNaturalCancel = testAnyPattern(trimmed, CANCEL_ABORT_NATURAL_PATTERNS);
    const hasCancelVerb = testAnyPattern(trimmed, CANCEL_ABORT_VERB_PATTERNS);
    const hasBookingContext = testAnyPattern(trimmed, CANCEL_ABORT_CONTEXT_PATTERNS);
    const isShortCancel = SHORT_CANCEL_ABORT_SIGNALS.has(trimmed);

    if (activeDraft && isShortCancel) {
        return {
            detected: true,
            confidence: 0.82,
            reason: "short_cancel_in_active_booking_context",
            suggestedNextQuestion: CANCEL_ABORT_CONFIRM_QUESTION
        };
    }

    if (hasNaturalCancel && (activeDraft || hasBookingContext)) {
        return {
            detected: true,
            confidence: 0.9,
            reason: "cancel_abort_current_booking_draft",
            suggestedNextQuestion: CANCEL_ABORT_CONFIRM_QUESTION
        };
    }

    if (hasCancelVerb && hasBookingContext) {
        return {
            detected: true,
            confidence: activeDraft ? 0.88 : 0.78,
            reason: activeDraft
                ? "cancel_abort_current_booking_draft"
                : "cancel_signal_without_active_booking_draft",
            suggestedNextQuestion: CANCEL_ABORT_CONFIRM_QUESTION
        };
    }

    if (activeDraft && hasCancelVerb) {
        return {
            detected: true,
            confidence: 0.76,
            reason: "cancel_abort_current_booking_draft",
            suggestedNextQuestion: CANCEL_ABORT_CONFIRM_QUESTION
        };
    }

    return {
        detected: false,
        confidence: 0,
        reason: null,
        suggestedNextQuestion: CANCEL_ABORT_CONFIRM_QUESTION
    };
}

function countEvidence(normalized) {
    return {
        finalConfirm: includesAny(normalized, SIGNALS.finalConfirm),
        shortAmbiguous: exactAny(normalized, SIGNALS.shortAmbiguous),
        pause: includesAny(normalized, SIGNALS.pause),
        info: includesAny(normalized, SIGNALS.info),
        availability: includesAny(normalized, SIGNALS.availability),
        edit: includesAny(normalized, SIGNALS.edit),
        cancel: includesAny(normalized, SIGNALS.cancel),
        review: includesAny(normalized, SIGNALS.review),
        help: includesAny(normalized, SIGNALS.help)
    };
}

function isShortConfirmation(message) {
    const normalized = normalizeText(message).trim();
    return ["xac nhan", "dong y", "dung roi", "dung"].includes(normalized);
}

function isExplicitResumeConfirmation(message) {
    const normalized = normalizeText(message).trim();

    return Boolean(
        normalized.includes("xac nhan lich nay") ||
            normalized.includes("xac nhan dat lich nay") ||
            (normalized.startsWith("dung") && normalized.includes("xac nhan")) ||
            (normalized.startsWith("dong y") && normalized.includes("lich nay"))
    );
}

function isCancelDraftConfirmation(message) {
    const normalized = normalizeText(message).trim();

    return Boolean(
        (
            normalized.startsWith("dung") ||
            normalized.startsWith("dong y") ||
            normalized.startsWith("xac nhan")
        ) &&
            normalized.includes("huy") &&
            normalized.includes("ban nhap")
    );
}

function isPendingEditConfirmation(message) {
    const normalized = normalizeText(message).trim();
    return PENDING_EDIT_CONFIRM_SIGNALS.some((signal) =>
        normalized === signal || normalized.includes(signal)
    );
}

function isPendingEditReject(message) {
    const normalized = normalizeText(message).trim();
    return PENDING_EDIT_REJECT_SIGNALS.some((signal) =>
        normalized === signal || normalized.includes(signal)
    );
}

function isPendingCancelReject(message) {
    const normalized = normalizeText(message).trim();
    return PENDING_CANCEL_REJECT_SIGNALS.some((signal) =>
        normalized === signal || normalized.includes(signal)
    );
}

function detectRelativeDateValue(normalized) {
    if (!normalized.includes("ngay kia")) {
        return null;
    }

    const date = new Date();
    date.setDate(date.getDate() + 2);

    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0")
    ].join("-");
}

function detectEditTextValue(message, prefixes) {
    const text = String(message || "").trim();
    const normalized = normalizeText(text);
    const connectors = ["thanh", "sang", "la", ":"];

    for (const prefix of prefixes) {
        const prefixIndex = normalized.indexOf(prefix);
        if (prefixIndex < 0) continue;

        const afterPrefix = text.slice(prefixIndex + prefix.length).trim();
        const normalizedAfterPrefix = normalizeText(afterPrefix);
        const connector = connectors.find((item) =>
            normalizedAfterPrefix.startsWith(item)
        );

        if (!connector) continue;

        return afterPrefix.slice(connector.length).replace(/^[:\s-]+/, "").trim();
    }

    return null;
}

function detectEditTarget(message) {
    const normalized = normalizeText(message);
    const timeValue = detectTimeFromMessage(message);
    const dateValue = detectDateFromMessage(message) || detectRelativeDateValue(normalized);
    const addressValue = detectEditTextValue(message, [
        "sua dia chi",
        "doi dia chi",
        "dia chi"
    ]);
    const patientNameValue = detectEditTextValue(message, [
        "sua ten nguoi dat",
        "doi ten nguoi dat",
        "sua ten",
        "doi ten",
        "ten nguoi dat",
        "ten"
    ]);

    if (
        timeValue &&
        (
            normalized.includes("doi sang") ||
            normalized.includes("chuyen sang") ||
            normalized.includes("doi gio") ||
            normalized.includes("sua gio")
        )
    ) {
        return {
            targetField: "appointmentTime",
            targetValue: timeValue
        };
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
        return {
            targetField: "appointmentDate",
            targetValue: dateValue
        };
    }

    if (
        addressValue &&
        (
            normalized.includes("doi dia chi") ||
            normalized.includes("sua dia chi")
        )
    ) {
        return {
            targetField: "address",
            targetValue: addressValue
        };
    }

    if (
        patientNameValue &&
        (
            normalized.includes("doi ten") ||
            normalized.includes("sua ten")
        )
    ) {
        return {
            targetField: "patientName",
            targetValue: patientNameValue
        };
    }

    if (
        normalized.includes("doi goi") ||
        normalized.includes("sua goi") ||
        (
            normalized.includes("doi sang") &&
            (
                normalized.includes("goi") ||
                normalized.includes("mo mau") ||
                normalized.includes("chuc nang") ||
                normalized.includes("tong quat") ||
                normalized.includes("cong thuc mau") ||
                normalized.includes("hba1c")
            )
        )
    ) {
        return {
            targetField: "testType",
            targetValue: message
        };
    }

    return {
        targetField: null,
        targetValue: null
    };
}

function buildContext({ session, draft, missingFields }) {
    const activeDraft = Boolean(session?.currentFlow === "booking" && draft);
    const paused = session?.status === "booking_paused";
    const pendingEdit = session?.pendingDraftEdit || null;
    const pendingCancel = Boolean(session?.pendingDraftCancel);
    const ready = activeDraft && Array.isArray(missingFields) && missingFields.length === 0;

    return {
        activeDraft,
        paused,
        pendingEdit,
        pendingCancel,
        ready,
        missingFields: missingFields || []
    };
}

function isLikelyFieldValueForContext({ message, normalized, context, evidence }) {
    if (VAGUE_FIELD_VALUE_SIGNALS.some((signal) => normalized.includes(signal))) {
        return false;
    }

    if ([
        evidence.finalConfirm,
        evidence.pause,
        evidence.info,
        evidence.availability,
        evidence.edit,
        evidence.cancel,
        evidence.review,
        evidence.help
    ].some(Boolean)) {
        return false;
    }

    if (
        detectTimeFromMessage(message) ||
        detectDateFromMessage(message) ||
        detectRelativeDateValue(normalized) ||
        /(\+84|0)\d(?:[\s.\-]?\d){8,10}/.test(String(message || "")) ||
        /\b(dia chi|tai|ten toi la|ten:|sdt|so dien thoai)\b/.test(normalized)
    ) {
        return true;
    }

    const nextField = context.missingFields[0] || null;

    if (!nextField) return false;
    if (nextField === "appointmentTime") return Boolean(detectTimeFromMessage(message));
    if (nextField === "appointmentDate") {
        return Boolean(
            detectDateFromMessage(message) ||
                detectRelativeDateValue(normalized) ||
                /\b(ngay mai|hom nay|\d{1,2}[/-]\d{1,2})\b/.test(normalized)
        );
    }
    if (nextField === "testType") {
        return /\b(goi|xet nghiem|chuc nang|mo mau|tong quat|cong thuc mau|hba1c)\b/.test(normalized);
    }
    if (nextField === "phoneNumber") {
        return /(\+84|0)\d(?:[\s.\-]?\d){8,10}/.test(String(message || ""));
    }
    if (nextField === "address") {
        return String(message || "").trim().length >= 5;
    }
    if (nextField === "patientName") {
        const trimmed = String(message || "").trim();
        const wordCount = trimmed.split(/\s+/).filter(Boolean).length;

        return !/\d/.test(trimmed) && wordCount >= 2 && wordCount <= 6;
    }

    return false;
}

function buildUnclearFieldQuestion(nextField) {
    if (nextField === "patientName") {
        return "Mình chưa ghi nhận tên người đặt. Bạn vui lòng cho mình họ tên người đặt lịch.";
    }

    if (nextField === "address") {
        return "Mình chưa chắc đây là địa chỉ lấy mẫu. Bạn muốn tạm dừng để hỏi lại hay nhập địa chỉ sau?";
    }

    if (nextField === "appointmentTime") {
        return "Mình chưa nhận ra giờ lấy mẫu. Bạn vui lòng nhập giờ, ví dụ 7h30 hoặc 08:00.";
    }

    if (nextField === "appointmentDate") {
        return "Mình chưa nhận ra ngày lấy mẫu. Bạn vui lòng nhập ngày, ví dụ ngày mai hoặc 27/05/2026.";
    }

    if (nextField === "testType") {
        return "Mình chưa nhận ra gói xét nghiệm bạn muốn đặt. Bạn muốn chọn gói nào của HomeLab?";
    }

    return "Ý bạn là muốn tiếp tục đặt lịch, sửa thông tin, hay hỏi thêm về gói xét nghiệm?";
}

function classifyConversationAct({ message, session = null, draft = null, missingFields = [] }) {
    const normalized = normalizeText(message).trim();
    const context = buildContext({ session, draft, missingFields });
    const evidence = countEvidence(normalized);
    const cancelEvidence = detectCancelAbortEvidence({ normalized, context });
    evidence.cancel = cancelEvidence.detected;
    const editTarget = detectEditTarget(message);
    const intentCount = [
        evidence.finalConfirm,
        evidence.pause,
        evidence.info,
        evidence.availability,
        evidence.edit,
        evidence.cancel,
        evidence.review,
        evidence.help
    ].filter(Boolean).length;

    if (!normalized) {
        return baseResult({
            confidence: 0.2,
            reason: "empty_message"
        });
    }

    if (context.pendingCancel && isCancelDraftConfirmation(message)) {
        return baseResult({
            act: ACTS.CANCEL_OR_ABORT,
            confidence: 0.9,
            reason: "explicit_cancel_draft_confirmation_in_pending_cancel_context",
            requiresClarification: false,
            shouldMutateDraft: false,
            cancelMode: "confirm_pending"
        });
    }

    if (context.pendingCancel && isPendingCancelReject(message)) {
        return baseResult({
            act: ACTS.CANCEL_OR_ABORT,
            confidence: 0.86,
            reason: "reject_cancel_draft_in_pending_cancel_context",
            requiresClarification: false,
            shouldMutateDraft: false,
            cancelMode: "reject_pending"
        });
    }

    if (context.pendingCancel) {
        return baseResult({
            act: ACTS.CANCEL_OR_ABORT,
            confidence: 0.56,
            reason: cancelEvidence.detected
                ? "pending_cancel_still_requires_explicit_cancel_draft_confirmation"
                : "pending_cancel_needs_clear_yes_or_no",
            requiresClarification: true,
            shouldMutateDraft: false,
            blockedBy: ["pending_cancel"],
            suggestedNextQuestion: PENDING_CANCEL_EXPLICIT_QUESTION
        });
    }

    if (context.paused && isExplicitResumeConfirmation(message)) {
        return baseResult({
            act: ACTS.RESUME_AFTER_PAUSE,
            confidence: 0.92,
            reason: "explicit_resume_confirmation_after_pause",
            requiresClarification: false,
            shouldMutateDraft: false,
            suggestedNextQuestion: null,
            resumeMode: "explicit"
        });
    }

    if (context.paused && (isShortConfirmation(message) || evidence.shortAmbiguous)) {
        return baseResult({
            act: ACTS.RESUME_AFTER_PAUSE,
            confidence: 0.74,
            reason: "short_confirmation_blocked_by_paused_context",
            requiresClarification: true,
            shouldMutateDraft: false,
            blockedBy: ["paused"],
            suggestedNextQuestion:
                "Bạn muốn tiếp tục xác nhận lịch vừa tạm dừng đúng không? Nếu đúng, hãy trả lời 'Đúng, xác nhận lịch này'.",
            resumeMode: "needs_reconfirm"
        });
    }

    if (
        context.paused &&
        (
            normalized.includes("tiep tuc dat") ||
            normalized.includes("tiep tuc dat lich") ||
            normalized.includes("tiep tuc lich") ||
            normalized.includes("quay lai dat")
        )
    ) {
        return baseResult({
            act: ACTS.RESUME_AFTER_PAUSE,
            confidence: 0.88,
            reason: "explicit_continue_after_pause",
            requiresClarification: false,
            shouldMutateDraft: false,
            suggestedNextQuestion: null,
            resumeMode: "continue"
        });
    }

    if (context.pendingEdit && isPendingEditConfirmation(message)) {
        return baseResult({
            act: ACTS.EDIT_REQUEST,
            confidence: 0.86,
            reason: "confirmation_resolves_pending_draft_edit",
            requiresClarification: false,
            shouldMutateDraft: true,
            targetField: context.pendingEdit.field || null,
            targetValue: context.pendingEdit.value || null,
            editMode: "confirm_pending",
            edit: context.pendingEdit
        });
    }

    if (context.pendingEdit && isPendingEditReject(message)) {
        return baseResult({
            act: ACTS.EDIT_REQUEST,
            confidence: 0.86,
            reason: "reject_pending_draft_edit",
            requiresClarification: false,
            shouldMutateDraft: false,
            editMode: "reject_pending",
            edit: context.pendingEdit
        });
    }

    if (context.pendingEdit) {
        return baseResult({
            act: ACTS.EDIT_REQUEST,
            confidence: 0.54,
            reason: "pending_edit_needs_clear_confirmation",
            requiresClarification: true,
            shouldMutateDraft: false,
            blockedBy: ["pending_edit"],
            suggestedNextQuestion:
                "Bạn có muốn áp dụng thay đổi này không? Nếu đồng ý hãy trả lời 'Đồng ý đổi', nếu không hãy nói 'Không, giữ như cũ'.",
            editMode: "clarify_pending",
            edit: context.pendingEdit
        });
    }

    if (intentCount > 1 && evidence.edit) {
        return baseResult({
            act: ACTS.EDIT_REQUEST,
            confidence: 0.82,
            reason: "conflicting_intent_prioritized_edit_over_confirmation",
            requiresClarification: !editTarget.targetField,
            shouldMutateDraft: false,
            targetField: editTarget.targetField,
            targetValue: editTarget.targetValue,
            blockedBy: ["conflicting_intent"],
            suggestedNextQuestion: editTarget.targetField
                ? null
                : "Bạn muốn sửa thông tin nào: gói xét nghiệm, ngày giờ lấy mẫu, địa chỉ hay tên người đặt?",
            editMode: editTarget.targetField ? "propose_change" : "ask_target",
            edit: {
                field: editTarget.targetField,
                value: editTarget.targetValue
            }
        });
    }

    if (evidence.info) {
        return baseResult({
            act: ACTS.INFO_DETOUR,
            confidence: 0.88,
            reason: "current_message_asks_for_package_or_test_information",
            requiresClarification: false,
            shouldMutateDraft: false,
            suggestedNextQuestion: null
        });
    }

    if (evidence.availability) {
        return baseResult({
            act: ACTS.AVAILABILITY_CHECK,
            confidence: 0.86,
            reason: "current_message_asks_available_slots",
            requiresClarification: false,
            shouldMutateDraft: false,
            suggestedNextQuestion: null
        });
    }

    if (cancelEvidence.detected) {
        return baseResult({
            act: ACTS.CANCEL_OR_ABORT,
            confidence: cancelEvidence.confidence || 0.86,
            reason: cancelEvidence.reason || (
                context.activeDraft
                    ? "cancel_abort_current_booking_draft"
                    : "cancel_signal_without_booking_code"
            ),
            requiresClarification: true,
            shouldMutateDraft: false,
            suggestedNextQuestion: cancelEvidence.suggestedNextQuestion
        });
    }

    if (evidence.edit) {
        return baseResult({
            act: ACTS.EDIT_REQUEST,
            confidence: editTarget.targetField ? 0.86 : 0.78,
            reason: editTarget.targetField
                ? "edit_signal_with_target_value"
                : "edit_signal_needs_target_field",
            requiresClarification: !editTarget.targetField,
            shouldMutateDraft: false,
            targetField: editTarget.targetField,
            targetValue: editTarget.targetValue,
            suggestedNextQuestion: editTarget.targetField
                ? null
                : "Bạn muốn sửa gói xét nghiệm, ngày giờ lấy mẫu, địa chỉ hay tên người đặt?",
            editMode: editTarget.targetField ? "propose_change" : "ask_target",
            edit: {
                field: editTarget.targetField,
                value: editTarget.targetValue
            }
        });
    }

    if (evidence.pause) {
        return baseResult({
            act: ACTS.PAUSE_OR_HOLD,
            confidence: 0.84,
            reason: "pause_or_hold_signal_with_active_context",
            requiresClarification: false,
            shouldMutateDraft: false
        });
    }

    if (evidence.review) {
        return baseResult({
            act: ACTS.REVIEW_DRAFT,
            confidence: 0.84,
            reason: "current_message_requests_draft_review",
            requiresClarification: false,
            shouldMutateDraft: false
        });
    }

    if (evidence.help) {
        return baseResult({
            act: ACTS.HELP_NEXT_STEP,
            confidence: 0.82,
            reason: "current_message_asks_next_step",
            requiresClarification: false,
            shouldMutateDraft: false
        });
    }

    if (evidence.shortAmbiguous) {
        return baseResult({
            act: ACTS.UNCLEAR,
            confidence: 0.45,
            reason: context.ready
                ? "short_ambiguous_message_at_ready_confirmation"
                : "short_ambiguous_message",
            requiresClarification: true,
            shouldMutateDraft: false,
            blockedBy: context.ready ? ["ready_confirmation_requires_clear_intent"] : [],
            suggestedNextQuestion: context.ready
                ? "Bạn muốn xác nhận lịch này, sửa thông tin, hay hỏi thêm?"
                : "Ý bạn là muốn tiếp tục đặt lịch, sửa thông tin, hay hỏi thêm về gói xét nghiệm?"
        });
    }

    if (evidence.finalConfirm || isShortConfirmation(message)) {
        const blockedBy = [];
        if (!context.activeDraft) blockedBy.push("no_active_draft");
        if (context.paused) blockedBy.push("paused");
        if (context.pendingEdit) blockedBy.push("pending_edit");
        if (context.pendingCancel) blockedBy.push("pending_cancel");
        if (!context.ready) blockedBy.push("draft_missing_fields");

        return baseResult({
            act: ACTS.FINAL_CONFIRM,
            confidence: blockedBy.length ? 0.62 : 0.9,
            reason: blockedBy.length
                ? "confirmation_blocked_by_booking_context"
                : "clear_confirmation_with_ready_active_draft",
            requiresClarification: blockedBy.length > 0,
            shouldMutateDraft: false,
            blockedBy,
            suggestedNextQuestion: blockedBy.includes("draft_missing_fields")
                ? "Mình vẫn còn thiếu thông tin để đặt lịch. Bạn muốn xem còn thiếu gì không?"
                : blockedBy.includes("paused")
                    ? "Bạn muốn tiếp tục xác nhận lịch vừa tạm dừng đúng không?"
                    : "Bạn muốn xác nhận lịch này, sửa thông tin, hay hỏi thêm?"
        });
    }

    if (isLikelyFieldValueForContext({ message, normalized, context, evidence })) {
        return baseResult({
            act: ACTS.FIELD_VALUE,
            confidence: 0.76,
            reason: "message_matches_next_expected_field",
            requiresClarification: false,
            shouldMutateDraft: true,
            suggestedNextQuestion: null
        });
    }

    return baseResult({
        act: ACTS.UNCLEAR,
        confidence: 0.42,
        reason: "no_intent_signal_confident_enough",
        requiresClarification: true,
        shouldMutateDraft: false,
        targetField: context.missingFields[0] || null,
        blockedBy: context.missingFields[0] ? ["field_value_not_confident"] : [],
        suggestedNextQuestion: context.missingFields[0]
            ? buildUnclearFieldQuestion(context.missingFields[0])
            : "Ý bạn là muốn tiếp tục đặt lịch, sửa thông tin, hay hỏi thêm về gói xét nghiệm?"
    });
}

module.exports = {
    ACTS,
    classifyConversationAct,
    detectCancelAbortEvidence,
    isExplicitResumeConfirmation,
    isShortConfirmation
};
