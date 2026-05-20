const bookingRuntime = require("../src/services/booking-runtime/booking.service");
const availabilitySlotService = require("../src/services/booking-runtime/availability-slot.service");
const prisma = require("../src/services/booking-runtime/prisma-client");

const API_BASE_URL = process.env.HOMELAB_API_BASE_URL || "http://localhost:5000";

function isoDate(offsetDays = 1) {
    const date = new Date();
    date.setDate(date.getDate() + offsetDays);

    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0")
    ].join("-");
}

function makePhone(prefix = "08") {
    return `${prefix}${Date.now().toString().slice(-8)}`;
}

async function createAssignedBooking({ collectorPhone, patientPhone, patientName, offsetDays = 1 }) {
    await availabilitySlotService.createAvailabilitySlot({
        date: isoDate(offsetDays),
        timeStart: "08:30",
        timeEnd: "09:30",
        capacity: 10,
        area: "default"
    });

    const booking = await bookingRuntime.createConfirmedBooking(
        {
            patientName,
            phone: patientPhone,
            testTypeText: "Cong thuc mau",
            sampleDate: isoDate(offsetDays),
            sampleTimeStart: "08:30",
            address: "12 Nguyen Trai, Smoke Collector Dashboard"
        },
        {
            sessionId: `smoke_collector_5c3_${Date.now()}`,
            createdSource: "CHAT",
            reason: "smoke_collector_booking_dashboard_api_5c3"
        }
    );

    return bookingRuntime.assignStaffToBooking(
        booking.bookingCode,
        {
            staffName: "Smoke Sample Collector 5C3",
            staffPhone: collectorPhone,
            role: "SAMPLE_COLLECTOR"
        },
        {
            role: "ADMIN",
            userId: "smoke_collector_5c3",
            reason: "assign smoke collector"
        }
    );
}

async function request(path, options = {}) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            "x-demo-role": "COLLECTOR",
            "x-demo-user-id": "smoke_collector_5c3",
            ...(options.headers || {})
        }
    });
    const payload = await response.json();

    return { response, payload };
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

async function runCase(id, fn, state) {
    try {
        await fn(state);
        console.log(`PASS ${id}`);
        return { id, passed: true };
    } catch (error) {
        console.error(`FAIL ${id}: ${error.message}`);
        return { id, passed: false };
    }
}

async function main() {
    const state = {
        collectorPhone: makePhone("08"),
        wrongCollectorPhone: makePhone("07"),
        patientPhone: makePhone("09"),
        booking: null,
        cancelledBooking: null
    };

    const cases = [
        [
            "create_staff_and_assigned_booking",
            async () => {
                state.booking = await createAssignedBooking({
                    collectorPhone: state.collectorPhone,
                    patientPhone: state.patientPhone,
                    patientName: "Smoke Collector Patient"
                });

                assert(state.booking?.bookingCode, "bookingCode missing");
                assert(state.booking?.assignedStaff?.phone === state.collectorPhone, "collector assignment missing");
                assert(state.booking?.status === "ASSIGNED", "booking was not ASSIGNED");
            }
        ],
        [
            "list_bookings_by_collector_phone",
            async () => {
                const { response, payload } = await request(
                    `/api/collector/bookings?phone=${encodeURIComponent(state.collectorPhone)}`
                );

                assert(response.status === 200 && payload.success, "list endpoint failed");
                assert(Array.isArray(payload.data?.bookings), "bookings list missing");
                assert(
                    payload.data.bookings.some(
                        (booking) => booking.bookingCode === state.booking.bookingCode
                    ),
                    "created booking not found for collector phone"
                );
            }
        ],
        [
            "detail_with_correct_collector_has_history",
            async () => {
                const { response, payload } = await request(
                    `/api/collector/bookings/${state.booking.bookingCode}?phone=${encodeURIComponent(state.collectorPhone)}`
                );

                assert(response.status === 200 && payload.success, "detail endpoint failed");
                assert(payload.data?.bookingCode === state.booking.bookingCode, "detail bookingCode mismatch");
                assert(Array.isArray(payload.data?.statusHistory), "statusHistory missing");
                assert(payload.data.statusHistory.length >= 1, "statusHistory empty");
            }
        ],
        [
            "detail_with_wrong_collector_404",
            async () => {
                const { response, payload } = await request(
                    `/api/collector/bookings/${state.booking.bookingCode}?phone=${encodeURIComponent(state.wrongCollectorPhone)}`
                );

                assert(response.status === 404, "wrong collector did not return 404");
                assert(payload.success === false, "wrong collector response was not controlled");
                assert(payload.code === "BOOKING_NOT_FOUND", "wrong collector code mismatch");
            }
        ],
        [
            "mark_sample_collected",
            async () => {
                const { response, payload } = await request(
                    `/api/collector/bookings/${state.booking.bookingCode}/sample-collected?phone=${encodeURIComponent(state.collectorPhone)}`,
                    {
                        method: "PATCH",
                        body: JSON.stringify({ note: "smoke collected note" })
                    }
                );

                assert(response.status === 200 && payload.success, "sample-collected endpoint failed");
                assert(payload.data?.status === "SAMPLE_COLLECTED", "booking was not SAMPLE_COLLECTED");
            }
        ],
        [
            "sample_collected_on_cancelled_rejected",
            async () => {
                state.cancelledBooking = await createAssignedBooking({
                    collectorPhone: state.collectorPhone,
                    patientPhone: makePhone("09"),
                    patientName: "Smoke Collector Cancelled",
                    offsetDays: 2
                });

                await bookingRuntime.updateBookingStatus(
                    state.cancelledBooking.bookingCode,
                    "CANCELLED",
                    {
                        role: "ADMIN",
                        userId: "smoke_collector_5c3",
                        reason: "prepare cancelled booking"
                    }
                );

                const { response, payload } = await request(
                    `/api/collector/bookings/${state.cancelledBooking.bookingCode}/sample-collected?phone=${encodeURIComponent(state.collectorPhone)}`,
                    {
                        method: "PATCH",
                        body: JSON.stringify({ note: "should reject" })
                    }
                );

                assert(response.status === 409, "cancelled sample-collected did not return 409");
                assert(payload.success === false, "cancelled response was not controlled");
                assert(payload.code === "BOOKING_STATUS_TRANSITION_REJECTED", "cancelled code mismatch");
            }
        ]
    ];

    const results = [];

    for (const [id, fn] of cases) {
        results.push(await runCase(id, fn, state));
    }

    const passed = results.filter((result) => result.passed).length;
    console.log(`\nSmoke collector booking dashboard API 5C-3: ${passed}/${results.length} passed`);

    if (passed !== results.length) {
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
