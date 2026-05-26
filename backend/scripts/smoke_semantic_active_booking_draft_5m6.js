const path = require("path");

try {
    require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
} catch {
    // dotenv is optional for smoke syntax checks; runtime can still use process env.
}

const packageCatalog = require("../src/services/booking-package-catalog.service");
const { normalizeText } = require("../src/utils/text.util");

let prisma = null;

const API_BASE_URL = process.env.HOMELAB_API_BASE_URL || "http://localhost:5000";
const CHAT_URL = process.env.HOMELAB_CHAT_API_URL || `${API_BASE_URL}/api/chat`;
const REQUEST_TIMEOUT_MS = 90000;

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

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
        "x-demo-user-id": "admin-smoke-5m6"
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
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    const payload = await parseJsonResponse(response);

    return { response, payload };
}

async function postChat(message, sessionId, headers = {}) {
    const response = await fetch(CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ message, sessionId }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    const payload = await parseJsonResponse(response);

    assert(response.status === 200 && payload.success, `chat failed for "${message}"`);
    return payload.data || {};
}

async function createSlot({ date, timeStart, timeEnd, capacity = 60 }) {
    const existing = await request(
        `/api/admin/availability-slots?date=${encodeURIComponent(date)}&active=true`,
        { method: "GET", headers: adminHeaders() }
    );
    const existingSlot = (existing.payload.data?.slots || []).find(
        (slot) => slot.date === date && slot.timeStart === timeStart
    );

    if (existingSlot) {
        const updated = await request(`/api/admin/availability-slots/${existingSlot.id}`, {
            method: "PATCH",
            headers: adminHeaders(),
            body: JSON.stringify({ capacity, active: true })
        });
        assert(updated.response.status === 200 && updated.payload.success, "slot update failed");
        return;
    }

    const created = await request("/api/admin/availability-slots", {
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

    assert(created.response.status === 201 && created.payload.success, "slot create failed");
}

async function countBookingsBySession(sessionId) {
    return prisma.booking.count({ where: { createdFromSessionId: sessionId } });
}

function assertMissing(data, field, label) {
    assert((data.booking?.missingFields || []).includes(field), `${label}: missing ${field} was not reported`);
}

function assertNoAmbiguousFieldSaved(data, label) {
    const draft = data.booking?.draft || {};
    const badValues = ["oke nhe", "vay cung duoc"];
    assert(!badValues.includes(normalizeText(draft.appointmentTime || "")), `${label}: ambiguous text saved as time`);
    assert(!badValues.includes(normalizeText(draft.address || "")), `${label}: ambiguous text saved as address`);
    assert(!badValues.includes(normalizeText(draft.patientName || "")), `${label}: ambiguous text saved as name`);
}

function assertReadonlyIntentMeta(data, expectedAct, label) {
    const meta = data.meta?.conversationAct || {};
    assert(
        meta.currentTurnIntentUsed === expectedAct ||
            meta.rule?.act === expectedAct ||
            meta.act === expectedAct,
        `${label}: expected current turn ${expectedAct}`
    );
    assert(
        ["rule", "semantic_shadow", "fallback_policy"].includes(meta.currentTurnIntentSource),
        `${label}: missing currentTurnIntentSource`
    );
}

function assertPackageDetailReply(data, label) {
    const reply = normalizeText(data.reply || "");
    assertReadonlyIntentMeta(data, "info_detour", label);
    assert(!data.booking?.draft?.appointmentTime, `${label}: info detour mutated appointmentTime`);
    assert(reply.includes("chuc nang gan"), `${label}: reply did not mention liver package`);
    assert(reply.includes("gio lay mau"), `${label}: reply did not return to missing time`);
}

async function main() {
    if (!process.env.DATABASE_URL) {
        console.log(JSON.stringify({
            ok: true,
            blocked: true,
            script: "smoke_semantic_active_booking_draft_5m6",
            reason: "DATABASE_URL missing; DB smoke blocked"
        }, null, 2));
        return;
    }

    prisma = require("../src/services/booking-runtime/prisma-client");

    const sessionId = uniqueId("active_draft_5m6");
    const phone = makePhone();
    const tomorrow = isoDate(1);

    await packageCatalog.ensureRequiredCatalogItems();
    await createSlot({ date: tomorrow, timeStart: "08:30", timeEnd: "09:30" });

    const before = await countBookingsBySession(sessionId);

    let data = await postChat(
        `toi muon dat lich xet nghiem ngay ${displayDate(tomorrow)}`,
        sessionId,
        userHeaders(phone)
    );
    assertMissing(data, "testType", "start");

    data = await postChat("goi chuc nang gan", sessionId, userHeaders(phone));
    assert(data.booking?.draft?.testType, "package was not saved");
    assertMissing(data, "appointmentTime", "package");

    data = await postChat("con thieu thong tin gi", sessionId, userHeaders(phone));
    let reply = normalizeText(data.reply || "");
    assertReadonlyIntentMeta(data, "review_draft", "review");
    assert(reply.includes("chuc nang gan") && reply.includes("con thieu") && reply.includes("gio lay mau") && reply.includes("dia chi") && reply.includes("ten nguoi dat"), "review did not include summary and missing fields");

    data = await postChat("noi ro cho toi ve goi chuc nang gan", sessionId, userHeaders(phone));
    assertPackageDetailReply(data, "explicit package explanation");

    data = await postChat("toi muon hieu ky hon ve goi nay", sessionId, userHeaders(phone));
    assertPackageDetailReply(data, "contextual package explanation");

    data = await postChat("cai nay dung de lam gi", sessionId, userHeaders(phone));
    assertPackageDetailReply(data, "contextual purpose question");

    data = await postChat("goi nay gom nhung gi", sessionId, userHeaders(phone));
    assertPackageDetailReply(data, "components package question");

    data = await postChat("oke nhe", sessionId, userHeaders(phone));
    assertNoAmbiguousFieldSaved(data, "ambiguous time ack");
    assertMissing(data, "appointmentTime", "ambiguous time ack");

    data = await postChat("8h30", sessionId, userHeaders(phone));
    assert(data.booking?.draft?.appointmentTime === "08:30", "time was not saved");
    assertMissing(data, "address", "time");

    data = await postChat("vay cung duoc", sessionId, userHeaders(phone));
    assertNoAmbiguousFieldSaved(data, "ambiguous address ack");
    assert(!data.booking?.draft?.address, "ambiguous address ack saved address");
    assertMissing(data, "address", "ambiguous address ack");

    const beforeAvailabilityDraft = JSON.stringify(data.booking?.draft || {});
    data = await postChat("hien tai co khung gio nao dang trong", sessionId, userHeaders(phone));
    reply = normalizeText(data.reply || "");
    assertReadonlyIntentMeta(data, "availability_inquiry", "availability");
    assert(JSON.stringify(data.booking?.draft || {}) === beforeAvailabilityDraft, "availability inquiry mutated draft");
    assert(!data.booking?.draft?.address, "availability inquiry was saved as address");
    assert(reply.includes("khung gio") || reply.includes("08:30") || reply.includes("chua the hien thi"), "availability reply did not mention slots");

    data = await postChat("dia chi: 766 De La Thanh, phuong O Cho Dua, Ha Noi", sessionId, userHeaders(phone));
    assert(normalizeText(data.booking?.draft?.address || "").includes("de la thanh"), "address was not saved");
    assertMissing(data, "patientName", "address");

    data = await postChat("ten: Tran Van C", sessionId, userHeaders(phone));
    assert(data.booking?.draft?.patientName === "Tran Van C", "name was not saved");
    assert((data.booking?.missingFields || []).length === 0, "ready draft still has missing fields");

    const beforeReview = await countBookingsBySession(sessionId);
    data = await postChat("cho toi xem lai thong tin", sessionId, userHeaders(phone));
    reply = normalizeText(data.reply || "");
    const afterReview = await countBookingsBySession(sessionId);
    assert(afterReview === beforeReview, "review created booking before explicit confirmation");
    assert(reply.includes("thong tin") && reply.includes("chuc nang gan") && reply.includes("08:30") && reply.includes("tran van c"), "final review did not include draft summary");

    data = await postChat("xac nhan dat lich", sessionId, userHeaders(phone));
    const afterConfirm = await countBookingsBySession(sessionId);
    assert(afterConfirm === before + 1, "explicit confirmation did not create booking");
    assert(data.action === "BOOKING_CREATED", "confirmation did not return BOOKING_CREATED");

    console.log(JSON.stringify({
        ok: true,
        script: "smoke_semantic_active_booking_draft_5m6",
        sessionId
    }, null, 2));
}

main().catch((error) => {
    console.error(JSON.stringify({
        ok: false,
        script: "smoke_semantic_active_booking_draft_5m6",
        error: error.message,
        stack: error.stack
    }, null, 2));
    process.exit(1);
});
