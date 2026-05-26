const prisma = require("../src/services/booking-runtime/prisma-client");
const packageCatalog = require("../src/services/booking-package-catalog.service");
const { normalizeText } = require("../src/utils/text.util");

const API_BASE_URL = process.env.HOMELAB_API_BASE_URL || "http://localhost:5000";
const CHAT_URL = process.env.HOMELAB_CHAT_API_URL || `${API_BASE_URL}/api/chat`;
const REQUEST_TIMEOUT_MS = 90000;
let lastChatTrace = null;

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

function isoDate(offsetDays = 140) {
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
        "x-demo-user-id": "admin-smoke-5l1"
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

function hasExplicitDraftCancelConfirmationPrompt(normalizedReply) {
    return Boolean(
        normalizedReply.includes("huy ban nhap") &&
            /dung[,]?\s+huy\s+ban\s+nhap/.test(normalizedReply)
    );
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
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    const payload = await parseJsonResponse(response);

    return { response, payload };
}

async function postChat(message, sessionId, headers = {}) {
    lastChatTrace = { message, sessionId, headers };
    const response = await fetch(CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ message, sessionId }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    const payload = await parseJsonResponse(response);
    lastChatTrace = {
        ...lastChatTrace,
        status: response.status,
        success: payload.success,
        reply: payload.data?.reply || null,
        booking: payload.data?.booking || null,
        meta: payload.data?.meta || null
    };

    return { response, payload };
}

async function createSlot({ date, timeStart, timeEnd, capacity = 8 }) {
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
                body: JSON.stringify({ capacity: Math.max(capacity, 50), active: true })
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

async function setupReadyDraft({ sessionId, phone, date, time = "07:30" }) {
    const before = await countBookingsBySession(sessionId);
    const message = [
        `Tôi muốn đặt lịch gói chức năng thận ngày ${displayDate(date)} lúc ${time}`,
        "địa chỉ: 12 Nguyễn Trãi, phường Bến Thành, Quận 1, TP Hồ Chí Minh",
        "tên: Smoke Conversation Act"
    ].join(", ");
    const first = await postChat(message, sessionId, userHeaders(phone));
    const data = first.payload.data || {};
    const reply = data.reply || "";
    const normalizedReply = normalizeText(reply);
    const after = await countBookingsBySession(sessionId);

    assert(first.response.status === 200 && first.payload.success, "ready draft setup failed");
    assert(after === before, "setup created booking before confirmation");
    assert(!hasBookingCode(reply), "setup reply unexpectedly has booking code");
    assert(
        data.booking?.draft && (
            normalizedReply.includes("xac nhan") ||
            data.booking?.status === "pending_confirmation"
        ),
        "setup did not produce pending confirmation draft"
    );
}

async function setupMissingAddressDraft({ sessionId, phone, date, time = "07:30" }) {
    const before = await countBookingsBySession(sessionId);
    const message = [
        `Tôi muốn đặt lịch gói chức năng thận ngày ${displayDate(date)} lúc ${time}`,
        "tên: Smoke Missing Address"
    ].join(", ");
    const first = await postChat(message, sessionId, userHeaders(phone));
    const data = first.payload.data || {};
    const after = await countBookingsBySession(sessionId);

    assert(first.response.status === 200 && first.payload.success, "missing address draft setup failed");
    assert(after === before, "missing address setup created booking");
    assert(data.booking?.draft, "missing address setup lost draft");
    assert((data.booking?.missingFields || []).includes("address"), "setup did not leave address missing");
}

async function setupMissingNameDraft({ sessionId, phone, date, time = "07:30" }) {
    const before = await countBookingsBySession(sessionId);
    const message = [
        `Tôi muốn đặt lịch gói chức năng thận ngày ${displayDate(date)} lúc ${time}`,
        "địa chỉ: 12 Nguyễn Trãi, phường Bến Thành, Quận 1, TP Hồ Chí Minh"
    ].join(", ");
    const first = await postChat(message, sessionId, userHeaders(phone));
    const data = first.payload.data || {};
    const after = await countBookingsBySession(sessionId);

    assert(first.response.status === 200 && first.payload.success, "missing name draft setup failed");
    assert(after === before, "missing name setup created booking");
    assert(data.booking?.draft, "missing name setup lost draft");
    assert((data.booking?.missingFields || []).includes("patientName"), "setup did not leave patientName missing");
}

async function setupMissingTimeDraft({ sessionId, phone, date }) {
    const before = await countBookingsBySession(sessionId);
    const message = [
        `Tôi muốn đặt lịch gói chức năng thận ngày ${displayDate(date)}`,
        "địa chỉ: 12 Nguyễn Trãi, phường Bến Thành, Quận 1, TP Hồ Chí Minh",
        "tên: Smoke Missing Time"
    ].join(", ");
    const first = await postChat(message, sessionId, userHeaders(phone));
    const data = first.payload.data || {};
    const after = await countBookingsBySession(sessionId);

    assert(first.response.status === 200 && first.payload.success, "missing time draft setup failed");
    assert(after === before, "missing time setup created booking");
    assert(data.booking?.draft, "missing time setup lost draft");
    assert((data.booking?.missingFields || []).includes("appointmentTime"), "setup did not leave appointmentTime missing");
}

async function runCase(id, fn, state) {
    try {
        await fn(state);
        console.log(`PASS ${id}`);
        return { id, passed: true };
    } catch (error) {
        console.error(`FAIL ${id}: ${error.message}`);
        console.error(JSON.stringify({
            case: id,
            expected: error.message,
            actual: {
                request: lastChatTrace?.message || null,
                responseStatus: lastChatTrace?.status || null,
                success: lastChatTrace?.success || null,
                reply: lastChatTrace?.reply || null,
                bookingStatus: lastChatTrace?.booking?.status || null,
                draft: lastChatTrace?.booking?.draft || null,
                missingFields: lastChatTrace?.booking?.missingFields || null,
                meta: lastChatTrace?.meta || null
            }
        }, null, 2));
        return { id, passed: false, error };
    }
}

async function main() {
    const state = {
        phone: makePhone(),
        date: isoDate(170 + Math.floor(Math.random() * 20)),
        tomorrow: isoDate(1)
    };

    await packageCatalog.ensureRequiredCatalogItems();
    await createSlot({ date: state.date, timeStart: "07:30", timeEnd: "08:30" });
    await createSlot({ date: state.date, timeStart: "08:00", timeEnd: "09:00" });
    await createSlot({ date: state.tomorrow, timeStart: "08:30", timeEnd: "09:30" });

    const cases = [
        [
            "current_turn_first_full_booking_detours_and_availability",
            async () => {
                const sessionId = uniqueId("full_current_turn_5l1e");
                const phone = makePhone();
                const before = await countBookingsBySession(sessionId);

                const start = await postChat("tôi muốn đặt lịch xét nghiệm ngày mai", sessionId, userHeaders(phone));
                let data = start.payload.data || {};
                let normalizedReply = normalizeText(data.reply || "");
                assert(start.response.status === 200 && start.payload.success, "full flow start failed");
                assert((data.booking?.missingFields || []).includes("testType"), "start did not ask for package/testType");
                assert(normalizedReply.includes("goi") || normalizedReply.includes("xet nghiem"), "start reply did not ask package");

                const packageStep = await postChat("gói chức năng gan", sessionId, userHeaders(phone));
                data = packageStep.payload.data || {};
                normalizedReply = normalizeText(data.reply || "");
                assert(data.booking?.draft?.testType, "package step did not set testType");
                assert((data.booking?.missingFields || []).includes("appointmentTime"), "package step did not ask for time next");
                assert(
                    normalizedReply.includes("gio lay mau") ||
                        normalizedReply.includes("khung gio con trong") ||
                        normalizedReply.includes("khung gio phu hop"),
                    "package step reply did not ask time or suggest available slots"
                );

                const review = await postChat("Còn thiếu thông tin gì", sessionId, userHeaders(phone));
                data = review.payload.data || {};
                normalizedReply = normalizeText(data.reply || "");
                assert(data.meta?.conversationAct?.act === "review_draft", "full flow review was not review_draft");
                assert(!data.booking?.draft?.appointmentTime, "review mutated time");
                assert(
                    normalizedReply.includes("da ghi nhan") &&
                        normalizedReply.includes("con thieu") &&
                        normalizedReply.includes("gio lay mau") &&
                        normalizedReply.includes("dia chi") &&
                        normalizedReply.includes("ten nguoi dat"),
                    "review did not summarize known and missing fields"
                );

                const info = await postChat("mà gói chức năng gan gồm những gì", sessionId, userHeaders(phone));
                data = info.payload.data || {};
                normalizedReply = normalizeText(data.reply || "");
                assert(data.meta?.conversationAct?.act === "info_detour", "package detail question was not info_detour");
                assert(!data.booking?.draft?.appointmentTime, "info detour mutated time");
                assert(normalizedReply.includes("chuc nang gan"), "info detour did not mention liver package");
                assert(normalizedReply.includes("gio lay mau"), "info detour did not continue asking time");

                const timeAck = await postChat("oke nhé", sessionId, userHeaders(phone));
                data = timeAck.payload.data || {};
                normalizedReply = normalizeText(data.reply || "");
                assert(!data.booking?.draft?.appointmentTime, "ambiguous ok was set as appointmentTime in full flow");
                assert(
                    normalizedReply.includes("gio lay mau") ||
                        (data.booking?.missingFields || []).includes("appointmentTime"),
                    "ambiguous ok while missing time did not ask for time"
                );

                const time = await postChat("8h30", sessionId, userHeaders(phone));
                data = time.payload.data || {};
                normalizedReply = normalizeText(data.reply || "");
                assert(data.booking?.draft?.appointmentTime === "08:30", "time step did not set appointmentTime");
                assert((data.booking?.missingFields || []).includes("address"), "time step did not ask address");
                assert(normalizedReply.includes("dia chi"), "time step reply did not ask address");

                const ack = await postChat("vậy cũng được", sessionId, userHeaders(phone));
                data = ack.payload.data || {};
                normalizedReply = normalizeText(data.reply || "");
                assert(!data.booking?.draft?.address, "ambiguous ack was set as address in full flow");
                assert(normalizedReply.includes("con thieu") && normalizedReply.includes("dia chi"), "ambiguous ack did not ask clear address");

                const availability = await postChat("hiện tại có các khung giờ nào đang trống", sessionId, userHeaders(phone));
                data = availability.payload.data || {};
                normalizedReply = normalizeText(data.reply || "");
                assert(data.meta?.conversationAct?.act === "availability_inquiry", "availability turn was not availability_inquiry");
                assert(!data.booking?.draft?.address, "availability turn was set as address in full flow");
                assert(
                    normalizedReply.includes("khung gio") ||
                        normalizedReply.includes("gio") ||
                        normalizedReply.includes("chua the hien thi"),
                    "availability turn did not return slot/helpful response"
                );

                const address = await postChat("766 Đê La Thành, Đống Đa, Hà Nội", sessionId, userHeaders(phone));
                data = address.payload.data || {};
                normalizedReply = normalizeText(data.reply || "");
                assert(normalizeText(data.booking?.draft?.address || "").includes("de la thanh"), "address step did not set address");
                assert((data.booking?.missingFields || []).includes("patientName"), "address step did not ask name");
                assert(normalizedReply.includes("ten nguoi dat"), "address step reply did not ask name");

                const name = await postChat("Trần Văn C", sessionId, userHeaders(phone));
                data = name.payload.data || {};
                normalizedReply = normalizeText(data.reply || "");
                assert(data.booking?.draft?.patientName === "Trần Văn C", "name step did not set patientName");
                assert((data.booking?.missingFields || []).length === 0, "name step did not produce ready draft");
                assert(normalizedReply.includes("xac nhan"), "name step did not ask final confirmation");

                const confirm = await postChat("Xác nhận đặt lịch", sessionId, userHeaders(phone));
                const after = await countBookingsBySession(sessionId);
                normalizedReply = normalizeText(confirm.payload.data?.reply || "");
                assert(
                    after === before + 1 ||
                        normalizedReply.includes("khung gio") ||
                        normalizedReply.includes("het cho") ||
                        normalizedReply.includes("chua mo lich"),
                    "full flow final confirm neither created booking nor returned slot reason"
                );
            }
        ],
        [
            "field_value_does_not_accept_vague_patient_name",
            async () => {
                const sessionId = uniqueId("vague_name_5l1b");
                await setupMissingNameDraft({ sessionId, phone: state.phone, date: state.date });
                const before = await countBookingsBySession(sessionId);
                const reply = await postChat("tôi chưa biết", sessionId, userHeaders(state.phone));
                const after = await countBookingsBySession(sessionId);
                const data = reply.payload.data || {};
                const normalizedReply = normalizeText(data.reply || "");

                assert(after === before, "vague patient name created booking");
                assert(!data.booking?.draft?.patientName, "vague text was set as patientName");
                assert(
                    normalizedReply.includes("ten nguoi dat") ||
                        normalizedReply.includes("ho ten"),
                    "vague patient name did not ask for patient name again"
                );
            }
        ],
        [
            "ambiguous_short_confirmation_requires_clarification",
            async () => {
                const sessionId = uniqueId("ambiguous_short_5l1a");
                await setupReadyDraft({ sessionId, phone: state.phone, date: state.date });
                const before = await countBookingsBySession(sessionId);
                const reply = await postChat("ừ", sessionId, userHeaders(state.phone));
                const after = await countBookingsBySession(sessionId);
                const normalizedReply = normalizeText(reply.payload.data?.reply || "");

                assert(after === before, "ambiguous short confirmation created booking");
                assert(
                    normalizedReply.includes("xac nhan") &&
                        normalizedReply.includes("sua") &&
                        normalizedReply.includes("hoi them"),
                    "ambiguous short confirmation did not ask clarify"
                );
            }
        ],
        [
            "pause_at_ready_confirmation",
            async () => {
                const sessionId = uniqueId("pause_ready_5l1");
                await setupReadyDraft({ sessionId, phone: state.phone, date: state.date });
                const before = await countBookingsBySession(sessionId);
                const pause = await postChat("Khoan đã", sessionId, userHeaders(state.phone));
                const after = await countBookingsBySession(sessionId);
                const data = pause.payload.data || {};
                const normalizedReply = normalizeText(data.reply || "");

                assert(pause.response.status === 200 && pause.payload.success, "pause chat failed");
                assert(after === before, "pause created booking");
                assert(data.booking?.draft, "pause lost draft");
                assert(data.meta?.sessionState === "booking_paused", "draft was not marked paused");
                assert(
                    normalizedReply.includes("chua tao lich") ||
                        normalizedReply.includes("van giu ban nhap"),
                    "pause reply did not say draft is held"
                );
            }
        ],
        [
            "confirm_after_pause_requires_reconfirm",
            async () => {
                const sessionId = uniqueId("pause_confirm_5l1");
                await setupReadyDraft({ sessionId, phone: state.phone, date: state.date });
                await postChat("Khoan đã", sessionId, userHeaders(state.phone));
                const before = await countBookingsBySession(sessionId);
                const confirm = await postChat("Xác nhận", sessionId, userHeaders(state.phone));
                const after = await countBookingsBySession(sessionId);
                const normalizedReply = normalizeText(confirm.payload.data?.reply || "");

                assert(after === before, "short confirm after pause created booking");
                assert(
                    normalizedReply.includes("tiep tuc xac nhan") &&
                        normalizedReply.includes("tam dung"),
                    "short confirm after pause did not ask resume confirmation"
                );
            }
        ],
        [
            "explicit_resume_confirm_creates_or_slot_failure",
            async () => {
                const sessionId = uniqueId("pause_explicit_5l1");
                await setupReadyDraft({ sessionId, phone: state.phone, date: state.date });
                await postChat("Khoan đã", sessionId, userHeaders(state.phone));
                const before = await countBookingsBySession(sessionId);
                const resume = await postChat("Đúng, xác nhận lịch này", sessionId, userHeaders(state.phone));
                const after = await countBookingsBySession(sessionId);
                const data = resume.payload.data || {};
                const normalizedReply = normalizeText(data.reply || "");

                assert(resume.response.status === 200 && resume.payload.success, "explicit resume failed");
                assert(
                    after === before + 1 ||
                        normalizedReply.includes("khung gio") ||
                        normalizedReply.includes("het cho") ||
                        normalizedReply.includes("chua mo lich"),
                    "explicit resume neither created booking nor returned slot reason"
                );
                assert(!normalizedReply.includes("chua hieu ro"), "explicit resume returned generic fallback");
            }
        ],
        [
            "conflicting_confirm_and_edit_prefers_edit",
            async () => {
                const sessionId = uniqueId("conflict_edit_5l1a");
                await setupReadyDraft({ sessionId, phone: state.phone, date: state.date });
                const before = await countBookingsBySession(sessionId);
                const conflict = await postChat("xác nhận nhưng đổi sang 8h", sessionId, userHeaders(state.phone));
                const after = await countBookingsBySession(sessionId);
                const normalizedReply = normalizeText(conflict.payload.data?.reply || "");

                assert(after === before, "conflicting intent created booking");
                assert(
                    normalizedReply.includes("doi gio lay mau sang 08:00") ||
                        normalizedReply.includes("sang 08:00 dung khong") ||
                        normalizedReply.includes("sua thong tin"),
                    "conflicting intent did not prefer edit or clarify"
                );
            }
        ],
        [
            "edit_time_at_ready_does_not_create",
            async () => {
                const sessionId = uniqueId("edit_time_5l1");
                await setupReadyDraft({ sessionId, phone: state.phone, date: state.date });
                const before = await countBookingsBySession(sessionId);
                const edit = await postChat("đổi sang 8h nhé", sessionId, userHeaders(state.phone));
                const after = await countBookingsBySession(sessionId);
                const normalizedReply = normalizeText(edit.payload.data?.reply || "");

                assert(after === before, "edit time created booking");
                assert(
                    normalizedReply.includes("doi gio lay mau sang 08:00") ||
                        normalizedReply.includes("sang 08:00 dung khong"),
                    "edit time did not ask for change confirmation"
                );

                const confirmEdit = await postChat("đúng", sessionId, userHeaders(state.phone));
                const afterConfirmEdit = await countBookingsBySession(sessionId);
                const normalizedConfirmEditReply = normalizeText(confirmEdit.payload.data?.reply || "");

                assert(afterConfirmEdit === before, "confirmed edit created booking");
                assert(
                    normalizedConfirmEditReply.includes("08:00") &&
                        normalizedConfirmEditReply.includes("xac nhan"),
                    "confirmed edit did not re-summarize and ask final confirmation"
                );
            }
        ],
        [
            "pending_edit_confirm_natural_updates_time_only",
            async () => {
                const sessionId = uniqueId("edit_confirm_natural_5l1b");
                await setupReadyDraft({ sessionId, phone: state.phone, date: state.date });
                const before = await countBookingsBySession(sessionId);
                await postChat("đổi sang 8h nhé", sessionId, userHeaders(state.phone));
                const confirmEdit = await postChat("đồng ý đổi giờ đó", sessionId, userHeaders(state.phone));
                const after = await countBookingsBySession(sessionId);
                const data = confirmEdit.payload.data || {};
                const normalizedReply = normalizeText(data.reply || "");

                assert(after === before, "natural edit confirmation created booking");
                assert(data.booking?.draft?.appointmentTime === "08:00", "natural edit confirmation did not update time");
                assert(normalizedReply.includes("08:00") && normalizedReply.includes("xac nhan"), "natural edit confirmation did not re-summarize");
            }
        ],
        [
            "pending_edit_reject_keeps_old_time",
            async () => {
                const sessionId = uniqueId("edit_reject_5l1b");
                await setupReadyDraft({ sessionId, phone: state.phone, date: state.date });
                const before = await countBookingsBySession(sessionId);
                await postChat("đổi sang 8h nhé", sessionId, userHeaders(state.phone));
                const rejectEdit = await postChat("không, giữ giờ cũ", sessionId, userHeaders(state.phone));
                const after = await countBookingsBySession(sessionId);
                const data = rejectEdit.payload.data || {};
                const normalizedReply = normalizeText(data.reply || "");

                assert(after === before, "edit rejection created booking");
                assert(data.booking?.draft?.appointmentTime === "07:30", "edit rejection changed old time");
                assert(normalizedReply.includes("07:30") && normalizedReply.includes("xac nhan"), "edit rejection did not return ready confirmation");
            }
        ],
        [
            "edit_date_at_ready_asks_confirmation",
            async () => {
                const sessionId = uniqueId("edit_date_5l1b");
                await setupReadyDraft({ sessionId, phone: state.phone, date: state.date });
                const before = await countBookingsBySession(sessionId);
                const edit = await postChat("đổi sang ngày kia", sessionId, userHeaders(state.phone));
                const after = await countBookingsBySession(sessionId);
                const normalizedReply = normalizeText(edit.payload.data?.reply || "");

                assert(after === before, "edit date created booking");
                assert(
                    normalizedReply.includes("doi ngay lay mau") &&
                        normalizedReply.includes("dung khong"),
                    "edit date did not ask confirmation"
                );
            }
        ],
        [
            "edit_package_at_ready_asks_confirmation",
            async () => {
                const sessionId = uniqueId("edit_package_5l1b");
                await setupReadyDraft({ sessionId, phone: state.phone, date: state.date });
                const before = await countBookingsBySession(sessionId);
                const edit = await postChat("đổi sang gói mỡ máu", sessionId, userHeaders(state.phone));
                const after = await countBookingsBySession(sessionId);
                const data = edit.payload.data || {};
                const normalizedReply = normalizeText(data.reply || "");

                assert(after === before, "edit package created booking");
                assert(
                    normalizedReply.includes("doi goi xet nghiem sang mo mau") &&
                        normalizedReply.includes("dung khong"),
                    "edit package did not ask confirmation"
                );
                assert(data.meta?.conversationAct?.targetField === "testType", "edit package missing act target");
            }
        ],
        [
            "not_correct_asks_what_to_edit",
            async () => {
                const sessionId = uniqueId("not_correct_5l1");
                await setupReadyDraft({ sessionId, phone: state.phone, date: state.date });
                const before = await countBookingsBySession(sessionId);
                const edit = await postChat("không đúng", sessionId, userHeaders(state.phone));
                const after = await countBookingsBySession(sessionId);
                const normalizedReply = normalizeText(edit.payload.data?.reply || "");

                assert(after === before, "not correct created booking");
                assert(
                    normalizedReply.includes("doi goi") &&
                        normalizedReply.includes("ngay gio") &&
                        normalizedReply.includes("dia chi") &&
                        normalizedReply.includes("nguoi dat"),
                    "not correct did not ask which field to edit"
                );
            }
        ],
        [
            "info_detour_missing_patient_name_does_not_mutate",
            async () => {
                const sessionId = uniqueId("info_missing_name_5l1b");
                await setupMissingNameDraft({ sessionId, phone: state.phone, date: state.date });
                const before = await countBookingsBySession(sessionId);
                const info = await postChat("gói này gồm những gì", sessionId, userHeaders(state.phone));
                const after = await countBookingsBySession(sessionId);
                const data = info.payload.data || {};
                const normalizedReply = normalizeText(data.reply || "");

                assert(after === before, "info detour missing name created booking");
                assert(!data.booking?.draft?.patientName, "info detour was set as patientName");
                assert(normalizedReply.includes("chuc nang than"), "info detour missing package detail");
                assert(normalizedReply.includes("ten nguoi dat"), "info detour did not continue asking patient name");
            }
        ],
        [
            "info_detour_at_ready_keeps_draft",
            async () => {
                const sessionId = uniqueId("info_ready_5l1");
                await setupReadyDraft({ sessionId, phone: state.phone, date: state.date });
                const before = await countBookingsBySession(sessionId);
                const info = await postChat("gói chức năng thận gồm gì", sessionId, userHeaders(state.phone));
                const after = await countBookingsBySession(sessionId);
                const data = info.payload.data || {};
                const normalizedReply = normalizeText(data.reply || "");

                assert(after === before, "info detour created booking");
                assert(data.booking?.draft, "info detour lost draft");
                assert(normalizedReply.includes("chuc nang than"), "info detour did not explain package");
                assert(
                    normalizedReply.includes("creatinine") ||
                        normalizedReply.includes("egfr"),
                    "info detour missing kidney components"
                );
            }
        ],
        [
            "info_detour_oke_explain_keeps_draft",
            async () => {
                const sessionId = uniqueId("info_oke_5l1a");
                await setupReadyDraft({ sessionId, phone: state.phone, date: state.date });
                const before = await countBookingsBySession(sessionId);
                const info = await postChat("oke giải thích giúp tôi về gói chức năng thận", sessionId, userHeaders(state.phone));
                const after = await countBookingsBySession(sessionId);
                const data = info.payload.data || {};
                const normalizedReply = normalizeText(data.reply || "");

                assert(after === before, "oke info detour created booking");
                assert(data.booking?.draft, "oke info detour lost draft");
                assert(normalizedReply.includes("chuc nang than"), "oke info detour did not explain package");
                assert(normalizedReply.includes("creatinine") || normalizedReply.includes("egfr"), "oke info detour missing components");
            }
        ],
        [
            "help_next_step_missing_address",
            async () => {
                const sessionId = uniqueId("help_next_5l1a");
                await setupMissingAddressDraft({ sessionId, phone: state.phone, date: state.date });
                const before = await countBookingsBySession(sessionId);
                const help = await postChat("giờ tôi cần làm gì", sessionId, userHeaders(state.phone));
                const after = await countBookingsBySession(sessionId);
                const normalizedReply = normalizeText(help.payload.data?.reply || "");

                assert(after === before, "help next step created booking");
                assert(
                    normalizedReply.includes("con thieu") &&
                        normalizedReply.includes("dia chi"),
                    "help next step did not ask for missing address"
                );
            }
        ],
        [
            "current_turn_review_missing_time_no_mutation",
            async () => {
                const sessionId = uniqueId("review_missing_time_5l1d");
                await setupMissingTimeDraft({ sessionId, phone: state.phone, date: state.date });
                const before = await countBookingsBySession(sessionId);
                const review = await postChat("Còn thiếu thông tin gì", sessionId, userHeaders(state.phone));
                const after = await countBookingsBySession(sessionId);
                const data = review.payload.data || {};
                const normalizedReply = normalizeText(data.reply || "");

                assert(after === before, "review missing time created booking");
                assert(!data.booking?.draft?.appointmentTime, "review missing time mutated appointmentTime");
                assert(data.meta?.conversationAct?.act === "review_draft", "missing info question was not review_draft");
                assert(
                    normalizedReply.includes("da ghi nhan") &&
                        normalizedReply.includes("con thieu") &&
                        normalizedReply.includes("gio lay mau"),
                    "review missing time did not list known and missing fields"
                );
            }
        ],
        [
            "ambiguous_ack_missing_address_no_address_mutation",
            async () => {
                const sessionId = uniqueId("ack_missing_address_5l1d");
                await setupMissingAddressDraft({ sessionId, phone: state.phone, date: state.date });
                const before = await countBookingsBySession(sessionId);
                const ack = await postChat("vậy cũng được", sessionId, userHeaders(state.phone));
                const after = await countBookingsBySession(sessionId);
                const data = ack.payload.data || {};
                const normalizedReply = normalizeText(data.reply || "");

                assert(after === before, "ambiguous ack missing address created booking");
                assert(!data.booking?.draft?.address, "ambiguous ack was set as address");
                assert(normalizedReply.includes("con thieu") && normalizedReply.includes("dia chi"), "ambiguous ack did not ask for address");
            }
        ],
        [
            "availability_inquiry_missing_address_no_address_mutation",
            async () => {
                const sessionId = uniqueId("availability_missing_address_5l1d");
                await setupMissingAddressDraft({ sessionId, phone: state.phone, date: state.date });
                const before = await countBookingsBySession(sessionId);
                const availability = await postChat("hiện tại có các khung giờ nào đang trống", sessionId, userHeaders(state.phone));
                const after = await countBookingsBySession(sessionId);
                const data = availability.payload.data || {};
                const normalizedReply = normalizeText(data.reply || "");

                assert(after === before, "availability inquiry created booking");
                assert(!data.booking?.draft?.address, "availability inquiry was set as address");
                assert(data.meta?.conversationAct?.act === "availability_inquiry", "availability question was not availability_inquiry");
                assert(
                    normalizedReply.includes("khung gio") ||
                        normalizedReply.includes("gio") ||
                        normalizedReply.includes("chua the hien thi"),
                    "availability inquiry did not return helpful availability response"
                );
            }
        ],
        [
            "clear_address_value_missing_address_sets_address",
            async () => {
                const sessionId = uniqueId("clear_address_5l1d");
                await setupMissingAddressDraft({ sessionId, phone: state.phone, date: state.date });
                const before = await countBookingsBySession(sessionId);
                const address = await postChat("766 Đê La Thành, Đống Đa, Hà Nội", sessionId, userHeaders(state.phone));
                const after = await countBookingsBySession(sessionId);
                const data = address.payload.data || {};
                const normalizedAddress = normalizeText(data.booking?.draft?.address || "");

                assert(after === before, "clear address value created booking");
                assert(normalizedAddress.includes("766") && normalizedAddress.includes("de la thanh"), "clear address value did not set address");
            }
        ],
        [
            "ambiguous_ack_missing_name_no_name_mutation",
            async () => {
                const sessionId = uniqueId("ack_missing_name_5l1d");
                await setupMissingNameDraft({ sessionId, phone: state.phone, date: state.date });
                const before = await countBookingsBySession(sessionId);
                const ack = await postChat("vậy cũng được", sessionId, userHeaders(state.phone));
                const after = await countBookingsBySession(sessionId);
                const data = ack.payload.data || {};
                const normalizedReply = normalizeText(data.reply || "");

                assert(after === before, "ambiguous ack missing name created booking");
                assert(!data.booking?.draft?.patientName, "ambiguous ack was set as patientName");
                assert(normalizedReply.includes("con thieu") && normalizedReply.includes("ten nguoi dat"), "ambiguous ack did not ask for patient name");
            }
        ],
        [
            "ambiguous_ack_ready_draft_does_not_create",
            async () => {
                const sessionId = uniqueId("ack_ready_5l1d");
                await setupReadyDraft({ sessionId, phone: state.phone, date: state.date });
                const before = await countBookingsBySession(sessionId);
                const ack = await postChat("vậy cũng được", sessionId, userHeaders(state.phone));
                const after = await countBookingsBySession(sessionId);
                const normalizedReply = normalizeText(ack.payload.data?.reply || "");

                assert(after === before, "ambiguous ack ready draft created booking");
                assert(
                    normalizedReply.includes("xac nhan dat lich") ||
                        (normalizedReply.includes("xac nhan") && normalizedReply.includes("sua")),
                    "ambiguous ack ready draft did not require clear confirmation"
                );
            }
        ],
        [
            "explicit_final_confirm_this_booking_creates_or_slot_failure",
            async () => {
                const sessionId = uniqueId("explicit_this_confirm_5l1d");
                await setupReadyDraft({ sessionId, phone: state.phone, date: state.date });
                const before = await countBookingsBySession(sessionId);
                const confirm = await postChat("xác nhận đặt lịch này", sessionId, userHeaders(state.phone));
                const after = await countBookingsBySession(sessionId);
                const normalizedReply = normalizeText(confirm.payload.data?.reply || "");

                assert(
                    after === before + 1 ||
                        normalizedReply.includes("khung gio") ||
                        normalizedReply.includes("het cho") ||
                        normalizedReply.includes("chua mo lich"),
                    "explicit final confirm neither created booking nor returned slot reason"
                );
            }
        ],
        [
            "unclear_life_phrase_missing_address_no_mutation",
            async () => {
                const sessionId = uniqueId("unclear_address_5l1b");
                await setupMissingAddressDraft({ sessionId, phone: state.phone, date: state.date });
                const before = await countBookingsBySession(sessionId);
                const unclear = await postChat("để tôi hỏi lại đã", sessionId, userHeaders(state.phone));
                const after = await countBookingsBySession(sessionId);
                const data = unclear.payload.data || {};
                const normalizedReply = normalizeText(data.reply || "");

                assert(after === before, "unclear address phrase created booking");
                assert(!data.booking?.draft?.address, "unclear phrase was set as address");
                assert(
                    normalizedReply.includes("tam dung") ||
                        normalizedReply.includes("dia chi"),
                    "unclear address phrase did not ask pause/address clarification"
                );
            }
        ],
        [
            "review_draft_shows_current_summary",
            async () => {
                const sessionId = uniqueId("review_draft_5l1a");
                await setupMissingAddressDraft({ sessionId, phone: state.phone, date: state.date });
                const before = await countBookingsBySession(sessionId);
                const review = await postChat("cho tôi xem lại thông tin", sessionId, userHeaders(state.phone));
                const after = await countBookingsBySession(sessionId);
                const normalizedReply = normalizeText(review.payload.data?.reply || "");

                assert(after === before, "review draft created booking");
                assert(
                    normalizedReply.includes("thong tin") &&
                        normalizedReply.includes("chuc nang than") &&
                        normalizedReply.includes("dia chi"),
                    "review draft did not show summary and missing fields"
                );
            }
        ],
        [
            "cancel_draft_requires_confirmation",
            async () => {
                const sessionId = uniqueId("cancel_draft_5l1");
                await setupReadyDraft({ sessionId, phone: state.phone, date: state.date });
                const before = await countBookingsBySession(sessionId);
                const cancel = await postChat("hủy đi", sessionId, userHeaders(state.phone));
                const after = await countBookingsBySession(sessionId);
                const normalizedReply = normalizeText(cancel.payload.data?.reply || "");

                assert(after === before, "cancel draft created booking");
                assert(
                    hasExplicitDraftCancelConfirmationPrompt(normalizedReply),
                    "cancel draft did not ask confirmation"
                );
            }
        ],
        [
            "ready_draft_cancel_natural_phrase",
            async () => {
                const sessionId = uniqueId("cancel_natural_5l1c");
                await setupReadyDraft({ sessionId, phone: state.phone, date: state.date });
                const before = await countBookingsBySession(sessionId);
                const cancel = await postChat("Tôi không muốn khám nữa bỏ lịch giúp tôi", sessionId, userHeaders(state.phone));
                const after = await countBookingsBySession(sessionId);
                const data = cancel.payload.data || {};
                const normalizedReply = normalizeText(data.reply || "");

                assert(after === before, "natural cancel phrase created booking");
                assert(data.booking?.draft, "natural cancel phrase lost draft");
                assert(data.meta?.sessionState === "booking_cancel_confirmation", "natural cancel did not set pending cancel state");
                assert(data.meta?.conversationAct?.act === "cancel_or_abort", "natural cancel was not classified as cancel_or_abort");
                assert(!normalizedReply.includes("y ban la muon tiep tuc"), "natural cancel returned generic unclear");
                assert(
                    normalizedReply.includes("chua tao lich") &&
                        hasExplicitDraftCancelConfirmationPrompt(normalizedReply) &&
                        normalizedReply.includes("tiep tuc dat lich"),
                    "natural cancel did not ask draft cancel confirmation"
                );
            }
        ],
        [
            "ready_draft_cancel_huy_lich",
            async () => {
                const sessionId = uniqueId("cancel_huy_lich_5l1c");
                await setupReadyDraft({ sessionId, phone: state.phone, date: state.date });
                const before = await countBookingsBySession(sessionId);
                const cancel = await postChat("Hủy lịch", sessionId, userHeaders(state.phone));
                const after = await countBookingsBySession(sessionId);
                const data = cancel.payload.data || {};
                const normalizedReply = normalizeText(data.reply || "");

                assert(after === before, "huy lich created booking");
                assert(data.booking?.draft, "huy lich lost draft");
                assert(data.meta?.sessionState === "booking_cancel_confirmation", "huy lich did not set pending cancel state");
                assert(data.meta?.conversationAct?.act === "cancel_or_abort", "huy lich was not classified as cancel_or_abort");
                assert(normalizedReply.includes("huy ban nhap"), "huy lich did not ask draft cancel confirmation");
            }
        ],
        [
            "ready_draft_cancel_short_huy",
            async () => {
                const sessionId = uniqueId("cancel_short_huy_5l1c");
                await setupReadyDraft({ sessionId, phone: state.phone, date: state.date });
                const before = await countBookingsBySession(sessionId);
                const cancel = await postChat("Hủy", sessionId, userHeaders(state.phone));
                const after = await countBookingsBySession(sessionId);
                const data = cancel.payload.data || {};
                const normalizedReply = normalizeText(data.reply || "");

                assert(after === before, "short huy created booking");
                assert(data.booking?.draft, "short huy lost draft");
                assert(data.meta?.sessionState === "booking_cancel_confirmation", "short huy did not set pending cancel state");
                assert(data.meta?.conversationAct?.reason === "short_cancel_in_active_booking_context", "short huy missing active context reason");
                assert(normalizedReply.includes("huy ban nhap"), "short huy did not ask draft cancel confirmation");
            }
        ],
        [
            "pending_cancel_huy_lich_still_requires_explicit",
            async () => {
                const sessionId = uniqueId("pending_huy_lich_5l1c");
                await setupReadyDraft({ sessionId, phone: state.phone, date: state.date });
                await postChat("Hủy", sessionId, userHeaders(state.phone));
                const before = await countBookingsBySession(sessionId);
                const again = await postChat("Hủy lịch", sessionId, userHeaders(state.phone));
                const after = await countBookingsBySession(sessionId);
                const data = again.payload.data || {};
                const normalizedReply = normalizeText(data.reply || "");

                assert(after === before, "pending huy lich created booking");
                assert(data.booking?.draft, "pending huy lich cleared draft");
                assert(data.meta?.sessionState === "booking_cancel_confirmation", "pending huy lich left cancel state");
                assert(
                    hasExplicitDraftCancelConfirmationPrompt(normalizedReply) &&
                        normalizedReply.includes("de xac nhan"),
                    "pending huy lich did not require explicit draft confirmation"
                );
            }
        ],
        [
            "pending_cancel_explicit_confirm",
            async () => {
                const sessionId = uniqueId("pending_confirm_5l1c");
                await setupReadyDraft({ sessionId, phone: state.phone, date: state.date });
                await postChat("Hủy", sessionId, userHeaders(state.phone));
                const before = await countBookingsBySession(sessionId);
                const confirmed = await postChat("Đúng, hủy bản nháp", sessionId, userHeaders(state.phone));
                const after = await countBookingsBySession(sessionId);
                const data = confirmed.payload.data || {};
                const normalizedReply = normalizeText(data.reply || "");

                assert(after === before, "explicit cancel confirm created booking");
                assert(!data.booking, "explicit cancel confirm returned active booking");
                assert(data.meta?.sessionState === "booking_closed", "explicit cancel confirm did not close draft");
                assert(normalizedReply.includes("da huy ban nhap"), "explicit cancel confirm did not say draft cancelled");
            }
        ],
        [
            "pending_cancel_reject",
            async () => {
                const sessionId = uniqueId("pending_reject_5l1c");
                await setupReadyDraft({ sessionId, phone: state.phone, date: state.date });
                await postChat("Hủy", sessionId, userHeaders(state.phone));
                const before = await countBookingsBySession(sessionId);
                const reject = await postChat("Không hủy nữa, tiếp tục đặt", sessionId, userHeaders(state.phone));
                const after = await countBookingsBySession(sessionId);
                const data = reject.payload.data || {};
                const normalizedReply = normalizeText(data.reply || "");

                assert(after === before, "pending cancel reject created booking");
                assert(data.booking?.draft, "pending cancel reject lost draft");
                assert(data.meta?.sessionState === "ready_for_confirmation", "pending cancel reject did not resume ready draft");
                assert(normalizedReply.includes("xac nhan"), "pending cancel reject did not return ready confirmation");
            }
        ],
        [
            "no_active_draft_cancel_existing",
            async () => {
                const sessionId = uniqueId("no_active_cancel_5l1c");
                const before = await countBookingsBySession(sessionId);
                const cancel = await postChat("Hủy lịch", sessionId, userHeaders(state.phone));
                const after = await countBookingsBySession(sessionId);
                const data = cancel.payload.data || {};
                const normalizedReply = normalizeText(data.reply || "");

                assert(after === before, "no active draft cancel created booking");
                assert(!normalizedReply.includes("da huy ban nhap"), "no active draft claimed draft was cancelled");
                assert(data.meta?.handledBy === "cancel.service", "no active draft did not route to existing booking cancel flow");
                assert(
                    normalizedReply.includes("ma dat lich") ||
                        normalizedReply.includes("hlb-yyyy"),
                    "no active draft cancel did not ask for booking code"
                );
            }
        ],
        [
            "pending_cancel_reject_resumes_draft",
            async () => {
                const sessionId = uniqueId("cancel_reject_5l1b");
                await setupReadyDraft({ sessionId, phone: state.phone, date: state.date });
                await postChat("hủy đi", sessionId, userHeaders(state.phone));
                const before = await countBookingsBySession(sessionId);
                const reject = await postChat("không hủy nữa, tiếp tục đặt", sessionId, userHeaders(state.phone));
                const after = await countBookingsBySession(sessionId);
                const data = reject.payload.data || {};
                const normalizedReply = normalizeText(data.reply || "");

                assert(after === before, "cancel reject created booking");
                assert(data.booking?.draft, "cancel reject lost draft");
                assert(data.meta?.sessionState === "ready_for_confirmation", "cancel reject did not clear pending cancel");
                assert(normalizedReply.includes("xac nhan"), "cancel reject did not return ready confirmation");
            }
        ],
        [
            "pending_cancel_unclear_asks_again",
            async () => {
                const sessionId = uniqueId("cancel_unclear_5l1b");
                await setupReadyDraft({ sessionId, phone: state.phone, date: state.date });
                await postChat("hủy đi", sessionId, userHeaders(state.phone));
                const before = await countBookingsBySession(sessionId);
                const unclear = await postChat("ờ", sessionId, userHeaders(state.phone));
                const after = await countBookingsBySession(sessionId);
                const data = unclear.payload.data || {};
                const normalizedReply = normalizeText(data.reply || "");

                assert(after === before, "cancel unclear created booking");
                assert(data.booking?.draft, "cancel unclear lost draft");
                assert(data.meta?.sessionState === "booking_cancel_confirmation", "cancel unclear cleared pending cancel");
                assert(
                    normalizedReply.includes("huy ban nhap") ||
                        normalizedReply.includes("tiep tuc dat lich"),
                    "cancel unclear did not ask cancel-or-continue"
                );
            }
        ],
        [
            "final_confirm_clear_creates_or_slot_failure",
            async () => {
                const sessionId = uniqueId("final_confirm_5l1a");
                await setupReadyDraft({ sessionId, phone: state.phone, date: state.date });
                const before = await countBookingsBySession(sessionId);
                const confirm = await postChat("xác nhận đặt lịch", sessionId, userHeaders(state.phone));
                const after = await countBookingsBySession(sessionId);
                const normalizedReply = normalizeText(confirm.payload.data?.reply || "");

                assert(
                    after === before + 1 ||
                        normalizedReply.includes("khung gio") ||
                        normalizedReply.includes("het cho") ||
                        normalizedReply.includes("chua mo lich"),
                    "clear final confirm neither created booking nor returned slot reason"
                );
                assert(!normalizedReply.includes("chua hieu ro"), "clear final confirm returned generic fallback");
            }
        ],
        [
            "urgent_override_still_wins",
            async () => {
                const sessionId = uniqueId("urgent_active_5l1");
                await setupReadyDraft({ sessionId, phone: state.phone, date: state.date });
                const before = await countBookingsBySession(sessionId);
                const urgent = await postChat("tôi đau ngực khó thở", sessionId, userHeaders(state.phone));
                const after = await countBookingsBySession(sessionId);
                const data = urgent.payload.data || {};
                const normalizedReply = normalizeText(data.reply || "");

                assert(after === before, "urgent override created booking");
                assert(data.flow !== "booking", "urgent routed to booking");
                assert(
                    data.meta?.intentGroup === "urgent_health" ||
                        normalizedReply.includes("cap cuu") ||
                        normalizedReply.includes("khan cap"),
                    "urgent override missing urgent_health handling"
                );
            }
        ]
    ];

    const results = [];

    for (const [id, fn] of cases) {
        results.push(await runCase(id, fn, state));
    }

    const passed = results.filter((result) => result.passed).length;
    const failed = results.length - passed;

    console.log(`TOTAL ${results.length} PASSED ${passed} FAILED ${failed}`);

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
