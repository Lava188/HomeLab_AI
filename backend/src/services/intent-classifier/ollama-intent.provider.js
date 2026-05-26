const {
    PROVIDERS
} = require("./intent-classifier.types");
const {
    buildIntentClassifierPrompt,
    parseLlmIntentOutput
} = require("./llm-intent.provider");

const DEFAULT_BASE_URL = "http://localhost:11434";
const DEFAULT_MODEL = "qwen2.5:3b";
const DEFAULT_TIMEOUT_MS = 60000;

function getConfig(env = process.env) {
    return {
        provider: PROVIDERS.OLLAMA_SHADOW,
        baseUrl: String(env.HOMELAB_OLLAMA_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, ""),
        model: env.HOMELAB_INTENT_CLASSIFIER_MODEL || DEFAULT_MODEL,
        timeoutMs: Number(env.HOMELAB_INTENT_CLASSIFIER_TIMEOUT_MS || DEFAULT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS
    };
}

function buildEvidence(config, overrides = {}) {
    return {
        provider: PROVIDERS.OLLAMA_SHADOW,
        providerUsed: PROVIDERS.OLLAMA_SHADOW,
        model: config.model,
        baseUrl: config.baseUrl,
        requestShape: "ollama_generate",
        ...overrides
    };
}

function fallbackMarker(config, fallbackReason, elapsedMs, extraEvidence = {}) {
    return {
        __fallbackDeterministic: true,
        fallbackReason,
        evidence: buildEvidence(config, {
            fallbackReason,
            elapsedMs,
            ...extraEvidence
        })
    };
}

function isModelMissing(status, text) {
    const normalized = String(text || "").toLowerCase();
    return (
        status === 404 ||
        normalized.includes("model") &&
            (
                normalized.includes("not found") ||
                normalized.includes("not installed") ||
                normalized.includes("pull")
            )
    );
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

async function classify(input = {}, options = {}) {
    const config = {
        ...getConfig(options.env || process.env),
        ...(options.baseUrl ? { baseUrl: String(options.baseUrl).replace(/\/+$/, "") } : {}),
        ...(options.model ? { model: options.model } : {}),
        ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {})
    };
    const fetchImpl = options.fetchImpl || global.fetch;
    const startedAt = Date.now();

    if (typeof fetchImpl !== "function") {
        return fallbackMarker(
            config,
            "provider_connection_failed_fallback_deterministic",
            Date.now() - startedAt,
            { errorCode: "fetch_unavailable" }
        );
    }

    const controller = typeof AbortController !== "undefined"
        ? new AbortController()
        : null;
    const timeout = controller
        ? setTimeout(() => controller.abort(), config.timeoutMs)
        : null;

    try {
        const response = await fetchImpl(`${config.baseUrl}/api/generate`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: config.model,
                prompt: buildIntentClassifierPrompt(input),
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
            const fallbackReason = isModelMissing(response.status, errorText)
                ? "provider_model_missing_fallback_deterministic"
                : "provider_connection_failed_fallback_deterministic";

            return fallbackMarker(config, fallbackReason, elapsedMs, {
                fetchStatus: response.status
            });
        }

        let payload;
        try {
            payload = await response.json();
        } catch {
            return fallbackMarker(
                config,
                "provider_malformed_output_fallback_deterministic",
                elapsedMs
            );
        }

        const parsed = parseLlmIntentOutput(payload?.response);
        if (!parsed) {
            return fallbackMarker(
                config,
                "provider_malformed_output_fallback_deterministic",
                elapsedMs
            );
        }

        return {
            ...parsed,
            provider: PROVIDERS.OLLAMA_SHADOW,
            providerUsed: PROVIDERS.OLLAMA_SHADOW,
            evidence: buildEvidence(config, {
                ...(parsed.evidence && typeof parsed.evidence === "object" ? parsed.evidence : {}),
                elapsedMs,
                done: payload?.done === true
            })
        };
    } catch (error) {
        const elapsedMs = Date.now() - startedAt;
        const fallbackReason = error?.name === "AbortError"
            ? "provider_timeout_fallback_deterministic"
            : isConnectionError(error)
                ? "provider_connection_failed_fallback_deterministic"
                : "provider_exception_fallback_deterministic";

        return fallbackMarker(config, fallbackReason, elapsedMs, {
            errorName: error?.name || null,
            errorCode: error?.cause?.code || error?.code || null
        });
    } finally {
        if (timeout) {
            clearTimeout(timeout);
        }
    }
}

module.exports = {
    classify,
    getConfig
};
