const { normalizeText } = require("../../utils/text.util");

const CONTEXT_VERSION = "health_consultation_context_v1";

const URGENT_RED_FLAG_PATTERNS = [
    "dau nguc kho tho",
    "dau nguc va mo hoi",
    "kho tho va mo hoi",
    "kho tho moi tim",
    "kho tho tim tai",
    "tim moi",
    "tim tai",
    "sot cao lo mo",
    "sot cao lu lan",
    "sot cao tho nhanh",
    "ho ra mau",
    "non ra mau",
    "phan den",
    "dau dau dot ngot",
    "meo mieng",
    "noi kho",
    "yeu mot ben",
    "yeu nua nguoi",
    "liet nua nguoi",
    "co giat",
    "xau di nhanh",
    "ban khong mat mau",
    "ngat lien tuc",
    "choang vang"
];

const SYMPTOM_SIGNALS = [
    "met",
    "met moi",
    "hay met",
    "muc toi",
    "suc giam",
    "an uong kem",
    "chan an",
    "buon non",
    "hay non",
    "chong mat",
    "choang",
    "nhuc dau",
    "dau dau",
    "dau bung",
    "dau dau du doi",
    "dau dau am i"
];

const TEST_ADEQUACY_PATTERNS = [
    "khong bi",
    "khong co",
    "khong thay",
    "khong dau nguc",
    "khong kho tho",
    "khong kho",
    "khong met",
    "khong chong mat",
    "khong ngat",
    "khong sot",
    "khong ho",
    "khong non",
    "khong nham"
];

const EXPLICIT_TEST_EXPLANATION_TERMS = [
    "hba1c",
    "glucose",
    "duong huyet",
    "alt",
    "ast",
    "men gan",
    "creatinine",
    "creatinin",
    "egfr",
    "gfr",
    "cholesterol",
    "triglyceride",
    "mo mau",
    "cbc",
    "cong thuc mau"
];

const LIFESTYLE_ADVICE_PATTERNS = [
    "ha huyet ap",
    "giam huyet ap",
    "huyet ap cao",
    "giam mo mau",
    "mo mau cao",
    "kiem soat duong huyet",
    "giam duong huyet",
    "kiem soat tieu duong",
    "kiem soát tiểu đường",
    "giam can",
    "giu can",
    "an healthy",
    "song khoe",
    "song healthy",
    "lối sống",
    "loai song"
];

const LAB_RESULT_SEVERITY_PATTERNS = [
    "cao co nguy hiem",
    "cao co nghiêm trọng",
    "thap co nguy hiem",
    "thap co nghiêm trọng",
    "bat thuong co phai",
    "co nguy hiem khong",
    "co nghiêm trọng không",
    "co dang lo không",
    "dang lo",
    "nghiem trọng",
    "nguy hiem"
];

const READ_ONLY_CONSULTATION_PATTERNS = [
    "chi hoi truoc",
    "hoi truoc",
    "chua muon dat",
    "chưa muốn đặt",
    "chua dat lich",
    "chưa đặt lịch",
    "chua muon kham",
    "chưa muốn khám",
    "chua muon xet nghiem",
    "chưa muốn xét nghiệm",
    "chi tu van",
    "chỉ tư vấn",
    "chi hoi thong tin",
    "chỉ hỏi thông tin",
    "tim hieu truoc",
    "tim hiểu trước"
];

const EXPLANATION_QUESTION_SIGNALS = [
    "la gi",
    "dung de lam gi",
    "kiem tra gi",
    "de lam gi",
    "y nghia",
    "giai thich",
    "chi so",
    "ket qua",
    "doc ket qua"
];

const PACKAGE_READY_PATTERNS = [
    "kiem tra tong quat",
    "xet nghiem tong quat",
    "goi tong quat",
    "khao sat suc khoe",
    "kiem tra suc khoe",
    "check up",
    "checkup"
];

const LIVER_SPECIFIC_PATTERNS = [
    "uong ruou",
    "uong bia",
    "uong nhieu",
    "tieu khang",
    "gam ran",
    "kiem tra gan",
    "xet nghiem gan",
    "men gan",
    "chuc nang gan",
    "gan"
];

