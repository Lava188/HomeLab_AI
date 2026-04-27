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
        safety: {
            redFlagStatus,
            activeRedFlags,
            escalationReason
        },
        packageDecision: {
            catalogVersion,
            catalogRuntimeEnabled,
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
                "Ban muon xet nghiem theo muc tieu nao: tong quat, met/thieu mau, duong huyet/chuyen hoa, hay chuc nang than?",
            priority: 1,
            blocking: true
        });
    }

    if (!collectedSlots.age) {
        questions.push({
            slotId: "age",
            question: "Ban bao nhieu tuoi?",
            priority: 2,
            blocking: false
        });
    }

    if (!collectedSlots.sex) {
        questions.push({
            slotId: "sex",
            question: "Gioi tinh sinh hoc cua ban la nam hay nu?",
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
            question: "Tinh trang met moi da keo dai bao lau?",
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
        return "Hien tai ban co dau nguc khong?";
    }

    if (slotId === "shortness_of_breath_present") {
        return "Hien tai ban co kho tho khong?";
    }

    return "Ban co ngat, xiu, lu lan, hoac thay doi y thuc khong?";
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

    if (!enabled) {
        return baseDecision({
            status: "disabled",
            replyMode: "existing_answer",
            reasons: ["Recommendation runtime flag is disabled."],
            debug: {
                intentGroup,
                featureFlagEnabled: false
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
                featureFlagEnabled: true
            }
        });
    }

    const catalogState = loadPackageCatalog();
    const { catalogVersion, catalogRuntimeEnabled, packageById } = catalogState;
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

    if (!catalogRuntimeEnabled) {
        return baseDecision({
            status: "do_not_recommend",
            replyMode: "recommendation_blocked",
            redFlagStatus,
            activeRedFlags,
            catalogVersion,
            catalogRuntimeEnabled,
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
                "Package catalog runtime_enabled is false, so runtime package recommendation is blocked."
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
        recommendedPackage: summarizePackage(packageById.get(recommendedPackageId)),
        redFlagStatus,
        activeRedFlags,
        catalogVersion,
        catalogRuntimeEnabled,
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
    runRecommendationRuntime
};
