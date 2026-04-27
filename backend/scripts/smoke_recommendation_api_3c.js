const DEFAULT_BASE_URL = "http://localhost:5000";
const DEFAULT_CHAT_PATH = "/api/chat";

const BASE_URL = (process.env.HOMELAB_API_BASE_URL || DEFAULT_BASE_URL).replace(
    /\/$/,
    ""
);
const CHAT_PATH = process.env.HOMELAB_API_CHAT_PATH || DEFAULT_CHAT_PATH;
const CHAT_URL = `${BASE_URL}${CHAT_PATH.startsWith("/") ? "" : "/"}${CHAT_PATH}`;

const REQUIRED_SERVER_ENV = {
    HOMELAB_RECOMMENDATION_RUNTIME_ENABLED: "true",
    HOMELAB_SEMANTIC_BRIDGE_MODE: "server",
    HOMELAB_SEMANTIC_BRIDGE_URL: "http://127.0.0.1:8765",
    HOMELAB_SEMANTIC_ROUTER_GATE: "true",
    HOMELAB_SEMANTIC_RETRIEVAL_ENABLED: "true"
};

const CASES = [
    {
        id: "general_checkup_ask_more",
        query: "tôi muốn xét nghiệm tổng quát",
        validate: ({ data, recommendation }) => [
            data.flow === "health_rag",
            data.meta?.intentGroup === "test_advice",
            Boolean(recommendation),
            ["ask_more", "needs_more_context"].includes(
                recommendation?.status || recommendation?.decisionType
            ),
            !hasRecommendedPackage(recommendation)
        ]
    },
    {
        id: "fatigue_ask_more",
        query: "tôi hay mệt muốn biết nên xét nghiệm gì",
        validate: ({ data, recommendation }) => [
            data.flow === "health_rag",
            data.meta?.intentGroup === "test_advice",
            Boolean(recommendation),
            recommendation?.status === "ask_more",
            !hasRecommendedPackage(recommendation)
        ]
    },
    {
        id: "general_checkup_complete_catalog_disabled",
        query:
            "nam 35 tuổi, hay mệt 2 tháng, muốn kiểm tra tổng quát, không đau ngực, không khó thở, không ngất",
        validate: ({ data, recommendation, candidatePackageIds }) => [
            data.flow === "health_rag",
            data.meta?.intentGroup === "test_advice",
            Boolean(recommendation),
            Boolean(recommendation?.extractedSlots),
            candidatePackageIds.length > 0,
            recommendation?.decisionType === "ready_but_catalog_disabled",
            !hasRecommendedPackage(recommendation)
        ]
    },
    {
        id: "anemia_cbc_catalog_disabled",
        query:
            "nữ 28 tuổi, hay chóng mặt và mệt, muốn kiểm tra thiếu máu, không đau ngực, không khó thở, không ngất",
        validate: ({ data, recommendation, candidatePackageIds }) => [
            data.flow === "health_rag",
            data.meta?.intentGroup === "test_advice",
            Boolean(recommendation),
            candidatePackageIds.includes("pkg_anemia_infection_basic_v1"),
            !hasRecommendedPackage(recommendation)
        ]
    },
    {
        id: "kidney_catalog_disabled",
        query: "tôi muốn kiểm tra thận, không đau ngực, không khó thở, không ngất",
        validate: ({ data, recommendation, candidatePackageIds }) => [
            data.flow === "health_rag",
            data.meta?.intentGroup === "test_advice",
            Boolean(recommendation),
            candidatePackageIds.includes("pkg_kidney_function_basic_v1"),
            !hasRecommendedPackage(recommendation)
        ]
    },
    {
        id: "booking_no_recommendation",
        query: "tôi muốn đặt lịch xét nghiệm tổng quát ngày mai",
        validate: ({ data, recommendation }) => [
            data.flow === "booking",
            !recommendation
        ]
    },
    {
        id: "mixed_booking_urgent_no_recommendation",
        query: "tôi muốn đặt lịch xét nghiệm vì đau ngực khó thở và vã mồ hôi",
        validate: ({ data, recommendation }) => [
            data.flow === "health_rag",
            data.meta?.intentGroup === "urgent_health",
            !recommendation
        ]
    },
    {
        id: "urgent_no_recommendation",
        query: "đau ngực khó thở và vã mồ hôi",
        validate: ({ data, recommendation }) => [
            data.flow === "health_rag",
            data.meta?.intentGroup === "urgent_health",
            !recommendation
        ]
    },
    {
        id: "result_boundary_no_package",
        query: "tôi có kết quả CBC rồi, đọc giúp tôi bị bệnh gì",
        validate: ({ data, recommendation }) => [
            data.flow !== "booking",
            !hasRecommendedPackage(recommendation),
            !hasDiagnosisLanguage(data.reply)
        ]
    }
];

function hasRecommendedPackage(recommendation) {
    return Boolean(recommendation?.recommendedPackage);
}

