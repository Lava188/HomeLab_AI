const {
    loadPackageCatalog,
    summarizePackage,
    getPackageRuntimeGate
} = require("./package-catalog.service");
const {
    extractRecommendationSlots,
    getActiveRedFlags
} = require("./recommendation-slot.service");

const REQUIRED_RED_FLAG_SLOTS = [
    "chest_pain_present",
    "shortness_of_breath_present",
    "fainting_or_altered_consciousness_present"
];

const GOAL_TO_CANDIDATE_PACKAGES = {
    anemia_infection_screening: ["pkg_anemia_infection_basic_v1"],
    kidney_function_screening: ["pkg_kidney_function_basic_v1"],
    glucose_screening: ["pkg_diabetes_glucose_basic_v1"],
    lipid_screening: ["pkg_lipid_cardiometabolic_basic_v1"],
    basic_blood_package: [
        "pkg_anemia_infection_basic_v1",
        "pkg_kidney_function_basic_v1",
        "pkg_diabetes_glucose_basic_v1",
        "pkg_lipid_cardiometabolic_basic_v1"
    ]
};

function isRecommendationRuntimeEnabled() {
    return String(process.env.HOMELAB_RECOMMENDATION_RUNTIME_ENABLED || "")
        .trim()
        .toLowerCase() === "true";
}

function isLivePackageRecommendationEnabled() {
    return String(process.env.HOMELAB_RECOMMENDATION_LIVE_PACKAGE_ENABLED || "")
        .trim()
        .toLowerCase() === "true";
}

function baseDecision({
    status,
    replyMode,
    recommendedPackage = null,
    nextQuestions = [],
    redFlagStatus = "unknown",
    activeRedFlags = [],
    escalationReason = null,
    catalogVersion = null,
    catalogRuntimeEnabled = false,
    livePackageEnabled = false,
    effectiveRuntimeEnabled = false,
    candidatePackageIds = [],
    eligiblePackageIds = [],
    blockedPackageIds = [],
    reasons = [],
    missingSlots = [],
    extractedSlots = {},
    decisionType = null,
    confidence = "low",
    userSafeSummary = null,
    candidatePackages = [],
    blockedReason = null,
    debug = {}
}) {
    return {
        status,
        replyMode,
        recommendedPackage,
        nextQuestions,
        missingSlots,
        extractedSlots,
        decisionType,
        confidence,
        userSafeSummary,
        livePackageEnabled,
        safety: {
            redFlagStatus,
            activeRedFlags,
            escalationReason
        },
        packageDecision: {
            catalogVersion,
            catalogRuntimeEnabled,
            livePackageEnabled,
            effectiveRuntimeEnabled,
            candidatePackages,
            candidatePackageIds,
            eligiblePackageIds,
            blockedPackageIds,
            blockedReason,
            reasons
        },
        debug
    };
}

function getMissingQuestions(collectedSlots) {
    const questions = [];

    if (!collectedSlots.recommendation_goal) {
        questions.push({
            slotId: "recommendation_goal",
            question:
                "Bạn muốn xét nghiệm theo mục tiêu nào: tổng quát, mệt/thiếu máu, đường huyết/chuyển hóa hay chức năng thận?",
            priority: 1,
            blocking: true
        });
    }

    if (!collectedSlots.age) {
        questions.push({
            slotId: "age",
            question: "Bạn bao nhiêu tuổi?",
            priority: 2,
            blocking: false
        });
    }

    if (!collectedSlots.sex) {
        questions.push({
            slotId: "sex",
            question: "Giới tính sinh học của bạn là nam hay nữ?",
            priority: 2,
            blocking: false
        });
    }

    if (
        collectedSlots.main_concern === "fatigue" &&
        !collectedSlots.symptom_duration
    ) {
        questions.push({
            slotId: "symptom_duration",
            question: "Tình trạng mệt mỏi đã kéo dài bao lâu?",
            priority: 1,
            blocking: true
        });
    }

    for (const slotId of REQUIRED_RED_FLAG_SLOTS) {
        if (typeof collectedSlots[slotId] !== "boolean") {
            questions.push({
                slotId,
                question: getRedFlagQuestion(slotId),
                priority: 1,
                blocking: true
            });
        }
    }

    return questions
        .sort((left, right) => left.priority - right.priority)
        .slice(0, 5);
}

