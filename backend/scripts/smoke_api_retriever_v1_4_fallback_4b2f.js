const http = require("http");

const API_URL = process.env.HOMELAB_CHAT_API_URL || "http://localhost:5000/api/chat";

const CASES = [
    {
        id: "hba1c_what",
        group: "health_rag_fallback",
        message: "HbA1c là gì?",
        expectedFlow: "health_rag"
    },
    {
        id: "liver_alt_ast",
        group: "health_rag_fallback",
        message: "men gan ALT AST để làm gì",
        expectedFlow: "health_rag"
    },
    {
        id: "general_test_advice",
        group: "health_rag_fallback",
        message: "tôi muốn xét nghiệm tổng quát",
        expectedFlow: "health_rag"
    },
    {
        id: "urgent_chest_breath_sweat",
        group: "urgent_fallback",
        message: "tôi đau ngực khó thở vã mồ hôi",
        expectedFlow: "health_rag",
        expectedIntentGroup: "urgent_health"
    },
    {
        id: "urgent_mixed_test_request",
        group: "urgent_fallback",
        message: "tôi muốn xét nghiệm tổng quát nhưng đang đau ngực khó thở",
        expectedFlow: "health_rag",
        expectedIntentGroup: "urgent_health"
    },
    {
        id: "booking_preserved",
        group: "booking_preserved",
        message: "tôi muốn đặt lịch lấy mẫu tại nhà",
        expectedFlow: "booking",
        skipFallbackAssert: true
    }
];

function postJson(url, body, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
        const target = new URL(url);
        const payload = JSON.stringify(body);
        const request = http.request(
            target,
            {
                method: "POST",
                timeout: timeoutMs,
                headers: {
                    "Content-Type": "application/json",
                    "Content-Length": Buffer.byteLength(payload)
                }
            },
            (response) => {
                const chunks = [];
                response.setEncoding("utf8");
                response.on("data", (chunk) => chunks.push(chunk));
                response.on("end", () => {
                    const raw = chunks.join("");
                    let parsed = {};

                    try {
                        parsed = raw ? JSON.parse(raw) : {};
                    } catch (error) {
                        reject(new Error(`failed to parse JSON: ${error.message}`));
                        return;
                    }

                    if (response.statusCode >= 400) {
                        reject(
                            new Error(
                                parsed.message ||
                                    parsed.error ||
                                    `HTTP ${response.statusCode}`
                            )
                        );
                        return;
                    }

                    resolve(parsed);
                });
            }
        );

        request.on("timeout", () => {
            request.destroy(new Error("request timed out"));
        });
        request.on("error", reject);
        request.write(payload);
        request.end();
    });
}

function semanticBridgeStatusLooksLikeFallback(meta) {
    const status = String(meta.semanticBridgeStatus || "").toLowerCase();
    const debugStatus = String(
        meta.debug?.semanticRetrieval?.semanticRetrievalStatus ||
            meta.debug?.semanticRetrieval?.status ||
            ""
    ).toLowerCase();

    return [status, debugStatus].some((value) =>
        ["disabled", "error", "timeout", "fallback", "missing", "empty", "unhydrated"].some(
            (token) => value.includes(token)
        )
    );
}

function hasFallbackMetadata(meta) {
    return (
        meta.fallbackUsed === true ||
        Boolean(meta.fallbackReason) ||
        Boolean(meta.debug?.semanticRetrieval?.fallbackReason) ||
        meta.debug?.semanticBridge?.fallbackUsed === true ||
        Boolean(meta.debug?.semanticBridge?.fallbackReason)
    );
}

