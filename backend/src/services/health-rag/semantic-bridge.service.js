const { execFile } = require("child_process");
const http = require("http");
const https = require("https");
const path = require("path");

const DEFAULT_TIMEOUT_MS = 3000;
const DEFAULT_TOP_K = 3;
const DEFAULT_SERVER_URL = "http://127.0.0.1:8765";
const V1_4_RETRIEVER_VERSION = "v1_4";
const V1_4_RETRIEVAL_STRATEGY = "expanded_query_topic_aware_rerank";
const V1_4_CANDIDATE_TOP_K = 20;
const V1_4_FINAL_TOP_K = 5;

function isShadowEnabled() {
    return String(process.env.HOMELAB_SEMANTIC_BRIDGE_SHADOW || "")
        .trim()
        .toLowerCase() === "true";
}

function getTimeoutMs() {
    const configured = Number(process.env.HOMELAB_SEMANTIC_BRIDGE_TIMEOUT_MS);
    return Number.isFinite(configured) && configured > 0
        ? configured
        : DEFAULT_TIMEOUT_MS;
}

function getPythonCommand() {
    return process.env.HOMELAB_PYTHON_BIN || "python";
}

function getBridgeMode() {
    const mode = String(process.env.HOMELAB_SEMANTIC_BRIDGE_MODE || "process")
        .trim()
        .toLowerCase();

    return mode === "server" ? "server" : "process";
}

function getBridgeServerUrl() {
    return process.env.HOMELAB_SEMANTIC_BRIDGE_URL || DEFAULT_SERVER_URL;
}

function getSemanticRetrieverVersion() {
    return String(process.env.HOMELAB_SEMANTIC_RETRIEVER_VERSION || "")
        .trim()
        .toLowerCase();
}

function getSemanticRetrievalStrategy() {
    return String(process.env.HOMELAB_SEMANTIC_RETRIEVAL_STRATEGY || "")
        .trim()
        .toLowerCase();
}

function isV14ControlledBridgeEnabled() {
    return (
        getSemanticRetrieverVersion() === V1_4_RETRIEVER_VERSION &&
        getSemanticRetrievalStrategy() === V1_4_RETRIEVAL_STRATEGY
    );
}

function getBridgeScriptPath() {
    return path.join(
        __dirname,
        "../../../../ai_lab/scripts/semantic_retriever_bridge_v1_3.py"
    );
}

function disabledResult() {
    return {
        semanticBridgeStatus: "disabled",
        runtimeMode: null,
        retrieverVersion: null,
        modelName: null,
        topChunks: [],
        bridgeMode: getBridgeMode(),
        retrievalStrategy: null,
        artifactDir: null,
        candidateTopK: null,
        finalTopK: null,
        queryExpansionApplied: false,
        detectedAliasGroups: [],
        queryExpansionTerms: [],
        runtimePromoted: false,
        runtimeDefaultChanged: false,
        fallbackUsed: false,
        fallbackReason: null,
        latencyMs: null,
        error: null
    };
}

function errorResult(errorMessage, details = {}) {
    return {
        semanticBridgeStatus: "error",
        runtimeMode: null,
        retrieverVersion: null,
        modelName: null,
        topChunks: [],
        bridgeMode: getBridgeMode(),
        retrievalStrategy: null,
        artifactDir: null,
        candidateTopK: null,
        finalTopK: null,
        queryExpansionApplied: false,
        detectedAliasGroups: [],
        queryExpansionTerms: [],
        runtimePromoted: false,
        runtimeDefaultChanged: false,
        fallbackUsed: true,
        fallbackReason: "semantic_bridge_error",
        latencyMs: null,
        error: errorMessage,
        ...details
    };
}

