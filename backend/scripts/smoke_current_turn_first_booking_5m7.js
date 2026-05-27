const prisma = require("../src/services/booking-runtime/prisma-client");
const packageCatalog = require("../src/services/booking-package-catalog.service");
const { normalizeText } = require("../src/utils/text.util");

const API_BASE_URL = process.env.HOMELAB_API_BASE_URL || "http://localhost:5000";
const CHAT_URL = process.env.HOMELAB_CHAT_API_URL || `${API_BASE_URL}/api/chat`;

function uniqueId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makePhone() {
    const suffix = `${Date.now()}${Math.floor(Math.random() * 10000)}`
        .replace(/\D/g, "")
        .slice(-8)
        .padStart(8, "0");

    return `09${suffix}`;
}

function isoDate(offsetDays = 1) {
    const date = new Date();
    date.setDate(date.getDate() + offsetDays);

    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0")
    ].join("-");
}

function displayDate(value) {
    const [year, month, day] = String(value).split("-");
    return `${day}/${month}/${year}`;
}

function userHeaders(phone) {
    return {
        "x-demo-role": "USER",
        "x-demo-user-id": `user-${phone}`,
        "x-demo-phone": phone
    };
}

function adminHeaders() {
    return {
        "x-demo-role": "ADMIN",
        "x-demo-user-id": "admin-smoke-5m7"
    };
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function hasBookingCode(text) {
    return /\bHLB-\d{8}-[A-Z0-9]{4,}\b/i.test(String(text || ""));
}

async function parseJsonResponse(response) {
    try {
        return await response.json();
    } catch {
        throw new Error(`API did not return JSON: ${response.status}`);
    }
}

async function request(path, options = {}) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {})
        },
        signal: AbortSignal.timeout(20000)
    });
    const payload = await parseJsonResponse(response);

    return { response, payload };
}

async function postChat(message, sessionId, phone) {
    const response = await fetch(CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...userHeaders(phone) },
        body: JSON.stringify({ message, sessionId }),
        signal: AbortSignal.timeout(20000)
    });
    const payload = await parseJsonResponse(response);

    assert(response.status === 200 && payload.success, `chat failed for "${message}"`);
    assert(payload.data?.meta?.currentTurnIntentUsed !== undefined, "currentTurnIntentUsed missing");
    assert(payload.data?.meta?.currentTurnIntentSource !== undefined, "currentTurnIntentSource missing");

    return payload.data;
}

async function createSlot({ date, timeStart, timeEnd, capacity = 50 }) {
    const existing = await request(
        `/api/admin/availability-slots?date=${encodeURIComponent(date)}&active=true`,
        { method: "GET", headers: adminHeaders() }
    );
    const existingSlot = (existing.payload.data?.slots || []).find(
        (slot) => slot.date === date && slot.timeStart === timeStart
    );

    if (existingSlot) {
        const { response, payload } = await request(
            `/api/admin/availability-slots/${existingSlot.id}`,
            {
                method: "PATCH",
                headers: adminHeaders(),
                body: JSON.stringify({ capacity, active: true })
            }
        );

        assert(response.status === 200 && payload.success, "slot update failed");
        return;
    }

    const { response, payload } = await request("/api/admin/availability-slots", {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({
            date,
            timeStart,
            timeEnd,
            capacity,
            area: "default",
            active: true
        })
    });

    assert(response.status === 201 && payload.success, "slot create failed");
}

async function countBookingsBySession(sessionId) {
    return prisma.booking.count({ where: { createdFromSessionId: sessionId } });
}

function assertNoMutation(data, fields) {
    for (const field of fields) {
        assert(!data.booking?.draft?.[field], `${field} was unexpectedly set`);
    }
}

async function runCase(id, fn, state) {
    try {
        await fn(state);
        console.log(`PASS ${id}`);
        return { id, passed: true };
    } catch (error) {
        console.error(`FAIL ${id}: ${error.message}`);
        return { id, passed: false, error };
    }
}

