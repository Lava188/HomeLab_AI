const deterministicProvider = require("./intent-classifier/deterministic-intent.provider");
const llmProvider = require("./intent-classifier/llm-intent.provider");
const ollamaProvider = require("./intent-classifier/ollama-intent.provider");
const {
    INTENT_GROUPS,
    CONVERSATION_ACTS,
    TARGET_TYPES,
    SAFETY_DECISIONS,
    PROVIDERS
} = require("./intent-classifier/intent-classifier.types");
const {
    normalizeIntentClassifierOutput,
    validateIntentClassifierOutput,
    buildFallbackIntentOutput
} = require("./intent-classifier/intent-output.validator");

const DEFAULT_ASYNC_PROVIDER_TIMEOUT_MS = 60000;

function getAsyncProviderTimeoutMs(options = {}, env = process.env) {
    const configured = Number(options.timeoutMs || env.HOMELAB_INTENT_CLASSIFIER_TIMEOUT_MS);
    return Number.isFinite(configured) && configured > 0
        ? configured
        : DEFAULT_ASYNC_PROVIDER_TIMEOUT_MS;
}

function getProviderName(options = {}) {
    const configured = String(options.providerName || process.env.HOMELAB_INTENT_CLASSIFIER_PROVIDER || "")
        .trim()
        .toLowerCase();

    if (configured === "llm" || configured === PROVIDERS.LLM_SHADOW_DISABLED) {
        return PROVIDERS.LLM_SHADOW_DISABLED;
    }

    if (configured === PROVIDERS.OLLAMA_SHADOW) {
        return PROVIDERS.OLLAMA_SHADOW;
    }

    return PROVIDERS.DETERMINISTIC_STUB;
}

function getProvider(providerName = getProviderName()) {
    if (providerName === PROVIDERS.LLM_SHADOW_DISABLED) {
        return llmProvider;
    }

    if (providerName === PROVIDERS.OLLAMA_SHADOW) {
        return ollamaProvider;
    }

    return deterministicProvider;
}

function withTimeout(promise, ms = DEFAULT_ASYNC_PROVIDER_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error("intent_classifier_provider_timeout"));
        }, ms);

        Promise.resolve(promise)
            .then((value) => {
                clearTimeout(timeout);
                resolve(value);
            })
            .catch((error) => {
                clearTimeout(timeout);
                reject(error);
            });
    });
}

function normalizeInput(input = {}) {
    return {
        message: input.message || "",
        sessionContext: input.sessionContext || {},
        draft: input.draft || {},
        lastBotAction: input.lastBotAction || null,
        domainContext: input.domainContext || {},
        ruleAct: input.ruleAct || null
    };
}

function fallbackFromProviderMarker(input, marker) {
    const fallbackResult = classifyWithProvider(
        input,
        PROVIDERS.DETERMINISTIC_STUB
    );

    return withFallbackMetadata(
        fallbackResult,
        marker.fallbackReason || "provider_unavailable_fallback_deterministic",
        marker.evidence || {}
    );
}

function classifyWithProvider(input, providerName) {
    const provider = getProvider(providerName);
    const rawResult = provider.classify(input);

    if (rawResult?.__fallbackDeterministic) {
        return fallbackFromProviderMarker(input, rawResult);
    }

    if (!rawResult || typeof rawResult.then === "function") {
        return null;
    }

    return normalizeIntentClassifierOutput(rawResult, {
        provider: rawResult.provider || rawResult.evidence?.provider || providerName,
        context: {
            nextExpectedField: input.domainContext?.nextExpectedField,
            domainContext: input.domainContext || {}
        }
    });
}

async function classifyWithProviderAsync(input, providerName, options = {}) {
    const provider = options.provider || getProvider(providerName);
    const timeoutMs = getAsyncProviderTimeoutMs(options);
    const rawResult = await withTimeout(provider.classify(input), timeoutMs);

    if (!rawResult) {
        return {
            result: null,
            malformed: true
        };
    }

    if (rawResult.__fallbackDeterministic) {
        return {
            result: null,
            fallbackReason: rawResult.fallbackReason,
            evidence: rawResult.evidence || {},
            malformed: false
        };
    }

    const result = normalizeIntentClassifierOutput(rawResult, {
        provider: rawResult.provider || rawResult.evidence?.provider || providerName,
        context: {
            nextExpectedField: input.domainContext?.nextExpectedField,
            domainContext: input.domainContext || {}
        }
    });

    return {
        result,
        malformed: !result
    };
}

