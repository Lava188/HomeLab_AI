const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "../.env") });

process.env.HOMELAB_SEMANTIC_ROUTER_GATE = "false";
process.env.HOMELAB_SEMANTIC_RETRIEVAL_ENABLED = "false";
process.env.HOMELAB_RETRIEVER_VERSION =
    process.env.HOMELAB_RETRIEVER_VERSION || "v1_3";
process.env.HOMELAB_RETRIEVER_FALLBACK_VERSION =
    process.env.HOMELAB_RETRIEVER_FALLBACK_VERSION || "v1_2";

const { routeMessage } = require("../src/services/router.service");

const CASES = [
    {
        id: "flag_off_test_advice_no_recommendation",
        flagEnabled: false,
        message: "toi muon xet nghiem tong quat",
        validate: ({ result, recommendation }) => [
            result.flow === "health_rag",
            result.meta?.intentGroup === "test_advice",
            !recommendation
        ]
    },
    {
        id: "flag_on_general_checkup_ask_more",
        flagEnabled: true,
        message: "toi muon xet nghiem tong quat",
        validate: ({ result, recommendation }) => [
            result.flow === "health_rag",
            result.meta?.intentGroup === "test_advice",
            recommendation?.status === "ask_more",
            hasQuestion(recommendation, "chest_pain_present"),
            !hasRecommendedPackage(recommendation)
        ]
    },
    {
        id: "flag_on_fatigue_ask_more",
        flagEnabled: true,
        message: "toi hay met muon biet nen xet nghiem gi",
        validate: ({ result, recommendation }) => [
            result.flow === "health_rag",
            result.meta?.intentGroup === "test_advice",
            recommendation?.status === "ask_more",
            hasQuestion(recommendation, "recommendation_goal"),
            hasQuestion(recommendation, "symptom_duration"),
            !hasRecommendedPackage(recommendation)
        ]
    },
    {
        id: "general_checkup_complete_catalog_disabled",
        flagEnabled: true,
        message:
            "nam 35 tuoi, hay met 2 thang, muon kiem tra tong quat, khong dau nguc, khong kho tho, khong ngat",
        validate: ({ result, recommendation }) => [
            result.flow === "health_rag",
            result.meta?.intentGroup === "test_advice",
            recommendation?.status === "do_not_recommend",
            recommendation?.decisionType === "ready_but_catalog_disabled",
            recommendation?.extractedSlots?.age === 35,
            recommendation?.extractedSlots?.sex === "male",
            includesCandidate(recommendation, "pkg_anemia_infection_basic_v1"),
            recommendation?.packageDecision?.catalogRuntimeEnabled === false,
            !hasRecommendedPackage(recommendation)
        ]
    },
    {
        id: "anemia_cbc_complete_catalog_disabled",
        flagEnabled: true,
        message:
            "nu 28 tuoi, hay chong mat va met 1 thang, muon kiem tra thieu mau, khong dau nguc, khong kho tho, khong ngat",
        validate: ({ result, recommendation }) => [
            result.flow === "health_rag",
            result.meta?.intentGroup === "test_advice",
            recommendation?.status === "do_not_recommend",
            recommendation?.decisionType === "ready_but_catalog_disabled",
            recommendation?.extractedSlots?.sex === "female",
            recommendation?.extractedSlots?.recommendation_goal ===
                "anemia_infection_screening",
            includesCandidate(recommendation, "pkg_anemia_infection_basic_v1"),
            !hasRecommendedPackage(recommendation)
        ]
    },
    {
        id: "kidney_complete_catalog_disabled",
        flagEnabled: true,
        message:
            "toi muon kiem tra than, khong dau nguc, khong kho tho, khong ngat",
        validate: ({ result, recommendation }) => [
            result.flow === "health_rag",
            result.meta?.intentGroup === "test_advice",
            recommendation?.status === "do_not_recommend",
            recommendation?.decisionType === "ready_but_catalog_disabled",
            recommendation?.extractedSlots?.recommendation_goal ===
                "kidney_function_screening",
            includesCandidate(recommendation, "pkg_kidney_function_basic_v1"),
            !hasRecommendedPackage(recommendation)
        ]
    },
    {
        id: "urgent_chest_shortness_no_recommendation",
        flagEnabled: true,
        message: "toi bi dau nguc kho tho va va mo hoi",
        validate: ({ result, recommendation }) => [
            result.flow === "health_rag",
            result.meta?.intentGroup === "urgent_health",
            !recommendation,
            !hasRecommendedPackage(recommendation)
        ]
    },
    {
        id: "mixed_booking_urgent_no_recommendation",
        flagEnabled: true,
        message:
            "toi muon dat lich xet nghiem vi dau nguc kho tho va va mo hoi",
        validate: ({ result, recommendation }) => [
            result.flow === "health_rag",
            result.meta?.intentGroup === "urgent_health",
            !recommendation,
            !hasRecommendedPackage(recommendation)
        ]
    },
    {
        id: "booking_no_recommendation",
        flagEnabled: true,
        message: "toi muon dat lich xet nghiem tong quat ngay mai",
        validate: ({ result, recommendation }) => [
            result.flow === "booking",
            result.meta?.intentGroup === "booking",
            !recommendation,
            !hasRecommendedPackage(recommendation)
        ]
    },
    {
        id: "result_interpretation_boundary_no_package",
        flagEnabled: true,
        message: "toi co ket qua CBC roi, doc giup toi bi benh gi",
        validate: ({ result, recommendation }) => [
            result.flow !== "booking",
            !hasRecommendedPackage(recommendation),
            !hasDiagnosisLanguage(result.reply)
        ]
    }
];

