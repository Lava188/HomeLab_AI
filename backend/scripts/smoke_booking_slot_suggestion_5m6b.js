const path = require("path");

const bookingRuntime = require("../src/services/booking-runtime/booking.service");
const availabilitySlotService = require("../src/services/booking-runtime/availability-slot.service");
const mockSessions = require("../src/data/mockSessions");
const packageCatalog = require("../src/services/booking-package-catalog.service");
const { normalizeText } = require("../src/utils/text.util");

const bookingServicePath = path.resolve(__dirname, "../src/services/booking.service.js");

const liverPackage = {
    id: "pkg-liver",
    code: "LIVER_FUNCTION",
    name: "Chức năng gan",
    description: "Đánh giá chức năng gan ở mức thông tin chung.",
    category: "Biochemistry",
    sampleType: "Blood",
    components: ["AST", "ALT", "GGT", "Bilirubin"],
    suitableFor: "Theo dõi sức khỏe gan.",
    preparationNotes: []
};

let slotScenario = {};

bookingRuntime.saveOrUpdateDraft = async () => ({ id: "mock-draft" });
bookingRuntime.clearDraft = async () => ({ count: 1 });
bookingRuntime.createConfirmedBooking = async () => {
    throw new Error("smoke should not create bookings");
};

packageCatalog.resolvePackageIntent = async (message = "") => {
    const normalized = normalizeText(message);

    if (normalized.includes("chuc nang gan") || normalized.includes("gan")) {
        return {
            type: "selected",
            package: liverPackage,
            candidates: []
        };
    }

    return { type: "none", package: null, candidates: [] };
};

availabilitySlotService.findAvailableNearbySlots = async ({ requestedDate }) =>
    (slotScenario[requestedDate] || []).map((slot) => ({ ...slot }));

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function uniqueId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function userSession() {
    return { phone: "0900000001" };
}

function loadBookingService() {
    delete require.cache[bookingServicePath];
    return require(bookingServicePath);
}

async function post(service, sessionId, message) {
    return service.handleBookingMessage({ message, sessionId, userSession: userSession() });
}

function replyText(data) {
    return normalizeText(data.reply || "");
}

function seedDraft(sessionId, overrides = {}) {
    mockSessions.clearSession(sessionId);
    mockSessions.upsertSession(sessionId, {
        currentFlow: "booking",
        status: "collecting_info",
        bookingDraft: {
            testType: "Chức năng gan",
            appointmentDate: null,
            appointmentTime: null,
            address: null,
            addressPartial: null,
            patientName: null,
            phoneNumber: "0900000001",
            testCatalogItemId: liverPackage.id,
            selectedPackage: liverPackage,
            packageConfirmed: false,
            ...overrides
        },
        confirmedBookingId: null,
        lastBookingFailure: null,
        lastAvailabilitySuggestion: null,
        pendingDraftEdit: null,
        pendingDraftCancel: null
    });
}

function expectNoGenericTimePrompt(data, label) {
    const reply = replyText(data);
    assert(!reply.includes("vui long cung cap them gio lay mau"), `${label}: generic time prompt leaked`);
}