const KIDNEY_SPECIFIC_PATTERNS = [
    "kiem tra than",
    "xet nghiem than",
    "chuc nang than",
    "loc cau than",
    "creatinine",
    "creatinin",
    "egfr",
    "gfr"
];

const GENERAL_HEALTH_ASK_PATTERNS = [
    "toi khoe khong",
    "toi co benh khong",
    "ban kham",
    "chan doan"
];

function hasUrgentRedFlag(normalizedMessage) {
    return URGENT_RED_FLAG_PATTERNS.some((pattern) =>
        normalizedMessage.includes(pattern)
    );
}

function hasSymptomSignal(normalizedMessage) {
    return SYMPTOM_SIGNALS.some((signal) =>
        normalizedMessage.includes(signal)
    );
}

function countSymptomDetails(normalizedMessage) {
    let count = 0;
    const detailPatterns = [
        { pattern: "tuoi", value: 2 },
        { pattern: "thang", value: 2 },
        { pattern: "ngay", value: 1 },
        { pattern: "tuan", value: 1 },
        { pattern: "nam", value: 2 },
        { pattern: "nu", value: 2 },
        { pattern: "nam tuoi", value: 3 },
        { pattern: "nu tuoi", value: 3 },
        { pattern: "khong bi", value: 1 },
        { pattern: "khong co", value: 1 },
        { pattern: "khong dau", value: 1 },
        { pattern: "khong kho", value: 1 }
    ];

    for (const { pattern, value } of detailPatterns) {
        if (normalizedMessage.includes(pattern)) {
            count += value;
        }
    }

    return count;
}

function isTestExplanationQuery(normalizedMessage) {
    const hasTestTerm = EXPLICIT_TEST_EXPLANATION_TERMS.some((term) =>
        normalizedMessage.includes(term)
    );
    const hasQuestion = EXPLANATION_QUESTION_SIGNALS.some((signal) =>
        normalizedMessage.includes(signal)
    );

    return hasTestTerm && hasQuestion;
}

function isGeneralHealthQuestion(normalizedMessage) {
    return GENERAL_HEALTH_ASK_PATTERNS.some((pattern) =>
        normalizedMessage.includes(pattern)
    );
}

function detectUserGoal(normalizedMessage) {
    if (hasUrgentRedFlag(normalizedMessage)) {
        return "urgent_health";
    }

    const hasReadOnlySignal = READ_ONLY_CONSULTATION_PATTERNS.some((pattern) =>
        normalizedMessage.includes(pattern)
    );
    if (hasReadOnlySignal) {
        return "read_only_consultation";
    }

    const hasLifestyleAdvice = LIFESTYLE_ADVICE_PATTERNS.some((pattern) =>
        normalizedMessage.includes(pattern)
    );
    if (hasLifestyleAdvice) {
        return "lifestyle_health_guidance";
    }

    const hasSeveritySignal = LAB_RESULT_SEVERITY_PATTERNS.some((pattern) =>
        normalizedMessage.includes(pattern)
    );
    const hasLabTerm = EXPLICIT_TEST_EXPLANATION_TERMS.some((term) =>
        normalizedMessage.includes(term)
    );
    if (hasSeveritySignal && hasLabTerm) {
        return "lab_result_severity";
    }

    if (isTestExplanationQuery(normalizedMessage)) {
        return "test_explanation";
    }

    if (isGeneralHealthQuestion(normalizedMessage)) {
        return "unclear_health_request";
    }

    const hasPackageReady = PACKAGE_READY_PATTERNS.some((pattern) =>
        normalizedMessage.includes(pattern)
    );

    if (hasPackageReady) {
        return "package_recommendation_ready";
    }

    const hasLiverSpecific = LIVER_SPECIFIC_PATTERNS.some((pattern) =>
        normalizedMessage.includes(pattern)
    );

    if (hasLiverSpecific) {
        return "liver_specific_inquiry";
    }

    const hasKidneySpecific = KIDNEY_SPECIFIC_PATTERNS.some((pattern) =>
        normalizedMessage.includes(pattern)
    );

    if (hasKidneySpecific) {
        return "kidney_specific_inquiry";
    }

    const hasSymptom = hasSymptomSignal(normalizedMessage);

    if (hasSymptom) {
        return "symptom_advice";
    }

    if (
        normalizedMessage.includes("xet nghiem") ||
        normalizedMessage.includes("kiem tra") ||
        normalizedMessage.includes("goi xet nghiem")
    ) {
        return "test_advice";
    }

    return "unclear_health_request";
}

