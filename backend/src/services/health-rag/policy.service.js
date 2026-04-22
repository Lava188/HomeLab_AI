const { normalizeText } = require("../../utils/text.util");

const POLICY_VERSION = "response_policy_v1";

const EMERGENCY_PATTERNS = [
    "lan ra tay",
    "lan ra ham",
    "va mo hoi",
    "choang vang",
    "tim moi",
    "tim tai",
    "lu lan",
    "khong noi duoc",
    "ho ra mau",
    "xau di nhanh",
    "dau bung du doi",
    "non ra mau",
    "phan den",
    "dau dau du doi",
    "co cung",
    "yeu liet",
    "phan ve",
    "sung moi",
    "sung luoi"
];

function hasEmergencyPattern(normalizedMessage) {
    return EMERGENCY_PATTERNS.some((pattern) => normalizedMessage.includes(pattern));
}

function detectUrgencyLevel(message, topChunks) {
    const normalizedMessage = normalizeText(message);

    if (hasEmergencyPattern(normalizedMessage)) {
        return "emergency";
    }

    if (topChunks.some((chunk) => chunk.faq_type === "emergency_warning")) {
        return "emergency";
    }

    return "urgent";
}

function choosePolicyMode({ message, retrievedChunks }) {
    const topChunks = retrievedChunks.slice(0, 3);
    const topTwoChunks = topChunks.slice(0, 2);
    const top1 = topChunks[0] || null;
    const top2 = topChunks[1] || null;
    const normalizedMessage = normalizeText(message);
    const redFlagChunks = topChunks.filter((chunk) => chunk.section === "red_flags");
    const uniqueRedFlagSources = [...new Set(redFlagChunks.map((chunk) => chunk.source_id))];
    const uniqueSources = [...new Set(topChunks.map((chunk) => chunk.source_id))];
    const topTwoRedFlagSources = [
        ...new Set(
            topTwoChunks
                .filter((chunk) => chunk.section === "red_flags")
                .map((chunk) => chunk.source_id)
        )
    ];

    if (!top1 || top1.score < 0.12) {
        return {
            policyVersion: POLICY_VERSION,
            primaryMode: "fallback",
            urgencyLevel: "none",
            overlapFlag: topChunks.length > 1 ? "mixed" : "single",
            reason: "retrieval_low_confidence"
        };
    }

    if (
        redFlagChunks.length >= 2 &&
        uniqueRedFlagSources.length >= 2 &&
        topTwoRedFlagSources.length >= 2
    ) {
        return {
            policyVersion: POLICY_VERSION,
            primaryMode: "mixed_emergency",
            urgencyLevel: "emergency",
            overlapFlag: "mixed",
            reason: "multi_source_red_flags_in_top3"
        };
    }

    if (
        top1.faq_type === "urgent_advice" &&
        detectUrgencyLevel(message, [top1]) !== "emergency"
    ) {
        return {
            policyVersion: POLICY_VERSION,
            primaryMode: "urgent_advice",
            urgencyLevel: "urgent",
            overlapFlag: uniqueSources.length > 1 ? "mixed" : "single",
            reason: "top1_is_urgent_advice"
        };
    }

    if (
        top1.faq_type === "emergency_warning" &&
        top2 &&
        top2.source_id === top1.source_id &&
        top2.faq_type === "urgent_advice" &&
        Math.abs(top1.score - top2.score) <= 0.03 &&
        !hasEmergencyPattern(normalizedMessage)
    ) {
        return {
            policyVersion: POLICY_VERSION,
            primaryMode: "urgent_advice",
            urgencyLevel: "urgent",
            overlapFlag: uniqueSources.length > 1 ? "mixed" : "single",
            reason: "urgent_advice_preferred_over_close_emergency_match"
        };
    }

    if (top1.section === "red_flags" || redFlagChunks.length >= 1) {
        return {
            policyVersion: POLICY_VERSION,
            primaryMode: "emergency_or_urgent",
            urgencyLevel: detectUrgencyLevel(message, topChunks),
            overlapFlag: uniqueSources.length > 1 ? "mixed" : "single",
            reason: "top1_is_red_flag"
        };
    }

    if (top1.source_id === "blood_tests" && redFlagChunks.length === 0) {
        return {
            policyVersion: POLICY_VERSION,
            primaryMode: "informational_test",
            urgencyLevel: "none",
            overlapFlag: uniqueSources.length > 1 ? "mixed" : "single",
            reason: "blood_tests_without_red_flags"
        };
    }

    return {
        policyVersion: POLICY_VERSION,
        primaryMode: "fallback",
        urgencyLevel: "none",
        overlapFlag: uniqueSources.length > 1 ? "mixed" : "single",
        reason: "top3_not_coherent_enough"
    };
}

module.exports = {
    POLICY_VERSION,
    choosePolicyMode
};
