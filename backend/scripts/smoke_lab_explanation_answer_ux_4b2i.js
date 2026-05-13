const http = require("http");

const API_URL = process.env.HOMELAB_CHAT_API_URL || "http://localhost:5000/api/chat";

const CASES = [
    {
        id: "hba1c_what",
        message: "HbA1c là gì?",
        expectFlow: "health_rag",
        expectIntentGroup: "test_advice",
        expectSemanticV14: true,
        requiredReplyAny: [["hba1c"], ["đường huyết trung bình", "mức đường huyết trung bình"], ["không chẩn đoán", "không tự kết luận chẩn đoán"]],
        disallowReplyAny: ["mục tiêu nào", "bạn muốn kiểm tra theo mục tiêu nào"],
        disallowFlow: "booking"
    },
    {
        id: "hba1c_blood_draw",
        message: "xét nghiệm HbA1c có cần lấy máu không?",
        expectFlow: "health_rag",
        expectIntentGroup: "test_advice",
        expectSemanticV14: true,
        requiredReplyAny: [["mẫu máu", "lấy mẫu máu", "xét nghiệm máu"], ["đường huyết trung bình", "mức đường huyết trung bình"], ["không chẩn đoán", "không tự kết luận chẩn đoán"]],
        disallowReplyAny: ["mục tiêu nào", "bạn muốn kiểm tra theo mục tiêu nào"],
        disallowFlow: "booking"
    },
    {
        id: "cbc_result_boundary",
        message: "tôi có kết quả CBC bất thường, bạn đọc giúp tôi xem có bệnh gì không",
        expectFlow: "health_rag",
        disallowDiagnosis: true,
        requiredReplyAny: [["không chẩn đoán", "không thể kết luận", "không dùng", "bác sĩ", "nhân viên y tế"]],
        disallowRecommendedPackage: true
    },
    {
        id: "urgent_preserved",
        message: "tôi đau ngực khó thở và mồ hôi",
        expectFlow: "health_rag",
        expectIntentGroup: "urgent_health",
        requiredReplyAny: [["cấp cứu", "khẩn cấp", "cơ sở y tế"]],
        disallowRecommendedPackage: true
    },
    {
        id: "booking_generic_no_test_type",
        message: "tôi muốn đặt lịch lấy mẫu tại nhà",
        expectFlow: "booking",
        expectIntentGroup: "booking",
        expectMissingField: "testType",
        disallowTestType: true
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

function normalizeText(value) {
    return String(value || "").toLowerCase();
}

function includesAny(text, terms) {
    const normalized = normalizeText(text);
    return terms.some((term) => normalized.includes(normalizeText(term)));
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

function checkRequiredReply(reply, groups) {
    const missing = [];

    for (const group of groups || []) {
        if (!includesAny(reply, group)) {
            missing.push(group.join(" OR "));
        }
    }

    return missing;
}

function checkCase(testCase, payload) {
    const failures = [];
    const data = payload.data || {};
    const meta = data.meta || {};
    const reply = data.reply || "";
    const draft = data.booking?.draft || {};

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
        failures.push(
            `expected intentGroup=${testCase.expectIntentGroup}, got ${meta.intentGroup}`
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

    const missingReplyGroups = checkRequiredReply(reply, testCase.requiredReplyAny);
    if (missingReplyGroups.length) {
        failures.push(`reply missing expected terms: ${missingReplyGroups.join("; ")}`);
    }

    if (testCase.disallowReplyAny && includesAny(reply, testCase.disallowReplyAny)) {
        failures.push(
            `reply contains disallowed ask-more phrase: ${testCase.disallowReplyAny.join(", ")}`
        );
    }
    if (testCase.disallowDiagnosis && includesAny(reply, ["bạn bị ", "chắc chắn bị"])) {
        failures.push("reply appears to diagnose disease");
    }
    if (testCase.disallowRecommendedPackage && hasRecommendedPackage(meta)) {
        failures.push("unexpected live recommended package metadata");
    }
    if (testCase.disallowTestType && (draft.testType || meta.extractedSlots?.testType)) {
        failures.push(
            `generic booking inferred testType=${draft.testType || meta.extractedSlots?.testType}`
        );
    }
    if (
        testCase.expectMissingField &&
        Array.isArray(meta.missingFields) &&
        !meta.missingFields.includes(testCase.expectMissingField)
    ) {
        failures.push(
            `expected missingFields to include ${testCase.expectMissingField}, got ${meta.missingFields.join(",")}`
        );
    }

    return failures;
}

async function main() {
    const rows = [];

    for (const testCase of CASES) {
        try {
            const payload = await postJson(API_URL, {
                message: testCase.message,
                sessionId: `smoke_lab_explanation_4b2i_${testCase.id}_${Date.now()}`
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
                reason: meta.reason || null,
                recommendationDecisionType: meta.recommendation?.decisionType || null,
                recommendedPackagePresent: hasRecommendedPackage(meta),
                bookingDraft: data.booking?.draft || null,
                missingFields: meta.missingFields || null,
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
                reason: null,
                recommendationDecisionType: null,
                recommendedPackagePresent: null,
                bookingDraft: null,
                missingFields: null,
                reply: null
            });
        }
    }

    const passed = rows.filter((row) => row.pass).length;
    const failed = rows.length - passed;
    const summary = {
        smoke: "lab_explanation_answer_ux_4b2i",
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
                smoke: "lab_explanation_answer_ux_4b2i",
                error: error.message
            },
            null,
            2
        )
    );
    process.exitCode = 1;
});