function getRedFlagQuestion(slotId) {
    if (slotId === "chest_pain_present") {
        return "Hiện tại bạn có đau ngực không?";
    }

    if (slotId === "shortness_of_breath_present") {
        return "Hiện tại bạn có khó thở không?";
    }

    return "Bạn có ngất, xỉu, lú lẫn hoặc thay đổi ý thức không?";
}

function hasDiagnosisOrResultInterpretationRequest(normalizedMessage) {
    return (
        normalizedMessage.includes("doc giup") ||
        normalizedMessage.includes("doc ket qua") ||
        normalizedMessage.includes("ket qua") ||
        normalizedMessage.includes("bi benh gi") ||
        normalizedMessage.includes("chan doan") ||
        normalizedMessage.includes("diagnos")
    );
}

function buildBlockedIds(candidatePackageIds, packageById) {
    return candidatePackageIds.filter((packageId) => {
        const gate = getPackageRuntimeGate(packageById.get(packageId));
        return (
            !gate.runtimeAllowed ||
            gate.recommendationExposure !== "allowed" ||
            gate.needsManualReview
        );
    });
}

function summarizeCandidatePackages(candidatePackageIds, packageById) {
    return candidatePackageIds
        .map((packageId) => summarizePackage(packageById.get(packageId)))
        .filter(Boolean);
}

function buildRecommendedPackage(packageItem, collectedSlots) {
    const summary = summarizePackage(packageItem);
    if (!summary) {
        return null;
    }

    return {
        ...summary,
        reason: buildRecommendationReason(summary, collectedSlots),
        rationale: buildRecommendationReason(summary, collectedSlots),
        safetyNote:
            "Gợi ý này chỉ để trao đổi thêm với nhân viên y tế, không dùng để chẩn đoán bệnh. Nếu có đau ngực, khó thở, ngất/lú lẫn, vã mồ hôi hoặc tình trạng xấu đi nhanh, hãy ưu tiên liên hệ cơ sở y tế khẩn cấp."
    };
}

function buildRecommendationReason(packageSummary, collectedSlots) {
    if (collectedSlots.recommendation_goal === "kidney_function_screening") {
        return "Bạn đang hỏi rõ về kiểm tra chức năng thận và đã phủ định các dấu hiệu cần xử trí khẩn cấp trong thông tin đã cung cấp.";
    }

    if (collectedSlots.recommendation_goal === "anemia_infection_screening") {
        return "Bạn đang hỏi về thiếu máu/CBC và thông tin hiện có không ghi nhận dấu hiệu cần xử trí khẩn cấp.";
    }

    if (collectedSlots.recommendation_goal === "basic_blood_package") {
        return "Bạn đang muốn kiểm tra tổng quát và thông tin hiện có đã có sàng lọc dấu hiệu cần xử trí khẩn cấp.";
    }

    return `Hướng xét nghiệm này phù hợp để trao đổi thêm theo mục tiêu ${packageSummary.displayNameVi || packageSummary.displayName || "kiểm tra máu"} đã nêu.`;
}

function getBlockingMissingSlots(questions) {
    return questions
        .filter((question) => question.blocking)
        .map((question) => question.slotId);
}

function buildUserSafeSummary(collectedSlots) {
    const parts = [];

    if (collectedSlots.recommendation_goal) {
        parts.push(`goal=${collectedSlots.recommendation_goal}`);
    }

    if (collectedSlots.age) {
        parts.push(`age=${collectedSlots.age}`);
    }

    if (collectedSlots.sex) {
        parts.push(`sex=${collectedSlots.sex}`);
    }

    if (collectedSlots.symptom_duration) {
        parts.push(
            `duration=${collectedSlots.symptom_duration.value}_${collectedSlots.symptom_duration.unit}`
        );
    }

    if (collectedSlots.red_flag_screen_result) {
        parts.push(`red_flags=${collectedSlots.red_flag_screen_result}`);
    }

    return parts.join("; ") || null;
}

