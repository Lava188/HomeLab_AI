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
        id: "flag_off_general_checkup",
        flagEnabled: false,
        message: "toi muon xet nghiem tong quat",
        validate: ({ result, recommendation }) => [
            result.flow === "health_rag",
            result.meta?.intentGroup === "test_advice",
            !recommendation,
            !hasRecommendedPackage(recommendation)
        ]
    },
    {
        id: "flag_on_general_checkup",
        flagEnabled: true,
        message: "toi muon xet nghiem tong quat",
        validate: ({ result, recommendation }) => [
            result.flow === "health_rag",
            result.meta?.intentGroup === "test_advice",
            ["ask_more", "do_not_recommend"].includes(recommendation?.status),
            !hasRecommendedPackage(recommendation)
        ]
    },
    {
        id: "flag_on_fatigue_test_advice",
        flagEnabled: true,
        message: "toi hay met muon biet nen xet nghiem gi",
        validate: ({ result, recommendation }) => [
            result.flow === "health_rag",
            result.meta?.intentGroup === "test_advice",
            recommendation?.status === "ask_more",
            !hasRecommendedPackage(recommendation)
        ]
    },
    {
        id: "flag_on_general_checkup_negatives",
        flagEnabled: true,
        message:
            "toi muon xet nghiem tong quat, khong dau nguc, khong kho tho, khong ngat",
        validate: ({ result, recommendation }) => [
            result.flow === "health_rag",
            result.meta?.intentGroup === "test_advice",
            recommendation?.status === "do_not_recommend",
            recommendation?.packageDecision?.catalogRuntimeEnabled === false,
            !hasRecommendedPackage(recommendation)
        ]
    },
    {
        id: "flag_on_kidney_negatives",
        flagEnabled: true,
        message:
            "toi muon kiem tra than, khong dau nguc, khong kho tho, khong ngat",
        validate: ({ result, recommendation }) => [
            result.flow === "health_rag",
            result.meta?.intentGroup === "test_advice",
            recommendation?.status === "do_not_recommend",
            recommendation?.packageDecision?.catalogRuntimeEnabled === false,
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
        id: "cbc_result_boundary_no_package",
        flagEnabled: true,
        message: "toi co ket qua CBC roi, doc giup toi bi benh gi",
        validate: ({ result, recommendation }) => [
            result.flow !== "booking",
            !hasRecommendedPackage(recommendation),
            !hasDiagnosisLanguage(result.reply)
        ]
    }
];

function hasRecommendedPackage(recommendation) {
    return Boolean(recommendation?.recommendedPackage);
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
        sessionId: `recommendation_runtime_3a_${index + 1}`
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
        replyMode: recommendation?.replyMode || null,
        recommendedPackageId:
            recommendation?.recommendedPackage?.packageId || null,
        catalogRuntimeEnabled:
            recommendation?.packageDecision?.catalogRuntimeEnabled ?? null,
        selectedRetrievalMode: result.meta?.selectedRetrievalMode || null,
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
    const summary = {
        smokeName: "recommendation_runtime_3a",
        total: rows.length,
        passed,
        failed,
        defaultOffVerified:
            rows.find((row) => row.id === "flag_off_general_checkup")
                ?.recommendationStatus === null,
        catalogRuntimeDisabledRespected: rows
            .filter((row) =>
                [
                    "flag_on_general_checkup_negatives",
                    "flag_on_kidney_negatives"
                ].includes(row.id)
            )
            .every(
                (row) =>
                    row.recommendationStatus === "do_not_recommend" &&
                    row.catalogRuntimeEnabled === false &&
                    row.recommendedPackageId === null
            ),
        rows
    };

    console.log(JSON.stringify(summary, null, 2));
    process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
