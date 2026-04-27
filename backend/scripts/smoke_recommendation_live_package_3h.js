const { spawn } = require("child_process");
const path = require("path");

const REPO_ROOT = path.join(__dirname, "../..");
const BASE_URL = (process.env.HOMELAB_API_BASE_URL || "http://localhost:5000")
    .replace(/\/$/, "");
const CHAT_URL = `${BASE_URL}/api/chat`;
const LIVE_GATE_ENV = "HOMELAB_RECOMMENDATION_LIVE_PACKAGE_ENABLED";
const GATE_OFF_PORT = process.env.HOMELAB_3H_GATE_OFF_PORT || "5059";
const GATE_OFF_BASE_URL = `http://localhost:${GATE_OFF_PORT}`;

const LIVE_CASES = [
    {
        id: "general_checkup_live_package",
        query:
            "nam 35 tuổi, hay mệt 2 tháng, muốn kiểm tra tổng quát, không đau ngực, không khó thở, không ngất",
        validate: ({ data, recommendation, answer, candidatePackageIds, sources }) => [
            data.flow === "health_rag",
            data.meta?.intentGroup === "test_advice",
            Boolean(recommendation),
            Boolean(recommendation?.recommendedPackage),
            recommendation?.livePackageEnabled === true ||
                recommendation?.packageDecision?.livePackageEnabled === true,
            candidatePackageIds.length > 0,
            answerIncludesPackageName(answer, recommendation?.recommendedPackage),
            !containsRawPackageId(answer),
            !hasWrongUrgentWarning(answer),
            sources.length === 0
        ]
    },
    {
        id: "kidney_live_package",
        query:
            "tôi muốn kiểm tra thận, 40 tuổi, mệt nhẹ 1 tháng, không đau ngực, không khó thở, không ngất",
        validate: ({ data, recommendation, answer, candidatePackageIds, sources }) => [
            data.flow === "health_rag",
            data.meta?.intentGroup === "test_advice",
            Boolean(recommendation?.recommendedPackage),
            candidatePackageIds.includes("pkg_kidney_function_basic_v1"),
            packageMentionsKidney(recommendation?.recommendedPackage, answer),
            !containsRawPackageId(answer),
            !hasSourceLike(sources, ["d-dimer", "ddimer", "dimer"])
        ]
    },
    {
        id: "general_ask_more_no_live_package",
        query: "tôi muốn xét nghiệm tổng quát",
        validate: ({ data, recommendation, answer }) => [
            data.flow === "health_rag",
            data.meta?.intentGroup === "test_advice",
            recommendation?.status === "ask_more",
            recommendation?.decisionType === "needs_more_context",
            !recommendation?.recommendedPackage,
            asksForMoreInfo(answer),
            !containsRawPackageId(answer)
        ]
    },
    {
        id: "urgent_blocks_live_package",
        query: "tôi muốn xét nghiệm vì đau ngực khó thở và vã mồ hôi",
        validate: ({ data, recommendation, answer }) => [
            data.flow === "health_rag",
            data.meta?.intentGroup === "urgent_health",
            !recommendation,
            !data.meta?.recommendation,
            mentionsUrgentSafety(answer)
        ]
    },
    {
        id: "booking_no_live_package",
        query: "tôi muốn đặt lịch xét nghiệm tổng quát ngày mai",
        validate: ({ data, recommendation }) => [
            data.flow === "booking",
            data.meta?.intentGroup === "booking",
            !recommendation
        ]
    },
    {
        id: "cbc_boundary_no_live_package",
        query: "tôi có kết quả CBC rồi, đọc giúp tôi bị bệnh gì",
        validate: ({ data, recommendation, answer }) => [
            data.flow === "health_rag",
            recommendation?.decisionType === "medical_review_boundary",
            !recommendation?.recommendedPackage,
            !hasDiagnosisLanguage(answer)
        ]
    }
];

const GATE_OFF_CASE = {
    id: "live_gate_off_control",
    query:
        "nam 35 tuổi, hay mệt 2 tháng, muốn kiểm tra tổng quát, không đau ngực, không khó thở, không ngất",
    validate: ({ data, recommendation, answer, candidatePackageIds }) => [
        data.flow === "health_rag",
        data.meta?.intentGroup === "test_advice",
        Boolean(recommendation),
        recommendation?.decisionType === "ready_but_catalog_disabled",
        recommendation?.packageDecision?.livePackageEnabled === false,
        !recommendation?.recommendedPackage,
        candidatePackageIds.length > 0,
        !containsRawPackageId(answer)
    ]
};

