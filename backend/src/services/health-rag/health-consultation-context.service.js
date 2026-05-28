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

function extractPreviousSymptoms(sessionContext) {
    const symptoms = new Set();

    const recentMessages = Array.isArray(sessionContext?.recentMessages)
        ? sessionContext.recentMessages.slice(-5)
        : [];

    console.log(`[DEBUG] extractPreviousSymptoms: recentMessages count=${recentMessages.length}`);

    for (const msg of recentMessages) {
        if (msg.role === "user") {
            const content = normalizeText(msg.content || "");
            if (content.includes("met")) symptoms.add("mệt");
            if (content.includes("chong mat")) symptoms.add("chóng mặt");
            if (content.includes("nhuc dau") || content.includes("dau dau")) symptoms.add("đau đầu");
            if (content.includes("dau bung")) symptoms.add("đau bụng");
            if (content.includes("an uong kem") || content.includes("chan an")) symptoms.add("ăn uống kém");
            if (content.includes("buon non") || content.includes("hay non")) symptoms.add("buồn nôn");
        }
    }

    if (symptoms.size === 0 && sessionContext?.lastSymptomMessage) {
        const content = normalizeText(sessionContext.lastSymptomMessage || "");
        console.log(`[DEBUG] Using lastSymptomMessage: ${content}`);
        if (content.includes("met")) symptoms.add("mệt");
        if (content.includes("chong mat")) symptoms.add("chóng mặt");
        if (content.includes("nhuc dau") || content.includes("dau dau")) symptoms.add("đau đầu");
        if (content.includes("dau bung")) symptoms.add("đau bụng");
        if (content.includes("an uong kem") || content.includes("chan an")) symptoms.add("ăn uống kém");
        if (content.includes("buon non") || content.includes("hay non")) symptoms.add("buồn nôn");
    }

    const result = Array.from(symptoms);
    console.log(`[DEBUG] extractPreviousSymptoms result: ${result.join(",")}`);
    return result;
}

function isFollowUpQuestion(normalizedMessage, previousSymptoms) {
    if (previousSymptoms.length === 0) {
        return false;
    }

    const followUpSignals = [
        "vay",
        "vậy",
        "theo ban",
        "theo bạn",
        "theo",
        "nen",
        "nên",
        "chon",
        "chọn",
        "goi",
        "gói",
        "xet nghiem",
        "xét nghiệm",
        "kiem tra",
        "kiểm tra"
    ];

    const hasFollowUpSignal = followUpSignals.some((signal) =>
        normalizedMessage.includes(signal)
    );

    const isAskingForGuidance =
        normalizedMessage.includes("nên") ||
        normalizedMessage.includes("chọn") ||
        normalizedMessage.includes("xet nghiem") ||
        normalizedMessage.includes("gói");

    return hasFollowUpSignal && isAskingForGuidance;
}

function buildSessionSummary(sessionContext) {
    const symptoms = extractPreviousSymptoms(sessionContext);
    if (symptoms.length === 0) {
        return "";
    }
    return `Người dùng đã mô tả các triệu chứng: ${symptoms.join(", ")}`;
}

function analyzeHealthConsultationContext({
    message,
    sessionContext = {},
    retrievedChunks = []
}) {
    const normalizedMessage = normalizeText(message);
    const previousSymptoms = extractPreviousSymptoms(sessionContext);
    const hasPreviousSymptoms = previousSymptoms.length > 0;
    const isFollowUp = isFollowUpQuestion(normalizedMessage, previousSymptoms);

    const augmentedMessage = hasPreviousSymptoms
        ? `${normalizedMessage} ${previousSymptoms.join(" ")}`
        : normalizedMessage;

    const userGoal = detectUserGoal(augmentedMessage);
    const needsUrgentCare = hasUrgentRedFlag(normalizedMessage);

    let missingInfo = [];
    let isComplete = false;
    let detailScore = 0;

    const { isComplete: baseComplete, missingInfo: baseMissing, detailScore: baseScore } = assessInformationCompleteness(
        augmentedMessage,
        userGoal
    );

    if (hasPreviousSymptoms) {
        detailScore = baseScore + 2;
        if (baseMissing.includes("symptom_or_goal")) {
            missingInfo = baseMissing.filter(m => m !== "symptom_or_goal");
        } else {
            missingInfo = baseMissing;
        }

        if (isFollowUp && missingInfo.length <= 1) {
            isComplete = true;
            missingInfo = [];
        } else {
            isComplete = missingInfo.length === 0 || baseComplete;
        }
    } else {
        missingInfo = baseMissing;
        isComplete = baseComplete;
        detailScore = baseScore;
    }

    const shouldAskClarifyingQuestion = !needsUrgentCare && !isComplete && !isFollowUp;
    const clarifyingQuestions = shouldAskClarifyingQuestion
        ? generateClarifyingQuestions(userGoal, missingInfo, normalizedMessage)
        : [];

    const canSuggestPackages =
        !needsUrgentCare &&
        ((isComplete && userGoal === "liver_specific_inquiry") ||
            (isComplete && userGoal === "kidney_specific_inquiry") ||
            (isComplete && userGoal === "package_recommendation_ready") ||
            (isComplete && userGoal === "symptom_advice") ||
            (userGoal === "symptom_advice" && hasPreviousSymptoms && detailScore >= 4) ||
            (isFollowUp && hasPreviousSymptoms));

    const suggestedPackageHints = suggestPackageHints(userGoal, normalizedMessage);

    let reason;
    if (needsUrgentCare) {
        reason = "urgent_red_flag_detected";
    } else if (shouldAskClarifyingQuestion) {
        reason = `insufficient_context_missing_${missingInfo.join("_")}`;
    } else if (canSuggestPackages) {
        reason = "sufficient_context_for_package_guidance";
    } else if (userGoal === "test_explanation") {
        reason = "test_explanation_query";
    } else if (userGoal === "lifestyle_health_guidance") {
        reason = "lifestyle_health_guidance_query";
    } else if (userGoal === "lab_result_severity") {
        reason = "lab_result_severity_query";
    } else if (userGoal === "read_only_consultation") {
        reason = "read_only_consultation_signal";
    } else {
        reason = "general_health_inquiry";
    }

    if (isFollowUp && hasPreviousSymptoms) {
        console.log(`[DEBUG] Follow-up detected: symptoms=${previousSymptoms.join(",")}, isComplete=${isComplete}, canSuggest=${canSuggestPackages}`);
    }

    return {
        version: CONTEXT_VERSION,
        userGoal,
        needsUrgentCare,
        isComplete,
        missingInfo,
        detailScore,
        shouldAskClarifyingQuestion,
        clarifyingQuestions,
        canSuggestPackages,
        suggestedPackageHints,
        summary: buildSessionSummary(sessionContext),
        previousSymptoms,
        isFollowUp,
        reason,
        analyzedAt: new Date().toISOString()
    };
}

module.exports = {
    CONTEXT_VERSION,
    analyzeHealthConsultationContext,
    extractPreviousSymptoms,
    buildSessionSummary,
    isFollowUpQuestion
};