function normalizePayload(payload) {
    if (payload.error) {
        return errorResult(payload.error, {
            query: payload.query || null,
            runtimeMode: payload.runtimeMode || null,
            retrieverVersion: payload.retrieverVersion || null,
            modelName: payload.modelName || null,
            retrievalStrategy: payload.retrievalStrategy || null,
            artifactDir: payload.artifactDir || null,
            runtimePromoted: payload.runtimePromoted === true,
            runtimeDefaultChanged: payload.runtimeDefaultChanged === true,
            fallbackReason: payload.fallbackReason || "semantic_bridge_payload_error"
        });
    }

    const topChunks = Array.isArray(payload.topChunks)
        ? payload.topChunks
        : Array.isArray(payload.results)
            ? payload.results
            : [];

    return {
        semanticBridgeStatus: "ok",
        query: payload.query || null,
        runtimeMode: payload.runtimeMode || null,
        retrieverVersion: payload.retrieverVersion || null,
        retrievalStrategy: payload.retrievalStrategy || null,
        artifactDir: payload.artifactDir || null,
        modelName: payload.modelName || null,
        topChunks,
        results: topChunks,
        bridgeMode: payload.bridgeMode || getBridgeMode(),
        candidateTopK: Number.isFinite(Number(payload.candidateTopK))
            ? Number(payload.candidateTopK)
            : null,
        finalTopK: Number.isFinite(Number(payload.finalTopK))
            ? Number(payload.finalTopK)
            : null,
        queryExpansionApplied: payload.queryExpansionApplied === true,
        expandedQuery: payload.expandedQuery || null,
        detectedAliasGroups: Array.isArray(payload.detectedAliasGroups)
            ? payload.detectedAliasGroups
            : [],
        queryExpansionTerms: Array.isArray(payload.queryExpansionTerms)
            ? payload.queryExpansionTerms
            : [],
        runtimePromoted: payload.runtimePromoted === true,
        runtimeDefaultChanged: payload.runtimeDefaultChanged === true,
        fallbackUsed: payload.fallbackUsed === true,
        fallbackReason: payload.fallbackReason || null,
        latencyMs: Number.isFinite(Number(payload.latencyMs))
            ? Number(payload.latencyMs)
            : null,
        clientLatencyMs: Number.isFinite(Number(payload.clientLatencyMs))
            ? Number(payload.clientLatencyMs)
            : null,
        error: null
    };
}

function requestJson({ url, method = "GET", body = null, timeoutMs }) {
    return new Promise((resolve, reject) => {
        const target = new URL(url);
        const client = target.protocol === "https:" ? https : http;
        const payload = body ? JSON.stringify(body) : null;
        const request = client.request(
            target,
            {
                method,
                timeout: timeoutMs,
                headers: payload
                    ? {
                        "Content-Type": "application/json",
                        "Content-Length": Buffer.byteLength(payload)
                    }
                    : undefined
            },
            (response) => {
                const chunks = [];
                response.setEncoding("utf8");
                response.on("data", (chunk) => chunks.push(chunk));
                response.on("end", () => {
                    const responseBody = chunks.join("");

                    try {
                        const parsed = responseBody
                            ? JSON.parse(responseBody)
                            : {};

                        if (response.statusCode >= 400) {
                            reject(
                                new Error(
                                    parsed.error ||
                                        `Semantic bridge server returned HTTP ${response.statusCode}`
                                )
                            );
                            return;
                        }

                        resolve(parsed);
                    } catch (error) {
                        reject(
                            new Error(
                                `Failed to parse semantic bridge server JSON: ${error.message}`
                            )
                        );
                    }
                });
            }
        );

        request.on("timeout", () => {
            request.destroy(new Error("Semantic bridge server request timed out"));
        });
        request.on("error", reject);

        if (payload) {
            request.write(payload);
        }
        request.end();
    });
}

