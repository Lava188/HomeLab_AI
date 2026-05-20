const bookingRuntime = require("../src/services/booking-runtime/booking.service");
const prisma = require("../src/services/booking-runtime/prisma-client");

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

function isoDate(offsetDays = 30) {
    const date = new Date();
    date.setDate(date.getDate() + offsetDays);

    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0")
    ].join("-");
}

function hasBookingCode(text) {
    return /\bHLB-\d{8}-[A-Z0-9]{4,}\b/i.test(String(text || ""));
}

async function parseJsonResponse(response) {
    try {
        return await response.json();
    } catch (error) {
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

function adminHeaders() {
    return {
        "x-demo-role": "ADMIN",
        "x-demo-user-id": "smoke_slot_5d2_admin"
    };
}

function userHeaders(phone) {
    return {
        "x-demo-role": "USER",
        "x-demo-user-id": "smoke_slot_5d2_user",
        "x-demo-phone": phone
    };
}

function collectorHeaders(phone) {
    return {
        "x-demo-role": "COLLECTOR",
        "x-demo-user-id": "smoke_slot_5d2_collector",
        "x-demo-phone": phone
    };
}

async function createSlot({ date, timeStart, timeEnd = "09:00", capacity = 1 }) {
    const { response, payload } = await request("/api/admin/availability-slots", {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({
            date,
            timeStart,
            timeEnd,
            capacity,
            area: "default"
        })
    });

    if (response.status !== 201 || !payload.success) {
        throw new Error(`create slot failed: ${response.status} ${JSON.stringify(payload)}`);
    }

    return payload.data;
}

async function createBooking({
    patientName,
    phone = makePhone("09"),
    sampleDate,
    sampleTimeStart,
    address = "12 Nguyen Trai, Smoke Slot Capacity"
}) {
    return bookingRuntime.createConfirmedBooking(
        {
            patientName,
            phone,
            testTypeText: "Cong thuc mau CBC",
            sampleDate,
            sampleTimeStart,
            address
        },
        {
            sessionId: uniqueId("smoke_slot_5d2_booking"),
            createdSource: "CHAT",
            reason: "smoke_booking_slot_capacity_5d2"
        }
    );
}

async function getBookingRecord(bookingCode) {
    return prisma.booking.findUnique({
        where: { bookingCode },
        include: {
            assignedStaff: true,
            statusHistory: {
                orderBy: { createdAt: "asc" }
            }
        }
    });
}

async function activeCount(date, timeStart) {
    const bookings = await prisma.booking.findMany({
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
        },
        select: {
            sampleTimeStart: true
        }
    });

    return bookings.filter((booking) => {
        const value = booking.sampleTimeStart;
        const hour = String(value.getUTCHours()).padStart(2, "0");
        const minute = String(value.getUTCMinutes()).padStart(2, "0");

        return `${hour}:${minute}` === timeStart;
    }).length;
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function assertSlotError(error, expectedCode) {
    assert(error?.code === expectedCode, `expected ${expectedCode}, got ${error?.code}`);
    assert(error?.statusCode === 409, `expected statusCode 409, got ${error?.statusCode}`);
    assert(Boolean(error.message), "slot error message missing");
}

async function adminAssign(bookingCode, collectorPhone) {
    return request(`/api/admin/bookings/${bookingCode}/assign`, {
        method: "PATCH",
        headers: adminHeaders(),
        body: JSON.stringify({
            staffName: "Smoke Slot Collector",
            staffPhone: collectorPhone,
            role: "SAMPLE_COLLECTOR"
        })
    });
}

async function adminUpdateStatus(bookingCode, status, reason) {
    return request(`/api/admin/bookings/${bookingCode}/status`, {
        method: "PATCH",
        headers: adminHeaders(),
        body: JSON.stringify({ status, reason })
    });
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
    const offsetBase = 45 + Math.floor(Math.random() * 200);
    const state = {
        dateA: isoDate(offsetBase),
        dateB: isoDate(offsetBase + 1),
        dateC: isoDate(offsetBase + 2),
        timeA: "08:11",
        timeB: "09:11",
        timeC: "10:11",
        timeClosed: "16:41",
        bookingA: null,
        bookingAfterCancel: null,
        sourceBooking: null,
        roleBooking: null
    };

    const cases = [
        [
            "create_slot_capacity_1",
            async () => {
                const slot = await createSlot({
                    date: state.dateA,
                    timeStart: state.timeA,
                    timeEnd: "09:11",
                    capacity: 1
                });

                assert(slot.capacity === 1, "slot capacity mismatch");
                assert(slot.date === state.dateA, "slot date mismatch");
                assert(slot.timeStart === state.timeA, "slot timeStart mismatch");
            }
        ],
        [
            "confirm_booking_uses_available_slot",
            async () => {
                state.bookingA = await createBooking({
                    patientName: "Smoke Slot Patient A",
                    phone: makePhone("09"),
                    sampleDate: state.dateA,
                    sampleTimeStart: state.timeA
                });

                assert(state.bookingA.status === "CONFIRMED", `status is ${state.bookingA.status}`);
                assert(await activeCount(state.dateA, state.timeA) === 1, "active slot count is not 1");
            }
        ],
        [
            "second_booking_same_slot_rejected_when_full",
            async () => {
                let error = null;

                try {
                    await createBooking({
                        patientName: "Smoke Slot Patient B",
                        phone: makePhone("09"),
                        sampleDate: state.dateA,
                        sampleTimeStart: state.timeA
                    });
                } catch (caughtError) {
                    error = caughtError;
                }

                assertSlotError(error, "BOOKING_SLOT_FULL");
            }
        ],
        [
            "cancel_booking_releases_slot",
            async () => {
                const cancelled = await bookingRuntime.cancelBooking(
                    state.bookingA.bookingCode,
                    { reason: "smoke slot release" },
                    {
                        changedByType: "SMOKE",
                        changedById: "smoke_slot_5d2",
                        source: "smoke_slot_5d2"
                    }
                );

                assert(cancelled.status === "CANCELLED", `status is ${cancelled.status}`);
                assert(await activeCount(state.dateA, state.timeA) === 0, "slot was not released by cancel");
            }
        ],
        [
            "confirm_booking_after_cancel_succeeds",
            async () => {
                state.bookingAfterCancel = await createBooking({
                    patientName: "Smoke Slot Patient After Cancel",
                    phone: makePhone("09"),
                    sampleDate: state.dateA,
                    sampleTimeStart: state.timeA
                });

                assert(state.bookingAfterCancel.status === "CONFIRMED", "booking after cancel was not confirmed");
            }
        ],
        [
            "reschedule_to_full_slot_rejected",
            async () => {
                await createSlot({
                    date: state.dateB,
                    timeStart: state.timeB,
                    timeEnd: "10:11",
                    capacity: 1
                });
                await createSlot({
                    date: state.dateB,
                    timeStart: state.timeC,
                    timeEnd: "11:11",
                    capacity: 1
                });

                await createBooking({
                    patientName: "Smoke Slot Target Occupant",
                    phone: makePhone("09"),
                    sampleDate: state.dateB,
                    sampleTimeStart: state.timeB
                });

                state.sourceBooking = await createBooking({
                    patientName: "Smoke Slot Reschedule Source",
                    phone: makePhone("09"),
                    sampleDate: state.dateB,
                    sampleTimeStart: state.timeC
                });

                let error = null;

                try {
                    await bookingRuntime.rescheduleBooking(
                        state.sourceBooking.bookingCode,
                        {
                            sampleDate: state.dateB,
                            sampleTimeStart: state.timeB
                        },
                        {
                            sessionId: uniqueId("smoke_slot_5d2_reschedule"),
                            reason: "should reject full slot"
                        }
                    );
                } catch (caughtError) {
                    error = caughtError;
                }

                assertSlotError(error, "BOOKING_SLOT_FULL");

                const record = await getBookingRecord(state.sourceBooking.bookingCode);
                assert(record.sampleTimeStart.getUTCHours() === 10, "source booking moved despite rejection");
            }
        ],
        [
            "reschedule_to_available_slot_succeeds",
            async () => {
                await createSlot({
                    date: state.dateC,
                    timeStart: state.timeA,
                    timeEnd: "09:11",
                    capacity: 1
                });

                const updated = await bookingRuntime.rescheduleBooking(
                    state.sourceBooking.bookingCode,
                    {
                        sampleDate: state.dateC,
                        sampleTimeStart: state.timeA
                    },
                    {
                        sessionId: uniqueId("smoke_slot_5d2_reschedule_ok"),
                        reason: "smoke reschedule to available slot"
                    }
                );

                assert(updated.status === "RESCHEDULED", `status is ${updated.status}`);
                assert(updated.sampleDate === state.dateC, "sampleDate did not update");
                assert(updated.sampleTimeStart === state.timeA, "sampleTimeStart did not update");
            }
        ],
        [
            "booking_without_open_slot_rejected",
            async () => {
                let error = null;

                try {
                    await createBooking({
                        patientName: "Smoke Slot No Open Slot",
                        phone: makePhone("09"),
                        sampleDate: state.dateC,
                        sampleTimeStart: state.timeClosed
                    });
                } catch (caughtError) {
                    error = caughtError;
                }

                assertSlotError(error, "BOOKING_SLOT_NOT_OPEN");
            }
        ],
        [
            "urgent_booking_still_does_not_create_booking",
            async () => {
                const sessionId = uniqueId("smoke_slot_urgent_5d2");
                const before = await prisma.booking.count({
                    where: { createdFromSessionId: sessionId }
                });
                const { response, payload } = await postChat(
                    "Toi muon dat lich xet nghiem vi dau nguc kho tho va mo hoi",
                    sessionId
                );
                const after = await prisma.booking.count({
                    where: { createdFromSessionId: sessionId }
                });
                const data = payload.data || {};
                const reply = data.reply || payload.reply || "";

                assert(response.status === 200 && payload.success, "urgent chat failed");
                assert(!hasBookingCode(reply), "urgent reply unexpectedly has booking code");
                assert(data.flow !== "booking", "urgent query routed to booking");
                assert(after === before, "urgent query created booking");
            }
        ],
        [
            "existing_role_based_e2e_path_still_valid_with_prepared_slots",
            async () => {
                const patientPhone = makePhone("09");
                const collectorPhone = makePhone("08");

                await createSlot({
                    date: isoDate(offsetBase + 3),
                    timeStart: "11:11",
                    timeEnd: "12:11",
                    capacity: 2
                });

                state.roleBooking = await createBooking({
                    patientName: "Smoke Slot Role E2E",
                    phone: patientPhone,
                    sampleDate: isoDate(offsetBase + 3),
                    sampleTimeStart: "11:11"
                });

                const assign = await adminAssign(state.roleBooking.bookingCode, collectorPhone);
                assert(assign.response.status === 200 && assign.payload.success, "admin assign failed");

                const collected = await request(
                    `/api/collector/bookings/${state.roleBooking.bookingCode}/sample-collected?phone=${encodeURIComponent(collectorPhone)}`,
                    {
                        method: "PATCH",
                        headers: collectorHeaders(collectorPhone),
                        body: JSON.stringify({ note: "smoke slot role path collected" })
                    }
                );
                assert(collected.response.status === 200 && collected.payload.success, "collector collected failed");

                await adminUpdateStatus(state.roleBooking.bookingCode, "IN_LAB_PROCESSING", "smoke in lab");
                await adminUpdateStatus(state.roleBooking.bookingCode, "RESULT_READY", "smoke result ready");
                const completed = await adminUpdateStatus(state.roleBooking.bookingCode, "COMPLETED", "smoke completed");
                assert(completed.payload.data?.status === "COMPLETED", "role path did not complete");

                const userDetail = await request(
                    `/api/user/bookings/${state.roleBooking.bookingCode}?phone=${encodeURIComponent(patientPhone)}`,
                    { headers: userHeaders(patientPhone) }
                );
                assert(userDetail.response.status === 200 && userDetail.payload.success, "user detail failed");
                assert(userDetail.payload.data?.status === "COMPLETED", "user does not see completed");
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
