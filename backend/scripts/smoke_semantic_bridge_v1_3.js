const fs = require("fs");
const path = require("path");
const { performance } = require("perf_hooks");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "../.env") });

process.env.HOMELAB_RETRIEVER_VERSION =
    process.env.HOMELAB_RETRIEVER_VERSION || "v1_3";
process.env.HOMELAB_RETRIEVER_FALLBACK_VERSION =
    process.env.HOMELAB_RETRIEVER_FALLBACK_VERSION || "v1_2";
process.env.HOMELAB_SEMANTIC_BRIDGE_SHADOW = "true";
process.env.HOMELAB_SEMANTIC_ROUTER_GATE = "true";
process.env.HOMELAB_SEMANTIC_RETRIEVAL_ENABLED = "true";
process.env.HOMELAB_SEMANTIC_BRIDGE_TIMEOUT_MS =
    process.env.HOMELAB_SEMANTIC_BRIDGE_TIMEOUT_MS || "120000";

const { routeMessage } = require("../src/services/router.service");
const { checkSemanticBridgeHealth } = require("../src/services/health-rag/semantic-bridge.service");

const CASES = [
    {
        id: "sepsis_plain",
        query: "nhiễm trùng nặng rất mệt xấu đi nhanh",
        expect: "urgent_health"
    },
    {
        id: "sepsis_with_term",
        query: "nhiễm trùng nặng rất mệt xấu đi nhanh sepsis",
        expect: "urgent_health"
    },
    {
        id: "chest_pain",
        query: "đau ngực và mồ hôi khó thở",
        expect: "urgent_health"
    },
    {
        id: "mixed_booking_urgent",
        query: "tôi muốn đặt lịch xét nghiệm vì đau ngực khó thở và vã mồ hôi",
        expect: "urgent_health"
    },
    {
        id: "fatigue_test_advice",
        query: "tôi hay mệt và muốn biết nên xét nghiệm gì",
        expect: "test_advice"
    },
    {
        id: "general_checkup",
        query: "tôi muốn xét nghiệm tổng quát",
        expect: "test_advice"
    },
    {
        id: "booking_explicit",
        query: "tôi muốn đặt lịch xét nghiệm tổng quát ngày mai",
        expect: "booking"
    },
    {
        id: "booking_sample_home",
        query: "đặt lịch lấy mẫu máu tại nhà",
        expect: "booking"
    }
];

function mdCell(value) {
    return String(value ?? "")
        .replace(/\|/g, "\\|")
        .replace(/\r?\n/g, " ");
}

function formatMs(value) {
    if (!Number.isFinite(Number(value))) {
        return "n/a";
    }

    return `${Math.round(Number(value))} ms`;
}

function topChunk(result) {
    return result.meta?.topChunks?.[0] || null;
}

function hasSepsisAnswerLeak(result) {
    const reply = String(result.reply || "").toLowerCase();
    return reply.includes("sepsis") || reply.includes("nhiễm trùng nặng");
}

function getIntentGroup(result) {
    return result.meta?.intentGroup || result.meta?.debug?.intentGroup || null;
}

function getSelectedRetrievalMode(result) {
    return (
        result.meta?.selectedRetrievalMode ||
        result.meta?.debug?.semanticRetrieval?.selectedRetrievalMode ||
        null
    );
}

async function runCase(testCase, index) {
    const started = performance.now();
    const result = await routeMessage({
        message: testCase.query,
        sessionId: `semantic_routing_policy_${index + 1}`
    });
    const top = topChunk(result);
    const semanticRetrieval = result.meta?.debug?.semanticRetrieval || {};
    const semanticBridge = result.meta?.debug?.semanticBridge || {};
    const pass = evaluateCase(testCase, result);

    return {
        id: testCase.id,
        query: testCase.query,
        expected: testCase.expect,
        pass,
        flow: result.flow,
        action: result.action,
        intentGroup: getIntentGroup(result),
        selectedRetrievalMode: getSelectedRetrievalMode(result),
        semanticRetrievalStatus:
            semanticRetrieval.status ||
            semanticRetrieval.semanticRetrievalStatus ||
            null,
        semanticRuntimeMode: semanticRetrieval.runtimeMode || null,
        bridgeStatus: semanticBridge.semanticBridgeStatus || null,
        topChunkId: top?.chunkId || null,
        topSourceId: top?.sourceId || null,
        replyHasSepsisLeak: hasSepsisAnswerLeak(result),
        replyPreview: String(result.reply || "").slice(0, 240),
        latencyMs: Math.round(performance.now() - started)
    };
}

