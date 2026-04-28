const http = require("http");

const API_URL = process.env.HOMELAB_CHAT_API_URL || "http://localhost:5000/api/chat";
const RETRIEVAL_STRATEGY = "expanded_query_topic_aware_rerank";

const CASES = [
    {
        id: "general_cbc",
        message: "tôi muốn xét nghiệm tổng quát, có cần xem công thức máu CBC không"
    },
    {
        id: "glucose_hba1c",
        message: "HbA1c với đường huyết khác nhau thế nào"
    },
    {
        id: "lipid",
        message: "mỡ máu cholesterol triglyceride là gì"
    },
    {
        id: "liver",
        message: "men gan ALT AST để làm gì"
    },
    {
        id: "kidney",
        message: "kiểm tra thận creatinine eGFR là xét nghiệm gì"
    },
    {
        id: "urine_albumin",
        message: "xét nghiệm nước tiểu albumin niệu kiểm tra được gì"
    },
    {
        id: "thyroid",
        message: "xét nghiệm tuyến giáp TSH T4 là gì"
    },
    {
        id: "fasting",
        message: "có cần nhịn ăn trước khi xét nghiệm máu không"
    },
    {
        id: "cbc_result_boundary",
        message: "tôi có kết quả CBC rồi đọc giúp tôi bị bệnh gì"
    }
];