function withFallbackMetadata(output, fallbackReason, extraEvidence = {}) {
    if (!output) return null;

    return {
        ...output,
        fallbackReason,
        ...(extraEvidence.providerUsed ? { providerUsed: extraEvidence.providerUsed } : {}),
        evidence: {
            ...extraEvidence,
            ...(output.evidence || {}),
            fallbackReason
        }
    };
}

function classifySemanticIntent(input = {}) {
    const normalizedInput = normalizeInput(input);
    const providerName = getProviderName();

    try {
        const providerResult = classifyWithProvider(normalizedInput, providerName);

        if (providerResult) {
            if (providerName === PROVIDERS.LLM_SHADOW_DISABLED) {
                const fallbackResult = classifyWithProvider(
                    normalizedInput,
                    PROVIDERS.DETERMINISTIC_STUB
                );
                return withFallbackMetadata(
                    fallbackResult,
                    providerResult.fallbackReason || "llm_provider_disabled_fallback_deterministic"
                );
            }

            return providerResult;
        }

        if (providerName !== PROVIDERS.DETERMINISTIC_STUB) {
            const fallbackResult = classifyWithProvider(
                normalizedInput,
                PROVIDERS.DETERMINISTIC_STUB
            );
            return withFallbackMetadata(
                fallbackResult,
                "provider_unavailable_fallback_deterministic"
            );
        }

        return buildFallbackIntentOutput({
            provider: providerName,
            fallbackReason: "intent_classifier_provider_returned_null"
        });
    } catch {
        try {
            const fallbackResult = classifyWithProvider(
                normalizedInput,
                PROVIDERS.DETERMINISTIC_STUB
            );

            return withFallbackMetadata(
                fallbackResult,
                "intent_classifier_exception_fallback_deterministic"
            );
        } catch {
            return null;
        }
    }
}

async function classifySemanticIntentAsync(input = {}, options = {}) {
    const normalizedInput = normalizeInput(input);
    const providerName = getProviderName(options);
    const timeoutMs = getAsyncProviderTimeoutMs(options);
    const injectedProvider = options.provider || null;

    try {
        const providerResponse = await classifyWithProviderAsync(
            normalizedInput,
            providerName,
            {
                provider: injectedProvider || undefined,
                timeoutMs
            }
        );
        const providerResult = providerResponse?.result || null;

        if (providerResult) {
            if (providerName === PROVIDERS.LLM_SHADOW_DISABLED && !injectedProvider) {
                const fallbackResult = classifyWithProvider(
                    normalizedInput,
                    PROVIDERS.DETERMINISTIC_STUB
                );
                return withFallbackMetadata(
                    fallbackResult,
                    providerResult.fallbackReason || "llm_provider_disabled_fallback_deterministic"
                );
            }

            return providerResult;
        }

        const fallbackResult = classifyWithProvider(
            normalizedInput,
            PROVIDERS.DETERMINISTIC_STUB
        );
        return withFallbackMetadata(
            fallbackResult,
            providerResponse?.fallbackReason ||
            (providerResponse?.malformed
                ? "provider_malformed_output_fallback_deterministic"
                : "provider_unavailable_fallback_deterministic"),
            providerResponse?.evidence || {}
        );
    } catch (error) {
        const fallbackReason = error?.message === "intent_classifier_provider_timeout"
            ? "provider_timeout_fallback_deterministic"
            : "provider_exception_fallback_deterministic";

        try {
            const fallbackResult = classifyWithProvider(
                normalizedInput,
                PROVIDERS.DETERMINISTIC_STUB
            );
            return withFallbackMetadata(fallbackResult, fallbackReason);
        } catch {
            return buildFallbackIntentOutput({
                provider: providerName,
                fallbackReason
            });
        }
    }
}

module.exports = {
    INTENT_GROUPS,
    CONVERSATION_ACTS,
    TARGET_TYPES,
    SAFETY_DECISIONS,
    PROVIDERS,
    classifySemanticIntent,
    classifySemanticIntentAsync,
    getProviderName,
    getProvider,
    withTimeout,
    getAsyncProviderTimeoutMs,
    buildIntentClassifierPrompt: llmProvider.buildIntentClassifierPrompt,
    parseLlmIntentOutput: llmProvider.parseLlmIntentOutput,
    validateIntentClassifierOutput,
    normalizeIntentClassifierOutput
};