function evaluateCase(testCase, result) {
    const intentGroup = getIntentGroup(result);
    const selectedRetrievalMode = getSelectedRetrievalMode(result);
    const top = topChunk(result);

    if (testCase.expect === "booking") {
        return result.flow === "booking" && intentGroup === "booking";
    }

    if (testCase.expect === "urgent_health") {
        return (
            result.flow === "health_rag" &&
            intentGroup === "urgent_health" &&
            selectedRetrievalMode === "semantic_faiss" &&
            Boolean(top?.chunkId)
        );
    }

    if (testCase.expect === "test_advice") {
        return (
            result.flow !== "booking" &&
            result.flow === "health_rag" &&
            intentGroup === "test_advice" &&
            !hasSepsisAnswerLeak(result) &&
            Boolean(top?.chunkId)
        );
    }

    return false;
}

function isSepsisPairCoherent(results) {
    const plain = results.find((item) => item.id === "sepsis_plain");
    const withTerm = results.find((item) => item.id === "sepsis_with_term");

    if (!plain || !withTerm) {
        return false;
    }

    return (
        plain.topChunkId === withTerm.topChunkId ||
        (plain.topSourceId && plain.topSourceId === withTerm.topSourceId)
    );
}

function buildReport({ serverHealth, results, totalLatencyMs }) {
    const passCount = results.filter((result) => result.pass).length;
    const sepsisPairCoherent = isSepsisPairCoherent(results);
    const allPass = passCount === results.length && sepsisPairCoherent;
    const lines = [
        "# Semantic Retrieval Controlled Hybrid Report",
        "",
        "## Executive summary",
        "",
        `Routing/policy smoke ran ${results.length} queries. Passed ${passCount}/${results.length}.`,
        "",
        `Sepsis pair top chunk/source coherence: ${sepsisPairCoherent ? "yes" : "no"}.`,
        "",
        `Total smoke latency: ${formatMs(totalLatencyMs)}.`,
        "",
        `Recommendation: **${allPass ? "READY_FOR_FRONTEND_MANUAL_TEST" : "BLOCKED"}**.`,
        "",
        "## Files changed",
        "",
        "- `backend/src/services/router-intent.service.js`",
        "- `backend/scripts/smoke_semantic_bridge_v1_3.js`",
        "- `ai_lab/reports/semantic_retrieval_controlled_hybrid_report.md`",
        "",
        "## Server health",
        "",
        `\`${JSON.stringify(serverHealth)}\``,
        "",
        "## Smoke results",
        "",
        "| Case | Query | Expected | Pass | Flow | Intent group | Selected retrieval | Top chunk | Top source | Sepsis leak | Latency |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"
    ];

    for (const result of results) {
        lines.push(
            [
                mdCell(result.id),
                mdCell(result.query),
                mdCell(result.expected),
                mdCell(result.pass ? "yes" : "no"),
                mdCell(result.flow),
                mdCell(result.intentGroup),
                mdCell(result.selectedRetrievalMode || "none"),
                mdCell(result.topChunkId || "none"),
                mdCell(result.topSourceId || "none"),
                mdCell(result.replyHasSepsisLeak ? "yes" : "no"),
                mdCell(formatMs(result.latencyMs))
            ].join(" | ").replace(/^/, "| ").replace(/$/, " |")
        );
    }

    lines.push(
        "",
        "## Pass/fail",
        "",
        allPass
            ? "PASS: urgent red-flag queries take priority over booking actions, while normal booking cases remain booking."
            : "FAIL: at least one routing or policy case did not match expectations.",
        "",
        "## Known limitations",
        "",
        "- Urgent-over-booking priority is a routing safety rule, not a diagnosis classifier.",
        "- Semantic retrieval remains opt-in and does not change default runtime/env.",
        "",
        "## Recommendation next step",
        "",
        allPass
            ? "**READY_FOR_FRONTEND_MANUAL_TEST**: verify mixed urgent booking cases in the chat UI Network response."
            : "**BLOCKED**: fix failed routing priority cases before frontend manual testing."
    );

    return lines.join("\n");
}

async function main() {
    const started = performance.now();
    const serverHealth = await checkSemanticBridgeHealth();
    const results = [];

    for (let index = 0; index < CASES.length; index += 1) {
        results.push(await runCase(CASES[index], index));
    }

    const totalLatencyMs = Math.round(performance.now() - started);
    const reportPath = path.join(
        __dirname,
        "../../ai_lab/reports/semantic_retrieval_controlled_hybrid_report.md"
    );

    fs.writeFileSync(
        reportPath,
        buildReport({
            serverHealth,
            results,
            totalLatencyMs
        }),
        "utf8"
    );

    console.log(
        JSON.stringify(
            {
                reportPath,
                serverHealth,
                results,
                totalLatencyMs
            },
            null,
            2
        )
    );
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
