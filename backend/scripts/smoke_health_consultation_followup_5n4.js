const BASE_URL = (process.env.HOMELAB_API_BASE_URL || "http://localhost:5000")
    .replace(/\/$/, "");
const CHAT_URL = `${BASE_URL}/api/chat`;

function normalize(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .toLowerCase();
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

async function postChat(message, sessionId) {
    const response = await fetch(CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, sessionId })
    });
    const payload = await response.json();

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${JSON.stringify(payload)}`);
    }

    return payload.data || payload;
}

async function runTurns(id, turns) {
    const sessionId = `health_consultation_followup_5n4_${id}_${Date.now()}`;
    let data;

    for (const message of turns) {
        data = await postChat(message, sessionId);
    }

    return data;
}

async function runCase(id, turns, validate) {
    try {
        const data = await runTurns(id, turns);
        const reply = String(data.reply || "");
        validate({ data, reply, text: normalize(reply) });
        console.log(`PASS ${id}`);
        console.log(`  reply: ${reply.slice(0, 320)}`);
        return true;
    } catch (error) {
        console.log(`FAIL ${id}`);
        console.log(`  error: ${error.message}`);
        return false;
    }
}

async function main() {
    console.log(`Health Consultation Follow-up 5N4 smoke: POST ${CHAT_URL}`);
    const results = [];

    results.push(await runCase("A_lifestyle_still_works", [
        "làm thế nào để giảm mỡ máu"
    ], ({ data, text }) => {
        assert(data.flow === "health_rag", "expected health_rag flow");
        assert(text.includes("mo mau"), "missing lifestyle lipid advice");
        assert(!text.includes("chua du chac chan"), "returned generic fallback");
        assert(!text.includes("dat lich"), "unexpected booking promotion");
    }));

    results.push(await runCase("B_followup_duration", [
        "tôi đợt này cảm thấy hơi mệt, thường xuyên chóng mặt",
        "kéo dài khoảng 2 tuần rồi"
    ], ({ text }) => {
        assert(text.includes("met") && text.includes("chong mat"), "lost previous symptoms");
        assert(text.includes("2 tuan"), "lost duration detail");
        assert(!text.includes("chua du chac chan"), "returned generic fallback");
    }));

    results.push(await runCase("C_followup_multiple_details", [
        "tôi đợt này cảm thấy hơi mệt, thường xuyên chóng mặt",
        "kéo dài khoảng 2 tuần rồi, không mang thai, và yếu hơn nhiều"
    ], ({ text }) => {
        assert(text.includes("met") && text.includes("chong mat"), "lost previous symptoms");
        assert(text.includes("2 tuan"), "lost duration detail");
        assert(text.includes("khong mang thai"), "lost pregnancy status");
        assert(text.includes("yeu hon nhieu"), "lost worsening detail");
        assert(text.includes("dau nguc") && text.includes("kho tho"), "missing safety questions");
    }));

    results.push(await runCase("D_package_guidance_after_context", [
        "tôi hay mệt và chóng mặt",
        "kéo dài 2 tuần, không sốt, không đau ngực, không khó thở",
        "vậy nên xét nghiệm gì"
    ], ({ text }) => {
        assert(text.includes("cong thuc mau"), "missing CBC guidance");
        assert(text.includes("hba1c") || text.includes("duong huyet"), "missing glucose guidance");
        assert(text.includes("khong phai chan doan"), "missing non-diagnostic boundary");
        assert(!text.includes("chua du chac chan"), "returned generic fallback");
    }));

    results.push(await runCase("E_red_flag_still_wins", [
        "tôi mệt và chóng mặt",
        "tôi đau ngực khó thở"
    ], ({ text }) => {
        assert(text.includes("cap cuu") || text.includes("khan cap") || text.includes("co so y te"), "missing urgent advice");
        assert(!text.includes("goi tong quat"), "package suggestion overrode urgent advice");
    }));

    results.push(await runCase("F_short_context_package_question", [
        "tôi hay mệt",
        "ăn uống kém nữa",
        "vậy chọn gói nào"
    ], ({ text }) => {
        assert(text.includes("met"), "lost fatigue context");
        assert(text.includes("an uong kem"), "lost appetite context");
        assert(!text.includes("chua du chac chan"), "returned generic fallback");
    }));

    results.push(await runCase("G_standalone_vague_detail", [
        "kéo dài 2 tuần rồi"
    ], ({ text }) => {
        assert(text.includes("trieu chung"), "did not ask which symptom");
        assert(!text.includes("chua du chac chan"), "returned generic fallback");
    }));

    const passed = results.filter(Boolean).length;
    const failed = results.length - passed;
    console.log("");
    console.log(`SUMMARY ${JSON.stringify({ total: results.length, passed, failed })}`);
    process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
