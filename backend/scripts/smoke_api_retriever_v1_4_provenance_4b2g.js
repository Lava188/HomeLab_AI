const http = require("http");

const API_URL = process.env.HOMELAB_CHAT_API_URL || "http://localhost:5000/api/chat";
const RETRIEVAL_STRATEGY = "expanded_query_topic_aware_rerank";
const ALLOWED_DOMAINS = new Set(["medlineplus.gov", "nhs.uk", "niddk.nih.gov"]);
const REVIEW_STATUS_DENYLIST = [
    "candidate_needs_review",
    "needs_human_review",
    "needs_revision",
    "revise",
    "rejected",
    "pending"
];

const CASES = [
    {
        id: "cbc",
        group: "health_rag_provenance",
        message: "CBC công thức máu là gì, có giúp biết thiếu máu không"
    },
    {
        id: "glucose_hba1c",
        group: "health_rag_provenance",
        message: "HbA1c với đường huyết khác nhau thế nào"
    },
    {
        id: "liver_alt_ast",
        group: "health_rag_provenance",
        message: "men gan ALT AST để làm gì"
    },
    {
        id: "kidney_creatinine_egfr",
        group: "health_rag_provenance",
        message: "creatinine eGFR kiểm tra chức năng thận như thế nào"
    },
    {
        id: "lipid_cholesterol",
        group: "health_rag_provenance",
        message: "cholesterol triglyceride mỡ máu là gì"
    },
    {
        id: "thyroid_tsh_t4",
        group: "health_rag_provenance",
        message: "xét nghiệm tuyến giáp TSH T4 là gì"
    },
    {
        id: "urine_albumin",
        group: "health_rag_provenance",
        message: "tổng phân tích nước tiểu albumin niệu kiểm tra được gì"
    },
    {
        id: "fasting",
        group: "health_rag_provenance",
        message: "trước khi xét nghiệm máu có cần nhịn ăn không"
    },
    {
        id: "blood_result_boundary",
        group: "health_rag_provenance",
        message: "tôi có kết quả xét nghiệm máu rồi, giải thích giúp nhưng đừng chẩn đoán"
    },
    {
        id: "urgent_safety",
        group: "safety_gate",
        message: "tôi đau ngực khó thở vã mồ hôi",
        expectedIntentGroup: "urgent_health",
        disallowRecommendedPackage: true
    },
    {
        id: "booking_preserved",
        group: "booking_gate",
        message: "tôi muốn đặt lịch lấy mẫu tại nhà",
        expectedFlow: "booking",
        skipHealthAssertions: true
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

function domainFromUrl(value) {
    try {
        return new URL(value).hostname.replace(/^www\./, "");
    } catch {
        return null;
    }
}

function collectSourceEntries(meta) {
    const entries = [];

    for (const chunk of Array.isArray(meta.topChunks) ? meta.topChunks : []) {
        entries.push({
            kind: "topChunk",
            id: chunk.chunkId || chunk.kbId || chunk.sourceId || null,
            domain: chunk.domain || domainFromUrl(chunk.sourceUrl || chunk.finalUrl),
            sourceUrl: chunk.sourceUrl || chunk.finalUrl || null,
            provenance: chunk.provenance
        });
    }

    for (const citation of Array.isArray(meta.citations) ? meta.citations : []) {
        entries.push({
            kind: "citation",
            id: citation.chunkId || citation.sourceId || null,
            domain: citation.domain || domainFromUrl(citation.sourceUrl || citation.finalUrl),
            sourceUrl: citation.sourceUrl || citation.finalUrl || null,
            provenance: citation.provenance
        });
    }

    const bridgeChunks = meta.debug?.semanticBridge?.topChunks;
    for (const chunk of Array.isArray(bridgeChunks) ? bridgeChunks : []) {
        entries.push({
            kind: "semanticBridgeTopChunk",
            id: chunk.chunk_id || chunk.kb_id || chunk.source_id || null,
            domain: chunk.domain || domainFromUrl(chunk.source_url || chunk.final_url),
            sourceUrl: chunk.source_url || chunk.final_url || null,
            provenance: chunk.provenance
        });
    }

    return entries;
}

function hasDeniedReviewMarker(value) {
    const text = JSON.stringify(value || {}).toLowerCase();
    return REVIEW_STATUS_DENYLIST.some((marker) => text.includes(marker));
}

function hasRecommendedPackage(meta) {
    const recommendation = meta.recommendation || {};
    return Boolean(
        recommendation.recommendedPackage ||
            recommendation.selectedPackage ||
            recommendation.packageId ||
            recommendation.decisionType === "recommend_package" ||
            meta.recommendedPackage
    );
}

function exposesRawPackageId(reply) {
    const text = String(reply || "");
    return /\b(pkg|package|goi|GÓI|GOI)[_-]?[A-Z0-9]{2,}\b/.test(text);
}

function artifactLooksV14(meta) {
    const artifactDir = String(
        meta.artifactDir || meta.debug?.semanticBridge?.artifactDir || ""
    ).replace(/\\/g, "/");
    return artifactDir.includes("retriever_v1_4");
}

function checkHealthCase(testCase, payload) {
    const failures = [];
    const data = payload.data || {};
    const meta = data.meta || {};
    const sources = collectSourceEntries(meta);

    if (payload.success !== true) {
        failures.push("API success is not true");
    }
    if (data.flow !== "health_rag") {
        failures.push(`expected flow=health_rag, got ${data.flow}`);
    }
    if (meta.selectedRetrievalMode !== "semantic_faiss") {
        failures.push(
            `expected selectedRetrievalMode=semantic_faiss, got ${meta.selectedRetrievalMode}`
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
    if (meta.semanticBridgeStatus !== "ok") {
        failures.push(`expected semanticBridgeStatus=ok, got ${meta.semanticBridgeStatus}`);
    }
    if (!artifactLooksV14(meta)) {
        failures.push("artifactDir does not point to retriever_v1_4");
    }
    if (meta.runtimePromoted === true || meta.debug?.semanticBridge?.runtimePromoted === true) {
        failures.push("runtimePromoted unexpectedly true");
    }
    if (sources.length === 0) {
        failures.push("no source/provenance entries found");
    }

    const entriesWithDomain = sources.filter((source) => source.domain);
    if (!entriesWithDomain.length) {
        failures.push("no source domains found");
    }
    for (const source of entriesWithDomain) {
        if (!ALLOWED_DOMAINS.has(source.domain)) {
            failures.push(
                `${source.kind}:${source.id || "unknown"} domain not allowlisted: ${source.domain}`
            );
        }
    }

    const entriesWithProvenance = sources.filter(
        (source) => source.provenance !== undefined && source.provenance !== null
    );
    if (!entriesWithProvenance.length) {
        failures.push("no provenance metadata found in returned sources");
    }
    if (hasDeniedReviewMarker(meta)) {
        failures.push("denied review_status marker surfaced in API metadata");
    }
    if (exposesRawPackageId(data.reply)) {
        failures.push("reply appears to expose raw package id");
    }
    if (
        meta.queryExpansionApplied !== true &&
        meta.queryExpansionApplied !== false &&
        meta.queryExpansionApplied !== undefined
    ) {
        failures.push(`queryExpansionApplied has invalid value: ${meta.queryExpansionApplied}`);
    }

    if (testCase.expectedIntentGroup && meta.intentGroup !== testCase.expectedIntentGroup) {
        failures.push(
            `expected intentGroup=${testCase.expectedIntentGroup}, got ${meta.intentGroup}`
        );
    }
    if (testCase.disallowRecommendedPackage && hasRecommendedPackage(meta)) {
        failures.push("unexpected recommendation/package metadata");
    }

    return failures;
}

function checkBookingCase(payload) {
    const failures = [];
    const data = payload.data || {};
    const meta = data.meta || {};

    if (payload.success !== true) {
        failures.push("API success is not true");
    }
    if (data.flow !== "booking") {
        failures.push(`expected flow=booking, got ${data.flow}`);
    }
    if (
        meta.retrieverVersion === "v1_4" ||
        String(meta.selectedRetrievalMode || "").includes("semantic")
    ) {
        failures.push("booking flow was hijacked by semantic retrieval");
    }
    if (hasRecommendedPackage(meta)) {
        failures.push("unexpected recommendation/package metadata");
    }
    if (hasDeniedReviewMarker(meta)) {
        failures.push("denied review_status marker surfaced in booking metadata");
    }

    return failures;
}

function checkCase(testCase, payload) {
    if (testCase.skipHealthAssertions) {
        return checkBookingCase(payload);
    }
    return checkHealthCase(testCase, payload);
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
                sessionId: `smoke_4b2g_${testCase.id}_${Date.now()}`
            });
            const failures = checkCase(testCase, payload);
            const data = payload.data || {};
            const meta = data.meta || {};
            const sources = collectSourceEntries(meta);

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
                queryExpansionApplied: meta.queryExpansionApplied,
                artifactDir: meta.artifactDir || null,
                runtimePromoted: meta.runtimePromoted,
                domains: [...new Set(sources.map((source) => source.domain).filter(Boolean))],
                source_count: sources.length,
                provenance_count: sources.filter(
                    (source) => source.provenance !== undefined && source.provenance !== null
                ).length,
                recommendedPackagePresent: hasRecommendedPackage(meta)
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
                queryExpansionApplied: null,
                artifactDir: null,
                runtimePromoted: null,
                domains: [],
                source_count: 0,
                provenance_count: 0,
                recommendedPackagePresent: null
            });
        }
    }

    const passed = rows.filter((row) => row.pass).length;
    const failed = rows.length - passed;
    const summary = {
        smoke: "api_retriever_v1_4_provenance_4b2g",
        apiUrl: API_URL,
        total: rows.length,
        passed,
        failed,
        groups: summarizeGroups(rows),
        allowlistedDomains: [...ALLOWED_DOMAINS],
        deniedReviewStatusMarkers: REVIEW_STATUS_DENYLIST,
        rows
    };

    console.log(JSON.stringify(summary, null, 2));
    process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((error) => {
    console.error(
        JSON.stringify(
            {
                smoke: "api_retriever_v1_4_provenance_4b2g",
                error: error.message
            },
            null,
            2
        )
    );
    process.exitCode = 1;
});
