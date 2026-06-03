const DEFAULT_BASE_URL = "http://localhost:11434";
const DEFAULT_MODEL = "qwen2.5:3b";
const DEFAULT_TIMEOUT_MS = 60000;

const PROVIDER_NAME = "ollama_shadow_health_query_expansion";
const EXPANSION_VERSION = "health_query_expansion_v1";

function getConfig(env = process.env) {
    return {
        baseUrl: String(env.HOMELAB_OLLAMA_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, ""),
        model: env.HOMELAB_HEALTH_QUERY_EXPANSION_MODEL ||
            env.HOMELAB_INTENT_CLASSIFIER_MODEL ||
            DEFAULT_MODEL,
        timeoutMs: Number(env.HOMELAB_INTENT_CLASSIFIER_TIMEOUT_MS || DEFAULT_TIMEOUT_MS) ||
            DEFAULT_TIMEOUT_MS
    };
}

function toStringArray(value) {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .slice(0, 12);
}

function normalizeConfidence(value) {
    const numberValue = Number(value);

    if (!Number.isFinite(numberValue)) {
        return 0;
    }

    return Math.max(0, Math.min(1, numberValue));
}

function buildFallbackExpansion(fallbackReason, extra = {}) {
    return {
        version: EXPANSION_VERSION,
        provider: PROVIDER_NAME,
        fallbackReason,
        expandedQueryTerms: [],
        likelySymptoms: [],
        relatedTests: [],
        clarifyingHints: [],
        confidence: 0,
        shouldUseExpansion: false,
        ...extra
    };
}

function stripJsonFence(rawText) {
    const text = String(rawText || "").trim();
    const fenceMatch = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);

    return fenceMatch ? fenceMatch[1].trim() : text;
}

function isConnectionError(error) {
    const code = error?.cause?.code || error?.code || "";
    const message = String(error?.message || "").toLowerCase();

    return (
        code === "ECONNREFUSED" ||
        code === "ECONNRESET" ||
        code === "ENOTFOUND" ||
        message.includes("fetch failed") ||
        message.includes("connection refused")
    );
}

async function readResponseText(response) {
    try {
        return await response.text();
    } catch {
        return "";
    }
}

function normalizeExpansionOutput(raw) {
    if (!raw || typeof raw !== "object") {
        return null;
    }

    const confidence = normalizeConfidence(raw.confidence);

    return {
        version: raw.version || EXPANSION_VERSION,
        provider: raw.provider || PROVIDER_NAME,
        expandedQueryTerms: toStringArray(raw.expandedQueryTerms),
        likelySymptoms: toStringArray(raw.likelySymptoms),
        relatedTests: toStringArray(raw.relatedTests),
        clarifyingHints: toStringArray(raw.clarifyingHints).slice(0, 4),
        confidence,
        shouldUseExpansion: confidence >= 0.2
    };
}

function buildQueryExpansionPrompt(query, sessionContext = {}) {
    const recentMessages = Array.isArray(sessionContext.recentMessages)
        ? sessionContext.recentMessages.slice(-5).map((message) => ({
              role: message.role || "user",
              content: message.content || ""
          }))
        : [];
    const recentSymptoms = Array.isArray(sessionContext.recentSymptoms)
        ? sessionContext.recentSymptoms
        : sessionContext.healthConsultation?.symptoms || [];
    const lastBotAction = sessionContext.lastBotAction ||
        sessionContext.lastAction ||
        sessionContext.healthConsultation?.lastBotAction ||
        null;

    return [
        "Bạn là bộ mở rộng truy vấn Health RAG read-only cho HomeLab.",
        "Chỉ trả về JSON hợp lệ, không markdown, không giải thích ngoài JSON.",
        "",
        "Nhiệm vụ:",
        "- Mở rộng ngữ nghĩa câu hỏi sức khỏe để cải thiện truy hồi tài liệu.",
        "- Suy luận các biểu hiện, triệu chứng, tên xét nghiệm, mục tiêu kiểm tra có liên quan.",
        "- Không phân loại intent bằng danh sách keyword.",
        "- Không tạo, sửa, hủy booking; không gán collector; không tác động database.",
        "- Không chẩn đoán bệnh, không kê đơn, không đưa quyết định y tế.",
        "",
        "Schema JSON bắt buộc:",
        JSON.stringify({
            expandedQueryTerms: ["string"],
            likelySymptoms: ["string"],
            relatedTests: ["string"],
            clarifyingHints: ["string"],
            confidence: 0.0
        }, null, 2),
        "",
        "Bối cảnh phiên hiện tại:",
        JSON.stringify({
            recentMessages,
            recentSymptoms,
            lastBotAction
        }, null, 2),
        "",
        "Câu hỏi user:",
        String(query || ""),
        "",
        "Trả về đúng một JSON object theo schema."
    ].join("\n");
}