function assessInformationCompleteness(normalizedMessage, userGoal) {
    const missingInfo = [];
    const detailScore = countSymptomDetails(normalizedMessage);

    if (userGoal === "symptom_advice" || userGoal === "test_advice") {
        const hasAge = /\d+\s*tuoi/.test(normalizedMessage);
        const hasDuration = /(\d+)(ngay|tuan|thang|nam)/.test(normalizedMessage);
        const hasNegativePatterns = TEST_ADEQUACY_PATTERNS.some((pattern) =>
            normalizedMessage.includes(pattern)
        );
        const hasSymptomSpecific = hasSymptomSignal(normalizedMessage);

        if (!hasAge) {
            missingInfo.push("age");
        }

        if (!hasDuration && !hasSymptomSpecific) {
            missingInfo.push("duration_or_symptom_detail");
        }

        if (!hasNegativePatterns && userGoal === "symptom_advice") {
            missingInfo.push("safety_check");
        }

        if (detailScore < 3 && missingInfo.length > 0) {
            return {
                isComplete: false,
                missingInfo,
                detailScore
            };
        }
    }

    if (userGoal === "liver_specific_inquiry" || userGoal === "kidney_specific_inquiry") {
        const hasAge = /\d+\s*tuoi/.test(normalizedMessage);
        const hasNegativePatterns = TEST_ADEQUACY_PATTERNS.some((pattern) =>
            normalizedMessage.includes(pattern)
        );

        if (!hasAge) {
            missingInfo.push("age");
        }

        if (!hasNegativePatterns) {
            missingInfo.push("safety_check");
        }

        if (missingInfo.length > 0) {
            return {
                isComplete: false,
                missingInfo,
                detailScore
            };
        }
    }

    if (userGoal === "unclear_health_request") {
        return {
            isComplete: false,
            missingInfo: ["symptom_or_goal"],
            detailScore: 0
        };
    }

    if (userGoal === "package_recommendation_ready") {
        const hasAge = /\d+\s*tuoi/.test(normalizedMessage);
        const hasNegativePatterns = TEST_ADEQUACY_PATTERNS.some((pattern) =>
            normalizedMessage.includes(pattern)
        );

        if (!hasAge) {
            missingInfo.push("age");
        }

        if (!hasNegativePatterns) {
            missingInfo.push("safety_check");
        }

        if (missingInfo.length > 0) {
            return {
                isComplete: false,
                missingInfo,
                detailScore
            };
        }
    }

    return {
        isComplete: true,
        missingInfo: [],
        detailScore
    };
}

function generateClarifyingQuestions(userGoal, missingInfo, normalizedMessage) {
    const questions = [];

    if (missingInfo.includes("age")) {
        if (userGoal === "liver_specific_inquiry") {
            questions.push("Bạn bao nhiêu tuổi và hiện tại có đang dùng thuốc gì không?");
        } else if (userGoal === "kidney_specific_inquiry") {
            questions.push("Bạn bao nhiêu tuổi, có tiểu khó, tiểu ít hay có tiền sử bệnh thận không?");
        } else {
            questions.push("Bạn bao nhiêu tuổi?");
        }
    }

    if (missingInfo.includes("duration_or_symptom_detail")) {
        if (normalizedMessage.includes("met")) {
            questions.push("Tình trạng mệt kéo dài bao lâu, có kèm sụt cân, sốt hoặc khó thở không?");
        } else if (normalizedMessage.includes("dau dau")) {
            questions.push("Đau đầu bao lâu, có buồn nôn, nhạy cảm ánh sáng hoặc nghe ồn không?");
        } else if (normalizedMessage.includes("dau bung")) {
            questions.push("Đau bụng bao lâu, vị trí nào, có nôn, tiêu lỏng hoặc phân đen không?");
        } else {
            questions.push("Triệu chứng này kéo dài bao lâu và có kèm theo dấu hiệu nào khác không?");
        }
    }

    if (missingInfo.includes("safety_check")) {
        if (normalizedMessage.includes("met")) {
            questions.push("Bạn có đau ngực, khó thở, chóng mặt, ngất hoặc tim đập nhanh không?");
        } else {
            questions.push("Bạn có đau ngực, khó thở, ngất, sốt cao hoặc tình trạng xấu đi nhanh không?");
        }
    }

    if (missingInfo.includes("symptom_or_goal")) {
        questions.push("Bạn đang lo dấu hiệu nào cụ thể, hay muốn kiểm tra tổng quát để an tâm?");
    }

    return questions.slice(0, 3);
}

