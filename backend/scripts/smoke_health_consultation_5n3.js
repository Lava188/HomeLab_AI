const BASE_URL = (process.env.HOMELAB_API_BASE_URL || "http://localhost:5000")
    .replace(/\/$/, "");
const CHAT_URL = `${BASE_URL}/api/chat`;

const CASES = [
    {
        id: "A_lifestyle_blood_pressure_lipid",
        query: "Làm thế nào để hạ huyết áp và giảm chỉ số mỡ máu?",
        validate: ({ data, answer }) => [
            data.flow === "health_rag",
            answer.includes("huyết áp") || answer.includes("mỡ máu"),
            !answer.includes("xét nghiệm"),
            !answer.includes("giải thích xét nghiệm"),
            answer.toLowerCase().includes("không thay thế") || answer.toLowerCase().includes("không chẩn đoán"),
            !answer.includes("đặt lịch")
        ]
    },
    {
        id: "B_lifestyle_diabetes",
        query: "Làm sao để giảm chỉ số đường huyết và kiểm soát bệnh tiểu đường?",
        validate: ({ data, answer }) => [
            data.flow === "health_rag",
            answer.includes("đường huyết") || answer.includes("tiểu đường"),
            !answer.includes("xét nghiệm"),
            !answer.includes("giải thích"),
            answer.toLowerCase().includes("không") && (answer.toLowerCase().includes("chẩn đoán") || answer.toLowerCase().includes("kê đơn")),
            !answer.includes("đặt lịch")
        ]
    },
    {
        id: "C_multi_turn_fatigue_dizziness",
        turns: [
            { role: "user", content: "Tôi hay mệt gần đây" },
            { role: "user", content: "Cũng hơi chóng mặt nữa" },
            { role: "user", content: "Vậy nên xét nghiệm gì?" }
        ],
        validate: ({ data, answer }) => [
            data.flow === "health_rag",
            answer.includes("mệt") || answer.includes("chóng mặt"),
            !answer.includes("Triệu chứng nào"),
            !answer.includes("Bạn đang lo dấu hiệu nào")
        ]
    },
    {
        id: "D_fatigue_poor_appetite_package",
        turns: [
            { role: "user", content: "Tôi hay mệt, ăn uống kém" },
            { role: "user", content: "Vậy chọn gói nào?" }
        ],
        validate: ({ data, answer }) => [
            data.flow === "health_rag",
            answer.includes("gói") || answer.includes("xét nghiệm"),
            !answer.includes("Triệu chứng nào"),
            !answer.includes("Mình cần thêm")
        ]
    },
    {
        id: "E_lab_result_severity_alt_ast",
        query: "ALT AST cao thì có nghiêm trọng không?",
        validate: ({ data, answer }) => [
            data.flow === "health_rag",
            answer.includes("ALT") || answer.includes("AST") || answer.includes("men gan"),
            answer.toLowerCase().includes("chưa") || answer.toLowerCase().includes("cần"),
            !answer.includes("Triệu chứng nào"),
            !answer.includes("Bạn đang lo")
        ]
    },
    {
        id: "F_general_not_feeling_well",
        query: "Tôi thấy cơ thể không ổn lắm, muốn kiểm tra xem có vấn đề gì không",
        validate: ({ data, answer }) => [
            data.flow === "health_rag",
            answer.includes("?") || answer.toLowerCase().includes("bao nhiêu"),
            !answer.includes("gói"),
            !answer.includes("đặt lịch")
        ]
    },
    {
        id: "G_read_only_consultation",
        query: "Tôi chỉ hỏi trước thôi, chưa muốn đặt lịch",
        validate: ({ data, answer, meta }) => [
            data.flow === "health_rag" || data.flow === "fallback",
            !answer.includes("hủy bản nháp"),
            !answer.includes("Xác nhận hủy"),
            !meta?.debug?.semanticRouterGate?.originalFlow === "cancel"
        ]
    },
    {
        id: "H_urgent_still_wins",
        query: "Tôi đau ngực khó thở vã mồ hôi",
        validate: ({ data, answer, meta }) => [
            data.flow === "health_rag",
            meta?.intentGroup === "urgent_health",
            answer.includes("cấp cứu") || answer.includes("khẩn cấp"),
            !answer.includes("gói"),
            !answer.includes("xét nghiệm")
        ]
    },
    {
        id: "I_test_explanation_still_works",
        query: "HbA1c dùng để làm gì?",
        validate: ({ data, answer }) => [
            data.flow === "health_rag",
            answer.includes("HbA1c") || answer.includes("A1C") || answer.includes("đường huyết"),
            !answer.includes("đặt lịch"),
            !answer.includes("gói")
        ]
    },
    {
        id: "J_booking_unchanged",
        query: "Tôi muốn đặt lịch xét nghiệm ngày mai",
        validate: ({ data, answer }) => [
            data.flow === "booking",
            !data.meta?.debug?.semanticRouterGate?.routedToHealthRag,
            !answer.includes("tư vấn sức khỏe")
        ]
    }
];

function normalize(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/đ/g, "d")
        .replace(/Đ/g, "D")
        .toLowerCase();
}

async function postChat(message, sessionId, index) {
    const response = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            message,
            sessionId: sessionId || `health_consultation_5n3_${index + 1}_${Date.now()}`
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
        let data;
        let answer = "";
        let meta = null;

        if (testCase.turns && Array.isArray(testCase.turns)) {
            const sessionId = `health_consultation_5n3_multi_${index + 1}_${Date.now()}`;
            for (const turn of testCase.turns) {
                const payload = await postChat(turn.content, sessionId, index);
                data = payload;
                answer = String(payload?.reply || "");
                meta = payload?.meta || null;
            }
        } else {
            const payload = await postChat(testCase.query, null, index);
            data = payload;
            answer = String(payload?.reply || "");
            meta = payload?.meta || null;
        }

        const checks = testCase.validate({ data, answer, meta });
        const pass = checks.every(Boolean);

        return {
            id: testCase.id,
            query: testCase.query || testCase.turns?.[testCase.turns.length - 1]?.content,
            flow: data?.flow || null,
            intentGroup: data?.meta?.intentGroup || meta?.intentGroup || null,
            semanticRouted: data?.meta?.debug?.semanticRouterGate?.routedToHealthRag || false,
            failedChecks: checks
                .map((value, checkIndex) => (value ? null : checkIndex + 1))
                .filter(Boolean),
            answerPreview: answer.slice(0, 350),
            pass
        };
    } catch (error) {
        return {
            id: testCase.id,
            query: testCase.query || testCase.turns?.[testCase.turns.length - 1]?.content,
            flow: null,
            intentGroup: null,
            semanticRouted: false,
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
    console.log(`  semanticRouted: ${row.semanticRouted}`);
    console.log(`  failedChecks: ${JSON.stringify(row.failedChecks)}`);
    console.log(`  answerPreview: ${row.answerPreview}`);
    if (row.error) {
        console.log(`  error: ${row.error}`);
    }
}

async function main() {
    console.log(`Health Consultation 5N3 smoke: POST ${CHAT_URL}`);

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
