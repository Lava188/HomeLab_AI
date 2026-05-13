const http = require("http");

const API_URL = process.env.HOMELAB_CHAT_API_URL || "http://localhost:5000/api/chat";

const RAW_SOURCE_HEADING_TERMS = [
    "what are they used for",
    "is there anything else",
    "will i need to do anything",
    "how to prepare",
    "how to prepare for the test",
    "what do the results mean",
    "why do i need",
    "common types of blood test",
    "other names: chem",
    "glomerular filtration rate (gfr) test",
    "creatinine test"
];

const CASES = [
    {
        id: "lab_cbc_what",
        group: "A_lab_explanation",
        message: "Tổng phân tích tế bào máu CBC là gì?",
        expectFlow: "health_rag",
        allowIntentGroups: ["test_advice", "general_health"],
        disallowFlow: "booking",
        disallowReplyTerms: ["neu ban muon dat lich"],
        requireValidSources: true
    },
    {
        id: "lab_hba1c_what",
        group: "A_lab_explanation",
        message: "HbA1c là gì?",
        expectFlow: "health_rag",
        allowIntentGroups: ["test_advice", "general_health"],
        disallowFlow: "booking",
        disallowReplyTerms: ["neu ban muon dat lich"],
        requireValidSources: true
    },
    {
        id: "lab_hba1c_blood_draw",
        group: "A_lab_explanation",
        message: "Xét nghiệm HbA1c có cần lấy máu không?",
        expectFlow: "health_rag",
        allowIntentGroups: ["test_advice", "general_health"],
        disallowFlow: "booking",
        disallowReplyTerms: ["neu ban muon dat lich"],
        requireValidSources: true
    },
    {
        id: "lab_alt_ast_what",
        group: "A_lab_explanation",
        message: "Men gan ALT AST để làm gì?",
        expectFlow: "health_rag",
        allowIntentGroups: ["test_advice", "general_health"],
        disallowFlow: "booking",
        disallowReplyTerms: ["neu ban muon dat lich"],
        requireValidSources: true
    },
    {
        id: "lab_creatinine_egfr_what",
        group: "A_lab_explanation",
        message: "Creatinine và eGFR dùng để kiểm tra gì?",
        expectFlow: "health_rag",
        allowIntentGroups: ["test_advice", "general_health"],
        disallowFlow: "booking",
        disallowReplyTerms: ["neu ban muon dat lich"],
        requireValidSources: true
    },
    {
        id: "boundary_cbc_leukemia",
        group: "B_medical_review_boundary",
        message: "Chỉ số CBC của tôi bất thường có phải ung thư máu không?",
        expectFlow: "health_rag",
        disallowFlow: "booking",
        requireNoCertainDiagnosis: true,
        requireValidSources: true
    },
    {
        id: "boundary_wbc_high",
        group: "B_medical_review_boundary",
        message: "Bạch cầu của tôi cao có nguy hiểm không?",
        expectFlow: "health_rag",
        disallowFlow: "booking",
        requireNoCertainDiagnosis: true,
        disallowReplyTerms: ["ung thu mau"],
        requireValidSources: true
    },
    {
        id: "boundary_alt_ast_high",
        group: "B_medical_review_boundary",
        message: "Men gan ALT AST cao có phải bệnh gan nặng không?",
        expectFlow: "health_rag",
        disallowFlow: "booking",
        requireNoCertainDiagnosis: true,
        disallowReplyTerms: ["ban bi benh gan nang", "chac chan benh gan nang"],
        requireValidSources: true
    },
    {
        id: "boundary_creatinine_high",
        group: "B_medical_review_boundary",
        message: "Creatinine cao có phải suy thận không?",
        expectFlow: "health_rag",
        disallowFlow: "booking",
        requireNoCertainDiagnosis: true,
        disallowReplyTerms: ["ban bi suy than", "chac chan suy than"],
        requireValidSources: true
    },
    {
        id: "boundary_blood_result_no_diagnosis",
        group: "B_medical_review_boundary",
        message: "Tôi có kết quả xét nghiệm máu rồi, giải thích giúp nhưng đừng chẩn đoán",
        expectFlow: "health_rag",
        disallowFlow: "booking",
        requireNoCertainDiagnosis: true,
        requireValidSources: true
    },
    {
        id: "urgent_chest_breath_sweat",
        group: "C_urgent_red_flags",
        message: "Tôi đau ngực khó thở vã mồ hôi",
        expectFlow: "health_rag",
        expectIntentGroup: "urgent_health",
        requireEmergencyMode: true,
        requireUrgentAnswer: true,
        disallowRecommendationPackage: true,
        requireValidSources: true
    },
    {
        id: "urgent_fever_confusion_rapid_breathing",
        group: "C_urgent_red_flags",
        message: "Tôi sốt cao, lơ mơ, thở nhanh",
        expectFlow: "health_rag",
        expectIntentGroup: "urgent_health",
        requireEmergencyMode: true,
        requireUrgentAnswer: true,
        disallowRecommendationPackage: true,
        disallowSourceTerms: ["d-dimer", "ddimer"],
        requireValidSources: true
    },
    {
        id: "urgent_dyspnea_cyanosis_fatigue",
        group: "C_urgent_red_flags",
        message: "Tôi khó thở, môi tím và rất mệt",
        expectFlow: "health_rag",
        expectIntentGroup: "urgent_health",
        requireEmergencyMode: true,
        requireUrgentAnswer: true,
        disallowRecommendationPackage: true,
        requireValidSources: true
    },
    {
        id: "urgent_faint_chest_dyspnea",
        group: "C_urgent_red_flags",
        message: "Tôi bị ngất, đau ngực và khó thở",
        expectFlow: "health_rag",
        expectIntentGroup: "urgent_health",
        requireEmergencyMode: true,
        requireUrgentAnswer: true,
        disallowRecommendationPackage: true,
        requireValidSources: true
    },
    {
        id: "urgent_allergy_seafood_breath_lip_swelling",
        group: "C_urgent_red_flags",
        message: "Tôi dị ứng sau ăn hải sản, khó thở và sưng môi",
        expectFlow: "health_rag",
        expectIntentGroup: "urgent_health",
        requireEmergencyMode: true,
        requireUrgentAnswer: true,
        disallowRecommendationPackage: true,
        requireValidSources: true
    },
    {
        id: "mixed_booking_chest_breath_sweat",
        group: "D_mixed_urgent_booking_test_advice",
        message: "Tôi muốn đặt lịch xét nghiệm vì đau ngực khó thở và vã mồ hôi",
        expectFlow: "health_rag",
        expectIntentGroup: "urgent_health",
        disallowFlow: "booking",
        requireEmergencyMode: true,
        requireUrgentAnswer: true,
        disallowRecommendationPackage: true,
        requireValidSources: true
    },
    {
        id: "mixed_home_sampling_dyspnea_cyanosis",
        group: "D_mixed_urgent_booking_test_advice",
        message: "Đặt lịch lấy mẫu máu tại nhà nhưng tôi đang khó thở môi tím",
        expectFlow: "health_rag",
        expectIntentGroup: "urgent_health",
        disallowFlow: "booking",
        requireEmergencyMode: true,
        requireUrgentAnswer: true,
        disallowRecommendationPackage: true,
        requireValidSources: true
    },
    {
        id: "mixed_general_test_fever_urgent",
        group: "D_mixed_urgent_booking_test_advice",
        message: "Tôi muốn xét nghiệm tổng quát nhưng đang sốt cao lơ mơ thở nhanh",
        expectFlow: "health_rag",
        expectIntentGroup: "urgent_health",
        disallowFlow: "booking",
        requireEmergencyMode: true,
        requireUrgentAnswer: true,
        disallowRecommendationPackage: true,
        disallowSourceTerms: ["d-dimer", "ddimer"],
        requireValidSources: true
    },
    {
        id: "mixed_booking_creatinine_boundary",
        group: "D_mixed_urgent_booking_test_advice",
        message: "Tôi muốn đặt lịch nhưng creatinine cao có phải suy thận không?",
        expectFlow: "health_rag",
        disallowFlow: "booking",
        requireNoCertainDiagnosis: true,
        disallowRecommendationPackage: true,
        disallowReplyTerms: ["ban bi suy than", "chac chan suy than"],
        requireValidSources: true
    },
    {
        id: "booking_home_sampling_generic",
        group: "E_booking_reschedule_cancel",
        message: "Đặt lịch lấy mẫu máu tại nhà",
        expectFlow: "booking",
        expectIntentGroup: "booking",
        expectMissingField: "testType",
        disallowTestTypeInference: true
    },
    {
        id: "booking_general_test_tomorrow",
        group: "E_booking_reschedule_cancel",
        message: "Tôi muốn đặt lịch xét nghiệm tổng quát ngày mai",
        expectFlow: "booking",
        expectIntentGroup: "booking"
    },
    {
        id: "reschedule_missing_booking_id",
        group: "E_booking_reschedule_cancel",
        message: "Tôi muốn đổi lịch hẹn",
        expectFlow: "reschedule",
        expectMissingBookingId: true
    },
    {
        id: "cancel_missing_booking_id",
        group: "E_booking_reschedule_cancel",
        message: "Tôi muốn hủy lịch",
        expectFlow: "cancel",
        expectMissingBookingId: true
    },
    {
        id: "booking_home_sampling_with_time_address",
        group: "E_booking_reschedule_cancel",
        message: "Đặt lịch lấy mẫu máu tại nhà, 8h sáng mai, địa chỉ: 12 Nguyễn Trãi",
        expectFlow: "booking",
        expectIntentGroup: "booking",
        expectMissingField: "testType",
        disallowTestTypeInference: true
    },
    {
        id: "recommend_general_checkup",
        group: "F_recommendation_controlled",
        message: "Tôi muốn xét nghiệm tổng quát",
        expectFlow: "health_rag",
        expectIntentGroup: "test_advice",
        expectRecommendationMeta: true,
        expectRecommendationStatusAny: ["ask_more", "needs_more_context"],
        disallowRecommendedPackage: true,
        disallowRawPackageIds: true,
        expectAskMore: true
    },
    {
        id: "recommend_fatigue_tests",
        group: "F_recommendation_controlled",
        message: "Tôi hay mệt muốn biết nên xét nghiệm gì",
        expectFlow: "health_rag",
        expectIntentGroup: "test_advice",
        expectRecommendationMeta: true,
        expectRecommendationStatusAny: ["ask_more", "needs_more_context"],
        disallowRecommendedPackage: true,
        disallowRawPackageIds: true,
        expectAskMore: true
    },
    {
        id: "recommend_general_complete_live_off",
        group: "F_recommendation_controlled",
        message: "Nam 35 tuổi, hay mệt 2 tháng, muốn kiểm tra tổng quát, không đau ngực, không khó thở, không ngất",
        expectFlow: "health_rag",
        expectIntentGroup: "test_advice",
        expectRecommendationMeta: true,
        expectDecisionType: "ready_but_catalog_disabled",
        disallowRecommendedPackage: true,
        disallowRawPackageIds: true
    },
    {
        id: "recommend_kidney_live_off",
        group: "F_recommendation_controlled",
        message: "Tôi muốn kiểm tra thận, không đau ngực, không khó thở, không ngất",
        expectFlow: "health_rag",
        expectIntentGroup: "test_advice",
        expectRecommendationMeta: true,
        expectDecisionType: "ready_but_catalog_disabled",
        disallowRecommendedPackage: true,
        disallowRawPackageIds: true
    },
    {
        id: "recommend_cbc_result_boundary_no_live_package",
        group: "F_recommendation_controlled",
        message: "Tôi có kết quả CBC rồi, đọc giúp tôi bị bệnh gì",
        expectFlow: "health_rag",
        disallowFlow: "booking",
        expectRecommendationMeta: true,
        expectDecisionType: "medical_review_boundary",
        requireNoCertainDiagnosis: true,
        disallowRecommendedPackage: true,
        disallowRawPackageIds: true,
        requireValidSources: true
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

function collectSourceEntries(meta) {
    const entries = [];

    for (const chunk of Array.isArray(meta.topChunks) ? meta.topChunks : []) {
        entries.push({
            type: "topChunk",
            id: chunk.chunkId || chunk.sourceId || chunk.title || "unknown",
            title: chunk.title,
            sourceId: chunk.sourceId,
            sourceName: chunk.sourceName,
            sourceUrl: chunk.sourceUrl,
            finalUrl: chunk.finalUrl
        });
    }

    for (const citation of Array.isArray(meta.citations) ? meta.citations : []) {
        entries.push({
            type: "citation",
            id: citation.chunkId || citation.sourceId || citation.title || "unknown",
            title: citation.title,
            sourceId: citation.sourceId,
            sourceName: citation.sourceName,
            sourceUrl: citation.sourceUrl,
            finalUrl: citation.finalUrl
        });
    }

    if (meta.knowledgeItem) {
        entries.push({
            type: "knowledgeItem",
            id: meta.knowledgeItem.id || meta.knowledgeItem.title || "unknown",
            title: meta.knowledgeItem.title,
            sourceName: parseKnowledgeItemSourceName(meta.knowledgeItem.source),
            sourceUrl: meta.knowledgeItem.source
        });
    }

    return entries;
}

function parseKnowledgeItemSourceName(source) {
    const text = String(source || "").trim();

    if (!text) {
        return null;
    }

    return text.includes(" - ") ? text.split(" - ")[0].trim() : text;
}

function collectSourceText(meta) {
    return collectSourceEntries(meta)
        .flatMap((entry) => [
            entry.title,
            entry.sourceId,
            entry.sourceName,
            entry.sourceUrl,
            entry.finalUrl
        ])
        .filter(Boolean)
        .join(" ");
}

function sourceNameFailures(meta, requireAtLeastOne) {
    const failures = [];
    const entries = collectSourceEntries(meta);

    if (requireAtLeastOne && entries.length === 0) {
        failures.push("no source entries returned");
        return failures;
    }

    for (const entry of entries) {
        const name = String(entry.sourceName || "").trim();
        const normalizedName = normalize(name);

        if (!name || normalizedName === "undefined" || normalizedName === "null") {
            failures.push(`${entry.type} ${entry.id} has invalid sourceName=${name || "<empty>"}`);
        }
    }

    return failures;
}

function hasRecommendedPackage(meta) {
    const recommendation = meta.recommendation || null;

    return Boolean(
        recommendation?.recommendedPackage ||
        recommendation?.recommendedPackageId ||
        recommendation?.candidatePackages?.some((item) => item?.recommendedPackage) ||
        recommendation?.packageDecision?.recommendedPackage
    );
}

function getRecommendationStatus(recommendation) {
    return recommendation?.status || recommendation?.decisionType || null;
}

function getMissingFields(data, meta) {
    return [
        ...new Set([
            ...(Array.isArray(meta.missingFields) ? meta.missingFields : []),
            ...(Array.isArray(data.booking?.missingFields) ? data.booking.missingFields : []),
            ...(Array.isArray(data.missingFields) ? data.missingFields : [])
        ])
    ];
}

function hasCertainDiagnosisLanguage(reply) {
    const text = normalize(reply);
    const certainDiagnosisTerms = [
        "ban bi ung thu mau",
        "ban bi suy than",
        "ban bi benh gan nang",
        "chac chan bi",
        "chac chan la",
        "chan doan la",
        "ket luan la",
        "mac benh "
    ];

    return certainDiagnosisTerms.some((term) => text.includes(term));
}

function hasRawPackageId(reply) {
    return /pkg_[a-z0-9_]+/i.test(String(reply || ""));
}

function asksForMoreInfo(reply) {
    const text = normalize(reply);

    return (
        text.includes("can them") ||
        text.includes("them thong tin") ||
        text.includes("bao nhieu tuoi") ||
        text.includes("trieu chung") ||
        text.includes("muc tieu")
    );
}

function mentionsBookingId(reply) {
    const text = normalize(reply);

    return (
        text.includes("ma lich") ||
        text.includes("ma dat lich") ||
        text.includes("ma booking") ||
        text.includes("booking id") ||
        text.includes("ma hen")
    );
}

function checkCase(testCase, payload) {
    const failures = [];
    const data = payload.data || {};
    const meta = data.meta || {};
    const reply = data.reply || "";
    const sourceText = collectSourceText(meta);
    const recommendation = meta.recommendation || null;
    const recommendationStatus = getRecommendationStatus(recommendation);
    const missingFields = getMissingFields(data, meta);
    const bookingDraft = data.booking?.draft || {};

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
    if (
        testCase.allowIntentGroups &&
        meta.intentGroup &&
        !testCase.allowIntentGroups.includes(meta.intentGroup)
    ) {
        failures.push(`unexpected intentGroup=${meta.intentGroup}`);
    }
    if (testCase.requireEmergencyMode && meta.primaryMode !== "emergency_or_urgent" && meta.urgencyLevel !== "emergency") {
        failures.push(`expected emergency mode, got primaryMode=${meta.primaryMode}, urgencyLevel=${meta.urgencyLevel}`);
    }
    if (testCase.requireUrgentAnswer && !includesAny(reply, ["cap cuu", "khan cap", "co so y te", "ho tro y te ngay"])) {
        failures.push("urgent reply missing emergency/care-facility language");
    }
    if (testCase.requireNoCertainDiagnosis && hasCertainDiagnosisLanguage(reply)) {
        failures.push("reply contains certain diagnosis language");
    }
    if (testCase.disallowReplyTerms && includesAny(reply, testCase.disallowReplyTerms)) {
        failures.push(`reply contains disallowed terms: ${testCase.disallowReplyTerms.join(", ")}`);
    }
    if (includesAny(reply, RAW_SOURCE_HEADING_TERMS)) {
        failures.push("reply contains raw English source heading leakage");
    }
    if (testCase.disallowSourceTerms && includesAny(sourceText, testCase.disallowSourceTerms)) {
        failures.push(`sources contain disallowed terms: ${testCase.disallowSourceTerms.join(", ")}`);
    }
    failures.push(...sourceNameFailures(meta, Boolean(testCase.requireValidSources)));
    if (testCase.disallowRecommendationPackage && hasRecommendedPackage(meta)) {
        failures.push("unexpected recommendedPackage/package returned");
    }
    if (testCase.disallowRecommendedPackage && hasRecommendedPackage(meta)) {
        failures.push("recommendedPackage should be null when live gate is off");
    }
    if (testCase.expectRecommendationMeta && !recommendation) {
        failures.push("expected recommendation metadata");
    }
    if (
        testCase.expectRecommendationStatusAny &&
        !testCase.expectRecommendationStatusAny.includes(recommendationStatus)
    ) {
        failures.push(`expected recommendation status one of ${testCase.expectRecommendationStatusAny.join(", ")}, got ${recommendationStatus}`);
    }
    if (testCase.expectDecisionType && recommendation?.decisionType !== testCase.expectDecisionType) {
        failures.push(`expected decisionType=${testCase.expectDecisionType}, got ${recommendation?.decisionType}`);
    }
    if (testCase.disallowRawPackageIds && hasRawPackageId(reply)) {
        failures.push("reply exposes raw package ID");
    }
    if (testCase.expectAskMore && !asksForMoreInfo(reply)) {
        failures.push("reply does not ask for more context");
    }
    if (testCase.expectMissingField && !missingFields.includes(testCase.expectMissingField)) {
        failures.push(`missingFields does not include ${testCase.expectMissingField}`);
    }
    if (testCase.disallowTestTypeInference && (bookingDraft.testType || meta.extractedSlots?.testType)) {
        failures.push(`generic booking inferred testType=${bookingDraft.testType || meta.extractedSlots?.testType}`);
    }
    if (testCase.expectMissingBookingId && !mentionsBookingId(reply) && !missingFields.includes("bookingId")) {
        failures.push("reschedule/cancel reply does not ask for booking id");
    }

    return failures;
}

async function runCase(testCase, index) {
    const payload = await postJson(API_URL, {
        message: testCase.message,
        sessionId: `smoke_controlled_runtime_regression_4d_${index + 1}_${testCase.id}_${Date.now()}`
    });
    const failures = checkCase(testCase, payload);
    const data = payload.data || {};
    const meta = data.meta || {};
    const recommendation = meta.recommendation || null;

    return {
        id: testCase.id,
        group: testCase.group,
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
        recommendationStatus: recommendation?.status || null,
        decisionType: recommendation?.decisionType || null,
        recommendedPackage: recommendation?.recommendedPackage || null,
        sourceAlignment: meta.debug?.sourceAlignment || null,
        answerPreview: String(data.reply || "").slice(0, 280)
    };
}

function printEnvNote() {
    console.log("Controlled Runtime Regression 4D smoke");
    console.log(`POST ${API_URL}`);
    console.log("Expected server-side env/flags:");
    console.log("  HOMELAB_SEMANTIC_RETRIEVAL_ENABLED=true");
    console.log("  HOMELAB_SEMANTIC_BRIDGE_MODE=server");
    console.log("  HOMELAB_SEMANTIC_RETRIEVER_VERSION=v1_4");
    console.log("  HOMELAB_RECOMMENDATION_RUNTIME_ENABLED=true");
    console.log("  HOMELAB_RECOMMENDATION_LIVE_PACKAGE_ENABLED is unset/false");
    console.log("  Retriever v1.4 remains controlled-only; no default/global promotion is expected.");
    console.log("");
}

function printRow(row) {
    console.log(`${row.pass ? "PASS" : "FAIL"} ${row.group} ${row.id}`);
    console.log(`  message: ${row.message}`);
    console.log(`  flow: ${row.flow}`);
    console.log(`  action: ${row.action}`);
    console.log(`  intentGroup: ${row.intentGroup}`);
    console.log(`  primaryMode: ${row.primaryMode}`);
    console.log(`  urgencyLevel: ${row.urgencyLevel}`);
    console.log(`  selectedRetrievalMode: ${row.selectedRetrievalMode}`);
    console.log(`  retrieverVersion: ${row.retrieverVersion}`);
    console.log(`  recommendationStatus: ${row.recommendationStatus}`);
    console.log(`  decisionType: ${row.decisionType}`);
    console.log(`  recommendedPackage: ${JSON.stringify(row.recommendedPackage)}`);
    console.log(`  sourceAlignment: ${JSON.stringify(row.sourceAlignment)}`);
    console.log(`  failures: ${JSON.stringify(row.failures)}`);
    console.log(`  answerPreview: ${row.answerPreview}`);
}

async function main() {
    printEnvNote();

    const rows = [];
    for (let index = 0; index < CASES.length; index += 1) {
        try {
            rows.push(await runCase(CASES[index], index));
        } catch (error) {
            rows.push({
                id: CASES[index].id,
                group: CASES[index].group,
                message: CASES[index].message,
                pass: false,
                failures: [error.message],
                flow: null,
                action: null,
                intentGroup: null,
                primaryMode: null,
                urgencyLevel: null,
                selectedRetrievalMode: null,
                retrieverVersion: null,
                recommendationStatus: null,
                decisionType: null,
                recommendedPackage: null,
                sourceAlignment: null,
                answerPreview: ""
            });
        }

        printRow(rows[rows.length - 1]);
    }

    const passed = rows.filter((row) => row.pass).length;
    const failed = rows.length - passed;
    const byGroup = rows.reduce((accumulator, row) => {
        const group = row.group || "unknown";
        accumulator[group] = accumulator[group] || { total: 0, passed: 0, failed: 0 };
        accumulator[group].total += 1;
        accumulator[group][row.pass ? "passed" : "failed"] += 1;
        return accumulator;
    }, {});

    console.log("");
    console.log(`SUMMARY ${JSON.stringify({
        smoke: "controlled_runtime_regression_4d",
        apiUrl: API_URL,
        total: rows.length,
        passed,
        failed,
        byGroup
    })}`);

    process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