function suggestPackageHints(userGoal, normalizedMessage) {
    if (userGoal === "liver_specific_inquiry") {
        return ["LIVER_FUNCTION"];
    }

    if (userGoal === "kidney_specific_inquiry") {
        return ["KIDNEY_FUNCTION"];
    }

    if (userGoal === "package_recommendation_ready") {
        return ["GENERAL_CHECKUP"];
    }

    if (
        userGoal === "symptom_advice" &&
        (normalizedMessage.includes("met") ||
            normalizedMessage.includes("an uong kem") ||
            normalizedMessage.includes("suc giam"))
    ) {
        return ["GENERAL_CHECKUP", "CBC", "LIPID_PROFILE"];
    }

    return [];
}

function getRecentHealthMessages(sessionContext = {}) {
    const candidates = [
        sessionContext.recentHealthMessages,
        sessionContext.healthMessages,
        sessionContext.recentMessages,
        sessionContext.messages,
        sessionContext.chatHistory
    ];

    for (const item of candidates) {
        if (Array.isArray(item)) {
            return item
                .map((m) => ({
                    role: m.role || m.sender || "unknown",
                    content: m.content || m.message || m.text || ""
                }))
                .filter((m) => m.content);
        }
    }

    return [];
}

function extractSymptomsFromText(value = "") {
    const text = normalizeText(value);
    const symptoms = [];

    if (/\b(met|moi|duoi suc|yeu nguoi|yeu hon)\b/.test(text)) symptoms.push("mệt");
    if (/\b(chong mat|choang|xay xam|hoa mat)\b/.test(text)) symptoms.push("chóng mặt");
    if (/\b(an uong kem|chan an|an kem|sut can)\b/.test(text)) symptoms.push("ăn uống kém");
    if (/\b(dau dau|nhuc dau)\b/.test(text)) symptoms.push("đau đầu");
    if (/\b(dau bung)\b/.test(text)) symptoms.push("đau bụng");
    if (/\b(buon non|hay non)\b/.test(text)) symptoms.push("buồn nôn");
    if (/\b(mat ngu|kho ngu)\b/.test(text)) symptoms.push("mất ngủ");

    return symptoms;
}

function extractPreviousSymptoms(sessionContext = {}) {
    const stateSymptoms = Array.isArray(sessionContext.healthConsultation?.symptoms)
        ? sessionContext.healthConsultation.symptoms
        : [];
    const messages = getRecentHealthMessages(sessionContext);
    const messageSymptoms = extractSymptomsFromText(messages
        .filter((m) => m.role !== "assistant")
        .map((m) => m.content)
        .join(" "));
    const lastSymptoms = extractSymptomsFromText(sessionContext.lastSymptomMessage || "");

    return [...new Set([...stateSymptoms, ...messageSymptoms, ...lastSymptoms])];
}

