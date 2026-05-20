const availabilitySlotService = require("../src/services/booking-runtime/availability-slot.service");
const bookingRuntime = require("../src/services/booking-runtime/booking.service");
const prisma = require("../src/services/booking-runtime/prisma-client");
const { normalizeText } = require("../src/utils/text.util");

const API_BASE_URL = process.env.HOMELAB_API_BASE_URL || "http://localhost:5000";
const CHAT_URL = process.env.HOMELAB_CHAT_API_URL || `${API_BASE_URL}/api/chat`;

function uniqueId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makePhone(prefix = "09") {
    const suffix = `${Date.now()}${Math.floor(Math.random() * 10000)}`
        .replace(/\D/g, "")
        .slice(-8)
        .padStart(8, "0");

    return `${prefix}${suffix}`;
}

function isoDate(offsetDays = 80) {
    const date = new Date();
    date.setDate(date.getDate() + offsetDays);

    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0")
    ].join("-");
}

function displayDate(isoDateValue) {
    const [year, month, day] = String(isoDateValue).split("-");

    return `${day}/${month}/${year}`;
}

function hasBookingCode(text) {
    return /\bHLB-\d{8}-[A-Z0-9]{4,}\b/i.test(String(text || ""));
}

function extractBookingCode(text) {
    return String(text || "").match(/\bHLB-\d{8}-[A-Z0-9]{4,}\b/i)?.[0] || null;
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

async function parseJsonResponse(response) {
    try {
        return await response.json();
    } catch (error) {
        throw new Error(`API did not return JSON: ${response.status}`);
    }
}

async function postChat(message, sessionId) {
    const response = await fetch(CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, sessionId }),
        signal: AbortSignal.timeout(20000)
    });
    const payload = await parseJsonResponse(response);

    return { response, payload };
}

async function createSlot({ date, timeStart, timeEnd, capacity = 1 }) {
    return availabilitySlotService.createAvailabilitySlot({
        date,
        timeStart,
        timeEnd,
        capacity,
        area: "default",
        active: true
    });
}

async function createBooking({ patientName, phone, sampleDate, sampleTimeStart, address }) {
    return bookingRuntime.createConfirmedBooking(
        {
            patientName,
            phone,
            testTypeText: "Công thức máu CBC",
            sampleDate,
            sampleTimeStart,
            address: address || "12 Nguyễn Trãi, Quận 1"
        },
        {
            sessionId: uniqueId("smoke_5e2_setup"),
            createdSource: "CHAT",
            reason: "smoke_slot_aware_chatbot_ux_5e2"
        }
    );
}

async function countConfirmedBookingsForSession(sessionId) {
    return prisma.booking.count({
        where: {
            createdFromSessionId: sessionId,
            status: "CONFIRMED"
        }
    });
}

