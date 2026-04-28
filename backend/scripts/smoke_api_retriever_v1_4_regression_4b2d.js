const http = require("http");

const API_URL = process.env.HOMELAB_CHAT_API_URL || "http://localhost:5000/api/chat";
const RETRIEVAL_STRATEGY = "expanded_query_topic_aware_rerank";

const CASES = [
    {
        id: "health_general_tests",
        group: "health_test_advice_controlled_v1_4",
        message: "mình muốn kiểm tra sức khỏe tổng quát thì nên xét nghiệm gì",
        expectFlow: "health_rag",
        expectSemanticV14: true
    },
    {
        id: "health_hba1c_glucose",
        group: "health_test_advice_controlled_v1_4",
        message: "HbA1c với đường huyết khác nhau thế nào",
        expectFlow: "health_rag",
        expectSemanticV14: true
    },
    {
        id: "health_liver_alt_ast",
        group: "health_test_advice_controlled_v1_4",
        message: "men gan ALT AST để làm gì",
        expectFlow: "health_rag",
        expectSemanticV14: true
    },
    {
        id: "health_thyroid_tsh_t4",
        group: "health_test_advice_controlled_v1_4",
        message: "xét nghiệm tuyến giáp TSH T4 là gì",
        expectFlow: "health_rag",
        expectSemanticV14: true
    },
    {
        id: "urgent_chest_breath_sweat",
        group: "urgent_safety",
        message: "tôi đau ngực khó thở vã mồ hôi",
        disallowFlow: "booking",
        expectIntentGroup: "urgent_health",
        expectNoRecommendation: true
    },
    {
        id: "urgent_mixed_test_request",
        group: "urgent_safety",
        message: "tôi muốn xét nghiệm tổng quát nhưng đang đau ngực khó thở",
        disallowFlow: "booking",
        expectIntentGroup: "urgent_health",
        expectNoRecommendation: true
    },
    {
        id: "booking_preserved",
        group: "operational_preserved",
        message: "tôi muốn đặt lịch lấy mẫu tại nhà",
        expectFlow: "booking",
        expectNoSemanticV14: true
    },
    {
        id: "reschedule_preserved",
        group: "operational_preserved",
        message: "tôi muốn đổi lịch hẹn",
        expectFlow: "reschedule",
        expectNoSemanticV14: true
    },
    {
        id: "cancel_preserved",
        group: "operational_preserved",
        message: "tôi muốn hủy lịch",
        expectFlow: "cancel",
        expectNoSemanticV14: true
    },
    {
        id: "recommendation_missing_context",
        group: "recommendation_gates",
        message: "tôi mệt, nên xét nghiệm gì",
        expectFlow: "health_rag",
        expectNoRecommendation: true,
        expectSemanticV14: true
    },
    {
        id: "recommendation_result_boundary",
        group: "recommendation_gates",
        message: "HbA1c cao vậy có chắc bị tiểu đường không",
        expectFlow: "health_rag",
        expectNoRecommendation: true,
        expectSemanticV14: true
    },
    {
        id: "recommendation_urgent_gate",
        group: "recommendation_gates",
        message: "tôi đau ngực khó thở, có gói xét nghiệm nào không",
        disallowFlow: "booking",
        expectIntentGroup: "urgent_health",
        expectNoRecommendation: true
    },
    {
        id: "edge_hba1c_what",
        group: "edge_routing_regression",
        message: "HbA1c là gì?",
        expectFlow: "health_rag",
        expectIntentGroup: "test_advice",
        expectSemanticV14: true
    },
    {
        id: "edge_hba1c_blood_draw",
        group: "edge_routing_regression",
        message: "xét nghiệm HbA1c có cần lấy máu không?",
        expectFlow: "health_rag",
        expectIntentGroup: "test_advice",
        expectSemanticV14: true
    }
];