async function expandUserQueryWithOllama(query, sessionContext = {}, options = {}) {
    const config = {
        ...getConfig(options.env || process.env),
        ...(options.baseUrl ? { baseUrl: String(options.baseUrl).replace(/\/+$/, "") } : {}),
        ...(options.model ? { model: options.model } : {}),
        ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {})
    };
    const fetchImpl = options.fetchImpl || global.fetch;
    const startedAt = Date.now();

    if (!String(query || "").trim()) {
        return buildFallbackExpansion("empty_query", {
            elapsedMs: Date.now() - startedAt
        });
    }

    if (typeof fetchImpl !== "function") {
        return buildFallbackExpansion("provider_fetch_unavailable", {
            elapsedMs: Date.now() - startedAt
        });
    }

    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), config.timeoutMs) : null;

    try {
        // Ollama runs as a shadow/read-only provider. The output is used only to enrich retrieval text.
        const response = await fetchImpl(`${config.baseUrl}/api/generate`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: config.model,
                prompt: buildQueryExpansionPrompt(query, sessionContext),
                stream: false,
                format: "json",
                options: {
                    temperature: 0
                }
            }),
            ...(controller ? { signal: controller.signal } : {})
        });
        const elapsedMs = Date.now() - startedAt;

        if (!response.ok) {
            const errorText = await readResponseText(response);

            return buildFallbackExpansion("provider_http_error", {
                elapsedMs,
                fetchStatus: response.status,
                errorText: errorText.slice(0, 200)
            });
        }

        let payload;
        try {
            payload = await response.json();
        } catch {
            return buildFallbackExpansion("provider_malformed_json", { elapsedMs });
        }

        let parsed;
        try {
            parsed = JSON.parse(stripJsonFence(payload?.response));
        } catch {
            return buildFallbackExpansion("provider_invalid_json", {
                elapsedMs,
                rawResponse: String(payload?.response || "").slice(0, 500)
            });
        }

        const normalized = normalizeExpansionOutput(parsed);

        if (!normalized) {
            return buildFallbackExpansion("provider_invalid_schema", { elapsedMs });
        }

        return {
            ...normalized,
            elapsedMs,
            model: config.model,
            baseUrl: config.baseUrl
        };
    } catch (error) {
        const elapsedMs = Date.now() - startedAt;
        const fallbackReason = error?.name === "AbortError"
            ? "provider_timeout"
            : isConnectionError(error)
                ? "provider_connection_failed"
                : "provider_exception";

        return buildFallbackExpansion(fallbackReason, {
            elapsedMs,
            errorName: error?.name || null,
            errorCode: error?.cause?.code || error?.code || null,
            errorMessage: String(error?.message || "").slice(0, 200)
        });
    } finally {
        if (timeout) {
            clearTimeout(timeout);
        }
    }
}

function buildExpandedRetrievalQuery(query, expansion) {
    if (!expansion || expansion.shouldUseExpansion !== true || expansion.fallbackReason) {
        return String(query || "");
    }

    const additions = [
        ...expansion.expandedQueryTerms,
        ...expansion.likelySymptoms,
        ...expansion.relatedTests
    ];
    const uniqueAdditions = [...new Set(additions.map((item) => String(item || "").trim()).filter(Boolean))];

    return [
        String(query || "").trim(),
        ...uniqueAdditions
    ].filter(Boolean).join(" ");
}

module.exports = {
    EXPANSION_VERSION,
    PROVIDER_NAME,
    buildExpandedRetrievalQuery,
    buildFallbackExpansion,
    buildQueryExpansionPrompt,
    expandUserQueryWithOllama,
    normalizeExpansionOutput
};