function getConfidence({ candidatePackageIds, missingSlots, redFlagStatus }) {
    if (missingSlots.length > 0 || redFlagStatus !== "negative") {
        return "low";
    }

    return candidatePackageIds.length > 0 ? "medium" : "low";
}

function runRecommendationRuntime({ message, intentGroup }) {
    const enabled = isRecommendationRuntimeEnabled();
    const livePackageEnabled = isLivePackageRecommendationEnabled();

    if (!enabled) {
        return baseDecision({
            status: "disabled",
            replyMode: "existing_answer",
            reasons: ["Recommendation runtime flag is disabled."],
            debug: {
                intentGroup,
                featureFlagEnabled: false,
                livePackageEnabled
            }
        });
    }

    if (intentGroup !== "test_advice") {
        return baseDecision({
            status: "disabled",
            replyMode: "existing_answer",
            reasons: ["Recommendation runtime only runs for test_advice intent."],
            debug: {
                intentGroup,
                featureFlagEnabled: true,
                livePackageEnabled
            }
        });
    }

    const catalogState = loadPackageCatalog();
    const { catalogVersion, catalogRuntimeEnabled, packageById } = catalogState;
    const effectiveRuntimeEnabled =
        Boolean(catalogRuntimeEnabled) || livePackageEnabled;
    const slotResult = extractRecommendationSlots({ message });
    const { collectedSlots, normalizedMessage, redFlagStatus } = slotResult;
    const activeRedFlags = getActiveRedFlags(collectedSlots);
    const recommendationGoal = collectedSlots.recommendation_goal || null;
    const candidatePackageIds =
        GOAL_TO_CANDIDATE_PACKAGES[recommendationGoal] || [];
    const candidatePackages = summarizeCandidatePackages(
        candidatePackageIds,
        packageById
    );
    const nextQuestions = getMissingQuestions(collectedSlots);
    const missingSlots = getBlockingMissingSlots(nextQuestions);
    const userSafeSummary = buildUserSafeSummary(collectedSlots);
    const confidence = getConfidence({
        candidatePackageIds,
        missingSlots,
        redFlagStatus
    });

    const commonDebug = {
        intentGroup,
        featureFlagEnabled: true,
        livePackageEnabled,
        effectiveRuntimeEnabled,
        normalizedMessage,
        collectedSlots,
        explicitSignals: slotResult.explicitSignals
    };

    if (activeRedFlags.length > 0) {
        return baseDecision({
            status: "escalate",
            replyMode: "safety_escalation",
            redFlagStatus,
            activeRedFlags,
            escalationReason: "active_red_flags",
            catalogVersion,
            catalogRuntimeEnabled,
            livePackageEnabled,
            effectiveRuntimeEnabled,
            candidatePackages,
            candidatePackageIds,
            blockedPackageIds: candidatePackageIds,
            missingSlots,
            extractedSlots: collectedSlots,
            decisionType: "safety_escalation",
            confidence: "high",
            userSafeSummary,
            blockedReason: "active_red_flags",
            reasons: [
                "Active red flags take priority over package recommendation."
            ],
            debug: commonDebug
        });
    }

    if (hasDiagnosisOrResultInterpretationRequest(normalizedMessage)) {
        return baseDecision({
            status: "do_not_recommend",
            replyMode: "recommendation_blocked",
            redFlagStatus,
            activeRedFlags,
            escalationReason: "medical_review_boundary",
            catalogVersion,
            catalogRuntimeEnabled,
            livePackageEnabled,
            effectiveRuntimeEnabled,
            candidatePackages,
            candidatePackageIds,
            blockedPackageIds: candidatePackageIds,
            missingSlots,
            extractedSlots: collectedSlots,
            decisionType: "medical_review_boundary",
            confidence,
            userSafeSummary,
            blockedReason: "medical_review_boundary",
            reasons: [
                "Result interpretation or diagnosis requests are outside package recommendation scope."
            ],
            debug: commonDebug
        });
    }

    if (missingSlots.length > 0) {
        return baseDecision({
            status: "ask_more",
            replyMode: "recommendation_context",
            nextQuestions,
            redFlagStatus,
            activeRedFlags,
            catalogVersion,
            catalogRuntimeEnabled,
            livePackageEnabled,
            effectiveRuntimeEnabled,
            candidatePackages,
            candidatePackageIds,
            blockedPackageIds: buildBlockedIds(candidatePackageIds, packageById),
            missingSlots,
            extractedSlots: collectedSlots,
            decisionType: "needs_more_context",
            confidence,
            userSafeSummary,
            blockedReason: "missing_required_slots",
            reasons: ["More context is required before package matching."],
            debug: commonDebug
        });
    }

    if (!effectiveRuntimeEnabled) {
        return baseDecision({
            status: "do_not_recommend",
            replyMode: "recommendation_blocked",
            redFlagStatus,
            activeRedFlags,
            catalogVersion,
            catalogRuntimeEnabled,
            livePackageEnabled,
            effectiveRuntimeEnabled,
            candidatePackages,
            candidatePackageIds,
            blockedPackageIds: candidatePackageIds,
            missingSlots,
            extractedSlots: collectedSlots,
            decisionType: "ready_but_catalog_disabled",
            confidence,
            userSafeSummary,
            blockedReason: "catalog_runtime_disabled",
            reasons: [
                "Package catalog runtime_enabled is false and live package gate is disabled, so runtime package recommendation is blocked."
            ],
            debug: commonDebug
        });
    }

    const eligiblePackageIds = candidatePackageIds.filter((packageId) => {
        const gate = getPackageRuntimeGate(packageById.get(packageId));
        return (
            gate.runtimeAllowed &&
            gate.recommendationExposure === "allowed" &&
            !gate.needsManualReview
        );
    });

    const recommendedPackageId = eligiblePackageIds[0] || null;
    if (!recommendedPackageId) {
        return baseDecision({
            status: "do_not_recommend",
            replyMode: "recommendation_blocked",
            redFlagStatus,
            activeRedFlags,
            catalogVersion,
            catalogRuntimeEnabled,
            livePackageEnabled,
            effectiveRuntimeEnabled,
            candidatePackages,
            candidatePackageIds,
            eligiblePackageIds,
            blockedPackageIds: buildBlockedIds(candidatePackageIds, packageById),
            missingSlots,
            extractedSlots: collectedSlots,
            decisionType: "no_eligible_package",
            confidence,
            userSafeSummary,
            blockedReason: "no_eligible_package",
            reasons: ["No eligible package is allowed by package-level gates."],
            debug: commonDebug
        });
    }

    return baseDecision({
        status: "recommend",
        replyMode: "recommendation_context",
        recommendedPackage: buildRecommendedPackage(
            packageById.get(recommendedPackageId),
            collectedSlots
        ),
        redFlagStatus,
        activeRedFlags,
        catalogVersion,
        catalogRuntimeEnabled,
        livePackageEnabled,
        effectiveRuntimeEnabled,
        candidatePackages,
        candidatePackageIds,
        eligiblePackageIds,
        blockedPackageIds: buildBlockedIds(candidatePackageIds, packageById),
        missingSlots,
        extractedSlots: collectedSlots,
        decisionType: "recommend_package",
        confidence: "medium",
        userSafeSummary,
        reasons: ["A package matched all runtime gates."],
        debug: commonDebug
    });
}

module.exports = {
    isRecommendationRuntimeEnabled,
    isLivePackageRecommendationEnabled,
    runRecommendationRuntime
};
