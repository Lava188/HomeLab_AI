const { normalizeText } = require("../../utils/text.util");

function includesAny(text, signals) {
    return signals.some((signal) => text.includes(signal));
}

function detectExplicitNegative(text, positiveSignal) {
    return (
        text.includes(`khong ${positiveSignal}`) ||
        text.includes(`khong bi ${positiveSignal}`) ||
        text.includes(`khong co ${positiveSignal}`) ||
        text.includes(`khong thay ${positiveSignal}`)
    );
}

function detectBooleanSlot(text, positiveSignals) {
    for (const signal of positiveSignals) {
        if (detectExplicitNegative(text, signal)) {
            return false;
        }
    }

    return includesAny(text, positiveSignals) ? true : null;
}

function extractRecommendationGoal(normalizedMessage) {
    if (
        includesAny(normalizedMessage, [
            "kiem tra than",
            "chuc nang than",
            "xet nghiem than",
            "bmp"
        ])
    ) {
        return "kidney_function_screening";
    }

    if (
        includesAny(normalizedMessage, [
            "thieu mau",
            "cong thuc mau",
            "cbc",
            "met",
            "hay met"
        ])
    ) {
        return "anemia_infection_screening";
    }

    if (
        includesAny(normalizedMessage, [
            "duong huyet",
            "duong mau",
            "glucose",
            "tieu duong",
            "metabolic",
            "chuyen hoa"
        ])
    ) {
        return "glucose_screening";
    }

    if (
        includesAny(normalizedMessage, [
            "tong quat",
            "kiem tra suc khoe",
            "general checkup",
            "health check"
        ])
    ) {
        return "basic_blood_package";
    }

    return null;
}

function extractRecommendationSlots({ message }) {
    const normalizedMessage = normalizeText(message);
    const collectedSlots = {};
    const explicitSignals = [];

    const recommendationGoal = extractRecommendationGoal(normalizedMessage);
    if (recommendationGoal) {
        collectedSlots.recommendation_goal = recommendationGoal;
        explicitSignals.push(`goal:${recommendationGoal}`);
    }

    if (String(message || "").trim()) {
        collectedSlots.symptom_summary = String(message).trim();
    }

    const redFlagSlots = [
        {
            slotId: "chest_pain_present",
            signals: ["dau nguc"]
        },
        {
            slotId: "shortness_of_breath_present",
            signals: ["kho tho", "ngop tho"]
        },
        {
            slotId: "fainting_or_altered_consciousness_present",
            signals: ["ngat", "xiu", "lu lan"]
        }
    ];

    for (const item of redFlagSlots) {
        const value = detectBooleanSlot(normalizedMessage, item.signals);
        if (value !== null) {
            collectedSlots[item.slotId] = value;
            explicitSignals.push(`${item.slotId}:${value}`);
        }
    }

    if (
        includesAny(normalizedMessage, [
            "xau di nhanh",
            "nang len nhanh",
            "te hon nhanh",
            "rapidly worsening"
        ])
    ) {
        collectedSlots.symptom_progression = "rapidly_worsening";
        explicitSignals.push("symptom_progression:rapidly_worsening");
    }

    const redFlagStatus = deriveRedFlagStatus(collectedSlots);
    if (redFlagStatus !== "unknown") {
        collectedSlots.red_flag_screen_result = redFlagStatus;
    }

    return {
        normalizedMessage,
        collectedSlots,
        explicitSignals,
        redFlagStatus
    };
}

function getActiveRedFlags(collectedSlots) {
    const activeRedFlags = [];

    if (collectedSlots.chest_pain_present === true) {
        activeRedFlags.push("chest_pain_present");
    }

    if (collectedSlots.shortness_of_breath_present === true) {
        activeRedFlags.push("shortness_of_breath_present");
    }

    if (collectedSlots.fainting_or_altered_consciousness_present === true) {
        activeRedFlags.push("fainting_or_altered_consciousness_present");
    }

    if (collectedSlots.symptom_progression === "rapidly_worsening") {
        activeRedFlags.push("symptom_progression_rapidly_worsening");
    }

    return activeRedFlags;
}

function deriveRedFlagStatus(collectedSlots) {
    const activeRedFlags = getActiveRedFlags(collectedSlots);
    if (activeRedFlags.length > 0) {
        return "positive";
    }

    const required = [
        "chest_pain_present",
        "shortness_of_breath_present",
        "fainting_or_altered_consciousness_present"
    ];
    const allExplicitNegative = required.every(
        (slotId) => collectedSlots[slotId] === false
    );

    return allExplicitNegative ? "negative" : "unknown";
}

module.exports = {
    extractRecommendationSlots,
    deriveRedFlagStatus,
    getActiveRedFlags
};