function getCandidatePackageIds(recommendation) {
    const fromIds = recommendation?.packageDecision?.candidatePackageIds;
    if (Array.isArray(fromIds)) {
        return fromIds;
    }

    const fromPackages = recommendation?.packageDecision?.candidatePackages;
    if (Array.isArray(fromPackages)) {
        return fromPackages
            .map((packageItem) => packageItem?.packageId)
            .filter(Boolean);
    }

    return [];
}

function unwrapResponse(payload) {
    if (payload && typeof payload === "object" && "data" in payload) {
        return payload.data;
    }

    return payload;
}

function hasDiagnosisLanguage(reply) {
    const text = String(reply || "").toLowerCase();
    return [
        "bạn bị ",
        "ban bi ",
        "chắc chắn là",
        "chac chan la",
        "chẩn đoán là",
        "chan doan la",
        "mắc bệnh ",
        "mac benh "
    ].some((phrase) => text.includes(phrase));
}

async function postChat(query, index) {
    const response = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            message: query,
            sessionId: `recommendation_api_3c_${index + 1}_${Date.now()}`
        })
    });

    const text = await response.text();
    let payload = null;
    try {
        payload = text ? JSON.parse(text) : null;
    } catch (error) {
        throw new Error(`Non-JSON response ${response.status}: ${text}`);
    }

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${JSON.stringify(payload)}`);
    }

    return unwrapResponse(payload);
}

async function runCase(testCase, index) {
    try {
        const data = await postChat(testCase.query, index);
        const recommendation = data?.meta?.recommendation || null;
        const candidatePackageIds = getCandidatePackageIds(recommendation);
        const checks = testCase.validate({
            data,
            recommendation,
            candidatePackageIds
        });
        const pass = checks.every(Boolean);

        return {
            id: testCase.id,
            query: testCase.query,
            flow: data?.flow || null,
            intentGroup: data?.meta?.intentGroup || null,
            selectedRetrievalMode: data?.meta?.selectedRetrievalMode || null,
            recommendationStatus: recommendation?.status || null,
            decisionType: recommendation?.decisionType || null,
            recommendedPackage: recommendation?.recommendedPackage || null,
            candidatePackageIds,
            pass,
            failedChecks: checks
                .map((value, checkIndex) => (value ? null : checkIndex + 1))
                .filter(Boolean)
        };
    } catch (error) {
        return {
            id: testCase.id,
            query: testCase.query,
            flow: null,
            intentGroup: null,
            selectedRetrievalMode: null,
            recommendationStatus: null,
            decisionType: null,
            recommendedPackage: null,
            candidatePackageIds: [],
            pass: false,
            error: error.message
        };
    }
}

function printEnvNote() {
    console.log("Recommendation API 3C smoke");
    console.log(`POST ${CHAT_URL}`);
    console.log("Expected server-side env:");
    for (const [key, value] of Object.entries(REQUIRED_SERVER_ENV)) {
        console.log(`  ${key}=${value}`);
    }
    console.log(
        "Flag-off regression: restart backend with HOMELAB_RECOMMENDATION_RUNTIME_ENABLED=false and rerun this script; test_advice rows should have recommendationStatus=null."
    );
    console.log("");
}

function printRow(row) {
    console.log(`${row.pass ? "PASS" : "FAIL"} ${row.id}`);
    console.log(`  query: ${row.query}`);
    console.log(`  flow: ${row.flow}`);
    console.log(`  intentGroup: ${row.intentGroup}`);
    console.log(`  selectedRetrievalMode: ${row.selectedRetrievalMode}`);
    console.log(`  recommendationStatus: ${row.recommendationStatus}`);
    console.log(`  decisionType: ${row.decisionType}`);
    console.log(
        `  recommendedPackage: ${JSON.stringify(row.recommendedPackage)}`
    );
    console.log(
        `  candidatePackageIds: ${JSON.stringify(row.candidatePackageIds)}`
    );
    if (row.failedChecks?.length) {
        console.log(`  failedChecks: ${row.failedChecks.join(",")}`);
    }
    if (row.error) {
        console.log(`  error: ${row.error}`);
    }
}

async function main() {
    printEnvNote();

    const rows = [];
    for (let index = 0; index < CASES.length; index += 1) {
        const row = await runCase(CASES[index], index);
        rows.push(row);
        printRow(row);
    }

    const passed = rows.filter((row) => row.pass).length;
    const failed = rows.length - passed;
    const summary = {
        total: rows.length,
        passed,
        failed,
        testAdviceHasRecommendation: rows
            .filter((row) => row.intentGroup === "test_advice")
            .every((row) => Boolean(row.recommendationStatus)),
        bookingUrgentNoRecommendation: rows
            .filter((row) =>
                row.flow === "booking" || row.intentGroup === "urgent_health"
            )
            .every((row) => !row.recommendationStatus),
        catalogDisabledKeepsPackageNull: rows.every(
            (row) => row.recommendedPackage === null
        )
    };

    console.log("");
    console.log(`SUMMARY ${JSON.stringify(summary)}`);
    process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
