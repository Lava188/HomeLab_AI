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
    "xau di nhanh"
];

function detectUrgencyLevel(message, topChunks) {
    const normalizedMessage = normalizeText(message);

    if (
        EMERGENCY_PATTERNS.some((pattern) => normalizedMessage.includes(pattern))
    ) {
        return "emergency";
    }

    if (topChunks.some((chunk) => chunk.faq_type === "emergency_warning")) {
        return "emergency";
    }

    return "urgent";
}

function choosePolicyMode({ message, retrievedChunks }) {
    const topChunks = retrievedChunks.slice(0, 3);
    const top1 = topChunks[0] || null;
    const redFlagChunks = topChunks.filter((chunk) => chunk.section === "red_flags");
    const uniqueRedFlagSources = [...new Set(redFlagChunks.map((chunk) => chunk.source_id))];
    const uniqueSources = [...new Set(topChunks.map((chunk) => chunk.source_id))];

    if (!top1 || top1.score < 8) {
        return {
            policyVersion: POLICY_VERSION,
            primaryMode: "fallback",
            urgencyLevel: "none",
            overlapFlag: topChunks.length > 1 ? "mixed" : "single",
            reason: "retrieval_low_confidence"
        };
    }

    if (redFlagChunks.length >= 2 && uniqueRedFlagSources.length >= 2) {
        return {
            policyVersion: POLICY_VERSION,
            primaryMode: "mixed_emergency",
            urgencyLevel: "emergency",
            overlapFlag: "mixed",
            reason: "multi_source_red_flags_in_top3"
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
