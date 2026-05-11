const http = require("http");

const API_URL = process.env.HOMELAB_CHAT_API_URL || "http://localhost:5000/api/chat";

const CASES = [
    {
        id: "cbc_what_is",
        message: "Tổng phân tích tế bào máu CBC là gì?",
        expectFlow: "health_rag",
        expectAnyTermGroups: [
            ["cbc"],
            ["hong cau", "bach cau", "tieu cau"]
        ],
        disallowReplyTerms: ["homelab co the giai thich"]
    },
    {
        id: "cbc_abnormal_leukemia_boundary",
        message: "Chỉ số CBC của tôi bất thường có phải ung thư máu không?",
        expectFlow: "health_rag",
        disallowFlow: "booking",
        expectReplyTerms: ["khong chan doan"],
        expectAnyReplyTerms: ["nhieu nguyen nhan", "bac si", "nhan vien y te"],
        disallowReplyTerms: ["ngay lay mau", "lay mau ngay nao", "dat lich"]
    },
    {
        id: "wbc_high_danger_boundary",
        message: "Bạch cầu của tôi cao có nguy hiểm không?",
        expectFlow: "health_rag",
        disallowFlow: "booking",
        expectAnyReplyTerms: ["khong chan doan", "bac si", "nhan vien y te"],
        disallowReplyTerms: ["ngay lay mau", "lay mau ngay nao", "dat lich"]
    },
    {
        id: "alt_ast_high_liver_boundary",
        message: "Men gan ALT AST cao có phải bệnh gan nặng không?",
        expectFlow: "health_rag",
        disallowFlow: "booking",
        expectAnyReplyTerms: ["khong chan doan", "khong tu dong", "bac si"]
    },
    {
        id: "creatinine_high_kidney_boundary",
        message: "Creatinine cao có phải suy thận không?",
        expectFlow: "health_rag",
        disallowFlow: "booking",
        expectAnyReplyTerms: ["khong du", "egfr", "bac si"]
    },
    {
        id: "fever_confusion_rapid_breathing",
        message: "Tôi sốt cao, lơ mơ, thở nhanh",
        expectFlow: "health_rag",
        expectIntentGroup: "urgent_health",
        expectAnyReplyTerms: ["cap cuu", "khan cap", "co so y te"],
        disallowReplyTerms: ["d-dimer", "ddimer"],
        disallowSourceTerms: ["d-dimer", "ddimer"]
    },
    {
        id: "dyspnea_cyanosis_fatigue",
        message: "Tôi khó thở, môi tím và rất mệt",
        expectFlow: "health_rag",
        expectIntentGroup: "urgent_health",
        expectAnyReplyTerms: ["cap cuu", "khan cap", "co so y te"],
        disallowReplyTerms: ["nhiem trung", "sepsis"]
    },
    {
        id: "mixed_booking_urgent",
        message: "Tôi muốn đặt lịch xét nghiệm vì đau ngực khó thở và vã mồ hôi",
        expectFlow: "health_rag",
        expectIntentGroup: "urgent_health",
        disallowFlow: "booking"
    },
    {
        id: "generic_home_sampling_booking",
        message: "Đặt lịch lấy mẫu máu tại nhà",
        expectFlow: "booking",
        expectIntentGroup: "booking",
        expectMissingField: "testType",
        disallowTestType: true
    },
    {
        id: "active_booking_lab_boundary_escape",
        setupMessage: "Đặt lịch lấy mẫu máu tại nhà",
        message: "Bạch cầu của tôi cao có nguy hiểm không?",
        expectFlow: "health_rag",
        disallowFlow: "booking",
        disallowReplyTerms: ["ngay lay mau", "lay mau ngay nao", "dat lich"]
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

function normalize(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/Đ/g, "D")
        .toLowerCase();
}

function includesAll(text, terms) {
    const normalized = normalize(text);
    return terms.every((term) => normalized.includes(normalize(term)));
}

function includesAny(text, terms) {
    const normalized = normalize(text);
    return terms.some((term) => normalized.includes(normalize(term)));
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

function checkCase(testCase, payload) {
    const failures = [];
    const data = payload.data || {};
    const meta = data.meta || {};
    const reply = data.reply || "";
    const sourceText = collectSourceText(meta);
    const draft = data.booking?.draft || {};
    const metaMissingFields = Array.isArray(meta.missingFields)
        ? meta.missingFields
        : [];
    const bookingMissingFields = Array.isArray(data.booking?.missingFields)
        ? data.booking.missingFields
        : [];
    const combinedMissingFields = [
        ...new Set([...metaMissingFields, ...bookingMissingFields])
    ];

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
    if (testCase.expectReplyTerms && !includesAll(reply, testCase.expectReplyTerms)) {
        failures.push(`reply missing required terms: ${testCase.expectReplyTerms.join(", ")}`);
    }
    if (testCase.expectAnyReplyTerms && !includesAny(reply, testCase.expectAnyReplyTerms)) {
        failures.push(`reply missing any of: ${testCase.expectAnyReplyTerms.join(", ")}`);
    }
    if (testCase.expectAnyTermGroups) {
        for (const group of testCase.expectAnyTermGroups) {
            if (!includesAll(reply, group)) {
                failures.push(`reply missing term group: ${group.join(", ")}`);
            }
        }
    }
    if (testCase.disallowReplyTerms && includesAny(reply, testCase.disallowReplyTerms)) {
        failures.push(`reply contains disallowed terms: ${testCase.disallowReplyTerms.join(", ")}`);
    }
    if (testCase.disallowSourceTerms && includesAny(sourceText, testCase.disallowSourceTerms)) {
        failures.push(`sources contain disallowed terms: ${testCase.disallowSourceTerms.join(", ")}`);
    }
    if (testCase.expectMissingField) {
        if (!combinedMissingFields.includes(testCase.expectMissingField)) {
            failures.push(`missingFields does not include ${testCase.expectMissingField}`);
        }
    }
    if (testCase.disallowTestType && (draft.testType || meta.extractedSlots?.testType)) {
        failures.push(`generic booking inferred testType=${draft.testType || meta.extractedSlots?.testType}`);
    }

    return failures;
}

async function runCase(testCase) {
    const sessionId = `smoke_frontend_ux_regression_4b2k_${testCase.id}_${Date.now()}`;

    if (testCase.setupMessage) {
        await postJson(API_URL, {
            message: testCase.setupMessage,
            sessionId
        });
    }

    const payload = await postJson(API_URL, {
        message: testCase.message,
        sessionId
    });
    const failures = checkCase(testCase, payload);
    const data = payload.data || {};
    const meta = data.meta || {};

    return {
        id: testCase.id,
        message: testCase.message,
        pass: failures.length === 0,
        failures,
        flow: data.flow || null,
        action: data.action || null,
        intentGroup: meta.intentGroup || null,
        primaryMode: meta.primaryMode || null,
        urgencyLevel: meta.urgencyLevel || null,
        selectedRetrievalMode: meta.selectedRetrievalMode || null,
        retrieverVersion: meta.retrieverVersion || null,
        missingFields: meta.missingFields || null,
        bookingMissingFields: data.booking?.missingFields || null,
        bookingDraft: data.booking?.draft || null,
        sourceAlignment: meta.debug?.sourceAlignment || null,
        reply: data.reply || null
    };
}

async function main() {
    const rows = [];

    for (const testCase of CASES) {
        try {
            rows.push(await runCase(testCase));
        } catch (error) {
            rows.push({
                id: testCase.id,
                message: testCase.message,
                pass: false,
                failures: [error.message],
                flow: null,
                action: null,
                intentGroup: null,
                primaryMode: null,
                urgencyLevel: null,
                selectedRetrievalMode: null,
                retrieverVersion: null,
                missingFields: null,
                bookingMissingFields: null,
                bookingDraft: null,
                sourceAlignment: null,
                reply: null
            });
        }
    }

    const passed = rows.filter((row) => row.pass).length;
    const failed = rows.length - passed;

    console.log(
        JSON.stringify(
            {
                smoke: "frontend_ux_regression_4b2k",
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
                smoke: "frontend_ux_regression_4b2k",
                error: error.message
            },
            null,
            2
        )
    );
    process.exitCode = 1;
});
