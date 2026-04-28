const { spawn } = require("child_process");
const http = require("http");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const BRIDGE_SCRIPT = path.join(
    ROOT,
    "ai_lab/scripts/semantic_retriever_bridge_v1_4.py"
);
const ARTIFACT_DIR = path.join(ROOT, "ai_lab/artifacts/retriever_v1_4");
const BRIDGE_URL = "http://127.0.0.1:8766";
const RETRIEVAL_STRATEGY = "expanded_query_topic_aware_rerank";

const QUERIES = [
    "xét nghiệm tổng quát",
    "mệt mỏi nên xét nghiệm gì",
    "kiểm tra thận",
    "HbA1c với đường huyết khác nhau thế nào",
    "mỡ máu cholesterol triglyceride là gì",
    "men gan ALT AST để làm gì",
    "xét nghiệm nước tiểu kiểm tra được gì",
    "xét nghiệm tuyến giáp TSH T4 là gì",
    "có cần nhịn ăn trước khi xét nghiệm máu không",
    "tôi có kết quả CBC rồi đọc giúp tôi"
];

function requestJson(url, timeoutMs = 3000) {
    return new Promise((resolve, reject) => {
        const request = http.get(url, { timeout: timeoutMs }, (response) => {
            const chunks = [];
            response.setEncoding("utf8");
            response.on("data", (chunk) => chunks.push(chunk));
            response.on("end", () => {
                try {
                    resolve(JSON.parse(chunks.join("") || "{}"));
                } catch (error) {
                    reject(error);
                }
            });
        });

        request.on("timeout", () => {
            request.destroy(new Error("HTTP request timed out"));
        });
        request.on("error", reject);
    });
}