function extractHealthInfo(message = "") {
    const text = normalizeText(message);
    const durationMatch = text.match(/(\d+)\s*(ngay|tuan|thang|nam)/);
    const negativeFlags = [];
    const redFlags = [];
    const flagPatterns = [
        ["sot", "fever"],
        ["dau nguc", "chest_pain"],
        ["kho tho", "breathlessness"],
        ["ngat", "fainting"],
        ["lo mo", "confusion"],
        ["yeu mot ben", "one_sided_weakness"],
        ["khong tu di lai duoc", "cannot_walk"]
    ];

    for (const [pattern, flag] of flagPatterns) {
        if (text.includes(`khong ${pattern}`)) {
            negativeFlags.push(`no_${flag}`);
        } else if (text.includes(pattern)) {
            redFlags.push(flag);
        }
    }

    if (text.includes("xau di nhanh") || text.includes("nang len nhanh")) {
        redFlags.push("rapid_worsening");
    }

    return {
        symptoms: extractSymptomsFromText(text),
        duration: durationMatch
            ? `${durationMatch[1]} ${{
                ngay: "ngày",
                tuan: "tuần",
                thang: "tháng",
                nam: "năm"
            }[durationMatch[2]]}`
            : null,
        pregnancyStatus: text.includes("khong mang thai") || text.includes("khong co thai")
            ? "not_pregnant"
            : text.includes("mang thai") || text.includes("co thai")
                ? "pregnant"
                : null,
        severity: text.includes("yeu hon nhieu") || text.includes("met hon nhieu") ||
            text.includes("duoi suc hon") || text.includes("nang hon")
            ? "worsening"
            : null,
        negativeFlags: [...new Set(negativeFlags)],
        redFlags: [...new Set(redFlags)],
        userGoal: text.includes("chon goi") || text.includes("goi nao")
            ? "package_guidance"
            : text.includes("xet nghiem gi") || text.includes("can xet nghiem")
                ? "test_guidance"
                : null
    };
}

function extractCurrentHealthDetails(message = "") {
    const info = extractHealthInfo(message);

    return {
        ...info,
        pregnancyNegative: info.pregnancyStatus === "not_pregnant",
        severeWeakness: info.severity === "worsening",
        hasFollowUpDetail: Boolean(
            info.duration ||
            info.pregnancyStatus ||
            info.severity ||
            info.negativeFlags.length ||
            info.redFlags.length
        )
    };
}

function isFollowUpQuestion(message = "", previousSymptoms = []) {
    const text = normalizeText(message);
    const asksForGuidance =
        text.includes("xet nghiem gi") ||
        text.includes("chon goi nao") ||
        text.includes("goi nao phu hop") ||
        text.includes("toi can lam gi") ||
        text.includes("tiep theo lam gi") ||
        text.includes("co can xet nghiem");

    return previousSymptoms.length > 0 && asksForGuidance;
}

function isFollowUpAnswer(message = "", previousSymptoms = []) {
    if (!previousSymptoms.length) {
        return false;
    }

    return extractCurrentHealthDetails(message).hasFollowUpDetail;
}

function isHealthFollowUpDetail(message = "", sessionContext = {}) {
    const previousSymptoms = extractPreviousSymptoms(sessionContext);
    const currentDetails = extractCurrentHealthDetails(message);

    return previousSymptoms.length > 0 && currentDetails.hasFollowUpDetail;
}

function mergeHealthConsultationState(sessionContext = {}, message = "") {
    const previous = sessionContext.healthConsultation || {};
    const info = extractHealthInfo(message);

    return {
        symptoms: [...new Set([
            ...(Array.isArray(previous.symptoms) ? previous.symptoms : []),
            ...extractPreviousSymptoms(sessionContext),
            ...info.symptoms
        ])],
        duration: info.duration || previous.duration || null,
        severity: info.severity || previous.severity || null,
        pregnancyStatus: info.pregnancyStatus || previous.pregnancyStatus || null,
        negativeFlags: [...new Set([
            ...(Array.isArray(previous.negativeFlags) ? previous.negativeFlags : []),
            ...info.negativeFlags
        ])],
        redFlags: [...new Set([
            ...(Array.isArray(previous.redFlags) ? previous.redFlags : []),
            ...info.redFlags
        ])],
        userGoal: info.userGoal || previous.userGoal || null,
        updatedAt: new Date().toISOString()
    };
}

function mergeAnswerIntoContext(message, previousSymptoms, sessionContext = {}) {
    const healthInfo = extractHealthInfo(message);

    return {
        augmentedMessage: [normalizeText(message), ...previousSymptoms].join(" "),
        healthInfo,
        previousSymptoms,
        state: mergeHealthConsultationState(sessionContext, message),
        hasDuration: Boolean(healthInfo.duration),
        hasPregnancyInfo: Boolean(healthInfo.pregnancyStatus),
        hasSeverityInfo: Boolean(healthInfo.severity),
        hasNegativeInfo: healthInfo.negativeFlags.length > 0
    };
}

