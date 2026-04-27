const BASE_URL = (process.env.HOMELAB_API_BASE_URL || "http://localhost:5000")
    .replace(/\/$/, "");
const CHAT_URL = `${BASE_URL}/api/chat`;

const CASES = [
    {
        id: "general_checkup_ask_more_ux",
        query: "tôi muốn xét nghiệm tổng quát",
        validate: ({ data, recommendation, answer, candidatePackageIds }) => [
            data.flow === "health_rag",
            data.meta?.intentGroup === "test_advice",
            Boolean(recommendation),
            recommendation?.status === "ask_more",
            asksForMoreInfo(answer),
            !containsRawPackageId(answer),
            !hasRecommendedPackage(recommendation),
            candidatePackageIds.length > 0
        ]
    },
    {
        id: "fatigue_ask_more_ux",
        query: "tôi hay mệt muốn biết nên xét nghiệm gì",
        validate: ({ data, recommendation, answer }) => [
            data.flow === "health_rag",
            data.meta?.intentGroup === "test_advice",
            Boolean(recommendation),
            ["ask_more", "needs_more_context"].includes(
                recommendation?.status || recommendation?.decisionType
            ),
            asksForMoreInfo(answer),
            !hasDiagnosisLanguage(answer),
            !containsRawPackageId(answer)
        ]
    },
    {
        id: "general_ready_not_live_ux",
        query:
            "nam 35 tuổi, hay mệt 2 tháng, muốn kiểm tra tổng quát, không đau ngực, không khó thở, không ngất",
        validate: ({ data, recommendation, answer, candidatePackageIds }) => [
            data.flow === "health_rag",
            data.meta?.intentGroup === "test_advice",
            candidatePackageIds.length > 0,
            recommendation?.decisionType === "ready_but_catalog_disabled",
            !hasRecommendedPackage(recommendation),
            !claimsFinalPackage(answer),
            suggestsDirection(answer),
            !containsRawPackageId(answer)
        ]
    },
    {
        id: "kidney_ready_not_live_ux",
        query: "tôi muốn kiểm tra thận, không đau ngực, không khó thở, không ngất",
        validate: ({ data, recommendation, answer }) => [
            data.flow === "health_rag",
            data.meta?.intentGroup === "test_advice",
            recommendation?.decisionType === "ready_but_catalog_disabled",
            !hasRecommendedPackage(recommendation),
            suggestsDirection(answer),
            !claimsFinalPackage(answer),
            !containsRawPackageId(answer)
        ]
    },
    {
        id: "medical_review_boundary_ux",
        query: "tôi có kết quả CBC rồi, đọc giúp tôi bị bệnh gì",
        validate: ({ data, recommendation, answer }) => [
            data.flow === "health_rag",
            recommendation?.decisionType === "medical_review_boundary",
            !hasRecommendedPackage(recommendation),
            mentionsMedicalReview(answer),
            !hasDiagnosisLanguage(answer),
            !recommendsPackage(answer),
            !containsRawPackageId(answer)
        ]
    },
    {
        id: "booking_no_recommendation_ux",
        query: "tôi muốn đặt lịch xét nghiệm tổng quát ngày mai",
        validate: ({ data, recommendation, answer }) => [
            data.flow === "booking",
            !recommendation,
            !hasRecommendationUx(answer)
        ]
    },
    {
        id: "urgent_no_recommendation_ux",
        query: "đau ngực khó thở và vã mồ hôi",
        validate: ({ data, recommendation, answer }) => [
            data.flow === "health_rag",
            data.meta?.intentGroup === "urgent_health",
            !recommendation,
            mentionsUrgentSafety(answer),
            !hasRecommendationUx(answer)
        ]
    }
];

function getCandidatePackageIds(recommendation) {
    const ids = recommendation?.packageDecision?.candidatePackageIds;
    if (Array.isArray(ids)) {
        return ids;
    }

    return [];
}

function hasRecommendedPackage(recommendation) {
    return Boolean(recommendation?.recommendedPackage);
}

function containsRawPackageId(answer) {
    return /pkg_[a-z0-9_]+/i.test(String(answer || ""));
}

function asksForMoreInfo(answer) {
    const text = normalize(answer);
    return (
        text.includes("can them") ||
        text.includes("them thong tin") ||
        text.includes("bao nhieu tuoi") ||
        text.includes("muc tieu") ||
        text.includes("trieu chung")
    );
}

function suggestsDirection(answer) {
    const text = normalize(answer);
    return (
        text.includes("huong xet nghiem") ||
        text.includes("trao doi them") ||
        text.includes("cong thuc mau") ||
        text.includes("chuc nang than")
    );
}

function claimsFinalPackage(answer) {
    const text = normalize(answer);
    return (
        text.includes("da chot goi") ||
        text.includes("chot goi xet nghiem") ||
        text.includes("nen dat goi") ||
        text.includes("khuyen nghi goi")
    );
}

function mentionsMedicalReview(answer) {
    const text = normalize(answer);
    return (
        text.includes("bac si") ||
        text.includes("nhan vien y te") ||
        text.includes("trieu chung") ||
        text.includes("tien su")
    );
}

function mentionsUrgentSafety(answer) {
    const text = normalize(answer);
    return (
        text.includes("cap cuu") ||
        text.includes("khan cap") ||
        text.includes("co so y te") ||
        text.includes("ho tro y te ngay")
    );
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

function recommendsPackage(answer) {
    const text = normalize(answer);
    return (
        text.includes("goi y goi") ||
        text.includes("de xuat goi") ||
        text.includes("nen chon goi") ||
        text.includes("nen dat goi")
    );
}

function hasRecommendationUx(answer) {
    const text = normalize(answer);
    return (
        text.includes("huong xet nghiem") ||
        text.includes("goi xet nghiem phu hop") ||
        text.includes("de tu van huong xet nghiem") ||
        text.includes("homeLab can them mot vai thong tin".toLowerCase())
    );
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
            sessionId: `recommendation_answer_ux_3d_${index + 1}_${Date.now()}`
        })
    });

    const payload = await response.json();
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
    console.log(`  failedChecks: ${JSON.stringify(row.failedChecks)}`);
    console.log(`  answerPreview: ${row.answerPreview}`);
    if (row.error) {
        console.log(`  error: ${row.error}`);
    }
}

async function main() {
    console.log(`Recommendation Answer UX 3D smoke: POST ${CHAT_URL}`);

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
