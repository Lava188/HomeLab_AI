const http = require("http");

const API_URL = process.env.HOMELAB_CHAT_API_URL || "http://localhost:5000/api/chat";

const RAW_ENGLISH_HEADING_PATTERNS = [
    /\bNguồn đang dùng\b/i,
    /\bWhat (is|are|it's|they|do)\b/i,
    /\bWhat are they used for\b/i,
    /\bIs there anything else I need to know\b/i,
    /\bCommon types of blood test\b/i,
    /\bFasting plasma glucose test\b/i,
    /\bHemoglobin A1C \(HbA1c\) Test\b/i,
    /\bOther names: HbA1C\b/i,
    /\bWhy do I need an A1C test\b/i,
    /\bLiver Function Tests\b/i
];

const CASES = [
    {
        id: "hba1c_what",
        message: "HbA1c là gì?",
        expectedFlow: "health_rag",
        expectedIntentGroup: "test_advice",
        expectSemanticV14: true,
        requireSources: true
    },
    {
        id: "hba1c_blood_draw",
        message: "xét nghiệm HbA1c có cần lấy máu không?",
        expectedFlow: "health_rag",
        expectedIntentGroup: "test_advice",
        expectSemanticV14: true,
        requireSources: true
    },
    {
        id: "liver_alt_ast",
        message: "men gan ALT AST để làm gì",
        expectedFlow: "health_rag",
        expectedIntentGroup: "test_advice",
        expectSemanticV14: true,
        requireSources: true
    },
    {
        id: "cbc_boundary",
        message: "tôi có kết quả CBC bất thường, bạn đọc giúp tôi xem có bệnh gì không",
        expectedFlow: "health_rag",
        expectSemanticV14: true,
        requireSources: true,
        expectBoundary: true
    },
    {
        id: "urgent_chest_breath_sweat",
        message: "tôi đau ngực khó thở và mồ hôi",
        expectedFlow: "health_rag",
        expectedIntentGroup: "urgent_health",
        expectSemanticV14: true,
        requireSources: true,
        expectUrgent: true
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

        request.on("timeout", () => request.destroy(new Error("request timed out")));
        request.on("error", reject);
        request.write(payload);
        request.end();
    });
}

function collectSourceEntries(meta) {
    const entries = [];

    for (const chunk of Array.isArray(meta.topChunks) ? meta.topChunks : []) {
        entries.push({
            sourceUrl: chunk.sourceUrl || chunk.finalUrl || null,
            domain: chunk.domain || null,
            provenance: chunk.provenance
        });
    }

    for (const citation of Array.isArray(meta.citations) ? meta.citations : []) {
        entries.push({
            sourceUrl: citation.sourceUrl || citation.finalUrl || null,
            domain: citation.domain || null,
            provenance: citation.provenance
        });
    }

    const bridgeChunks = meta.debug?.semanticBridge?.topChunks;
    for (const chunk of Array.isArray(bridgeChunks) ? bridgeChunks : []) {
        entries.push({
            sourceUrl: chunk.source_url || chunk.final_url || null,
            domain: chunk.domain || null,
            provenance: chunk.provenance
        });
    }

    return entries;
}

function hasValidSource(meta) {
    return collectSourceEntries(meta).some(
        (entry) =>
            entry.sourceUrl &&
            entry.domain &&
            entry.provenance !== undefined &&
            entry.provenance !== null
    );
}

function hasRawEnglishHeading(reply) {
    return RAW_ENGLISH_HEADING_PATTERNS.some((pattern) => pattern.test(reply));
}

function includesAny(text, terms) {
    const lower = String(text || "").toLowerCase();
    return terms.some((term) => lower.includes(String(term).toLowerCase()));
}

function checkCase(testCase, payload) {
    const failures = [];
    const data = payload.data || {};
    const meta = data.meta || {};
    const reply = data.reply || "";

    if (payload.success !== true) {
        failures.push("API success is not true");
    }
    if (data.flow !== testCase.expectedFlow) {
        failures.push(`expected flow=${testCase.expectedFlow}, got ${data.flow}`);
    }
    if (testCase.expectedIntentGroup && meta.intentGroup !== testCase.expectedIntentGroup) {
        failures.push(
            `expected intentGroup=${testCase.expectedIntentGroup}, got ${meta.intentGroup}`
        );
    }
    if (testCase.expectSemanticV14) {
        if (meta.selectedRetrievalMode !== "semantic_faiss") {
            failures.push(
                `expected selectedRetrievalMode=semantic_faiss, got ${meta.selectedRetrievalMode}`
            );
        }
        if (meta.retrieverVersion !== "v1_4") {
            failures.push(`expected retrieverVersion=v1_4, got ${meta.retrieverVersion}`);
        }
    }
    if (hasRawEnglishHeading(reply)) {
        failures.push("raw English source heading/title leaked into answer body");
    }
    if (testCase.requireSources && !hasValidSource(meta)) {
        failures.push("missing valid source metadata/provenance");
    }
    if (
        testCase.expectUrgent &&
        !includesAny(reply, ["cấp cứu", "cơ sở y tế", "khẩn cấp"])
    ) {
        failures.push("urgent answer missing emergency guidance");
    }
    if (
        testCase.expectBoundary &&
        !includesAny(reply, ["không chẩn đoán", "không thể kết luận", "bác sĩ", "nhân viên y tế"])
    ) {
        failures.push("boundary answer missing no-diagnosis language");
    }
    if (testCase.expectBoundary && includesAny(reply, ["chắc chắn bị", "bạn bị bệnh"])) {
        failures.push("boundary answer appears to diagnose");
    }

    return failures;
}

async function main() {
    const rows = [];

    for (const testCase of CASES) {
        try {
            const payload = await postJson(API_URL, {
                message: testCase.message,
                sessionId: `smoke_answer_text_polish_4b2i_${testCase.id}_${Date.now()}`
            });
            const failures = checkCase(testCase, payload);
            const data = payload.data || {};
            const meta = data.meta || {};

            rows.push({
                id: testCase.id,
                message: testCase.message,
                pass: failures.length === 0,
                failures,
                flow: data.flow || null,
                intentGroup: meta.intentGroup || null,
                selectedRetrievalMode: meta.selectedRetrievalMode || null,
                retrieverVersion: meta.retrieverVersion || null,
                primaryMode: meta.primaryMode || null,
                source_count: collectSourceEntries(meta).length,
                reply: data.reply || null
            });
        } catch (error) {
            rows.push({
                id: testCase.id,
                message: testCase.message,
                pass: false,
                failures: [error.message],
                flow: null,
                intentGroup: null,
                selectedRetrievalMode: null,
                retrieverVersion: null,
                primaryMode: null,
                source_count: 0,
                reply: null
            });
        }
    }

    const passed = rows.filter((row) => row.pass).length;
    const failed = rows.length - passed;
    const summary = {
        smoke: "answer_text_polish_4b2i",
        apiUrl: API_URL,
        total: rows.length,
        passed,
        failed,
        rows
    };

    console.log(JSON.stringify(summary, null, 2));
    process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((error) => {
    console.error(
        JSON.stringify(
            {
                smoke: "answer_text_polish_4b2i",
                error: error.message
            },
            null,
            2
        )
    );
    process.exitCode = 1;
});