function hasQuestion(recommendation, slotId) {
    return (recommendation?.nextQuestions || []).some(
        (question) => question.slotId === slotId
    );
}

function hasRecommendedPackage(recommendation) {
    return Boolean(recommendation?.recommendedPackage);
}

function includesCandidate(recommendation, packageId) {
    return (recommendation?.packageDecision?.candidatePackageIds || []).includes(
        packageId
    );
}

function hasDiagnosisLanguage(reply) {
    const text = String(reply || "").toLowerCase();
    return [
        "ban bi ",
        "chac chan la",
        "chan doan la",
        "mac benh "
    ].some((phrase) => text.includes(phrase));
}

async function runCase(testCase, index) {
    process.env.HOMELAB_RECOMMENDATION_RUNTIME_ENABLED = testCase.flagEnabled
        ? "true"
        : "false";

    const result = await routeMessage({
        message: testCase.message,
        sessionId: `recommendation_runtime_3b_${index + 1}`
    });
    const recommendation = result.meta?.recommendation || null;
    const checks = testCase.validate({ result, recommendation });
    const pass = checks.every(Boolean);

    return {
        id: testCase.id,
        pass,
        flagEnabled: testCase.flagEnabled,
        flow: result.flow,
        action: result.action,
        intentGroup: result.meta?.intentGroup || null,
        recommendationStatus: recommendation?.status || null,
        decisionType: recommendation?.decisionType || null,
        confidence: recommendation?.confidence || null,
        recommendedPackageId:
            recommendation?.recommendedPackage?.packageId || null,
        candidatePackageIds:
            recommendation?.packageDecision?.candidatePackageIds || [],
        catalogRuntimeEnabled:
            recommendation?.packageDecision?.catalogRuntimeEnabled ?? null,
        missingSlots: recommendation?.missingSlots || [],
        failedChecks: checks
            .map((value, checkIndex) => (value ? null : checkIndex + 1))
            .filter(Boolean),
        replyPreview: String(result.reply || "").slice(0, 220)
    };
}

async function main() {
    const rows = [];

    for (let index = 0; index < CASES.length; index += 1) {
        rows.push(await runCase(CASES[index], index));
    }

    const passed = rows.filter((row) => row.pass).length;
    const failed = rows.length - passed;
    const catalogDisabledRows = rows.filter(
        (row) => row.decisionType === "ready_but_catalog_disabled"
    );
    const summary = {
        smokeName: "recommendation_runtime_3b",
        total: rows.length,
        passed,
        failed,
        defaultOffVerified:
            rows.find((row) => row.id === "flag_off_test_advice_no_recommendation")
                ?.recommendationStatus === null,
        catalogRuntimeDisabledRespected:
            catalogDisabledRows.length >= 3 &&
            catalogDisabledRows.every(
                (row) =>
                    row.catalogRuntimeEnabled === false &&
                    row.recommendedPackageId === null
            ),
        noRecommendationForBookingOrUrgent: rows
            .filter((row) =>
                [
                    "urgent_chest_shortness_no_recommendation",
                    "mixed_booking_urgent_no_recommendation",
                    "booking_no_recommendation"
                ].includes(row.id)
            )
            .every((row) => row.recommendationStatus === null),
        rows
    };

    console.log(JSON.stringify(summary, null, 2));
    process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
