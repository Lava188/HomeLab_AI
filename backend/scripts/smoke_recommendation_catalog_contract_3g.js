const BASE_URL = (process.env.HOMELAB_API_BASE_URL || "http://localhost:5000")
    .replace(/\/$/, "");
const CHAT_URL = `${BASE_URL}/api/chat`;

const CASES = [
    {
        id: "general_ask_more_source_contract",
        query: "tôi muốn xét nghiệm tổng quát",
        validate: ({ data, recommendation, answer, sources }) => [
            data.flow === "health_rag",
            data.meta?.intentGroup === "test_advice",
            Boolean(recommendation),
            !hasRecommendedPackage(recommendation),
            !containsRawPackageId(answer),
            !hasSourceLike(sources, ["chest", "pain", "đau ngực", "dau nguc"])
        ]
    },
    {
        id: "general_ready_disabled_source_contract",
        query:
            "nam 35 tuổi, hay mệt 2 tháng, muốn kiểm tra tổng quát, không đau ngực, không khó thở, không ngất",
        validate: ({ data, recommendation, answer, candidatePackageIds, sources }) => [
            data.flow === "health_rag",
            data.meta?.intentGroup === "test_advice",
            Boolean(recommendation),
            recommendation?.decisionType === "ready_but_catalog_disabled",
            candidatePackageIds.length > 0,
            !hasRecommendedPackage(recommendation),
            !containsRawPackageId(answer),
            !hasSourceLike(sources, ["chest", "pain", "đau ngực", "dau nguc"])
        ]
    },
    {
        id: "kidney_ready_disabled_source_contract",
        query: "tôi muốn kiểm tra thận, không đau ngực, không khó thở, không ngất",
        validate: ({ data, recommendation, answer, candidatePackageIds, sources }) => [
            data.flow === "health_rag",
            data.meta?.intentGroup === "test_advice",
            Boolean(recommendation),
            recommendation?.decisionType === "ready_but_catalog_disabled",
            candidatePackageIds.includes("pkg_kidney_function_basic_v1"),
            !hasRecommendedPackage(recommendation),
            !containsRawPackageId(answer),
            !hasSourceLike(sources, ["d-dimer", "ddimer", "dimer"])
        ]
    },
    {
        id: "cbc_boundary_source_contract",
        query: "tôi có kết quả CBC rồi, đọc giúp tôi bị bệnh gì",
        validate: ({ data, recommendation, answer, sources }) => [
            data.flow === "health_rag",
            data.meta?.intentGroup === "test_advice",
            Boolean(recommendation),
            recommendation?.decisionType === "medical_review_boundary",
            !hasRecommendedPackage(recommendation),
            !containsRawPackageId(answer),
            !hasDiagnosisLanguage(answer),
            sources.length === 0 || hasSourceLike(sources, ["cbc", "complete blood count"])
        ]
    },
    {
        id: "booking_no_recommendation_source_contract",
        query: "tôi muốn đặt lịch xét nghiệm tổng quát ngày mai",
        validate: ({ data, recommendation }) => [
            data.flow === "booking",
            !recommendation
        ]
    },
    {
        id: "urgent_source_contract",
        query: "đau ngực khó thở và vã mồ hôi",
        validate: ({ data, recommendation, sources }) => [
            data.flow === "health_rag",
            data.meta?.intentGroup === "urgent_health",
            !recommendation,
            sources.length === 0 ||
                hasSourceLike(sources, [
                    "chest",
                    "pain",
                    "nhs",
                    "shortness",
                    "breath",
                    "đau ngực",
                    "dau nguc"
                ])
        ]
    }
];

function getCandidatePackageIds(recommendation) {
    const ids = recommendation?.packageDecision?.candidatePackageIds;
    return Array.isArray(ids) ? ids : [];
}

function hasRecommendedPackage(recommendation) {
    return Boolean(recommendation?.recommendedPackage);
}

function collectVisibleSources(data) {
    const sources = [];
    const meta = data?.meta || {};

    if (meta.knowledgeItem?.source) {
        sources.push(String(meta.knowledgeItem.source));
    }

    for (const citation of meta.citations || []) {
        sources.push(
            [
                citation.sourceId,
                citation.sourceName,
                citation.sourceUrl,
                citation.title
            ]
                .filter(Boolean)
                .join(" | ")
        );
    }

    for (const chunk of meta.topChunks || []) {
        sources.push(
            [
                chunk.sourceId,
                chunk.sourceName,
                chunk.sourceUrl,
                chunk.title
            ]
                .filter(Boolean)
                .join(" | ")
        );
    }

    return [...new Set(sources.filter(Boolean))];
}

function hasSourceLike(sources, signals) {
    const text = normalize(sources.join(" "));
    return signals.some((signal) => text.includes(normalize(signal)));
}

function containsRawPackageId(answer) {
    return /pkg_[a-z0-9_]+/i.test(String(answer || ""));
}

function hasDiagnosisLanguage(answer) {
    const text = normalize(answer);
    return [
        "ban bi ",
        "chac chan la",
        "chan doan la",
        "mac benh "
    ].some((phrase) => text.includes(phrase));
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
            sessionId: `recommendation_catalog_contract_3g_${index + 1}_${Date.now()}`
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
        const sources = collectVisibleSources(data);
        const checks = testCase.validate({
            data,
            recommendation,
            candidatePackageIds,
            answer,
            sources
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
            answerPreview: answer.slice(0, 260),
            visibleSources: sources,
            failedChecks: checks
                .map((value, checkIndex) => (value ? null : checkIndex + 1))
                .filter(Boolean),
            pass
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
            answerPreview: "",
            visibleSources: [],
            failedChecks: ["request"],
            error: error.message,
            pass: false
        };
    }
}

function printRow(row) {
    console.log(`${row.pass ? "PASS" : "FAIL"} ${row.id}`);
    console.log(`  query: ${row.query}`);
    console.log(`  flow: ${row.flow}`);
    console.log(`  intentGroup: ${row.intentGroup}`);
    console.log(`  selectedRetrievalMode: ${row.selectedRetrievalMode}`);
    console.log(`  recommendationStatus: ${row.recommendationStatus}`);
    console.log(`  decisionType: ${row.decisionType}`);
    console.log(`  recommendedPackage: ${JSON.stringify(row.recommendedPackage)}`);
    console.log(`  candidatePackageIds: ${JSON.stringify(row.candidatePackageIds)}`);
    console.log(`  answerPreview: ${row.answerPreview}`);
    console.log(`  visibleSources: ${JSON.stringify(row.visibleSources)}`);
    console.log(`  failedChecks: ${JSON.stringify(row.failedChecks)}`);
    if (row.error) {
        console.log(`  error: ${row.error}`);
    }
}

async function main() {
    console.log(`Recommendation Catalog Contract 3G smoke: POST ${CHAT_URL}`);

    const rows = [];
    for (let index = 0; index < CASES.length; index += 1) {
        const row = await runCase(CASES[index], index);
        rows.push(row);
        printRow(row);
    }

    const passed = rows.filter((row) => row.pass).length;
    const failed = rows.length - passed;

    console.log("");
    console.log(`SUMMARY ${JSON.stringify({ total: rows.length, passed, failed })}`);
    process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