const GATE_CASES = [
    {
        id: "urgent_override",
        message: "đau ngực khó thở vã mồ hôi, tôi có nên đặt xét nghiệm không",
        expectedFlows: ["health_rag", "emergency"],
        expectNoRecommendedPackage: true,
        expectUrgentIntent: true
    },
    {
        id: "booking_preserved",
        message: "tôi muốn đặt lịch xét nghiệm tổng quát sáng mai",
        expectedFlows: ["booking"],
        expectNoSemanticV14Required: true
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

function hasValidSource(topChunks, citations) {
    const chunkOk = (topChunks || []).some(
        (chunk) =>
            (chunk.sourceUrl || chunk.finalUrl) &&
            chunk.provenance !== undefined &&
            chunk.topic &&
            chunk.domain
    );
    const citationOk = (citations || []).some(
        (citation) => citation.sourceUrl || citation.finalUrl
    );

    return chunkOk || citationOk;
}

function hasReviewLeak(value) {
    const text = JSON.stringify(value || {}).toLowerCase();
    return (
        text.includes("candidate_needs_review") ||
        text.includes("needs_revision") ||
        text.includes("rejected") ||
        text.includes("pending")
    );
}

function hasRecommendedPackage(meta) {
    const recommendation = meta.recommendation || {};
    return Boolean(
        recommendation.recommendedPackage ||
            recommendation.selectedPackage ||
            recommendation.packageId ||
            meta.recommendedPackage
    );
}

function checkCase(testCase, payload) {
    const failures = [];
    const data = payload.data || {};
    const meta = data.meta || {};
    const topChunks = Array.isArray(meta.topChunks) ? meta.topChunks : [];
    const citations = Array.isArray(meta.citations) ? meta.citations : [];

    if (payload.success !== true) {
        failures.push("API success is not true");
    }
    if (data.flow !== "health_rag") {
        failures.push(`expected flow=health_rag, got ${data.flow}`);
    }
    if (!String(meta.selectedRetrievalMode || "").includes("semantic")) {
        failures.push(
            `expected semantic selectedRetrievalMode, got ${meta.selectedRetrievalMode}`
        );
    }
    if (meta.retrieverVersion !== "v1_4") {
        failures.push(`expected retrieverVersion=v1_4, got ${meta.retrieverVersion}`);
    }
    if (meta.retrievalStrategy !== RETRIEVAL_STRATEGY) {
        failures.push(
            `expected retrievalStrategy=${RETRIEVAL_STRATEGY}, got ${meta.retrievalStrategy}`
        );
    }
    if (meta.candidateTopK !== 20) {
        failures.push(`expected candidateTopK=20, got ${meta.candidateTopK}`);
    }
    if (meta.finalTopK !== 5) {
        failures.push(`expected finalTopK=5, got ${meta.finalTopK}`);
    }
    if (meta.runtimePromoted !== false) {
        failures.push("runtimePromoted is not false");
    }
    if (meta.runtimeDefaultChanged !== false) {
        failures.push("runtimeDefaultChanged is not false");
    }
    if (meta.semanticBridgeStatus !== "ok") {
        failures.push(`expected semanticBridgeStatus=ok, got ${meta.semanticBridgeStatus}`);
    }
    if (meta.fallbackUsed !== false) {
        failures.push(`expected no fallback for normal lab query, got fallbackUsed=${meta.fallbackUsed}`);
    }
    if (meta.fallbackReason) {
        failures.push(`expected no fallbackReason for normal lab query, got ${meta.fallbackReason}`);
    }
    if (!hasValidSource(topChunks, citations)) {
        failures.push("missing valid source/provenance metadata");
    }
    if (hasRecommendedPackage(meta)) {
        failures.push("unexpected live recommended package metadata");
    }
    if (hasReviewLeak(meta)) {
        failures.push("revise/rejected/pending review marker surfaced");
    }

    return failures;
}

function checkGateCase(testCase, payload) {
    const failures = [];
    const data = payload.data || {};
    const meta = data.meta || {};

    if (payload.success !== true) {
        failures.push("API success is not true");
    }
    if (!testCase.expectedFlows.includes(data.flow)) {
        failures.push(
            `expected flow in ${testCase.expectedFlows.join(",")}, got ${data.flow}`
        );
    }
    if (testCase.expectNoRecommendedPackage && hasRecommendedPackage(meta)) {
        failures.push("unexpected live recommended package metadata");
    }
    if (
        testCase.expectUrgentIntent &&
        meta.intentGroup &&
        meta.intentGroup !== "urgent_health"
    ) {
        failures.push(`expected urgent_health intentGroup, got ${meta.intentGroup}`);
    }
    if (
        testCase.expectNoSemanticV14Required &&
        meta.selectedRetrievalMode &&
        String(meta.selectedRetrievalMode).includes("semantic") &&
        meta.retrieverVersion === "v1_4"
    ) {
        failures.push("booking flow unexpectedly used v1_4 semantic retrieval");
    }
    if (hasReviewLeak(meta)) {
        failures.push("revise/rejected/pending review marker surfaced");
    }

    return failures;
}

async function main() {
    const rows = [];
    const gateRows = [];

    for (const testCase of CASES) {
        try {
            const payload = await postJson(API_URL, {
                message: testCase.message,
                sessionId: `smoke_4b2b_${testCase.id}_${Date.now()}`
            });
            const failures = checkCase(testCase, payload);
            const data = payload.data || {};
            const meta = data.meta || {};
            const topChunks = Array.isArray(meta.topChunks) ? meta.topChunks : [];

            rows.push({
                id: testCase.id,
                message: testCase.message,
                pass: failures.length === 0,
                failures,
                flow: data.flow || null,
                selectedRetrievalMode: meta.selectedRetrievalMode || null,
                retrieverVersion: meta.retrieverVersion || null,
                retrievalStrategy: meta.retrievalStrategy || null,
                semanticBridgeStatus: meta.semanticBridgeStatus || null,
                candidateTopK: meta.candidateTopK || null,
                finalTopK: meta.finalTopK || null,
                queryExpansionApplied: meta.queryExpansionApplied,
                detectedAliasGroups: meta.detectedAliasGroups || [],
                topTopic: topChunks[0]?.topic || null,
                topDomain: topChunks[0]?.domain || null,
                fallbackUsed: meta.fallbackUsed,
                fallbackReason: meta.fallbackReason || null
            });
        } catch (error) {
            rows.push({
                id: testCase.id,
                message: testCase.message,
                pass: false,
                failures: [error.message],
                flow: null,
                selectedRetrievalMode: null,
                retrieverVersion: null,
                retrievalStrategy: null,
                semanticBridgeStatus: null,
                candidateTopK: null,
                finalTopK: null,
                queryExpansionApplied: null,
                detectedAliasGroups: [],
                topTopic: null,
                topDomain: null,
                fallbackUsed: null,
                fallbackReason: null
            });
        }
    }

    for (const testCase of GATE_CASES) {
        try {
            const payload = await postJson(API_URL, {
                message: testCase.message,
                sessionId: `smoke_4b2b_gate_${testCase.id}_${Date.now()}`
            });
            const failures = checkGateCase(testCase, payload);
            const data = payload.data || {};
            const meta = data.meta || {};

            gateRows.push({
                id: testCase.id,
                message: testCase.message,
                pass: failures.length === 0,
                failures,
                flow: data.flow || null,
                intentGroup: meta.intentGroup || null,
                selectedRetrievalMode: meta.selectedRetrievalMode || null,
                retrieverVersion: meta.retrieverVersion || null,
                recommendedPackagePresent: hasRecommendedPackage(meta)
            });
        } catch (error) {
            gateRows.push({
                id: testCase.id,
                message: testCase.message,
                pass: false,
                failures: [error.message],
                flow: null,
                intentGroup: null,
                selectedRetrievalMode: null,
                retrieverVersion: null,
                recommendedPackagePresent: null
            });
        }
    }

    const passed = rows.filter((row) => row.pass).length;
    const gatePassed = gateRows.filter((row) => row.pass).length;
    const failed = rows.length - passed + gateRows.length - gatePassed;
    const summary = {
        smoke: "api_retriever_v1_4_controlled_4b2b",
        apiUrl: API_URL,
        total: rows.length,
        passed,
        gate_total: gateRows.length,
        gate_passed: gatePassed,
        failed,
        expectedEnv: {
            HOMELAB_SEMANTIC_RETRIEVAL_ENABLED: "true",
            HOMELAB_SEMANTIC_BRIDGE_MODE: "server",
            HOMELAB_SEMANTIC_BRIDGE_URL: "http://127.0.0.1:8766",
            HOMELAB_SEMANTIC_RETRIEVER_VERSION: "v1_4",
            HOMELAB_SEMANTIC_RETRIEVAL_STRATEGY: RETRIEVAL_STRATEGY
        },
        rows,
        gateRows
    };

    console.log(JSON.stringify(summary, null, 2));
    process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((error) => {
    console.error(
        JSON.stringify(
            {
                smoke: "api_retriever_v1_4_controlled_4b2b",
                error: error.message
            },
            null,
            2
        )
    );
    process.exitCode = 1;
});