async function main() {
    const service = loadBookingService();
    const summaries = [];

    slotScenario = {
        "2026-05-27": [
            { date: "2026-05-27", timeStart: "08:00", timeEnd: "08:30", remainingCapacity: 2, active: true },
            { date: "2026-05-27", timeStart: "08:30", timeEnd: "09:00", remainingCapacity: 2, active: true },
            { date: "2026-05-27", timeStart: "09:00", timeEnd: "09:30", remainingCapacity: 2, active: true }
        ],
        "2026-05-29": [
            { date: "2026-05-29", timeStart: "08:00", timeEnd: "08:30", remainingCapacity: 2, active: true },
            { date: "2026-05-29", timeStart: "08:30", timeEnd: "09:00", remainingCapacity: 2, active: true }
        ],
        "2026-05-28": [
            { date: "2026-05-29", timeStart: "08:00", timeEnd: "08:30", remainingCapacity: 2, active: true },
            { date: "2026-05-29", timeStart: "08:30", timeEnd: "09:00", remainingCapacity: 2, active: true }
        ],
        "2026-05-30": [],
        "2026-05-31": [
            { date: "2026-06-01", timeStart: "08:00", timeEnd: "08:30", remainingCapacity: 2, active: true }
        ]
    };

    const sessionA = uniqueId("slot_5m6b_a");
    let data = await post(service, sessionA, "toi muon dat lich xet nghiem ngay 27/05/2026");
    assert((data.booking?.missingFields || []).includes("testType"), "A: should ask package first");

    data = await post(service, sessionA, "goi chuc nang gan");
    let reply = replyText(data);
    expectNoGenericTimePrompt(data, "A");
    assert(reply.includes("cac khung gio con trong") && reply.includes("08:00") && reply.includes("08:30"), "A: same-day slots missing");
    summaries.push({ case: "A", result: "same-day slot suggestions shown" });

    data = await post(service, sessionA, "chon 8h30");
    reply = replyText(data);
    assert(data.booking?.draft?.appointmentTime === "08:30", "B: suggested time was not saved");
    assert((data.booking?.missingFields || []).includes("address"), "B: address should be next missing field");
    assert(reply.includes("dia chi"), "B: bot did not ask address next");
    summaries.push({ case: "B", result: "suggested slot selection saved time" });

    const sessionC = uniqueId("slot_5m6b_c");
    data = await post(service, sessionC, "toi muon dat lich xet nghiem ngay 28/05/2026");
    data = await post(service, sessionC, "goi chuc nang gan");
    reply = replyText(data);
    expectNoGenericTimePrompt(data, "C");
    assert(reply.includes("ngay 28/05/2026 hien chua con khung gio phu hop"), "C: missing no-slot wording");
    assert(reply.includes("29/05/2026 luc 08:00") && reply.includes("doi sang ngay khac"), "C: nearby slots missing");
    summaries.push({ case: "C", result: "nearby slots suggested" });

    const sessionD = uniqueId("slot_5m6b_d");
    data = await post(service, sessionD, "toi muon dat lich xet nghiem ngay 30/05/2026");
    data = await post(service, sessionD, "goi chuc nang gan");
    reply = replyText(data);
    assert(reply.includes("hien homelab chua tim thay khung gio kha dung gan ngay 30/05/2026"), "D: no nearby message missing");
    assert(!reply.includes("08:00") && !reply.includes("08:30"), "D: bot fabricated or leaked slots");
    summaries.push({ case: "D", result: "no nearby slot is explicit" });

    const sessionE = uniqueId("slot_5m6b_e");
    data = await post(service, sessionE, "goi chuc nang gan");
    reply = replyText(data);
    assert(reply.includes("ngay lay mau"), "E: should ask date");
    assert(!reply.includes("khung gio con trong"), "E: should not suggest slots without date");
    summaries.push({ case: "E", result: "missing date asks date first" });

    const sessionF = uniqueId("slot_5m6b_f");
    data = await post(service, sessionF, "toi muon dat lich xet nghiem ngay 27/05/2026");
    reply = replyText(data);
    assert(reply.includes("goi") || reply.includes("xet nghiem"), "F: should ask package");
    assert(!reply.includes("khung gio con trong"), "F: should not suggest slots without package");
    summaries.push({ case: "F", result: "missing package asks package first" });

    const sessionG = uniqueId("slot_5m6b_g");
    seedDraft(sessionG, { appointmentDate: "2026-05-27" });
    data = await post(service, sessionG, "hien tai con khung gio nao trong");
    reply = replyText(data);
    assert(reply.includes("cac khung gio con trong") && reply.includes("08:00"), "G: availability inquiry did not reuse slot suggestion");
    const beforeDraft = JSON.stringify(data.booking?.draft || {});
    assert(JSON.stringify(mockSessions.getSession(sessionG).bookingDraft || {}) === beforeDraft, "G: availability inquiry mutated draft");
    summaries.push({ case: "G", result: "availability inquiry uses same reply builder" });

    const sessionH = uniqueId("slot_5m6b_h");
    seedDraft(sessionH, {
        appointmentDate: "2026-05-27",
        appointmentTime: "08:30"
    });
    data = await post(service, sessionH, "toi muon dat lich ngay 32/5/2026");
    reply = replyText(data);
    assert(reply.includes("ngay 32/05/2026 khong hop le"), "H: invalid date was not explained");
    assert(!data.booking?.draft?.address, "H: invalid date was saved as address");
    assert(data.booking?.draft?.appointmentDate === "2026-05-27", "H: invalid date changed draft date");
    assert(data.booking?.draft?.appointmentTime === "08:30", "H: invalid date changed draft time");
    assert(data.meta?.conversationAct?.currentTurnIntentUsed === "invalid_date", "H: invalid date meta missing");
    summaries.push({ case: "H", result: "invalid current-turn date is not parsed as address" });

    const sessionI = uniqueId("slot_5m6b_i");
    seedDraft(sessionI, {
        appointmentDate: "2026-05-27",
        appointmentTime: "08:30"
    });
    data = await post(service, sessionI, "toi muon dat lich ngay 29/05/2026");
    reply = replyText(data);
    assert(data.booking?.draft?.appointmentDate === "2026-05-29", "I: date change was not saved");
    assert(!data.booking?.draft?.appointmentTime, "I: old time was not cleared after date change");
    assert(!data.booking?.draft?.address, "I: date change was saved as address");
    assert(reply.includes("cap nhat ngay lay mau sang 29/05/2026"), "I: date change acknowledgement missing");
    assert(reply.includes("08:00") && reply.includes("08:30"), "I: same-day slots missing after date change");
    assert(data.meta?.conversationAct?.currentTurnIntentUsed === "date_change", "I: date change meta missing");
    summaries.push({ case: "I", result: "valid current-turn date change clears time and suggests slots" });

    const sessionJ = uniqueId("slot_5m6b_j");
    seedDraft(sessionJ, {
        appointmentDate: "2026-05-27",
        appointmentTime: "08:30"
    });
    data = await post(service, sessionJ, "doi sang ngay 31/05/2026");
    reply = replyText(data);
    assert(data.booking?.draft?.appointmentDate === "2026-05-31", "J: no-slot date change was not saved");
    assert(!data.booking?.draft?.appointmentTime, "J: old time was not cleared for no-slot date");
    assert(reply.includes("ngay 31/05/2026 hien chua con khung gio phu hop"), "J: no-slot wording missing");
    assert(reply.includes("01/06/2026 luc 08:00"), "J: nearby slot missing");
    summaries.push({ case: "J", result: "date change to no-slot day suggests nearby slots" });

    const sessionK = uniqueId("slot_5m6b_k");
    seedDraft(sessionK, {
        appointmentDate: "2026-05-27",
        appointmentTime: "08:30"
    });
    data = await post(service, sessionK, "hien tai con khung gio nao trong");
    reply = replyText(data);
    assert(reply.includes("hien ban dang chon 08:30 ngay 27/05/2026"), "K: current selected time missing");
    assert(reply.includes("08:00") && reply.includes("08:30"), "K: available slots missing");
    assert(reply.includes("giu 08:30") && reply.includes("doi sang khung gio khac"), "K: keep/change question missing");
    summaries.push({ case: "K", result: "availability inquiry reminds selected time" });

    const sessionL = uniqueId("slot_5m6b_l");
    seedDraft(sessionL, {
        appointmentDate: "2026-05-27",
        appointmentTime: "08:30"
    });
    data = await post(service, sessionL, "766 De La Thanh, Dong Da, Ha Noi");
    assert(normalizeText(data.booking?.draft?.address || "").includes("de la thanh"), "L: real address was not saved");
    summaries.push({ case: "L", result: "real address still saves normally" });

    console.log(JSON.stringify({
        ok: true,
        script: "smoke_booking_slot_suggestion_5m6b",
        summaries
    }, null, 2));
}

main().catch((error) => {
    console.error(JSON.stringify({
        ok: false,
        script: "smoke_booking_slot_suggestion_5m6b",
        error: error.message,
        stack: error.stack
    }, null, 2));
    process.exit(1);
});
