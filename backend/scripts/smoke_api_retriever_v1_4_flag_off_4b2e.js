const http = require("http");

const API_URL = process.env.HOMELAB_CHAT_API_URL || "http://localhost:5000/api/chat";
const V1_4_STRATEGY = "expanded_query_topic_aware_rerank";

const CASES = [
    {
        id: "lab_general",
        group: "lab_test",
        message: "mình muốn kiểm tra sức khỏe tổng quát thì nên xét nghiệm gì",
        expectedFlows: ["health_rag", "fallback"],
        expectedIntentGroups: ["test_advice", "general_health"]
    },
    {
        id: "lab_hba1c",
        group: "lab_test",
        message: "HbA1c là gì?",
        expectedFlows: ["health_rag", "fallback"],
        expectedIntentGroups: ["test_advice", "general_health"]
    },
    {
        id: "lab_liver",
        group: "lab_test",
        message: "men gan ALT AST để làm gì",
        expectedFlows: ["health_rag", "fallback"],
        expectedIntentGroups: ["test_advice", "general_health"]
    },
    {
        id: "urgent_chest_breath",
        group: "urgent",
        message: "tôi đau ngực khó thở vã mồ hôi",
        disallowFlow: "booking",
        expectedIntentGroups: ["urgent_health"]
    },
    {
        id: "urgent_mixed_booking",
        group: "urgent",
        message: "tôi muốn xét nghiệm tổng quát nhưng đang đau ngực khó thở",
        disallowFlow: "booking",
        expectedIntentGroups: ["urgent_health"]
    },
    {
        id: "booking",
        group: "booking",
        message: "tôi muốn đặt lịch lấy mẫu tại nhà",
        expectedFlows: ["booking"],
        expectedIntentGroups: ["booking"]
    },
    {
        id: "reschedule",
        group: "booking",
        message: "tôi muốn đổi lịch hẹn",
        expectedFlows: ["reschedule"]
    },
    {
        id: "cancel",
        group: "booking",
        message: "tôi muốn hủy lịch",
        expectedFlows: ["cancel"]
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

function hasV14ArtifactDir(meta) {
    const artifactDir = String(meta.artifactDir || "");
    const debugBridgeArtifactDir = String(
        meta.debug?.semanticBridge?.artifactDir || ""
    );

    return (
        artifactDir.includes("retriever_v1_4") ||
        debugBridgeArtifactDir.includes("retriever_v1_4")
    );
}

function checkNoV14Meta(meta, failures) {
    if (meta.retrieverVersion === "v1_4") {
        failures.push("meta.retrieverVersion unexpectedly v1_4");
    }
    if (meta.retrievalStrategy === V1_4_STRATEGY) {
        failures.push("meta.retrievalStrategy unexpectedly v1_4 strategy");
    }
    if (hasV14ArtifactDir(meta)) {
        failures.push("meta artifactDir unexpectedly points to retriever_v1_4");
    }
    if (meta.queryExpansionApplied === true) {
        failures.push("meta.queryExpansionApplied unexpectedly true");
    }
    if (meta.debug?.semanticBridge?.retrieverVersion === "v1_4") {
        failures.push("debug.semanticBridge unexpectedly used v1_4");
    }
    if (meta.debug?.semanticBridge?.retrievalStrategy === V1_4_STRATEGY) {
        failures.push("debug.semanticBridge unexpectedly used v1_4 strategy");
    }
}

function checkCase(testCase, payload) {
    const failures = [];
    const data = payload.data || {};
    const meta = data.meta || {};

    if (payload.success !== true) {
        failures.push("API success is not true");
    }
    if (
        testCase.expectedFlows &&
        !testCase.expectedFlows.includes(data.flow)
    ) {
        failures.push(
            `expected flow in ${testCase.expectedFlows.join(",")}, got ${data.flow}`
        );
    }
    if (testCase.disallowFlow && data.flow === testCase.disallowFlow) {
        failures.push(`disallowed flow=${testCase.disallowFlow}`);
    }
    if (
        testCase.expectedIntentGroups &&
        meta.intentGroup &&
        !testCase.expectedIntentGroups.includes(meta.intentGroup)
    ) {
        failures.push(
            `expected intentGroup in ${testCase.expectedIntentGroups.join(",")}, got ${meta.intentGroup}`
        );
    }
    checkNoV14Meta(meta, failures);

    if (
        meta.semanticBridgeStatus === "disabled" &&
        meta.selectedRetrievalMode !== "lexical_fallback"
    ) {
        failures.push(
            `semantic disabled should use lexical_fallback, got ${meta.selectedRetrievalMode}`
        );
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
                sessionId: `smoke_4b2e_${testCase.id}_${Date.now()}`
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
                intentGroup: meta.intentGroup || null,
                selectedRetrievalMode: meta.selectedRetrievalMode || null,
                retrieverVersion: meta.retrieverVersion || null,
                retrievalStrategy: meta.retrievalStrategy || null,
                semanticBridgeStatus: meta.semanticBridgeStatus || null,
                artifactDir: meta.artifactDir || null,
                queryExpansionApplied: meta.queryExpansionApplied,
                fallbackUsed: meta.fallbackUsed,
                fallbackReason: meta.fallbackReason || null
            });
        } catch (error) {
            rows.push({
                id: testCase.id,
                group: testCase.group,
                message: testCase.message,
                pass: false,
                failures: [error.message],
                flow: null,
                intentGroup: null,
                selectedRetrievalMode: null,
                retrieverVersion: null,
                retrievalStrategy: null,
                semanticBridgeStatus: null,
                artifactDir: null,
                queryExpansionApplied: null,
                fallbackUsed: null,
                fallbackReason: null
            });
        }
    }

    const passed = rows.filter((row) => row.pass).length;
    const failed = rows.length - passed;
    const summary = {
        smoke: "api_retriever_v1_4_flag_off_4b2e",
        apiUrl: API_URL,
        total: rows.length,
        passed,
        failed,
        groups: summarizeGroups(rows),
        expected: {
            noRetrieverVersionV14: true,
            noExpandedQueryTopicRerankStrategy: true,
            noRetrieverV14ArtifactDir: true,
            noV14QueryExpansionApplied: true
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
                smoke: "api_retriever_v1_4_flag_off_4b2e",
                error: error.message
            },
            null,
            2
        )
    );
    process.exitCode = 1;
});
