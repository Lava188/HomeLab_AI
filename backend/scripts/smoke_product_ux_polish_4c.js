const http = require("http");

const API_URL = process.env.HOMELAB_CHAT_API_URL || "http://localhost:5000/api/chat";

const CASES = [
    {
        id: "cbc_what_no_booking_cta",
        message: "Tổng phân tích tế bào máu CBC là gì?",
        expectFlow: "health_rag",
        disallowReplyTerms: ["neu ban muon dat lich"]
    },
    {
        id: "alt_ast_what_no_booking_cta",
        message: "Men gan ALT AST để làm gì?",
        expectFlow: "health_rag",
        disallowReplyTerms: ["neu ban muon dat lich"]
    },
    {
        id: "creatinine_egfr_what_no_booking_cta",
        message: "Creatinine và eGFR dùng để kiểm tra gì?",
        expectFlow: "health_rag",
        disallowReplyTerms: ["neu ban muon dat lich"]
    },
    {
        id: "wbc_high_no_leukemia_unprompted",
        message: "Bạch cầu của tôi cao có nguy hiểm không?",
        expectFlow: "health_rag",
        expectAnyReplyTerms: ["khong chan doan", "chua du ket luan", "bac si", "nhan vien y te"],
        disallowReplyTerms: ["ung thu mau"]
    },
    {
        id: "cbc_abnormal_leukemia_boundary",
        message: "Chỉ số CBC của tôi bất thường có phải ung thư máu không?",
        expectFlow: "health_rag",
        expectReplyTerms: ["ung thu mau"],
        expectAnyReplyTerms: ["khong chan doan", "chua the ket luan", "khong ket luan"],
        disallowReplyTerms: ["chac chan bi", "ban bi ung thu mau"]
    },
    {
        id: "fever_confusion_rapid_breathing_urgent_source",
        message: "Tôi sốt cao, lơ mơ, thở nhanh",
        expectFlow: "health_rag",
        expectIntentGroup: "urgent_health",
        expectPrimaryMode: "emergency_or_urgent",
        expectAnyReplyTerms: ["cap cuu", "khan cap", "co so y te"],
        expectAnySourceTerms: ["sepsis", "nhiem trung", "nice_sepsis"],
        requireValidSourceNames: true,
        disallowReplyTerms: ["d-dimer", "ddimer"],
        disallowSourceTerms: ["d-dimer", "ddimer"]
    },
    {
        id: "mixed_general_test_but_urgent",
        message: "Tôi muốn xét nghiệm tổng quát nhưng đang sốt cao lơ mơ thở nhanh",
        expectFlow: "health_rag",
        disallowFlow: "booking",
        expectIntentGroup: "urgent_health",
        expectPrimaryMode: "emergency_or_urgent",
        expectAnyReplyTerms: ["cap cuu", "khan cap", "co so y te"],
        expectAnySourceTerms: ["sepsis", "nhiem trung", "nice_sepsis", "nice"],
        requireValidSourceNames: true,
        disallowRecommendation: true,
        disallowReplyTerms: ["goi xet nghiem phu hop", "neu chi muon kiem tra tong quat", "d-dimer", "ddimer"],
        disallowSourceTerms: ["d-dimer", "ddimer"]
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
                        reject(new Error(parsed.message || parsed.error || `HTTP ${response.statusCode}`));
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

function normalize(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/Đ/g, "D")
        .toLowerCase();
}

function includesAny(text, terms) {
    const normalized = normalize(text);
    return terms.some((term) => normalized.includes(normalize(term)));
}

function includesAll(text, terms) {
    const normalized = normalize(text);
    return terms.every((term) => normalized.includes(normalize(term)));
}

function collectSourceText(meta) {
    const parts = [];

    for (const chunk of Array.isArray(meta.topChunks) ? meta.topChunks : []) {
        parts.push(chunk.title, chunk.sourceId, chunk.sourceName, chunk.sourceUrl, chunk.finalUrl);
    }

    for (const citation of Array.isArray(meta.citations) ? meta.citations : []) {
        parts.push(citation.title, citation.sourceId, citation.sourceName, citation.sourceUrl, citation.finalUrl);
    }

    if (meta.knowledgeItem) {
        parts.push(meta.knowledgeItem.id, meta.knowledgeItem.title, meta.knowledgeItem.source);
    }

    return parts.filter(Boolean).join(" ");
}

function collectSourceNameFailures(meta) {
    const failures = [];
    const entries = [];

    for (const chunk of Array.isArray(meta.topChunks) ? meta.topChunks : []) {
        entries.push({
            type: "topChunk",
            id: chunk.chunkId || chunk.sourceId || chunk.title || "unknown",
            sourceName: chunk.sourceName
        });
    }

    for (const citation of Array.isArray(meta.citations) ? meta.citations : []) {
        entries.push({
            type: "citation",
            id: citation.chunkId || citation.sourceId || citation.title || "unknown",
            sourceName: citation.sourceName
        });
    }

    if (!entries.length) {
        failures.push("no source entries returned");
        return failures;
    }

    for (const entry of entries) {
        const sourceName = String(entry.sourceName || "").trim();

        if (!sourceName || sourceName.toLowerCase() === "undefined" || sourceName.toLowerCase() === "null") {
            failures.push(`${entry.type} ${entry.id} has invalid sourceName=${sourceName || "<empty>"}`);
        }
    }

    if (
        meta.knowledgeItem?.source &&
        normalize(meta.knowledgeItem.source).includes("undefined -")
    ) {
        failures.push("knowledgeItem source contains undefined display name");
    }

    return failures;
}

function hasRecommendedPackage(meta) {
    const recommendation = meta.recommendation || null;

    return Boolean(
        recommendation?.recommendedPackage ||
        recommendation?.recommendedPackageId ||
        recommendation?.candidatePackages?.length ||
        recommendation?.candidatePackageIds?.length ||
        recommendation?.packageDecision?.candidatePackages?.length
    );
}

function checkCase(testCase, payload) {
    const failures = [];
    const data = payload.data || {};
    const meta = data.meta || {};
    const reply = data.reply || "";
    const sourceText = collectSourceText(meta);

    if (payload.success !== true) {
        failures.push("API success is not true");
    }
    if (testCase.expectFlow && data.flow !== testCase.expectFlow) {
        failures.push(`expected flow=${testCase.expectFlow}, got ${data.flow}`);
    }
    if (testCase.disallowFlow && data.flow === testCase.disallowFlow) {
        failures.push(`unexpected flow=${data.flow}`);
    }
    if (testCase.expectIntentGroup && meta.intentGroup !== testCase.expectIntentGroup) {
        failures.push(`expected intentGroup=${testCase.expectIntentGroup}, got ${meta.intentGroup}`);
    }
    if (testCase.expectPrimaryMode && meta.primaryMode !== testCase.expectPrimaryMode) {
        failures.push(`expected primaryMode=${testCase.expectPrimaryMode}, got ${meta.primaryMode}`);
    }
    if (testCase.expectReplyTerms && !includesAll(reply, testCase.expectReplyTerms)) {
        failures.push(`reply missing required terms: ${testCase.expectReplyTerms.join(", ")}`);
    }
    if (testCase.expectAnyReplyTerms && !includesAny(reply, testCase.expectAnyReplyTerms)) {
        failures.push(`reply missing any of: ${testCase.expectAnyReplyTerms.join(", ")}`);
    }
    if (testCase.expectAnySourceTerms && !includesAny(sourceText, testCase.expectAnySourceTerms)) {
        failures.push(`sources missing any of: ${testCase.expectAnySourceTerms.join(", ")}`);
    }
    if (testCase.requireValidSourceNames) {
        failures.push(...collectSourceNameFailures(meta));
    }
    if (testCase.disallowReplyTerms && includesAny(reply, testCase.disallowReplyTerms)) {
        failures.push(`reply contains disallowed terms: ${testCase.disallowReplyTerms.join(", ")}`);
    }
    if (testCase.disallowSourceTerms && includesAny(sourceText, testCase.disallowSourceTerms)) {
        failures.push(`sources contain disallowed terms: ${testCase.disallowSourceTerms.join(", ")}`);
    }
    if (testCase.disallowRecommendation && hasRecommendedPackage(meta)) {
        failures.push("urgent case unexpectedly returned recommendation package candidates");
    }

    return failures;
}

async function main() {
    const rows = [];

    for (const testCase of CASES) {
        try {
            const payload = await postJson(API_URL, {
                message: testCase.message,
                sessionId: `smoke_product_ux_polish_4c_${testCase.id}_${Date.now()}`
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
                primaryMode: meta.primaryMode || null,
                urgencyLevel: meta.urgencyLevel || null,
                sourceAlignment: meta.debug?.sourceAlignment || null,
                sources: collectSourceText(meta),
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
                primaryMode: null,
                urgencyLevel: null,
                sourceAlignment: null,
                sources: null,
                reply: null
            });
        }
    }

    const passed = rows.filter((row) => row.pass).length;
    const failed = rows.length - passed;

    console.log(JSON.stringify({
        smoke: "product_ux_polish_4c",
        apiUrl: API_URL,
        total: rows.length,
        passed,
        failed,
        rows
    }, null, 2));

    process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((error) => {
    console.error(JSON.stringify({
        smoke: "product_ux_polish_4c",
        error: error.message
    }, null, 2));
    process.exitCode = 1;
});