async function countActiveBookingsForPhone(phone) {
    return prisma.booking.count({
        where: {
            phone,
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

async function getBookingRecord(bookingCode) {
    return prisma.booking.findUnique({ where: { bookingCode } });
}

function bookingMessage({ date, time, phone, patientName = "Smoke Slot UX User" }) {
    return [
        `Tôi muốn đặt lịch xét nghiệm CBC ngày ${displayDate(date)} lúc ${time}`,
        "địa chỉ: 12 Nguyễn Trãi, Quận 1",
        `tên: ${patientName}`,
        `số điện thoại ${phone}`
    ].join(", ");
}

async function createBookingViaChat({ date, time, phone, patientName, sessionId }) {
    const first = await postChat(bookingMessage({ date, time, phone, patientName }), sessionId);
    assert(first.response.status === 200 && first.payload.success, "booking info chat failed");

    const second = await postChat("Xác nhận", sessionId);
    assert(second.response.status === 200 && second.payload.success, "booking confirm chat failed");

    return second.payload.data || {};
}

function assertFriendlySlotReply(payload, expectedPhrase, forbiddenCode) {
    const data = payload.data || {};
    const reply = data.reply || "";
    const normalizedReply = normalizeText(reply);
    const serialized = JSON.stringify(payload);

    assert(!hasBookingCode(reply), "reply unexpectedly contains booking code");
    assert(normalizedReply.includes(normalizeText(expectedPhrase)), `reply missing phrase: ${expectedPhrase}`);
    assert(!serialized.includes(forbiddenCode), `payload leaked technical code ${forbiddenCode}`);
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
    const offsetBase = 80 + Math.floor(Math.random() * 200);
    const state = {
        unopenedDate: isoDate(offsetBase),
        fullDate: isoDate(offsetBase + 1),
        availableDate: isoDate(offsetBase + 2),
        rescheduleDateA: isoDate(offsetBase + 3),
        rescheduleUnopenedDateB: isoDate(offsetBase + 4),
        rescheduleFullDateB: isoDate(offsetBase + 5),
        timeA: "08:22",
        timeB: "09:22",
        timeC: "10:22"
    };

    const cases = [
        [
            "booking_without_open_slot_friendly_message",
            async () => {
                const sessionId = uniqueId("smoke_5e2_unopened");
                const phone = makePhone("09");
                const before = await countConfirmedBookingsForSession(sessionId);
                const data = await createBookingViaChat({
                    date: state.unopenedDate,
                    time: state.timeA,
                    phone,
                    patientName: "Smoke Slot UX Unopened",
                    sessionId
                });
                const after = await countConfirmedBookingsForSession(sessionId);

                assertFriendlySlotReply({ data }, "chưa mở lịch", "BOOKING_SLOT_NOT_OPEN");
                assert(after === before, "confirmed booking was created for unopened slot");
            }
        ],
        [
            "booking_full_slot_friendly_message",
            async () => {
                await createSlot({
                    date: state.fullDate,
                    timeStart: state.timeA,
                    timeEnd: state.timeB,
                    capacity: 1
                });
                await createBooking({
                    patientName: "Smoke Slot UX Occupant",
                    phone: makePhone("09"),
                    sampleDate: state.fullDate,
                    sampleTimeStart: state.timeA
                });

                const sessionId = uniqueId("smoke_5e2_full");
                const phone = makePhone("09");
                const before = await countActiveBookingsForPhone(phone);
                const data = await createBookingViaChat({
                    date: state.fullDate,
                    time: state.timeA,
                    phone,
                    patientName: "Smoke Slot UX Full",
                    sessionId
                });
                const after = await countActiveBookingsForPhone(phone);

                assertFriendlySlotReply({ data }, "hết chỗ", "BOOKING_SLOT_FULL");
                assert(after === before, "second booking was created in full slot");
            }
        ],
        [
            "booking_available_slot_still_succeeds",
            async () => {
                await createSlot({
                    date: state.availableDate,
                    timeStart: state.timeA,
                    timeEnd: state.timeB,
                    capacity: 2
                });

                const sessionId = uniqueId("smoke_5e2_available");
                const data = await createBookingViaChat({
                    date: state.availableDate,
                    time: state.timeA,
                    phone: makePhone("09"),
                    patientName: "Smoke Slot UX Available",
                    sessionId
                });
                const reply = data.reply || "";
                const bookingCode = data.booking?.bookingCode || extractBookingCode(reply);

                assert(bookingCode, "successful booking did not return HLB booking code");
                assert(data.booking?.status === "CONFIRMED", `booking status is ${data.booking?.status}`);
            }
        ],
        [
            "reschedule_to_unopened_slot_friendly_message",
            async () => {
                await createSlot({
                    date: state.rescheduleDateA,
                    timeStart: state.timeA,
                    timeEnd: state.timeB,
                    capacity: 2
                });
                const booking = await createBooking({
                    patientName: "Smoke Slot UX Reschedule Unopened",
                    phone: makePhone("09"),
                    sampleDate: state.rescheduleDateA,
                    sampleTimeStart: state.timeA
                });
                const sessionId = uniqueId("smoke_5e2_reschedule_unopened");
                const before = await getBookingRecord(booking.bookingCode);
                const { response, payload } = await postChat(
                    `Tôi muốn đổi lịch ${booking.bookingCode} sang ngày ${displayDate(state.rescheduleUnopenedDateB)} lúc ${state.timeC}`,
                    sessionId
                );
                const after = await getBookingRecord(booking.bookingCode);

                assert(response.status === 200 && payload.success, "reschedule unopened chat failed");
                assertFriendlySlotReply(payload, "khung giờ mới", "BOOKING_SLOT_NOT_OPEN");
                assert(normalizeText(payload.data.reply).includes("chua mo lich"), "reschedule reply missing unopened-slot phrase");
                assert(after.sampleDate.getTime() === before.sampleDate.getTime(), "booking date changed despite unopened slot");
                assert(after.sampleTimeStart.getTime() === before.sampleTimeStart.getTime(), "booking time changed despite unopened slot");
            }
        ],
        [
            "reschedule_to_full_slot_friendly_message",
            async () => {
                await createSlot({
                    date: state.rescheduleFullDateB,
                    timeStart: state.timeB,
                    timeEnd: state.timeC,
                    capacity: 1
                });
                await createSlot({
                    date: state.rescheduleFullDateB,
                    timeStart: state.timeC,
                    timeEnd: "11:22",
                    capacity: 2
                });
                await createBooking({
                    patientName: "Smoke Slot UX Full Target",
                    phone: makePhone("09"),
                    sampleDate: state.rescheduleFullDateB,
                    sampleTimeStart: state.timeB
                });
                const booking = await createBooking({
                    patientName: "Smoke Slot UX Reschedule Full",
                    phone: makePhone("09"),
                    sampleDate: state.rescheduleFullDateB,
                    sampleTimeStart: state.timeC
                });
                const before = await getBookingRecord(booking.bookingCode);
                const sessionId = uniqueId("smoke_5e2_reschedule_full");
                const { response, payload } = await postChat(
                    `Tôi muốn đổi lịch ${booking.bookingCode} sang ngày ${displayDate(state.rescheduleFullDateB)} lúc ${state.timeB}`,
                    sessionId
                );
                const after = await getBookingRecord(booking.bookingCode);

                assert(response.status === 200 && payload.success, "reschedule full chat failed");
                assertFriendlySlotReply(payload, "khung giờ mới", "BOOKING_SLOT_FULL");
                assert(normalizeText(payload.data.reply).includes("het cho"), "reschedule reply missing full-slot phrase");
                assert(after.sampleDate.getTime() === before.sampleDate.getTime(), "booking date changed despite full slot");
                assert(after.sampleTimeStart.getTime() === before.sampleTimeStart.getTime(), "booking time changed despite full slot");
            }
        ],
        [
            "urgent_booking_still_bypasses_slot_and_does_not_create",
            async () => {
                const sessionId = uniqueId("smoke_5e2_urgent");
                const before = await prisma.booking.count({
                    where: { createdFromSessionId: sessionId }
                });
                const { response, payload } = await postChat(
                    "Tôi muốn đặt lịch xét nghiệm vì đau ngực khó thở vã mồ hôi",
                    sessionId
                );
                const after = await prisma.booking.count({
                    where: { createdFromSessionId: sessionId }
                });
                const data = payload.data || {};
                const reply = data.reply || "";
                const normalizedReply = normalizeText(reply);

                assert(response.status === 200 && payload.success, "urgent chat failed");
                assert(!hasBookingCode(reply), "urgent reply unexpectedly has booking code");
                assert(data.flow !== "booking", "urgent query routed to booking");
                assert(
                    normalizedReply.includes("cap cuu") ||
                        normalizedReply.includes("khan cap") ||
                        normalizedReply.includes("di kham"),
                    "urgent response missing emergency guidance"
                );
                assert(after === before, "urgent query created booking");
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