function postJson(url, body, timeoutMs = 30000) {
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

function hasRecommendation(meta) {
    const recommendation = meta.recommendation || {};
    return Boolean(
        recommendation.recommendedPackage ||
            recommendation.selectedPackage ||
            recommendation.packageId ||
            recommendation.decisionType === "recommend_package" ||
            meta.recommendedPackage
    );
}

function checkSemanticV14(meta) {
    const failures = [];

    if (!String(meta.selectedRetrievalMode || "").includes("semantic")) {
        failures.push(`selectedRetrievalMode is not semantic: ${meta.selectedRetrievalMode}`);
    }
    if (meta.retrieverVersion !== "v1_4") {
        failures.push(`retrieverVersion is not v1_4: ${meta.retrieverVersion}`);
    }
    if (meta.retrievalStrategy !== RETRIEVAL_STRATEGY) {
        failures.push(`retrievalStrategy mismatch: ${meta.retrievalStrategy}`);
    }
    if (meta.semanticBridgeStatus !== "ok") {
        failures.push(`semanticBridgeStatus is not ok: ${meta.semanticBridgeStatus}`);
    }

    return failures;
}

function checkCase(testCase, payload) {
    const failures = [];
    const data = payload.data || {};
    const meta = data.meta || {};

    if (payload.success !== true) {
        failures.push("API success is not true");
    }
    if (testCase.expectFlow && data.flow !== testCase.expectFlow) {
        failures.push(`expected flow=${testCase.expectFlow}, got ${data.flow}`);
    }
    if (testCase.disallowFlow && data.flow === testCase.disallowFlow) {
        failures.push(`disallowed flow=${testCase.disallowFlow}`);
    }
    if (testCase.expectIntentGroup && meta.intentGroup !== testCase.expectIntentGroup) {
        failures.push(
            `expected intentGroup=${testCase.expectIntentGroup}, got ${meta.intentGroup}`
        );
    }
    if (testCase.expectSemanticV14) {
        failures.push(...checkSemanticV14(meta));
    }
    if (
        testCase.expectNoSemanticV14 &&
        meta.retrieverVersion === "v1_4" &&
        String(meta.selectedRetrievalMode || "").includes("semantic")
    ) {
        failures.push("operational flow was hijacked by semantic v1_4 retrieval");
    }
    if (testCase.expectNoRecommendation && hasRecommendation(meta)) {
        failures.push("unexpected package recommendation metadata");
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
                sessionId: `smoke_4b2d_${testCase.id}_${Date.now()}`
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
                primaryMode: meta.primaryMode || null,
                urgencyLevel: meta.urgencyLevel || null,
                fallbackUsed: meta.fallbackUsed,
                fallbackReason: meta.fallbackReason || null,
                recommendationDecisionType:
                    meta.recommendation?.decisionType || null,
                recommendedPackagePresent: hasRecommendation(meta)
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
                primaryMode: null,
                urgencyLevel: null,
                fallbackUsed: null,
                fallbackReason: null,
                recommendationDecisionType: null,
                recommendedPackagePresent: null
            });
        }
    }

    const passed = rows.filter((row) => row.pass).length;
    const failed = rows.length - passed;
    const summary = {
        smoke: "api_retriever_v1_4_regression_4b2d",
        apiUrl: API_URL,
        total: rows.length,
        passed,
        failed,
        groups: summarizeGroups(rows),
        expectedEnv: {
            HOMELAB_SEMANTIC_RETRIEVAL_ENABLED: "true",
            HOMELAB_SEMANTIC_BRIDGE_MODE: "server",
            HOMELAB_SEMANTIC_BRIDGE_URL: "http://127.0.0.1:8766",
            HOMELAB_SEMANTIC_RETRIEVER_VERSION: "v1_4",
            HOMELAB_SEMANTIC_RETRIEVAL_STRATEGY: RETRIEVAL_STRATEGY
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
                smoke: "api_retriever_v1_4_regression_4b2d",
                error: error.message
            },
            null,
            2
        )
    );
    process.exitCode = 1;
});