function getCandidatePackageIds(recommendation) {
    const ids = recommendation?.packageDecision?.candidatePackageIds;
    return Array.isArray(ids) ? ids : [];
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

function answerIncludesPackageName(answer, recommendedPackage) {
    const text = normalize(answer);
    const names = [
        recommendedPackage?.displayName,
        recommendedPackage?.displayNameVi
    ].filter(Boolean);
    return names.some((name) => text.includes(normalize(name)));
}

function packageMentionsKidney(recommendedPackage, answer) {
    const text = normalize(
        [
            answer,
            recommendedPackage?.displayName,
            recommendedPackage?.displayNameVi,
            ...(recommendedPackage?.includedTests || [])
        ].join(" ")
    );
    return (
        text.includes("kidney") ||
        text.includes("than") ||
        text.includes("basic metabolic") ||
        text.includes("bmp")
    );
}

function asksForMoreInfo(answer) {
    const text = normalize(answer);
    return (
        text.includes("can them") ||
        text.includes("them thong tin") ||
        text.includes("bao nhieu tuoi") ||
        text.includes("muc tieu")
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

function hasWrongUrgentWarning(answer) {
    const text = normalize(answer);
    return (
        text.includes("goi cap cuu ngay") ||
        text.includes("den co so y te khan cap ngay")
    );
}

function containsRawPackageId(answer) {
    return /pkg_[a-z0-9_]+/i.test(String(answer || ""));
}

function hasSourceLike(sources, signals) {
    const text = normalize(sources.join(" "));
    return signals.some((signal) => text.includes(normalize(signal)));
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

async function postChat(baseUrl, query, index, prefix) {
    const response = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            message: query,
            sessionId: `${prefix}_${index + 1}_${Date.now()}`
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

async function runCase(testCase, index, baseUrl, prefix) {
    try {
        const data = await postChat(baseUrl, testCase.query, index, prefix);
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
            livePackageEnabled:
                recommendation?.livePackageEnabled ??
                recommendation?.packageDecision?.livePackageEnabled ??
                null,
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
            livePackageEnabled: null,
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

function startGateOffServer() {
    const env = {
        ...process.env,
        PORT: GATE_OFF_PORT,
        HOMELAB_RECOMMENDATION_RUNTIME_ENABLED: "true",
        [LIVE_GATE_ENV]: "false"
    };
    const child = spawn(process.execPath, ["backend/src/app.js"], {
        cwd: REPO_ROOT,
        env,
        stdio: "ignore",
        windowsHide: true
    });

    return child;
}

async function waitForServer(baseUrl) {
    const deadline = Date.now() + 10000;
    let lastError = null;
    while (Date.now() < deadline) {
        try {
            await postChat(baseUrl, "ping", 0, "recommendation_3h_wait");
            return;
        } catch (error) {
            lastError = error;
            await new Promise((resolve) => setTimeout(resolve, 500));
        }
    }

    throw lastError || new Error(`Server did not start at ${baseUrl}`);
}

function printExpectedEnv() {
    console.log("Recommendation Live Package 3H smoke");
    console.log(`POST ${CHAT_URL}`);
    console.log("Expected live server env:");
    console.log("  HOMELAB_RECOMMENDATION_RUNTIME_ENABLED=true");
    console.log(`  ${LIVE_GATE_ENV}=true`);
    console.log("  HOMELAB_SEMANTIC_BRIDGE_MODE=server");
    console.log("  HOMELAB_SEMANTIC_BRIDGE_URL=http://127.0.0.1:8765");
    console.log("  HOMELAB_SEMANTIC_ROUTER_GATE=true");
    console.log("  HOMELAB_SEMANTIC_RETRIEVAL_ENABLED=true");
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
    console.log(`  livePackageEnabled: ${row.livePackageEnabled}`);
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
    printExpectedEnv();

    const rows = [];
    for (let index = 0; index < LIVE_CASES.length; index += 1) {
        const row = await runCase(
            LIVE_CASES[index],
            index,
            BASE_URL,
            "recommendation_live_package_3h"
        );
        rows.push(row);
        printRow(row);
    }

    let gateOffServer = null;
    try {
        gateOffServer = startGateOffServer();
        await waitForServer(GATE_OFF_BASE_URL);
        const gateOffRow = await runCase(
            GATE_OFF_CASE,
            LIVE_CASES.length,
            GATE_OFF_BASE_URL,
            "recommendation_live_package_3h_gate_off"
        );
        rows.push(gateOffRow);
        printRow(gateOffRow);
    } finally {
        if (gateOffServer) {
            gateOffServer.kill();
        }
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
