const { normalizeText } = require("../../utils/text.util");

const POLICY_VERSION = "response_policy_v1_2_backend";
const TEST_INFO_SECTIONS = new Set([
    "test_explainers",
    "pre_test_guides",
    "test_results"
]);
const OVERLAP_ELIGIBLE_SOURCES = new Set([
    "chest_pain",
    "shortness_of_breath",
    "nice_sepsis_overview",
    "nhs_anaphylaxis",
    "nhs_stroke_symptoms",
    "nhs_fainting_adults"
]);
const TEST_QUERY_HINTS = [
    "xet nghiem",
    "troponin",
    "d-dimer",
    "spo2",
    "pulse ox",
    "bmp",
    "cbc",
    "crp",
    "cay mau"
];

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

function hasAnyPattern(text, patterns) {
    return patterns.some((pattern) => text.includes(pattern));
}

function detectUrgencyLevel(message, topChunks) {
    const normalizedMessage = normalizeText(message);

    if (hasAnyPattern(normalizedMessage, EMERGENCY_PATTERNS)) {
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
    const top2 = topChunks[1] || null;
    const normalizedMessage = normalizeText(message);
    const redFlagChunks = topChunks.filter((chunk) => chunk.section === "red_flags");
    const uniqueSources = [...new Set(topChunks.map((chunk) => chunk.source_id))];
    const eligibleRedFlagSources = [
        ...new Set(
            redFlagChunks
                .map((chunk) => chunk.source_id)
                .filter((sourceId) => OVERLAP_ELIGIBLE_SOURCES.has(sourceId))
        )
    ];
    const hasHardEmergencyPattern = hasAnyPattern(
        normalizedMessage,
        EMERGENCY_PATTERNS
    );

    if (!top1 || top1.score < 0.12) {
        return {
            policyVersion: POLICY_VERSION,
            primaryMode: "fallback",
            urgencyLevel: "none",
            overlapFlag: topChunks.length > 1 ? "mixed" : "single",
            reason: "retrieval_low_confidence"
        };
    }

    if (top1.section && TEST_INFO_SECTIONS.has(top1.section)) {
        const top1TestTypes = new Set(top1.test_types || []);
        const hasSupportingTestChunk = topChunks.slice(1).some((chunk) => {
            const chunkTestTypes = new Set(chunk.test_types || []);
            return (
                chunk.section &&
                TEST_INFO_SECTIONS.has(chunk.section) &&
                (chunk.source_id === top1.source_id ||
                    [...chunkTestTypes].some((type) => top1TestTypes.has(type)))
            );
        });

        if (
            redFlagChunks.length === 0 ||
            hasSupportingTestChunk ||
            hasAnyPattern(normalizedMessage, TEST_QUERY_HINTS)
        ) {
            return {
                policyVersion: POLICY_VERSION,
                primaryMode: "informational_test",
                urgencyLevel: "none",
                overlapFlag: uniqueSources.length > 1 ? "mixed" : "single",
                reason: "test_information_top1"
            };
        }
    }

    if (hasHardEmergencyPattern && eligibleRedFlagSources.length >= 2) {
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
        !hasAnyPattern(normalizedMessage, EMERGENCY_PATTERNS)
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
