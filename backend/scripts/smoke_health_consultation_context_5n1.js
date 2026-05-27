const BASE_URL = (process.env.HOMELAB_API_BASE_URL || "http://localhost:5000")
    .replace(/\/$/, "");
const CHAT_URL = `${BASE_URL}/api/chat`;

const CASES = [
    {
        id: "A_vague_symptom_ask_more",
        query: "Tôi hay mệt, nên xét nghiệm gì?",
        expectedBehavior: "hỏi thêm thông tin, chưa đề xuất gói chắc chắn"
    },
    {
        id: "B_red_flag_urgent",
        query: "Tôi đau ngực khó thở vã mồ hôi",
        expectedBehavior: "urgent/cấp cứu, không đề xuất gói tại nhà"
    },
    {
        id: "C_test_explanation",
        query: "HbA1c dùng để làm gì?",
        expectedBehavior: "giải thích HbA1c, không chuyển sang booking"
    },
    {
        id: "D_general_checkup",
        query: "Tôi muốn kiểm tra sức khỏe tổng quát",
        expectedBehavior: "có thể gợi ý gói tổng quát cơ bản nếu gate cho phép, kèm lý do"
    },
    {
        id: "E_liver_specific",
        query: "Tôi uống rượu nhiều, muốn kiểm tra gan",
        expectedBehavior: "gợi ý hoặc giải thích nhóm chức năng gan, hỏi thêm nếu cần"
    },
    {
        id: "F_unclear_request",
        query: "Tôi thấy không ổn lắm",
        expectedBehavior: "hỏi thêm triệu chứng, thời gian, mức độ, dấu hiệu nguy hiểm"
    },
    {
        id: "G_booking_not_affected",
        query: "Tôi muốn đặt lịch xét nghiệm ngày mai",
        expectedBehavior: "vẫn đi booking flow như cũ"
    },
    {
        id: "H_kidney_specific_with_details",
        query: "Tôi 40 tuổi, không đau ngực, không khó thở, muốn kiểm tra thận",
        expectedBehavior: "gợi ý chức năng thận với lý do"
    },
    {
        id: "I_fatigue_with_details",
        query: "Nam 35 tuổi, hay mệt 2 tháng, không đau ngực, không khó thở, muốn kiểm tra tổng quát",
        expectedBehavior: "có thể gợi ý gói tổng quát với lý do"
    },
    {
        id: "J_headache_symptom",
        query: "Tôi hay nhức đầu, nên xét nghiệm gì?",
        expectedBehavior: "hỏi thêm chi tiết về triệu chứng đau đầu"
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

function checksAskMoreInfo(answer) {
    const text = normalize(answer);
    return (
        text.includes("can them") ||
        text.includes("them thong tin") ||
        text.includes("bao nhieu tuoi") ||
        text.includes("muc tieu") ||
        text.includes("trieu chung") ||
        text.includes("keo dai") ||
        text.includes("bao lau")
    );
}

function checksUrgentEscalation(answer) {
    const text = normalize(answer);
    return (
        text.includes("cap cuu") ||
        text.includes("khan cap") ||
        text.includes("co so y te") ||
        text.includes("di kham") ||
        text.includes("ho tro y te ngay") ||
        text.includes("khong nen tu theo doi")
    );
}

function checksTestExplanation(answer) {
    const text = normalize(answer);
    return (
        text.includes("hba1c") ||
        text.includes("a1c") ||
        text.includes("duong huyet") ||
        text.includes("trung binh") ||
        text.includes("2-3 thang")
    );
}

function checksPackageGuidance(answer) {
    const text = normalize(answer);
    return (
        text.includes("goi tong quat") ||
        text.includes("tong quat co ban") ||
        text.includes("cong thuc mau") ||
        text.includes("mo mau") ||
        text.includes("chuc nang gan") ||
        text.includes("men gan") ||
        text.includes("chuc nang than") ||
        text.includes("kidney") ||
        text.includes("creatinine") ||
        text.includes("egfr")
    );
}

function checksClarifyingQuestion(answer) {
    const text = normalize(answer);
    return (
        text.includes("?") ||
        text.includes("bao nhieu") ||
        text.includes("co khong") ||
        text.includes("bao lau") ||
        text.includes("keo dau")
    );
}

function checksBookingFlow(data) {
    return data?.flow === "booking";
}

async function postChat(query, index) {
    const response = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            message: query,
            sessionId: `health_consultation_context_5n1_${index + 1}_${Date.now()}`
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
        const answer = String(data?.reply || "");
        const intentGroup = data?.meta?.intentGroup || null;
        const flow = data?.flow || null;

        let checks = {};
        let pass = false;

        switch (testCase.id.charAt(0)) {
            case "A":
                checks = {
                    asksMoreInfo: checksAskMoreInfo(answer),
                    clarifies: checksClarifyingQuestion(answer),
                    notBooking: !checksBookingFlow(data),
                    notUrgent: !checksUrgentEscalation(answer)
                };
                pass = checks.asksMoreInfo && checks.clarifies && checks.notBooking && checks.notUrgent;
                break;

            case "B":
                checks = {
                    urgent: checksUrgentEscalation(answer),
                    notBooking: !checksBookingFlow(data),
                    intentGroup: intentGroup === "urgent_health"
                };
                pass = checks.urgent && checks.notBooking;
                break;

            case "C":
                checks = {
                    explainsHbA1c: checksTestExplanation(answer),
                    notBooking: !checksBookingFlow(data),
                    notPackagePromotion: !answer.includes("đặt lịch")
                };
                pass = checks.explainsHbA1c && checks.notBooking;
                break;

            case "D":
                checks = {
                    guidesToPackage: checksPackageGuidance(answer),
                    explainsReason: answer.includes("Lưu ý") || answer.includes("lý do"),
                    notBooking: !checksBookingFlow(data)
                };
                pass = checks.guidesToPackage || checks.notBooking;
                break;

            case "E":
                checks = {
                    mentionsLiver: answer.includes("gan") || answer.includes("ALT") || answer.includes("AST"),
                    asksClarification: checksAskMoreInfo(answer),
                    notBooking: !checksBookingFlow(data)
                };
                pass = (checks.mentionsLiver || checks.asksClarification) && checks.notBooking;
                break;

            case "F":
                checks = {
                    asksClarification: checksAskMoreInfo(answer),
                    notBooking: !checksBookingFlow(data)
                };
                pass = checks.asksClarification && checks.notBooking;
                break;

            case "G":
                checks = {
                    bookingFlow: checksBookingFlow(data),
                    notHealthRag: flow !== "health_rag"
                };
                pass = checks.bookingFlow;
                break;

            case "H":
                checks = {
                    mentionsKidney: answer.includes("thận") || answer.includes("kidney") || answer.includes("Creatinine"),
                    givesGuidance: checksPackageGuidance(answer),
                    notBooking: !checksBookingFlow(data)
                };
                pass = (checks.mentionsKidney || checks.givesGuidance) && checks.notBooking;
                break;

            case "I":
                checks = {
                    suggestsDirection: checksPackageGuidance(answer) || answer.includes("tổng quát"),
                    explainsContext: answer.includes("Lưu ý") || answer.includes("dựa trên"),
                    notBooking: !checksBookingFlow(data)
                };
                pass = checks.suggestsDirection && checks.notBooking;
                break;

            case "J":
                checks = {
                    asksHeadacheDetail: checksAskMoreInfo(answer) || (answer.includes("đau đầu") && answer.includes("?")),
                    notBooking: !checksBookingFlow(data)
                };
                pass = checks.asksHeadacheDetail && checks.notBooking;
                break;

            default:
                pass = false;
        }

        return {
            id: testCase.id,
            query: testCase.query,
            expectedBehavior: testCase.expectedBehavior,
            flow,
            intentGroup,
            checks,
            answerPreview: answer.slice(0, 300),
            pass
        };
    } catch (error) {
        return {
            id: testCase.id,
            query: testCase.query,
            expectedBehavior: testCase.expectedBehavior,
            flow: null,
            intentGroup: null,
            checks: { error: true },
            answerPreview: "",
            error: error.message,
            pass: false
        };
    }
}

function printRow(row) {
    console.log(`${row.pass ? "PASS" : "FAIL"} ${row.id}`);
    console.log(`  query: ${row.query}`);
    console.log(`  expected: ${row.expectedBehavior}`);
    console.log(`  flow: ${row.flow}`);
    console.log(`  intentGroup: ${row.intentGroup}`);
    console.log(`  checks: ${JSON.stringify(row.checks)}`);
    console.log(`  answerPreview: ${row.answerPreview}`);
    if (row.error) {
        console.log(`  error: ${row.error}`);
    }
}

async function main() {
    console.log(`Health Consultation Context 5N1 smoke: POST ${CHAT_URL}`);

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
