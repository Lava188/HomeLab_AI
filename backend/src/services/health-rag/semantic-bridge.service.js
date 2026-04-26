const { execFile } = require("child_process");
const http = require("http");
const https = require("https");
const path = require("path");

const DEFAULT_TIMEOUT_MS = 3000;
const DEFAULT_TOP_K = 3;
const DEFAULT_SERVER_URL = "http://127.0.0.1:8765";

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
            modelName: payload.modelName || null
        });
    }

    return {
        semanticBridgeStatus: "ok",
        query: payload.query || null,
        runtimeMode: payload.runtimeMode || null,
        retrieverVersion: payload.retrieverVersion || null,
        modelName: payload.modelName || null,
        topChunks: Array.isArray(payload.topChunks) ? payload.topChunks : [],
        bridgeMode: payload.bridgeMode || getBridgeMode(),
        latencyMs: Number.isFinite(Number(payload.latencyMs))
            ? Number(payload.latencyMs)
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

    try {
        const payload = await requestJson({
            url: `${serverUrl}/query`,
            method: "POST",
            body: {
                query: String(message || ""),
                topK: topK || DEFAULT_TOP_K
            },
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
