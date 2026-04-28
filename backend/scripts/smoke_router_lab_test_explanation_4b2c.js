const { detectFlow } = require("../src/services/router-intent.service");

const CASES = [
    {
        id: "glucose_hba1c_explain",
        message: "HbA1c với đường huyết khác nhau thế nào",
        expectedFlow: "health_rag",
        expectedIntentGroup: "test_advice"
    },
    {
        id: "liver_alt_ast_explain",
        message: "men gan ALT AST để làm gì",
        expectedFlow: "health_rag",
        expectedIntentGroup: "test_advice"
    },
    {
        id: "thyroid_tsh_t4_explain",
        message: "xét nghiệm tuyến giáp TSH T4 là gì",
        expectedFlow: "health_rag",
        expectedIntentGroup: "test_advice"
    },
    {
        id: "lipid_explain",
        message: "mỡ máu cholesterol triglyceride là gì",
        expectedFlow: "health_rag",
        expectedIntentGroup: "test_advice"
    },
    {
        id: "kidney_explain",
        message: "creatinine với eGFR kiểm tra thận khác nhau thế nào",
        expectedFlow: "health_rag",
        expectedIntentGroup: "test_advice"
    },
    {
        id: "urine_albumin_explain",
        message: "albumin niệu trong xét nghiệm nước tiểu có ý nghĩa gì",
        expectedFlow: "health_rag",
        expectedIntentGroup: "test_advice"
    },
    {
        id: "cbc_explain",
        message: "CBC công thức máu là gì",
        expectedFlow: "health_rag",
        expectedIntentGroup: "test_advice"
    },
    {
        id: "booking_explicit_preserved",
        message: "tôi muốn đặt lịch xét nghiệm tổng quát sáng mai",
        expectedFlow: "booking",
        expectedIntentGroup: "booking"
    },
    {
        id: "urgent_override_preserved",
        message: "đau ngực khó thở vã mồ hôi, tôi có nên đặt xét nghiệm không",
        expectedFlow: "health_rag",
        expectedIntentGroup: "urgent_health"
    },
    {
        id: "reschedule_preserved",
        message: "tôi muốn đổi lịch lấy mẫu đã đặt",
        expectedFlow: "reschedule"
    },
    {
        id: "cancel_preserved",
        message: "tôi muốn hủy lịch xét nghiệm",
        expectedFlow: "cancel"
    }
];

function main() {
    const rows = CASES.map((testCase) => {
        const result = detectFlow(testCase.message);
        const intentGroup = result.routerDebug?.intentGroup || null;
        const failures = [];

        if (result.flow !== testCase.expectedFlow) {
            failures.push(
                `expected flow=${testCase.expectedFlow}, got ${result.flow}`
            );
        }

        if (
            testCase.expectedIntentGroup &&
            intentGroup !== testCase.expectedIntentGroup
        ) {
            failures.push(
                `expected intentGroup=${testCase.expectedIntentGroup}, got ${intentGroup}`
            );
        }

        return {
            id: testCase.id,
            message: testCase.message,
            pass: failures.length === 0,
            failures,
            flow: result.flow,
            intentGroup,
            lowConfidenceReason:
                result.routerDebug?.lowConfidenceGuard?.reason || null
        };
    });
    const passed = rows.filter((row) => row.pass).length;
    const failed = rows.length - passed;

    console.log(
        JSON.stringify(
            {
                smoke: "router_lab_test_explanation_4b2c",
                total: rows.length,
                passed,
                failed,
                rows
            },
            null,
            2
        )
    );
    process.exitCode = failed === 0 ? 0 : 1;
}

main();
