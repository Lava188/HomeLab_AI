const bookingRuntime = require("../src/services/booking-runtime/booking.service");
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

function isoDate(offsetDays = 45) {
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

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function hasBookingCode(text) {
    return /\bHLB-\d{8}-[A-Z0-9]{4,}\b/i.test(String(text || ""));
}

function userHeaders(phone) {
    return {
        "x-demo-role": "USER",
        "x-demo-user-id": `smoke_5m9_user_${phone}`,
        "x-demo-phone": phone
    };
}

function adminHeaders() {
    return {
        "x-demo-role": "ADMIN",
        "x-demo-user-id": "smoke_5m9_admin"
    };
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
    return payload.data;
}

async function createSlot({ date, timeStart, timeEnd, capacity = 20 }) {
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
        return payload.data;
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
    return payload.data;
}

async function countActiveBookingsOnDate(date) {
    return prisma.booking.count({
        where: {
            sampleDate: new Date(`${date}T00:00:00.000Z`),
            status: {
                in: [
                    "CONFIRMED",
                    "RESCHEDULED",
                    "ASSIGNED",
                    "SAMPLE_COLLECTED",
                    "IN_LAB_PROCESSING",
                    "RESULT_READY"
                ]
            }
        }
    });
}

async function findCleanDateBlock() {
    const startOffset = 45 + Math.floor(Math.random() * 120);

    for (let offset = startOffset; offset < startOffset + 240; offset += 5) {
        const dates = [
            isoDate(offset),
            isoDate(offset + 1),
            isoDate(offset + 2),
            isoDate(offset + 3),
            isoDate(offset + 4)
        ];
        const counts = await Promise.all(dates.map(countActiveBookingsOnDate));

        if (counts.every((count) => count === 0)) {
            return dates;
        }
    }

    throw new Error("could not find clean date block for 5M-9 smoke");
}

async function countBookingsBySession(sessionId) {
    return prisma.booking.count({ where: { createdFromSessionId: sessionId } });
}

async function occupySlot(date, timeStart) {
    return bookingRuntime.createConfirmedBooking(
        {
            patientName: "Smoke 5M9 Occupant",
            phone: makePhone(),
            testTypeText: "Chức năng gan",
            sampleDate: date,
            sampleTimeStart: timeStart,
            address: "12 Nguyen Trai, Quan 1, TP Ho Chi Minh"
        },
        {
            sessionId: uniqueId("smoke_5m9_occupy"),
            createdSource: "ADMIN",
            reason: "smoke_booking_response_polish_5m9"
        }
    );
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
    const [dateA, dateB, dateC, dateD, dateE] = await findCleanDateBlock();
    const state = {
        phone: makePhone(),
        dateA,
        dateB,
        dateC,
        dateD,
        dateE,
        mainSession: uniqueId("smoke_5m9_main")
    };

    await packageCatalog.ensureRequiredCatalogItems();
    await createSlot({ date: state.dateA, timeStart: "08:00", timeEnd: "08:30" });
    await createSlot({ date: state.dateA, timeStart: "08:30", timeEnd: "09:00" });
    await createSlot({ date: state.dateB, timeStart: "09:00", timeEnd: "09:30" });
    await createSlot({ date: state.dateB, timeStart: "09:30", timeEnd: "10:00" });
    await createSlot({ date: state.dateC, timeStart: "08:30", timeEnd: "09:00", capacity: 1 });
    await createSlot({ date: state.dateC, timeStart: "10:00", timeEnd: "10:30", capacity: 10 });
    await createSlot({ date: state.dateD, timeStart: "08:30", timeEnd: "09:00" });
    await createSlot({ date: state.dateD, timeStart: "09:30", timeEnd: "10:00" });
    await createSlot({ date: state.dateE, timeStart: "08:30", timeEnd: "09:00" });
    await createSlot({ date: state.dateE, timeStart: "09:30", timeEnd: "10:00" });
    await occupySlot(state.dateC, "08:30");

    const cases = [
        ["A1_invalid_time_not_recorded_and_suggests_available_slots", async () => {
            state.invalidTimeSession = uniqueId("smoke_5m9_invalid_time");
            await postChat(`tôi muốn đặt lịch ngày ${displayDate(state.dateD)}`, state.invalidTimeSession, state.phone);
            const suggested = await postChat("gói chức năng gan", state.invalidTimeSession, state.phone);
            const suggestedReply = suggested.reply || "";
            assert(suggestedReply.includes("- 08:30") && suggestedReply.includes("- 09:30"), "initial slot suggestion missing");

            const data = await postChat("10h", state.invalidTimeSession, state.phone);
            const reply = data.reply || "";

            assert(data.booking?.draft?.appointmentTime !== "10:00", "invalid time was recorded");
            assert(!data.booking?.draft?.appointmentTime, "appointmentTime should remain missing");
            assert(reply.includes(`Khung 10:00 ngày ${displayDate(state.dateD)} hiện không khả dụng`), "unavailable time not explicit");
            assert(reply.includes("- 08:30") && reply.includes("- 09:30"), "available slots not suggested again");
            assert((data.booking?.missingFields || []).includes("appointmentTime"), "valid time should still be missing");
        }],
        ["A2_confirm_after_invalid_time_does_not_create", async () => {
            const before = await countBookingsBySession(state.invalidTimeSession);
            const data = await postChat("Xác nhận đặt lịch này", state.invalidTimeSession, state.phone);
            const after = await countBookingsBySession(state.invalidTimeSession);
            const reply = normalizeText(data.reply || "");

            assert(after === before, "booking was created after invalid time");
            assert(!hasBookingCode(data.reply || ""), "reply returned booking code after invalid time");
            assert((data.booking?.missingFields || []).includes("appointmentTime"), "valid time should still be missing on confirm");
            assert(reply.includes("thieu khung gio hop le") || reply.includes("chon khung gio"), "missing valid time not explained");
        }],
        ["A3_valid_time_records_and_asks_address", async () => {
            const data = await postChat("08:30", state.invalidTimeSession, state.phone);
            const reply = normalizeText(data.reply || "");

            assert(data.booking?.draft?.appointmentTime === "08:30", "valid time not recorded");
            assert(reply.includes("dia chi lay mau"), "address prompt missing after valid time");
            state.pauseDraftSnapshot = JSON.stringify(data.booking?.draft || {});
        }],
        ["A4_pause_suy_nghi_keeps_draft_natural", async () => {
            const before = await countBookingsBySession(state.invalidTimeSession);
            const data = await postChat("Chưa, tôi sẽ suy nghĩ thêm", state.invalidTimeSession, state.phone);
            const after = await countBookingsBySession(state.invalidTimeSession);
            const reply = normalizeText(data.reply || "");

            assert(after === before, "pause created booking");
            assert(JSON.stringify(data.booking?.draft || {}) === state.pauseDraftSnapshot, "pause mutated draft");
            assert(reply.includes("giu ban nhap") || reply.includes("giu thong tin"), "pause reply did not keep draft naturally");
            assert(!reply.includes("y ban la muon tiep tuc"), "pause reply used rigid clarification");
        }],
        ["A5_pause_hoi_nguoi_than_keeps_package_date", async () => {
            const sessionId = uniqueId("smoke_5m9_pause_family");
            await postChat(`tôi muốn đặt lịch ngày ${displayDate(state.dateD)}`, sessionId, state.phone);
            const beforeData = await postChat("gói chức năng gan", sessionId, state.phone);
            const beforeDraft = JSON.stringify(beforeData.booking?.draft || {});
            const before = await countBookingsBySession(sessionId);
            const data = await postChat("Để tôi hỏi lại người thân đã", sessionId, state.phone);
            const after = await countBookingsBySession(sessionId);
            const reply = normalizeText(data.reply || "");

            assert(after === before, "family pause created booking");
            assert(JSON.stringify(data.booking?.draft || {}) === beforeDraft, "family pause mutated draft");
            assert(reply.includes("giu thong tin goi va ngay lay mau") || reply.includes("giu ban nhap"), "family pause reply missing draft retention");
            assert(!reply.includes("y ban la muon tiep tuc"), "family pause reply used rigid clarification");
            state.familyPauseSession = sessionId;
        }],
        ["A6_resume_after_pause_returns_missing_step", async () => {
            const data = await postChat("tiếp tục đặt lịch", state.familyPauseSession, state.phone);
            const reply = normalizeText(data.reply || "");

            assert(data.booking?.draft?.appointmentDate === state.dateD, "resume lost date");
            assert(!data.booking?.draft?.appointmentTime, "resume should still need time");
            assert(reply.includes("khung") || reply.includes("gio lay mau"), "resume did not return to missing time step");
        }],
        ["A_package_after_date_suggests_slots_short", async () => {
            await postChat(`tôi muốn đặt lịch ngày ${displayDate(state.dateA)}`, state.mainSession, state.phone);
            const data = await postChat("gói chức năng gan", state.mainSession, state.phone);
            const reply = data.reply || "";
            const normalized = normalizeText(reply);

            assert(reply.includes("Mình đã ghi nhận gói Chức năng gan"), "missing concise package/date acknowledgement");
            assert(reply.includes("Ngày này còn các khung giờ:"), "missing slot heading");
            assert(reply.includes("- 08:00") && reply.includes("- 08:30"), "missing same-day slot bullets");
            assert(normalized.includes("ban muon chon khung nao"), "missing short slot question");
        }],
        ["B_choose_time_asks_address_with_example", async () => {
            const data = await postChat("08:30", state.mainSession, state.phone);
            const reply = data.reply || "";

            assert(data.booking?.draft?.appointmentTime === "08:30", "time not recorded");
            assert(reply.includes("địa chỉ lấy mẫu rõ ràng"), "address prompt not clear");
            assert(reply.includes("766 Đê La Thành"), "address example missing");
        }],
        ["C_missing_info_lists_known_and_missing", async () => {
            const data = await postChat("còn thiếu thông tin gì", state.mainSession, state.phone);
            const reply = data.reply || "";

            assert(reply.includes("Mình đang có:") || reply.includes("Hiện mình đang giữ:"), `known section missing: ${reply}`);
            assert(reply.includes("Chức năng gan"), "known package missing");
            assert(reply.includes("Ngày") || reply.includes("ngày"), "known date missing");
            assert(reply.includes("08:30"), "known time missing");
            assert(reply.includes("Còn thiếu:"), "missing section missing");
            assert(reply.includes("Địa chỉ") && reply.includes("Tên người đặt"), "missing fields absent");
            assert(reply.includes("địa chỉ") || reply.includes("Địa chỉ"), "next step missing");
        }],
        ["D_package_info_detour_answers_then_nudges", async () => {
            const data = await postChat("nói rõ cho tôi về gói chức năng gan", state.mainSession, state.phone);
            const reply = normalizeText(data.reply || "");

            assert(reply.includes("chuc nang gan") && reply.includes("alt") && reply.includes("ast"), "package detail missing");
            assert(reply.includes("minh van giu ban nhap dat lich"), `draft retention missing: ${data.reply}`);
            assert(reply.includes("gui dia chi") || reply.includes("chon khung gio"), `natural booking nudge missing: ${data.reply}`);
        }],
        ["E_vague_ack_does_not_mutate_address", async () => {
            const beforeAddress = state.lastAddress || null;
            const data = await postChat("vậy cũng được", state.mainSession, state.phone);
            const reply = normalizeText(data.reply || "");

            assert((data.booking?.draft?.address || null) === beforeAddress, "vague ack mutated address");
            assert(reply.includes("lich van chua du thong tin") || reply.includes("con thieu dia chi"), "vague reply not natural");
        }],
        ["F_invalid_date_reports_invalid", async () => {
            const sessionId = uniqueId("smoke_5m9_invalid");
            const data = await postChat("tôi muốn đặt lịch ngày 32/5/2026", sessionId, state.phone);
            const reply = data.reply || "";

            assert(reply.includes("Ngày 32/5/2026 không hợp lệ"), `invalid date not explicit: ${reply}`);
            assert(reply.includes("ngày mai"), "invalid date example missing");
        }],
        ["G_change_date_requires_new_time_and_slots", async () => {
            const sessionId = uniqueId("smoke_5m9_change");
            await postChat(`tôi muốn đặt lịch gói chức năng gan ngày ${displayDate(state.dateA)}`, sessionId, state.phone);
            await postChat("08:30", sessionId, state.phone);
            const data = await postChat(`tôi muốn đặt lịch ngày ${displayDate(state.dateB)}`, sessionId, state.phone);
            const reply = data.reply || "";

            assert(data.booking?.draft?.appointmentDate === state.dateB, "date not changed");
            assert(!data.booking?.draft?.appointmentTime, "time not cleared after date change");
            assert(reply.includes(`Mình đã đổi ngày lấy mẫu sang ${displayDate(state.dateB)}`), "date change acknowledgement missing");
            assert(reply.includes("cần chọn lại giờ"), "reselect time note missing");
            assert(reply.includes("- 09:00") && reply.includes("- 09:30"), "new slots missing");
        }],
        ["H_success_reply_has_code_and_summary", async () => {
            const sessionId = uniqueId("smoke_5m9_success");
            await postChat(`tôi muốn đặt lịch gói chức năng gan ngày ${displayDate(state.dateB)}`, sessionId, state.phone);
            await postChat("09:00", sessionId, state.phone);
            await postChat("766 Đê La Thành, Đống Đa, Hà Nội", sessionId, state.phone);
            await postChat("Nguyễn Văn Smoke", sessionId, state.phone);
            const before = await countBookingsBySession(sessionId);
            const data = await postChat("xác nhận đặt lịch", sessionId, state.phone);
            const after = await countBookingsBySession(sessionId);
            const reply = data.reply || "";

            assert(after === before + 1, "booking was not created");
            assert(reply.includes("Đã tạo lịch hẹn thành công"), "success phrase missing");
            assert(hasBookingCode(reply), "booking code missing");
            assert(reply.includes("Thông tin lịch:"), "summary heading missing");
            assert(reply.includes("- Gói:") && reply.includes("- Ngày giờ:"), "summary bullets missing");
        }],
        ["I_slot_failure_explains_reason", async () => {
            const sessionId = uniqueId("smoke_5m9_full");
            await postChat(`tôi muốn đặt lịch gói chức năng gan ngày ${displayDate(state.dateC)}`, sessionId, state.phone);
            await postChat("08:30", sessionId, state.phone);
            await postChat("766 Đê La Thành, Đống Đa, Hà Nội", sessionId, state.phone);
            await postChat("Trần Slot Full", sessionId, state.phone);
            const before = await countBookingsBySession(sessionId);
            const data = await postChat("xác nhận đặt lịch", sessionId, state.phone);
            const after = await countBookingsBySession(sessionId);
            const reply = normalizeText(data.reply || "");

            assert(after === before, "full slot should not create booking");
            assert(
                (reply.includes("08:30") && reply.includes("het cho")) ||
                    reply.includes("thieu khung gio hop le") ||
                    (data.booking?.missingFields || []).includes("appointmentTime"),
                `full slot reason missing: ${data.reply}`
            );
            assert(reply.includes("10:00") || reply.includes("khung gio"), "nearby suggestion missing");
        }],
        ["J_5m9c_invalid_time_with_date_then_package_clears_immediately", async () => {
            const sessionId = uniqueId("smoke_5m9c_invalid_date_time");
            await postChat(`tôi muốn đặt lịch ngày ${displayDate(state.dateE)}`, sessionId, state.phone);

            const invalid = await postChat(
                `oke vậy đặt lịch ngày ${displayDate(state.dateE)} 10h30 giúp tôi`,
                sessionId,
                state.phone
            );
            const invalidReply = invalid.reply || "";

            assert(!invalid.booking?.draft?.appointmentTime, "10:30 was kept before package selection");
            assert(invalidReply.includes(`Khung 10:30 ngày ${displayDate(state.dateE)} hiện không khả dụng`), "10:30 unavailable reply missing");
            assert(invalidReply.includes("- 08:30") && invalidReply.includes("- 09:30"), "same-day alternatives missing");

            const packageData = await postChat("gói chức năng gan", sessionId, state.phone);
            assert(packageData.booking?.draft?.testType === "Chức năng gan", "package not selected after invalid time");
            assert(!packageData.booking?.draft?.appointmentTime, "invalid time survived package selection");

            const before = await countBookingsBySession(sessionId);
            const confirm = await postChat("xác nhận đặt lịch này", sessionId, state.phone);
            const after = await countBookingsBySession(sessionId);
            const confirmReply = normalizeText(confirm.reply || "");

            assert(after === before, "booking was created after invalid date/time without valid time");
            assert((confirm.booking?.missingFields || []).includes("appointmentTime"), "appointmentTime not missing after confirm");
            assert(confirmReply.includes("thieu khung gio hop le") || confirmReply.includes("chon khung gio"), "confirm did not explain missing valid time");

            const valid = await postChat("08:30", sessionId, state.phone);
            assert(valid.booking?.draft?.appointmentTime === "08:30", "valid 08:30 was not recorded after invalid time");
            assert(normalizeText(valid.reply || "").includes("dia chi lay mau"), "address prompt missing after valid 08:30");
        }],
        ["K_5m9c_full_address_replaces_incomplete_address", async () => {
            const sessionId = uniqueId("smoke_5m9c_address");
            await postChat(`tôi muốn đặt lịch gói chức năng gan ngày ${displayDate(state.dateE)}`, sessionId, state.phone);
            await postChat("09:30", sessionId, state.phone);

            const partial = await postChat("số nhà 103", sessionId, state.phone);
            assert(!partial.booking?.draft?.address, "house number only should not become final address");
            assert(partial.booking?.draft?.addressPartial, "house number partial not retained");

            const fullAddress = "10 Xô Viết Nghệ Tĩnh, Can Lộc, Hà Tĩnh";
            const full = await postChat(fullAddress, sessionId, state.phone);
            const address = full.booking?.draft?.address || "";

            assert(address === fullAddress, `full address should replace partial, got: ${address}`);
            assert(!normalizeText(address).includes("so nha 103"), "partial address was incorrectly merged into full address");
        }],
        ["L_5m9c_package_detail_specific_followup_then_select", async () => {
            const sessionId = uniqueId("smoke_5m9c_package_detail");
            await postChat(`tôi muốn đặt lịch ngày ${displayDate(state.dateA)}`, sessionId, state.phone);

            const detail = await postChat("gói tổng quát cơ bản gồm những gì", sessionId, state.phone);
            const detailReply = detail.reply || "";
            const normalizedDetail = normalizeText(detailReply);

            assert(normalizedDetail.includes("tong quat co ban"), "general package detail missing");
            assert(detailReply.includes("Bạn muốn chọn gói Tổng quát cơ bản cho lịch này không?"), `specific package follow-up missing: ${detailReply}`);
            assert(!detail.booking?.draft?.testType, "detail question should not select package");

            const selected = await postChat("chọn gói tổng quát cơ bản", sessionId, state.phone);
            assert(selected.booking?.draft?.testType === "Gói tổng quát cơ bản", "package was not selected after explicit choice");
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