function checkCase(testCase, payload) {
    const failures = [];
    const data = payload.data || {};
    const meta = data.meta || {};

    if (payload.success !== true) {
        failures.push("API success is not true");
    }
    if (data.flow !== testCase.expectedFlow) {
        failures.push(`expected flow=${testCase.expectedFlow}, got ${data.flow}`);
    }
    if (
        testCase.expectedIntentGroup &&
        meta.intentGroup !== testCase.expectedIntentGroup
    ) {
        failures.push(
            `expected intentGroup=${testCase.expectedIntentGroup}, got ${meta.intentGroup}`
        );
    }

    if (!testCase.skipFallbackAssert && data.flow === "health_rag") {
        if (meta.selectedRetrievalMode === "semantic_faiss") {
            failures.push("selectedRetrievalMode unexpectedly semantic_faiss");
        }
        if (!hasFallbackMetadata(meta)) {
            failures.push("fallbackUsed/fallbackReason metadata missing");
        }
        if (!semanticBridgeStatusLooksLikeFallback(meta)) {
            failures.push(
                `semanticBridgeStatus does not look like fallback/error: ${meta.semanticBridgeStatus}`
            );
        }
    }

    return failures;
}

function summarizeGroups(rows) {
    return rows.reduce((acc, row) => {
        if (!acc[row.group]) {
            acc[row.group] = {
                total: 0,
                passed: 0,
                failed: 0
            };
        }
        acc[row.group].total += 1;
        if (row.pass) {
            acc[row.group].passed += 1;
        } else {
            acc[row.group].failed += 1;
        }
        return acc;
    }, {});
}

async function main() {
    const rows = [];

    for (const testCase of CASES) {
        try {
            const payload = await postJson(API_URL, {
                message: testCase.message,
                sessionId: `smoke_4b2f_${testCase.id}_${Date.now()}`
            });
            const failures = checkCase(testCase, payload);
            const data = payload.data || {};
            const meta = data.meta || {};

            rows.push({
                id: testCase.id,
                group: testCase.group,
                message: testCase.message,
                pass: failures.length === 0,
                failures,
                flow: data.flow || null,
                action: data.action || null,
                intentGroup: meta.intentGroup || null,
                selectedRetrievalMode: meta.selectedRetrievalMode || null,
                retrieverVersion: meta.retrieverVersion || null,
                retrievalStrategy: meta.retrievalStrategy || null,
                semanticBridgeStatus: meta.semanticBridgeStatus || null,
                fallbackUsed: meta.fallbackUsed,
                fallbackReason:
                    meta.fallbackReason ||
                    meta.debug?.semanticRetrieval?.fallbackReason ||
                    meta.debug?.semanticBridge?.fallbackReason ||
                    null
            });
        } catch (error) {
            rows.push({
                id: testCase.id,
                group: testCase.group,
                message: testCase.message,
                pass: false,
                failures: [error.message],
                flow: null,
                action: null,
                intentGroup: null,
                selectedRetrievalMode: null,
                retrieverVersion: null,
                retrievalStrategy: null,
                semanticBridgeStatus: null,
                fallbackUsed: null,
                fallbackReason: null
            });
        }
    }

    const passed = rows.filter((row) => row.pass).length;
    const failed = rows.length - passed;
    const summary = {
        smoke: "api_retriever_v1_4_fallback_4b2f",
        apiUrl: API_URL,
        total: rows.length,
        passed,
        failed,
        groups: summarizeGroups(rows),
        expectedEnv: {
            HOMELAB_SEMANTIC_RETRIEVAL_ENABLED: "true",
            HOMELAB_SEMANTIC_BRIDGE_MODE: "server",
            HOMELAB_SEMANTIC_BRIDGE_URL: "http://127.0.0.1:9876",
            HOMELAB_SEMANTIC_RETRIEVER_VERSION: "v1_4",
            HOMELAB_SEMANTIC_RETRIEVAL_STRATEGY: "expanded_query_topic_aware_rerank",
            HOMELAB_SEMANTIC_BRIDGE_TIMEOUT_MS: "1000"
        },
        rows
    };

    console.log(JSON.stringify(summary, null, 2));
    process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((error) => {
    console.error(
        JSON.stringify(
            {
                smoke: "api_retriever_v1_4_fallback_4b2f",
                error: error.message
            },
            null,
            2
        )
    );
    process.exitCode = 1;
});
