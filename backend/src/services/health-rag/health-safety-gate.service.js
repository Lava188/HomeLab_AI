const { normalizeText } = require("../../utils/text.util");

const SAFETY_GATE_VERSION = "health_safety_gate_v5n5";
const DEFAULT_BASE_URL = "http://localhost:11434";
const DEFAULT_MODEL = "qwen2.5:3b";
const DEFAULT_TIMEOUT_MS = 900;
const OLLAMA_CONFIDENCE_THRESHOLD = 0.55;

const RISK_ORDER = {
    none: 0,
    low: 1,
    medium: 2,
    urgent: 3,
    emergency: 4
};

const URGENT_SCENARIOS = [
    {
        id: "chest_pressure_breath_sweat",
        riskLevel: "emergency",
        terms: ["dau nguc", "tuc nguc", "nguc de nang", "kho tho", "tho khong ra hoi", "va mo hoi", "lanh toat", "buon non"]
    },
    {
        id: "stroke_like",
        riskLevel: "emergency",
        terms: ["yeu mot ben", "liet mot ben", "liet nua nguoi", "noi kho", "meo mieng", "dot ngot"]
    },
    {
        id: "sudden_severe_headache_neuro",
        riskLevel: "urgent",
        terms: ["dau dau du doi", "dau dau dot ngot", "non nhieu", "lo mo", "co giat"]
    },
    {
        id: "persistent_vomiting_dehydration",
        riskLevel: "urgent",
        terms: ["non lien tuc", "non nhieu", "khong uong duoc nuoc", "mat nuoc"]
    },
    {
        id: "high_fever_confusion",
        riskLevel: "urgent",
        terms: ["sot cao", "ret run", "lo mo", "lu lan", "xau di nhanh"]
    }
];

