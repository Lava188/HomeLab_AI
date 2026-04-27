const BASE_URL = (process.env.HOMELAB_API_BASE_URL || "http://localhost:5000")
    .replace(/\/$/, "");
const CHAT_URL = `${BASE_URL}/api/chat`;

const EXPECTED_ENV = {
    HOMELAB_RECOMMENDATION_RUNTIME_ENABLED: "false",
    HOMELAB_SEMANTIC_BRIDGE_MODE: "server",
    HOMELAB_SEMANTIC_BRIDGE_URL: "http://127.0.0.1:8765",
    HOMELAB_SEMANTIC_ROUTER_GATE: "true",
    HOMELAB_SEMANTIC_RETRIEVAL_ENABLED: "true"
};

const CASES = [
    {
        id: "general_checkup_flag_off",
        query: "tôi muốn xét nghiệm tổng quát",
        validate: ({ data, recommendation, answer, candidatePackageIds }) => [
            data.flow === "health_rag",
            data.meta?.intentGroup === "test_advice",
            !recommendation,
            candidatePackageIds.length === 0,
            !hasRecommendationUx(answer),
            !containsRawPackageId(answer)
        ]
    },
    {
        id: "fatigue_flag_off",
        query: "tôi hay mệt muốn biết nên xét nghiệm gì",
        validate: ({ data, recommendation, answer, candidatePackageIds }) => [
            data.flow === "health_rag",
            data.meta?.intentGroup === "test_advice",
            !recommendation,
            candidatePackageIds.length === 0,
            !hasRecommendationUx(answer),
            !containsRawPackageId(answer)
        ]
    },
    {
        id: "kidney_flag_off",
        query: "tôi muốn kiểm tra thận, không đau ngực, không khó thở, không ngất",
        validate: ({ data, recommendation, answer, candidatePackageIds }) => [
            data.flow === "health_rag",
            data.meta?.intentGroup === "test_advice",
            !recommendation,
            candidatePackageIds.length === 0,
            !hasRecommendationUx(answer),
            !containsRawPackageId(answer)
        ]
    },
    {
        id: "result_boundary_flag_off",
        query: "tôi có kết quả CBC rồi, đọc giúp tôi bị bệnh gì",
        validate: ({ data, recommendation, answer, candidatePackageIds }) => [
            data.flow === "health_rag",
            !recommendation,
            candidatePackageIds.length === 0,
            !hasRecommendationUx(answer),
            !containsRawPackageId(answer)
        ]
    },
    {
        id: "booking_flag_off",
        query: "tôi muốn đặt lịch xét nghiệm tổng quát ngày mai",
        validate: ({ data, recommendation, answer, candidatePackageIds }) => [
            data.flow === "booking",
            !recommendation,
            candidatePackageIds.length === 0,
            !hasRecommendationUx(answer),
            !containsRawPackageId(answer)
        ]
    },
    {
        id: "urgent_flag_off",
        query: "đau ngực khó thở và vã mồ hôi",
        validate: ({ data, recommendation, answer, candidatePackageIds }) => [
            data.flow === "health_rag",
            data.meta?.intentGroup === "urgent_health",
            !recommendation,
            candidatePackageIds.length === 0,
            !hasRecommendationUx(answer),
            !containsRawPackageId(answer)
        ]
    }
];

function getCandidatePackageIds(recommendation) {
    const ids = recommendation?.packageDecision?.candidatePackageIds;
    return Array.isArray(ids) ? ids : [];
}

function hasRecommendationUx(answer) {
    const text = normalize(answer);
    return (
        text.includes("de tu van huong xet nghiem an toan hon") ||
        text.includes("homelab can them mot vai thong tin") ||
        text.includes("dua tren thong tin hien co, homelab co the goi y huong xet nghiem") ||
        text.includes("cac huong co the trao doi them gom")
    );
}

function containsRawPackageId(answer) {
    return /pkg_[a-z0-9_]+/i.test(String(answer || ""));
}

function normalize(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/Đ/g, "D")
        .toLowerCase();
}

async function postChat(query, index) {
    const response = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            message: query,
            sessionId: `recommendation_flag_off_3e_${index + 1}_${Date.now()}`
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

    return payload?.data || payload;
}

async function runCase(testCase, index) {
    try {
        const data = await postChat(testCase.query, index);
        const recommendation = data?.meta?.recommendation || null;
        const candidatePackageIds = getCandidatePackageIds(recommendation);
        const answer = String(data?.reply || "");
        const checks = testCase.validate({
            data,
            recommendation,
            answer,
            candidatePackageIds
        });
        const pass = checks.every(Boolean);

        return {
            id: testCase.id,
            query: testCase.query,
            flow: data?.flow || null,
            intentGroup: data?.meta?.intentGroup || null,
            selectedRetrievalMode: data?.meta?.selectedRetrievalMode || null,
            hasRecommendationMeta: Boolean(recommendation),
            recommendationStatus: recommendation?.status || null,
            decisionType: recommendation?.decisionType || null,
            recommendedPackage: recommendation?.recommendedPackage || null,
            candidatePackageIds,
            failedChecks: checks
                .map((value, checkIndex) => (value ? null : checkIndex + 1))
                .filter(Boolean),
            answerPreview: answer.slice(0, 260),
            pass
        };
    } catch (error) {
        return {
            id: testCase.id,
            query: testCase.query,
            flow: null,
            intentGroup: null,
            selectedRetrievalMode: null,
            hasRecommendationMeta: false,
            recommendationStatus: null,
            decisionType: null,
            recommendedPackage: null,
            candidatePackageIds: [],
            failedChecks: ["request"],
            answerPreview: "",
            error: error.message,
            pass: false
        };
    }
}

function printExpectedEnv() {
    console.log("Recommendation Flag-off 3E smoke");
    console.log(`POST ${CHAT_URL}`);
    console.log("Expected server-side env:");
    for (const [key, value] of Object.entries(EXPECTED_ENV)) {
        console.log(`  ${key}=${value}`);
    }
    console.log("");
}

function printRow(row) {
    console.log(`${row.pass ? "PASS" : "FAIL"} ${row.id}`);
    console.log(`  query: ${row.query}`);
    console.log(`  flow: ${row.flow}`);
    console.log(`  intentGroup: ${row.intentGroup}`);
    console.log(`  selectedRetrievalMode: ${row.selectedRetrievalMode}`);
    console.log(`  hasRecommendationMeta: ${row.hasRecommendationMeta}`);
    console.log(`  recommendationStatus: ${row.recommendationStatus}`);
    console.log(`  decisionType: ${row.decisionType}`);
    console.log(`  recommendedPackage: ${JSON.stringify(row.recommendedPackage)}`);
    console.log(`  candidatePackageIds: ${JSON.stringify(row.candidatePackageIds)}`);
    console.log(`  failedChecks: ${JSON.stringify(row.failedChecks)}`);
    console.log(`  answerPreview: ${row.answerPreview}`);
    if (row.error) {
        console.log(`  error: ${row.error}`);
    }
}

async function main() {
    printExpectedEnv();

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
        recommendationMetaAbsent: rows.every((row) => !row.hasRecommendationMeta),
        recommendationUxAbsent: rows.every((row) => !hasRecommendationUx(row.answerPreview)),
        packageIdsAbsent: rows.every((row) => row.candidatePackageIds.length === 0)
    };

    console.log("");
    console.log(`SUMMARY ${JSON.stringify(summary)}`);
    process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
