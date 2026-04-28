const http = require("http");

const API_URL = process.env.HOMELAB_CHAT_API_URL || "http://localhost:5000/api/chat";

const CASES = [
    {
        id: "urgent_chest_breath_sweat_answer",
        message: "tôi đau ngực khó thở vã mồ hôi",
        expectFlow: "health_rag",
        expectIntentGroup: "urgent_health",
        expectReplyTerms: ["cấp cứu", "cơ sở y tế"],
        disallowReplyTerms: ["chưa đủ chắc chắn"]
    },
    {
        id: "generic_home_sample_booking_no_test_type_inference",
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

function includesAll(text, terms) {
    const normalized = String(text || "").toLowerCase();
    return terms.every((term) => normalized.includes(term.toLowerCase()));
}

function includesAny(text, terms) {
    const normalized = String(text || "").toLowerCase();
    return terms.some((term) => normalized.includes(term.toLowerCase()));
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
    const reply = data.reply || "";
    const draft = data.booking?.draft || {};

    if (payload.success !== true) {
        failures.push("API success is not true");
    }
    if (data.flow !== testCase.expectFlow) {
        failures.push(`expected flow=${testCase.expectFlow}, got ${data.flow}`);
    }
    if (meta.intentGroup !== testCase.expectIntentGroup) {
        failures.push(
            `expected intentGroup=${testCase.expectIntentGroup}, got ${meta.intentGroup}`
        );
    }
    if (testCase.expectReplyTerms && !includesAll(reply, testCase.expectReplyTerms)) {
        failures.push(
            `reply missing required terms: ${testCase.expectReplyTerms.join(", ")}`
        );
    }
    if (testCase.disallowReplyTerms && includesAny(reply, testCase.disallowReplyTerms)) {
        failures.push(
            `reply contains disallowed soft fallback term: ${testCase.disallowReplyTerms.join(", ")}`
        );
    }
    if (testCase.expectIntentGroup === "urgent_health" && hasRecommendedPackage(meta)) {
        failures.push("urgent case unexpectedly returned recommended package");
    }
    if (testCase.disallowTestType) {
        if (draft.testType || meta.extractedSlots?.testType) {
            failures.push(
                `generic booking inferred testType=${draft.testType || meta.extractedSlots?.testType}`
            );
        }
    }
    if (
        testCase.expectMissingField &&
        !Array.isArray(meta.missingFields) &&
        testCase.expectFlow === "booking"
    ) {
        failures.push("booking meta.missingFields is missing");
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
                sessionId: `smoke_urgent_booking_ux_4b2h_${testCase.id}_${Date.now()}`
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
                action: data.action || null,
                reply: data.reply || null,
                bookingDraft: data.booking?.draft || null,
                extractedSlots: meta.extractedSlots || null,
                missingFields: meta.missingFields || null,
                selectedRetrievalMode: meta.selectedRetrievalMode || null,
                retrieverVersion: meta.retrieverVersion || null,
                primaryMode: meta.primaryMode || null,
                urgencyLevel: meta.urgencyLevel || null
            });
        } catch (error) {
            rows.push({
                id: testCase.id,
                message: testCase.message,
                pass: false,
                failures: [error.message],
                flow: null,
                intentGroup: null,
                action: null,
                reply: null,
                bookingDraft: null,
                extractedSlots: null,
                missingFields: null,
                selectedRetrievalMode: null,
                retrieverVersion: null,
                primaryMode: null,
                urgencyLevel: null
            });
        }
    }

    const passed = rows.filter((row) => row.pass).length;
    const failed = rows.length - passed;
    const summary = {
        smoke: "urgent_booking_ux_4b2h",
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
                smoke: "urgent_booking_ux_4b2h",
                error: error.message
            },
            null,
            2
        )
    );
    process.exitCode = 1;
});