function buildSessionSummary(sessionContext = {}) {
    const state = sessionContext.healthConsultation || {};
    const previousSymptoms = extractPreviousSymptoms(sessionContext);

    if (!previousSymptoms.length) {
        return "";
    }

    return [
        `Người dùng đã mô tả: ${previousSymptoms.join(", ")}`,
        state.duration ? `thời gian ${state.duration}` : "",
        state.pregnancyStatus === "not_pregnant" ? "không mang thai" : "",
        state.severity === "worsening" ? "đang yếu hơn/nặng hơn" : "",
        Array.isArray(state.negativeFlags) && state.negativeFlags.length
            ? `đã phủ nhận ${state.negativeFlags.join(", ")}`
            : ""
    ].filter(Boolean).join("; ");
}

function analyzeHealthConsultationContext({
    message,
    sessionContext = {},
    retrievedChunks = []
}) {
    const normalizedMessage = normalizeText(message);
    const previousSymptoms = extractPreviousSymptoms(sessionContext);
    const hasPreviousSymptoms = previousSymptoms.length > 0;
    const isFollowUp = isFollowUpQuestion(message, previousSymptoms);
    const isFollowUpAns = isFollowUpAnswer(message, previousSymptoms);
    const mergedContext = mergeAnswerIntoContext(message, previousSymptoms, sessionContext);
    const state = mergedContext.state;
    const augmentedMessage = mergedContext.augmentedMessage;
    const userGoal = detectUserGoal(augmentedMessage);
    const needsUrgentCare = hasUrgentRedFlag(normalizedMessage) || mergedContext.healthInfo.redFlags.some(
        (flag) => ["chest_pain", "breathlessness", "fainting", "confusion", "one_sided_weakness", "cannot_walk", "rapid_worsening"].includes(flag)
    );
    const base = assessInformationCompleteness(augmentedMessage, userGoal);
    const hasSafetyInfo = state.negativeFlags.length > 0;
    const hasMinimumGuidanceContext = state.symptoms.length > 0 && Boolean(state.duration || hasSafetyInfo);
    const isComplete = base.isComplete || (hasPreviousSymptoms && hasMinimumGuidanceContext);
    const missingInfo = isComplete ? [] : base.missingInfo;
    const shouldAskClarifyingQuestion = !needsUrgentCare && !isComplete && !isFollowUp && !isFollowUpAns;
    const clarifyingQuestions = shouldAskClarifyingQuestion
        ? generateClarifyingQuestions(userGoal, missingInfo, normalizedMessage)
        : [];
    const canSuggestPackages =
        !needsUrgentCare &&
        (
            ((isComplete || isFollowUp) && state.symptoms.length > 0) ||
            (isComplete && ["liver_specific_inquiry", "kidney_specific_inquiry", "package_recommendation_ready"].includes(userGoal))
        );

    return {
        version: CONTEXT_VERSION,
        userGoal,
        needsUrgentCare,
        isComplete,
        missingInfo,
        detailScore: base.detailScore + state.symptoms.length + (state.duration ? 1 : 0) + state.negativeFlags.length,
        shouldAskClarifyingQuestion,
        clarifyingQuestions,
        canSuggestPackages,
        suggestedPackageHints: suggestPackageHints(userGoal, augmentedMessage),
        summary: buildSessionSummary({ ...sessionContext, healthConsultation: state }),
        previousSymptoms,
        isFollowUp: isFollowUp || isFollowUpAns,
        isFollowUpAnswer: isFollowUpAns,
        healthInfo: mergedContext.healthInfo,
        mergedContext,
        state,
        reason: needsUrgentCare
            ? "urgent_red_flag_detected"
            : canSuggestPackages
                ? "sufficient_context_for_package_guidance"
                : shouldAskClarifyingQuestion
                    ? `insufficient_context_missing_${missingInfo.join("_")}`
                    : "general_health_inquiry",
        analyzedAt: new Date().toISOString()
    };
}

module.exports = {
    CONTEXT_VERSION,
    analyzeHealthConsultationContext,
    getRecentHealthMessages,
    extractPreviousSymptoms,
    extractCurrentHealthDetails,
    isFollowUpQuestion,
    isFollowUpAnswer,
    isHealthFollowUpDetail,
    extractHealthInfo,
    mergeAnswerIntoContext,
    mergeHealthConsultationState,
    buildSessionSummary
};