async function main() {
    const state = {
        phone: makePhone(),
        tomorrow: isoDate(1),
        changedDate: isoDate(9 + Math.floor(Math.random() * 30)),
        mainSession: uniqueId("current_turn_first_5m7")
    };

    await packageCatalog.ensureRequiredCatalogItems();
    await createSlot({ date: state.tomorrow, timeStart: "08:30", timeEnd: "09:30" });
    await createSlot({ date: state.tomorrow, timeStart: "09:30", timeEnd: "10:30" });
    await createSlot({ date: state.changedDate, timeStart: "08:30", timeEnd: "09:30" });
    await createSlot({ date: state.changedDate, timeStart: "10:00", timeEnd: "11:00" });

    const cases = [
        ["A_package_and_date_suggests_slots", async () => {
            await postChat("tôi muốn đặt lịch xét nghiệm ngày mai", state.mainSession, state.phone);
            const data = await postChat("gói chức năng gan", state.mainSession, state.phone);
            const reply = normalizeText(data.reply || "");

            assert(reply.includes("08:30") || reply.includes("09:30"), "slot suggestion missing");
            assert(data.booking?.draft?.appointmentDate === state.tomorrow, "tomorrow date not retained");
            assert(data.booking?.draft?.testType, "package not retained");
            assert((data.booking?.missingFields || []).includes("appointmentTime"), "time should still be missing");
            assert(data.meta?.whyMissingFieldPromptUsed === "missing_appointmentTime", "missing time reason absent");
        }],
        ["B_package_detail_detour_does_not_mutate", async () => {
            const before = await countBookingsBySession(state.mainSession);
            const data = await postChat("nói rõ cho tôi về gói chức năng gan", state.mainSession, state.phone);
            const reply = normalizeText(data.reply || "");
            const after = await countBookingsBySession(state.mainSession);

            assert(reply.includes("chuc nang gan") && reply.includes("alt") && reply.includes("ast"), "package detail missing");
            assert(data.meta?.currentTurnIntentUsed === "info_detour", "info_detour intent missing");
            assertNoMutation(data, ["appointmentTime", "address", "patientName"]);
            assert(after === before, "info detour created booking");
        }],
        ["C_availability_query_returns_slots_not_address", async () => {
            const data = await postChat("hiện tại còn khung giờ nào trống", state.mainSession, state.phone);
            const reply = normalizeText(data.reply || "");

            assert(data.meta?.currentTurnIntentUsed === "availability_check", "availability intent missing");
            assert(reply.includes("08:30") || reply.includes("09:30"), "available slots missing");
            assertNoMutation(data, ["address", "patientName"]);
        }],
        ["D_choose_slot_sets_time_and_asks_address", async () => {
            const data = await postChat("8h30", state.mainSession, state.phone);
            const reply = normalizeText(data.reply || "");

            assert(data.booking?.draft?.appointmentTime === "08:30", "time not set");
            assert((data.booking?.missingFields || []).includes("address"), "address should be missing");
            assert(reply.includes("dia chi"), "did not ask address");
        }],
        ["E_vague_ack_does_not_set_address_or_name", async () => {
            const data = await postChat("vậy cũng được", state.mainSession, state.phone);
            const reply = normalizeText(data.reply || "");

            assertNoMutation(data, ["address", "patientName"]);
            assert(reply.includes("dia chi") || reply.includes("ten nguoi dat"), "missing field not clarified");
        }],
        ["F_review_draft_lists_known_missing_next", async () => {
            const data = await postChat("còn thiếu thông tin gì", state.mainSession, state.phone);
            const reply = normalizeText(data.reply || "");

            assert(data.meta?.currentTurnIntentUsed === "help_next_step", "help/review intent missing");
            assert(reply.includes("dia chi") || reply.includes("ten nguoi dat"), "missing fields absent");
            assert(reply.includes("chuc nang gan") && reply.includes("08:30"), "known fields absent");
        }],
        ["G_invalid_date_not_address", async () => {
            const data = await postChat("tôi muốn đặt lịch ngày 32/5/2026", state.mainSession, state.phone);
            const reply = normalizeText(data.reply || "");

            assert(reply.includes("khong hop le"), "invalid date not reported");
            assert(!data.booking?.draft?.address, "invalid date was parsed as address");
        }],
        ["H_valid_date_change_clears_time_and_suggests_new_slots", async () => {
            const sessionId = uniqueId("date_change_5m7");
            await postChat(`tôi muốn đặt lịch gói chức năng gan ngày ${displayDate(state.tomorrow)}`, sessionId, state.phone);
            await postChat("8h30", sessionId, state.phone);
            const data = await postChat(`tôi muốn đặt lịch ngày ${displayDate(state.changedDate)}`, sessionId, state.phone);
            const reply = normalizeText(data.reply || "");

            assert(data.booking?.draft?.appointmentDate === state.changedDate, "date not changed");
            assert(!data.booking?.draft?.appointmentTime, "time was not cleared after date change");
            assert(/\b\d{2}:\d{2}\b/.test(reply) || reply.includes("khung gio"), `new date slots missing: ${data.reply}`);
        }],
        ["I_availability_after_time_asks_keep_or_change", async () => {
            const data = await postChat("hiện tại còn khung giờ nào trống", state.mainSession, state.phone);
            const reply = normalizeText(data.reply || "");

            assert(reply.includes("dang chon") && reply.includes("giu") && reply.includes("doi"), "keep/change prompt missing");
            assert(data.booking?.draft?.appointmentTime === "08:30", "selected time changed");
        }],
        ["J_address_sets_address", async () => {
            const data = await postChat("766 Đê La Thành, Đống Đa, Hà Nội", state.mainSession, state.phone);

            assert(data.booking?.draft?.address, "address not set");
            assert(!data.booking?.draft?.patientName, "address was parsed as name");
        }],
        ["K_patient_name_sets_ready_draft", async () => {
            const data = await postChat("Trần Văn C", state.mainSession, state.phone);

            assert(data.booking?.draft?.patientName === "Trần Văn C", "patient name not set");
            assert((data.booking?.missingFields || []).length === 0, "draft should be ready");
        }],
        ["L_review_ready_draft_does_not_create", async () => {
            const before = await countBookingsBySession(state.mainSession);
            const data = await postChat("cho tôi xem lại thông tin", state.mainSession, state.phone);
            const after = await countBookingsBySession(state.mainSession);
            const reply = normalizeText(data.reply || "");

            assert(after === before, "review created booking");
            assert(reply.includes("ban nhap da du thong tin") || reply.includes("xac nhan"), "ready review missing");
            assert(!hasBookingCode(data.reply || ""), "review returned booking code");
        }],
        ["M_pause_keeps_draft_without_create", async () => {
            const before = await countBookingsBySession(state.mainSession);
            const data = await postChat("khoan đã", state.mainSession, state.phone);
            const after = await countBookingsBySession(state.mainSession);

            assert(after === before, "pause created booking");
            assert(data.booking?.draft, "pause lost draft");
            assert(data.meta?.sessionState === "booking_paused", "session not paused");
        }],
        ["N_final_confirm_creates_or_explains_slot_failure", async () => {
            const before = await countBookingsBySession(state.mainSession);
            const data = await postChat("xác nhận đặt lịch này", state.mainSession, state.phone);
            const after = await countBookingsBySession(state.mainSession);
            const reply = normalizeText(data.reply || "");

            assert(
                after === before + 1 ||
                    reply.includes("khung gio") ||
                    reply.includes("het cho") ||
                    reply.includes("chua mo lich"),
                "final confirm neither created booking nor explained slot failure"
            );
        }],
        ["O_cancel_natural_asks_confirmation_not_clear", async () => {
            const sessionId = uniqueId("cancel_natural_5m7");
            await postChat(`tôi muốn đặt lịch gói chức năng gan ngày ${displayDate(state.tomorrow)}`, sessionId, state.phone);
            const data = await postChat("tôi không muốn khám nữa bỏ lịch giúp tôi", sessionId, state.phone);
            const reply = normalizeText(data.reply || "");

            assert(data.booking?.draft, "cancel natural cleared draft immediately");
            assert(data.meta?.nextExpectedField === "cancelConfirmation", "cancel confirmation not requested");
            assert(reply.includes("huy ban nhap") || reply.includes("huy ban nhap dat lich"), "cancel confirmation text missing");
        }]
    ];

    const results = [];

    for (const [id, fn] of cases) {
        results.push(await runCase(id, fn, state));
    }

    const passed = results.filter((result) => result.passed).length;
    const failed = results.length - passed;

    console.log(`RESULT passed=${passed} failed=${failed} total=${results.length}`);

    if (failed > 0) {
        process.exitCode = 1;
    }
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
