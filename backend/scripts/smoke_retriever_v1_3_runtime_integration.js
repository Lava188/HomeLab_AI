const routerService = require("../src/services/router.service");

process.env.HOMELAB_RETRIEVER_VERSION =
    process.env.HOMELAB_RETRIEVER_VERSION || "v1_3";
process.env.HOMELAB_RETRIEVER_FALLBACK_VERSION =
    process.env.HOMELAB_RETRIEVER_FALLBACK_VERSION || "v1_2";

const CASES = [
    {
        id: "smoke_chest_pain_emergency",
        message: "đau ngực vã mồ hôi khó thở cần làm gì",
        expectNoPackageFirst: true,
        expectHealthOrEmergency: true
    },
    {
        id: "smoke_shortness_blue_confused",
        message: "khó thở môi xanh tím lú lẫn",
        expectNoPackageFirst: true,
        expectHealthOrEmergency: true
    },
    {
        id: "smoke_sepsis_worse_fast",
        message: "nhiễm trùng nặng rất mệt xấu đi nhanh sepsis",
        expectNoPackageFirst: true,
        expectHealthOrEmergency: true
    },
    {
        id: "smoke_ambiguous_hospital",
        message: "triệu chứng của tôi có cần đi viện ngay hay chỉ theo dõi",
        expectClarifying: true,
        expectNoPackageFirst: true
    },
    {
        id: "smoke_customer_infection_test",
        message: "tôi muốn xét nghiệm vì nghi nhiễm trùng thì chỉ số nào liên quan",
        expectNoPackageFirst: true,
        expectCustomerSafetyGate: true,
        expectHealthOrFallback: true
    },
    {
        id: "smoke_general_test_package",
        message: "tôi muốn tư vấn gói xét nghiệm tổng quát",
        expectNoPackageFirst: true,
        expectHealthOrFallback: true
    }
];

function includesPackageFirstLanguage(reply) {
    const text = String(reply || "").toLowerCase();
    return (
        text.includes("đề xuất gói") ||
        text.includes("goi xet nghiem phu hop") ||
        text.includes("gói xét nghiệm phù hợp") ||
        text.includes("dat lich ngay") ||
        text.includes("đặt lịch ngay")
    );
}

function checkCase(testCase, result) {
    const meta = result.meta || {};
    const routing = meta.routing || {};
    const failures = [];

    if (
        testCase.expectHealthOrEmergency &&
        !["health_rag", "emergency"].includes(result.flow)
    ) {
        failures.push(`expected health_rag/emergency flow, got ${result.flow}`);
    }

    if (
        testCase.expectHealthOrFallback &&
        !["health_rag", "fallback"].includes(result.flow)
    ) {
        failures.push(`expected health_rag/fallback flow, got ${result.flow}`);
    }

    if (
        testCase.expectClarifying &&
        !(
            result.action === "FALLBACK_RESPONSE" &&
            routing.lowConfidenceGuard &&
            routing.lowConfidenceGuard.triggered === true
        )
    ) {
        failures.push("expected clarifying fallback with lowConfidenceGuard");
    }

    if (testCase.expectNoPackageFirst && includesPackageFirstLanguage(result.reply)) {
        failures.push("reply contains package-first language");
    }

    if (
        testCase.expectCustomerSafetyGate &&
        meta.customerTestSafetyGateApplied !== true
    ) {
        failures.push("expected customerTestSafetyGateApplied=true");
    }

    if (
        result.flow === "health_rag" &&
        meta.loadedRetrieverVersion !== process.env.HOMELAB_RETRIEVER_VERSION
    ) {
        failures.push(
            `expected loadedRetrieverVersion=${process.env.HOMELAB_RETRIEVER_VERSION}, got ${meta.loadedRetrieverVersion}`
        );
    }

    if (result.flow === "health_rag" && typeof meta.fallbackUsed !== "boolean") {
        failures.push("fallbackUsed metadata is missing or not boolean");
    }

    return failures;
}

async function main() {
    const rows = [];

    for (const testCase of CASES) {
        const result = await routerService.routeMessage({
            message: testCase.message,
            sessionId: `smoke_${testCase.id}`
        });
        const failures = checkCase(testCase, result);
        const meta = result.meta || {};

        rows.push({
            id: testCase.id,
            message: testCase.message,
            pass: failures.length === 0,
            failures,
            flow: result.flow,
            action: result.action,
            primaryMode: meta.primaryMode || null,
            urgencyLevel: meta.urgencyLevel || null,
            requestedRetrieverVersion: meta.requestedRetrieverVersion || null,
            loadedRetrieverVersion: meta.loadedRetrieverVersion || null,
            fallbackUsed:
                typeof meta.fallbackUsed === "boolean" ? meta.fallbackUsed : null,
            fallbackReason: meta.fallbackReason || null,
            topChunks: Array.isArray(meta.topChunks)
                ? meta.topChunks.map((chunk) => chunk.chunkId)
                : [],
            lowConfidenceReason:
                meta.routing?.lowConfidenceGuard?.reason || null,
            customerTestSafetyGate:
                meta.routing?.customerTestSafetyGate || false,
            customerTestSafetyGateApplied:
                meta.customerTestSafetyGateApplied || false
        });
    }

    const passed = rows.filter((row) => row.pass).length;
    const failed = rows.length - passed;

    console.log(
        JSON.stringify(
            {
                requestedEnvVersion: process.env.HOMELAB_RETRIEVER_VERSION,
                fallbackEnvVersion: process.env.HOMELAB_RETRIEVER_FALLBACK_VERSION,
                total: rows.length,
                passed,
                failed,
                rows
            },
            null,
            2
        )
    );

    return failed === 0 ? 0 : 1;
}

main()
    .then((code) => {
        process.exitCode = code;
    })
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