function getConfig(env = process.env) {
    return {
        baseUrl: String(env.HOMELAB_OLLAMA_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, ""),
        model: env.HOMELAB_HEALTH_SAFETY_MODEL || env.HOMELAB_INTENT_CLASSIFIER_MODEL || DEFAULT_MODEL,
        timeoutMs: Number(env.HOMELAB_HEALTH_SAFETY_TIMEOUT_MS || DEFAULT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS
    };
}

function isUrgentRisk(riskLevel) {
    return RISK_ORDER[riskLevel] >= RISK_ORDER.urgent;
}

function maxRisk(left, right) {
    return RISK_ORDER[right] > RISK_ORDER[left] ? right : left;
}

function hasNegatedSignal(text, signal) {
    return [
        `khong ${signal}`,
        `khong bi ${signal}`,
        `khong co ${signal}`,
        `khong thay ${signal}`,
        `chua thay ${signal}`,
        `khong he ${signal}`
    ].some((pattern) => text.includes(pattern));
}

function hasSignal(text, signals) {
    return signals.some((signal) => text.includes(signal) && !hasNegatedSignal(text, signal));
}

function collectNegatedRedFlags(text) {
    const flags = [
        ["dau nguc", "no_chest_pain"],
        ["kho tho", "no_breathlessness"],
        ["ngat", "no_fainting"],
        ["lo mo", "no_confusion"],
        ["co giat", "no_seizure"],
        ["sot cao", "no_high_fever"]
    ];

    return flags
        .filter(([signal]) => hasNegatedSignal(text, signal))
        .map(([, flag]) => flag);
}

function evaluateRuleLayer(message = "", healthConsultationContext = {}) {
    const text = normalizeText(message);
    const ruleSignals = [];
    let riskLevel = "none";

    const chest = hasSignal(text, ["dau nguc", "tuc nguc", "nang nguc", "nguc de nang", "de nang nguc"]);
    const breath = hasSignal(text, ["kho tho", "hut hoi", "tho khong ra hoi", "tho gap", "tho nhanh"]);
    const sweatCold = hasSignal(text, ["va mo hoi", "mo hoi lanh", "lanh toat", "nguoi lanh"]);
    const nausea = hasSignal(text, ["buon non", "non nao"]);

    if (chest && (breath || sweatCold || nausea)) {
        ruleSignals.push("chest_pressure_with_breathlessness_or_sweat");
        riskLevel = "emergency";
    }

    if (hasSignal(text, ["ngat", "bat tinh", "lo mo", "lu lan", "co giat"])) {
        ruleSignals.push("fainting_confusion_or_seizure");
        riskLevel = maxRisk(riskLevel, "emergency");
    }

    if (
        hasSignal(text, ["yeu mot ben", "liet mot ben", "yeu nua nguoi", "liet nua nguoi"]) ||
        (hasSignal(text, ["noi kho", "meo mieng"]) && hasSignal(text, ["dot ngot", "bat ngo"]))
    ) {
        ruleSignals.push("stroke_like_symptoms");
        riskLevel = maxRisk(riskLevel, "emergency");
    }

    if (
        hasSignal(text, ["dau dau du doi", "dau dau dot ngot"]) &&
        hasSignal(text, ["non nhieu", "non lien tuc", "lo mo", "lu lan", "co giat"])
    ) {
        ruleSignals.push("sudden_severe_headache_with_neuro_or_vomiting");
        riskLevel = maxRisk(riskLevel, "urgent");
    }

    if (
        hasSignal(text, ["non lien tuc", "non nhieu"]) &&
        hasSignal(text, ["khong uong duoc nuoc", "khong giu duoc nuoc", "mat nuoc"])
    ) {
        ruleSignals.push("persistent_vomiting_cannot_drink");
        riskLevel = maxRisk(riskLevel, "urgent");
    }

    if (
        hasSignal(text, ["sot cao"]) &&
        hasSignal(text, ["ret run", "lo mo", "lu lan", "tho nhanh", "xau di nhanh"])
    ) {
        ruleSignals.push("high_fever_with_systemic_red_flags");
        riskLevel = maxRisk(riskLevel, "urgent");
    }

    if (hasSignal(text, ["xau di nhanh", "nang len nhanh", "te di nhanh"])) {
        ruleSignals.push("rapid_worsening");
        riskLevel = maxRisk(riskLevel, "urgent");
    }

    if (healthConsultationContext?.needsUrgentCare && ruleSignals.length > 0) {
        riskLevel = maxRisk(riskLevel, "urgent");
    }

    return {
        riskLevel,
        confidence: ruleSignals.length ? 0.8 : 0.45,
        ruleSignals,
        negatedRedFlags: collectNegatedRedFlags(text)
    };
}

function evaluateSimilarityLayer(message = "") {
    const text = normalizeText(message);
    const matches = URGENT_SCENARIOS.map((scenario) => {
        const matchedTerms = scenario.terms.filter((term) =>
            text.includes(term) && !hasNegatedSignal(text, term)
        );
        const score = matchedTerms.length / Math.min(scenario.terms.length, 4);

        return {
            id: scenario.id,
            riskLevel: scenario.riskLevel,
            score: Math.min(1, score),
            matchedTerms
        };
    }).sort((left, right) => right.score - left.score);

    const best = matches[0] || null;
    const confident = best && (
        best.score >= 0.5 ||
        (best.id === "chest_pressure_breath_sweat" && best.matchedTerms.length >= 3) ||
        (best.id === "persistent_vomiting_dehydration" && best.matchedTerms.length >= 2)
    );

    return {
        riskLevel: confident ? best.riskLevel : "none",
        confidence: confident ? Math.max(0.6, best.score) : 0.35,
        bestMatch: best,
        matches: matches.slice(0, 3),
        method: "deterministic_internal_scenario_similarity"
    };
}

function stripJsonFence(rawText) {
    const text = String(rawText || "").trim();
    const fenceMatch = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    return fenceMatch ? fenceMatch[1].trim() : text;
}

function buildSafetyPrompt(input = {}) {
    const recentMessages = Array.isArray(input.sessionContext?.recentMessages)
        ? input.sessionContext.recentMessages.slice(-5).map((m) => `${m.role || "user"}: ${m.content || ""}`).join("\n")
        : "(khong co)";
    const summary = input.healthConsultationContext?.summary || "(khong co)";

    return [
        "You are a read-only medical safety classifier for HomeLab Health RAG.",
        "Return JSON only. Do not create, edit, confirm, or cancel bookings. Do not recommend packages.",
        "Classify whether the current user message describes urgent or emergency red flags.",
        "Respect negation: 'khong dau nguc', 'khong kho tho', 'khong ngat' are negated red flags.",
        "Schema:",
        JSON.stringify({
            riskLevel: "none|low|medium|urgent|emergency",
            needsUrgentCare: false,
            redFlagSummary: "short Vietnamese summary",
            negatedRedFlags: ["string"],
            confidence: 0.0,
            reason: "short reason",
            safeResponseType: "continue_consultation|ask_clarifying_question|urgent_escalation"
        }),
        "",
        "Recent conversation:",
        recentMessages,
        "",
        "Health context summary:",
        summary,
        "",
        "Current user message:",
        input.message || ""
    ].join("\n");
}

function normalizeSemanticSafetyOutput(raw) {
    if (!raw || typeof raw !== "object") return null;

    const riskLevel = Object.prototype.hasOwnProperty.call(RISK_ORDER, raw.riskLevel)
        ? raw.riskLevel
        : "none";
    const confidence = Number(raw.confidence);
    const safeResponseType = [
        "continue_consultation",
        "ask_clarifying_question",
        "urgent_escalation"
    ].includes(raw.safeResponseType)
        ? raw.safeResponseType
        : isUrgentRisk(riskLevel)
            ? "urgent_escalation"
            : "continue_consultation";

    return {
        riskLevel,
        needsUrgentCare: Boolean(raw.needsUrgentCare),
        redFlagSummary: String(raw.redFlagSummary || "").trim(),
        negatedRedFlags: Array.isArray(raw.negatedRedFlags) ? raw.negatedRedFlags.filter(Boolean).slice(0, 8) : [],
        confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
        reason: String(raw.reason || "semantic_safety_completed"),
        safeResponseType
    };
}

async function classifySafetyWithOllama(input = {}, options = {}) {
    const fetchImpl = options.fetchImpl === undefined ? global.fetch : options.fetchImpl;
    const startedAt = Date.now();

    if (typeof fetchImpl !== "function") {
        return {
            status: "fallback",
            fallbackReason: "provider_fetch_unavailable",
            elapsedMs: Date.now() - startedAt
        };
    }

    const config = {
        ...getConfig(options.env || process.env),
        ...(options.baseUrl ? { baseUrl: String(options.baseUrl).replace(/\/+$/, "") } : {}),
        ...(options.model ? { model: options.model } : {}),
        ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {})
    };
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), config.timeoutMs) : null;

    try {
        const response = await fetchImpl(`${config.baseUrl}/api/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: config.model,
                prompt: buildSafetyPrompt(input),
                stream: false,
                format: "json",
                options: { temperature: 0 }
            }),
            ...(controller ? { signal: controller.signal } : {})
        });
        const elapsedMs = Date.now() - startedAt;

        if (!response.ok) {
            return {
                status: "fallback",
                fallbackReason: response.status === 404 ? "provider_model_missing" : "provider_http_error",
                fetchStatus: response.status,
                elapsedMs
            };
        }

        const payload = await response.json();
        const parsed = JSON.parse(stripJsonFence(payload?.response || ""));
        const normalized = normalizeSemanticSafetyOutput(parsed);

        if (!normalized) {
            return { status: "fallback", fallbackReason: "provider_invalid_schema", elapsedMs };
        }

        if (normalized.confidence < OLLAMA_CONFIDENCE_THRESHOLD) {
            return {
                status: "fallback",
                fallbackReason: "provider_low_confidence",
                confidence: normalized.confidence,
                elapsedMs,
                result: normalized
            };
        }

        return {
            status: "ok",
            elapsedMs,
            result: normalized
        };
    } catch (error) {
        return {
            status: "fallback",
            fallbackReason: error?.name === "AbortError" ? "provider_timeout" : "provider_exception",
            errorName: error?.name || null,
            errorMessage: String(error?.message || "").slice(0, 200),
            elapsedMs: Date.now() - startedAt
        };
    } finally {
        if (timeout) clearTimeout(timeout);
    }
}

function buildDecision({ ruleRisk, semanticRisk, similarityRisk, healthConsultationContext }) {
    let riskLevel = ruleRisk.riskLevel;
    const reasons = [];

    if (isUrgentRisk(ruleRisk.riskLevel)) {
        reasons.push(`rule:${ruleRisk.ruleSignals.join(",")}`);
    }

    if (
        semanticRisk?.status === "ok" &&
        semanticRisk.result &&
        semanticRisk.result.needsUrgentCare &&
        isUrgentRisk(semanticRisk.result.riskLevel)
    ) {
        riskLevel = maxRisk(riskLevel, semanticRisk.result.riskLevel);
        reasons.push(`ollama:${semanticRisk.result.reason}`);
    }

    if (isUrgentRisk(similarityRisk.riskLevel) && similarityRisk.confidence >= 0.6) {
        riskLevel = maxRisk(riskLevel, similarityRisk.riskLevel);
        reasons.push(`similarity:${similarityRisk.bestMatch?.id || "scenario_match"}`);
    }

    const shouldEscalate = isUrgentRisk(riskLevel);
    const shouldAskClarifying =
        !shouldEscalate && Boolean(healthConsultationContext?.shouldAskClarifyingQuestion);

    return {
        version: SAFETY_GATE_VERSION,
        riskLevel,
        shouldEscalate,
        shouldBlockRecommendation: shouldEscalate,
        shouldBlockBooking: shouldEscalate,
        reason: reasons.length ? reasons.join(";") : "no_urgent_red_flag_detected",
        evidence: {
            ruleSignals: ruleRisk.ruleSignals,
            negatedRedFlags: ruleRisk.negatedRedFlags,
            semanticRisk,
            similarityRisk
        },
        safeNextAction: shouldEscalate
            ? "urgent_escalation"
            : shouldAskClarifying
                ? "ask_clarifying_question"
                : "continue_consultation"
    };
}

async function evaluateHealthSafetyGate(input = {}, options = {}) {
    const ruleRisk = evaluateRuleLayer(input.message, input.healthConsultationContext);
    const similarityRisk = evaluateSimilarityLayer(input.message);
    const semanticRisk = await classifySafetyWithOllama(input, options);

    return buildDecision({
        ruleRisk,
        semanticRisk,
        similarityRisk,
        healthConsultationContext: input.healthConsultationContext
    });
}

module.exports = {
    SAFETY_GATE_VERSION,
    evaluateHealthSafetyGate,
    evaluateRuleLayer,
    evaluateSimilarityLayer,
    classifySafetyWithOllama,
    normalizeSemanticSafetyOutput,
    buildDecision
};
