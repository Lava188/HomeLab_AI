const http = require("http");

const API_URL = process.env.HOMELAB_CHAT_API_URL || "http://localhost:5000/api/chat";

const INTERNAL_ANSWER_PATTERNS = [
    /\bliver[_ ]function\b/i,
    /\blipid cholesterol triglycerides\b/i,
    /\bkidney[_ ]function\b/i,
    /nguồn truy xuất liên quan đến nhóm/i,
    /source heading/i,
    /raw source/i
];

const LAB_CASES = [
    {
        id: "liver_alt_ast",
        message: "men gan ALT AST để làm gì?",
        expectedTerms: ["men gan", "ALT", "AST"]
    },
    {
        id: "kidney_creatinine_egfr",
        message: "creatinine và eGFR dùng để kiểm tra gì?",
        expectedTerms: ["thận", "lọc"]
    },
    {
        id: "lipid_cholesterol_triglyceride",
        message: "cholesterol triglyceride khác nhau thế nào?",
        expectedTerms: ["mỡ máu", "chuyển hóa lipid"]
    },
    {
        id: "hba1c_blood_draw",
        message: "xét nghiệm HbA1c có cần lấy máu không?",
        expectedTerms: ["HbA1c", "máu"]
    },
    {
        id: "hba1c_fasting_preparation",
        message: "xét nghiệm HbA1c có cần nhịn ăn không?",
        expectedTerms: ["không cần nhịn ăn", "HbA1c"],
        expectSelectedRetrievalMode: "semantic_faiss",
        expectRetrieverVersion: "v1_4"
    },
    {
        id: "liver_alt_ast_high",
        message: "ALT AST cao nghĩa là gì?",
        expectedTerms: ["ALT", "AST"]
    }
];

const CASES = [
    ...LAB_CASES.map((testCase) => ({
        ...testCase,
        kind: "lab_explanation",
        expectFlow: "health_rag",
        expectAction: "ANSWER_HEALTH_QUERY",
        expectPrimaryMode: "lab_explanation",
        expectIntentGroup: "test_advice",
        disallowClarify: true,
        disallowInternalLabels: true
    })),
    {
        id: "urgent_chest_breath_sweat",
        kind: "urgent",
        message: "tôi đau ngực khó thở vã mồ hôi",
        expectFlow: "health_rag",
        expectIntentGroup: "urgent_health",
        expectUrgencyLevel: "emergency",
        expectedTerms: ["cấp cứu", "cơ sở y tế"]
    },
    {
        id: "booking_home_sample_no_test_type",
        kind: "booking",
        message: "tôi muốn đặt lịch lấy máu tại nhà",
        expectFlow: "booking",
        expectIntentGroup: "booking",
        disallowTestType: true
    },
    {
        id: "payment_transfer_not_lab_explanation",
        kind: "negative_route",
        message: "thanh toán có cần chuyển khoản không?",
        disallowIntentGroup: "test_advice",
        disallowPrimaryMode: "lab_explanation"
    },
    {
        id: "check_payment_transfer_not_lab_explanation",
        kind: "negative_route",
        message: "kiểm tra thanh toán có cần chuyển khoản không?",
        disallowIntentGroup: "test_advice",
        disallowPrimaryMode: "lab_explanation"
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

                    try {
                        const parsed = raw ? JSON.parse(raw) : {};

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
                    } catch (error) {
                        reject(new Error(`failed to parse JSON: ${error.message}`));
                    }
                });
            }
        );

        request.on("timeout", () => request.destroy(new Error("request timed out")));
        request.on("error", reject);
        request.write(payload);
        request.end();
    });
}

function includesAll(text, terms) {
    const normalized = String(text || "").toLowerCase();
    return terms.every((term) => normalized.includes(String(term).toLowerCase()));
}

function hasInternalAnswerLeak(reply) {
    return INTERNAL_ANSWER_PATTERNS.some((pattern) => pattern.test(reply));
}