async function waitForHealth(deadlineMs = 90000) {
    const started = Date.now();
    let lastError = null;

    while (Date.now() - started < deadlineMs) {
        try {
            const payload = await requestJson(`${BRIDGE_URL}/health`, 3000);
            if (payload?.ok) {
                return payload;
            }
        } catch (error) {
            lastError = error;
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    throw new Error(
        `semantic bridge v1_4 health did not become ready: ${lastError?.message || "unknown"}`
    );
}

function startBridge() {
    return spawn(
        process.env.HOMELAB_PYTHON_BIN || "python",
        [
            BRIDGE_SCRIPT,
            "--serve",
            "--host",
            "127.0.0.1",
            "--port",
            "8766",
            "--artifact-dir",
            ARTIFACT_DIR
        ],
        {
            cwd: ROOT,
            windowsHide: true,
            stdio: ["ignore", "pipe", "pipe"]
        }
    );
}

async function stopBridge(child) {
    if (!child || child.exitCode !== null) {
        return;
    }

    child.kill();
    await new Promise((resolve) => {
        const timeout = setTimeout(() => {
            if (child.exitCode === null) {
                child.kill("SIGKILL");
            }
            resolve();
        }, 5000);

        child.once("exit", () => {
            clearTimeout(timeout);
            resolve();
        });
    });
}

function hasMinimumResultMetadata(result) {
    return Boolean(
        (result.chunk_id || result.kb_id) &&
            result.topic &&
            result.domain &&
            (result.source_url || result.final_url) &&
            result.provenance !== undefined
    );
}

function hasRerankFields(result) {
    return Boolean(
        result.semanticScore !== undefined &&
            result.rerankScore !== undefined &&
            result.rankBeforeRerank !== undefined &&
            result.rankAfterRerank !== undefined
    );
}

function assertCondition(errors, label, condition, message) {
    if (!condition) {
        errors.push(`${label}: ${message}`);
    }
}

async function main() {
    const errors = [];
    const warnings = [];
    const querySummaries = [];

    delete process.env.HOMELAB_SEMANTIC_RETRIEVER_VERSION;
    delete process.env.HOMELAB_SEMANTIC_RETRIEVAL_STRATEGY;

    const semanticBridgeService = require("../src/services/health-rag/semantic-bridge.service");
    const defaultDisabled = await semanticBridgeService.runSemanticBridge({
        message: "xét nghiệm tổng quát",
        force: false
    });

    assertCondition(
        errors,
        "default_behavior",
        defaultDisabled.semanticBridgeStatus === "disabled",
        "runSemanticBridge without force/shadow should remain disabled"
    );

    process.env.HOMELAB_SEMANTIC_BRIDGE_MODE = "server";
    process.env.HOMELAB_SEMANTIC_BRIDGE_URL = BRIDGE_URL;
    process.env.HOMELAB_SEMANTIC_RETRIEVER_VERSION = "v1_4";
    process.env.HOMELAB_SEMANTIC_RETRIEVAL_STRATEGY = RETRIEVAL_STRATEGY;
    process.env.HOMELAB_SEMANTIC_BRIDGE_TIMEOUT_MS = "30000";

    const child = startBridge();

    try {
        await waitForHealth();

        for (const query of QUERIES) {
            const result = await semanticBridgeService.runSemanticBridge({
                message: query,
                topK: 3,
                force: true
            });
            const chunks = result.topChunks || result.results || [];
            const label = `query=${query}`;

            assertCondition(errors, label, result.semanticBridgeStatus === "ok", "semanticBridgeStatus is not ok");
            assertCondition(errors, label, result.retrieverVersion === "v1_4", "retrieverVersion is not v1_4");
            assertCondition(errors, label, result.retrievalStrategy === RETRIEVAL_STRATEGY, "retrievalStrategy mismatch");
            assertCondition(errors, label, result.candidateTopK === 20, "candidateTopK is not 20");
            assertCondition(errors, label, result.finalTopK === 5, "finalTopK is not 5");
            assertCondition(errors, label, result.runtimePromoted === false, "runtimePromoted is not false");
            assertCondition(errors, label, result.runtimeDefaultChanged === false, "runtimeDefaultChanged is not false");
            assertCondition(errors, label, chunks.length > 0, "no results returned");

            chunks.forEach((chunk, index) => {
                assertCondition(
                    errors,
                    `${label} result ${index + 1}`,
                    hasMinimumResultMetadata(chunk),
                    "missing topic/domain/source/provenance metadata"
                );
                assertCondition(
                    errors,
                    `${label} result ${index + 1}`,
                    hasRerankFields(chunk),
                    "missing semantic/rerank/rank fields"
                );
            });

            querySummaries.push({
                query,
                result_count: chunks.length,
                queryExpansionApplied: result.queryExpansionApplied,
                detectedAliasGroups: result.detectedAliasGroups || [],
                queryExpansionTerms: result.queryExpansionTerms || [],
                top_topic: chunks[0]?.topic || null,
                top_domain: chunks[0]?.domain || null,
                latencyMs: result.latencyMs,
                clientLatencyMs: result.clientLatencyMs
            });
        }
    } catch (error) {
        errors.push(`smoke_runtime: ${error.message}`);
    } finally {
        await stopBridge(child);
    }

    const summary = {
        smoke: "semantic_bridge_v1_4_node_controlled",
        total_queries: QUERIES.length,
        passed_queries: errors.length === 0 ? QUERIES.length : 0,
        retrieverVersion: "v1_4",
        retrievalStrategy: RETRIEVAL_STRATEGY,
        candidateTopK: 20,
        finalTopK: 5,
        runtimePromoted: false,
        runtimeDefaultChanged: false,
        defaultBehaviorPreserved: defaultDisabled.semanticBridgeStatus === "disabled",
        warning_count: warnings.length,
        error_count: errors.length,
        warnings,
        errors,
        queries: querySummaries
    };

    console.log(JSON.stringify(summary, null, 2));

    if (errors.length > 0) {
        process.exitCode = 1;
    }
}

main().catch((error) => {
    console.error(JSON.stringify({
        smoke: "semantic_bridge_v1_4_node_controlled",
        error_count: 1,
        errors: [error.message]
    }, null, 2));
    process.exitCode = 1;
});