async function runSemanticBridgeServer({ message, topK }) {
    const serverUrl = getBridgeServerUrl().replace(/\/+$/, "");
    const started = Date.now();
    const useV14ControlledBridge = isV14ControlledBridgeEnabled();
    const requestTopK = useV14ControlledBridge
        ? V1_4_FINAL_TOP_K
        : topK || DEFAULT_TOP_K;
    const requestBody = {
        query: String(message || ""),
        topK: requestTopK
    };

    if (useV14ControlledBridge) {
        requestBody.candidateTopK = V1_4_CANDIDATE_TOP_K;
    }

    try {
        const payload = await requestJson({
            url: `${serverUrl}/query`,
            method: "POST",
            body: requestBody,
            timeoutMs: getTimeoutMs()
        });

        return normalizePayload({
            ...payload,
            bridgeMode: "server",
            clientLatencyMs: Date.now() - started
        });
    } catch (error) {
        return errorResult(error.message, {
            bridgeMode: "server",
            serverUrl,
            requestedRetrieverVersion: useV14ControlledBridge
                ? V1_4_RETRIEVER_VERSION
                : null,
            requestedRetrievalStrategy: useV14ControlledBridge
                ? V1_4_RETRIEVAL_STRATEGY
                : null,
            candidateTopK: useV14ControlledBridge
                ? V1_4_CANDIDATE_TOP_K
                : null,
            finalTopK: requestTopK,
            fallbackUsed: true,
            fallbackReason: useV14ControlledBridge
                ? "semantic_bridge_v1_4_server_error_fallback_to_existing_path"
                : "semantic_bridge_server_error_fallback_to_existing_path",
            clientLatencyMs: Date.now() - started
        });
    }
}

async function checkSemanticBridgeHealth() {
    if (getBridgeMode() !== "server") {
        return {
            ok: false,
            bridgeMode: getBridgeMode(),
            reason: "server_mode_not_enabled"
        };
    }

    const serverUrl = getBridgeServerUrl().replace(/\/+$/, "");

    try {
        const payload = await requestJson({
            url: `${serverUrl}/health`,
            timeoutMs: getTimeoutMs()
        });

        return {
            ...payload,
            bridgeMode: "server",
            serverUrl
        };
    } catch (error) {
        return {
            ok: false,
            bridgeMode: "server",
            serverUrl,
            error: error.message
        };
    }
}

function runSemanticBridge({ message, topK = DEFAULT_TOP_K, force = false }) {
    if (!force && !isShadowEnabled()) {
        return Promise.resolve(disabledResult());
    }

    if (getBridgeMode() === "server") {
        return runSemanticBridgeServer({ message, topK });
    }

    return new Promise((resolve) => {
        const args = [
            getBridgeScriptPath(),
            "--query",
            String(message || ""),
            "--top-k",
            String(topK || DEFAULT_TOP_K)
        ];

        execFile(
            getPythonCommand(),
            args,
            {
                encoding: "utf8",
                timeout: getTimeoutMs(),
                windowsHide: true,
                maxBuffer: 1024 * 1024
            },
            (error, stdout, stderr) => {
                if (error) {
                    const timedOut =
                        error.killed ||
                        error.signal === "SIGTERM" ||
                        /timed out/i.test(error.message || "");
                    resolve(
                        errorResult(error.message, {
                            bridgeMode: "process",
                            timedOut,
                            stderr: String(stderr || "").trim() || null
                        })
                    );
                    return;
                }

                try {
                    const payload = JSON.parse(String(stdout || "").trim());
                    resolve(
                        normalizePayload({
                            ...payload,
                            bridgeMode: "process",
                            stderr: String(stderr || "").trim() || null
                        })
                    );
                } catch (parseError) {
                    resolve(
                        errorResult(`Failed to parse semantic bridge JSON: ${parseError.message}`, {
                            bridgeMode: "process",
                            stdout: String(stdout || "").slice(0, 1000),
                            stderr: String(stderr || "").trim() || null
                        })
                    );
                }
            }
        );
    });
}

module.exports = {
    runSemanticBridge,
    checkSemanticBridgeHealth,
    isShadowEnabled
};