function checkCase(testCase, payload) {
    const failures = [];
    const data = payload.data || {};
    const meta = data.meta || {};
    const reply = data.reply || "";
    const lowConfidenceGuard = meta.routing?.lowConfidenceGuard || null;

    if (payload.success !== true) {
        failures.push("API success is not true");
    }
    if (testCase.expectFlow && data.flow !== testCase.expectFlow) {
        failures.push(`expected flow=${testCase.expectFlow}, got ${data.flow}`);
    }
    if (testCase.expectAction && data.action !== testCase.expectAction) {
        failures.push(`expected action=${testCase.expectAction}, got ${data.action}`);
    }
    if (testCase.expectIntentGroup && meta.intentGroup !== testCase.expectIntentGroup) {
        failures.push(
            `expected intentGroup=${testCase.expectIntentGroup}, got ${meta.intentGroup}`
        );
    }
    if (testCase.disallowIntentGroup && meta.intentGroup === testCase.disallowIntentGroup) {
        failures.push(`unexpected intentGroup=${meta.intentGroup}`);
    }
    if (testCase.expectPrimaryMode && meta.primaryMode !== testCase.expectPrimaryMode) {
        failures.push(
            `expected primaryMode=${testCase.expectPrimaryMode}, got ${meta.primaryMode}`
        );
    }
    if (testCase.disallowPrimaryMode && meta.primaryMode === testCase.disallowPrimaryMode) {
        failures.push(`unexpected primaryMode=${meta.primaryMode}`);
    }
    if (
        testCase.expectUrgencyLevel &&
        meta.urgencyLevel !== testCase.expectUrgencyLevel
    ) {
        failures.push(
            `expected urgencyLevel=${testCase.expectUrgencyLevel}, got ${meta.urgencyLevel}`
        );
    }
    if (
        testCase.expectSelectedRetrievalMode &&
        meta.selectedRetrievalMode !== testCase.expectSelectedRetrievalMode
    ) {
        failures.push(
            `expected selectedRetrievalMode=${testCase.expectSelectedRetrievalMode}, got ${meta.selectedRetrievalMode}`
        );
    }
    if (
        testCase.expectRetrieverVersion &&
        meta.retrieverVersion !== testCase.expectRetrieverVersion
    ) {
        failures.push(
            `expected retrieverVersion=${testCase.expectRetrieverVersion}, got ${meta.retrieverVersion}`
        );
    }
    if (testCase.expectedTerms && !includesAll(reply, testCase.expectedTerms)) {
        failures.push(`reply missing expected terms: ${testCase.expectedTerms.join(", ")}`);
    }
    if (testCase.disallowClarify) {
        if (data.action === "FALLBACK_RESPONSE") {
            failures.push("lab explanation returned fallback action");
        }
        if (lowConfidenceGuard?.triggered === true) {
            failures.push(`lowConfidenceGuard triggered: ${lowConfidenceGuard.reason}`);
        }
    }
    if (testCase.disallowInternalLabels && hasInternalAnswerLeak(reply)) {
        failures.push("reply leaked internal topic/template/source heading text");
    }
    if (testCase.disallowTestType) {
        const draft = data.booking?.draft || {};

        if (draft.testType || meta.extractedSlots?.testType) {
            failures.push(
                `generic booking inferred testType=${draft.testType || meta.extractedSlots?.testType}`
            );
        }
        if (!Array.isArray(meta.missingFields) || !meta.missingFields.includes("testType")) {
            failures.push("generic booking did not keep testType as a missing field");
        }
    }

    return failures;
}

async function main() {
    const rows = [];

    for (const testCase of CASES) {
        try {
            const payload = await postJson(API_URL, {
                message: testCase.message,
                sessionId: `smoke_answer_ui_alignment_4b2j_${testCase.id}_${Date.now()}`
            });
            const failures = checkCase(testCase, payload);
            const data = payload.data || {};
            const meta = data.meta || {};

            rows.push({
                id: testCase.id,
                kind: testCase.kind,
                message: testCase.message,
                pass: failures.length === 0,
                failures,
                flow: data.flow || null,
                action: data.action || null,
                intentGroup: meta.intentGroup || null,
                primaryMode: meta.primaryMode || null,
                urgencyLevel: meta.urgencyLevel || null,
                lowConfidenceGuard: meta.routing?.lowConfidenceGuard || null,
                selectedRetrievalMode: meta.selectedRetrievalMode || null,
                retrieverVersion: meta.retrieverVersion || null,
                missingFields: meta.missingFields || null,
                bookingDraft: data.booking?.draft || null,
                reply: data.reply || null
            });
        } catch (error) {
            rows.push({
                id: testCase.id,
                kind: testCase.kind,
                message: testCase.message,
                pass: false,
                failures: [error.message],
                flow: null,
                action: null,
                intentGroup: null,
                primaryMode: null,
                urgencyLevel: null,
                lowConfidenceGuard: null,
                selectedRetrievalMode: null,
                retrieverVersion: null,
                missingFields: null,
                bookingDraft: null,
                reply: null
            });
        }
    }

    const passed = rows.filter((row) => row.pass).length;
    const failed = rows.length - passed;

    console.log(
        JSON.stringify(
            {
                smoke: "answer_ui_alignment_4b2j",
                apiUrl: API_URL,
                total: rows.length,
                passed,
                failed,
                rows
            },
            null,
            2
        )
    );
    process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((error) => {
    console.error(
        JSON.stringify(
            {
                smoke: "answer_ui_alignment_4b2j",
                error: error.message
            },
            null,
            2
        )
    );
    process.exitCode = 1;
});
