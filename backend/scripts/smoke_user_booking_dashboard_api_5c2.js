const bookingRuntime = require("../src/services/booking-runtime/booking.service");
const availabilitySlotService = require("../src/services/booking-runtime/availability-slot.service");
const prisma = require("../src/services/booking-runtime/prisma-client");

const API_BASE_URL = process.env.HOMELAB_API_BASE_URL || "http://localhost:5000";

function tomorrowIsoDate(offsetDays = 1) {
    const date = new Date();
    date.setDate(date.getDate() + offsetDays);

    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0")
    ].join("-");
}

function makePhone(prefix = "09") {
    return `${prefix}${Date.now().toString().slice(-8)}`;
}

async function createTestBooking({ phone, patientName, offsetDays = 1 }) {
    await availabilitySlotService.createAvailabilitySlot({
        date: tomorrowIsoDate(offsetDays),
        timeStart: "08:30",
        timeEnd: "09:30",
        capacity: 10,
        area: "default"
    });

    return bookingRuntime.createConfirmedBooking(
        {
            patientName,
            phone,
            testTypeText: "Cong thuc mau",
            sampleDate: tomorrowIsoDate(offsetDays),
            sampleTimeStart: "08:30",
            address: "12 Nguyen Trai, Smoke User Dashboard"
        },
        {
            sessionId: `smoke_user_5c2_${Date.now()}`,
            createdSource: "CHAT",
            reason: "smoke_user_booking_dashboard_api_5c2"
        }
    );
}

async function completeBookingThroughValidPath(bookingCode) {
    await bookingRuntime.assignStaffToBooking(
        bookingCode,
        {
            staffName: "Smoke User Completion Collector",
            staffPhone: `08${Date.now().toString().slice(-8)}`,
            role: "SAMPLE_COLLECTOR"
        },
        {
            role: "ADMIN",
            userId: "smoke_user_5c2",
            reason: "prepare assigned booking"
        }
    );

    for (const status of [
        "SAMPLE_COLLECTED",
        "IN_LAB_PROCESSING",
        "RESULT_READY",
        "COMPLETED"
    ]) {
        await bookingRuntime.updateBookingStatus(
            bookingCode,
            status,
            {
                role: "ADMIN",
                userId: "smoke_user_5c2",
                reason: `prepare ${status.toLowerCase()} booking`
            }
        );
    }
}

async function request(path, options = {}) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            "x-demo-role": "USER",
            "x-demo-user-id": "smoke_user_5c2",
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
        phone: makePhone("09"),
        wrongPhone: makePhone("08"),
        booking: null,
        completedBooking: null
    };

    const cases = [
        [
            "create_test_booking",
            async () => {
                state.booking = await createTestBooking({
                    phone: state.phone,
                    patientName: "Smoke User Dashboard"
                });

                assert(state.booking?.bookingCode, "bookingCode missing");
            }
        ],
        [
            "list_bookings_by_phone",
            async () => {
                const { response, payload } = await request(
                    `/api/user/bookings?phone=${encodeURIComponent(state.phone)}`
                );

                assert(response.status === 200 && payload.success, "list endpoint failed");
                assert(Array.isArray(payload.data?.bookings), "bookings list missing");
                assert(
                    payload.data.bookings.some(
                        (booking) => booking.bookingCode === state.booking.bookingCode
                    ),
                    "created booking not found for correct phone"
                );
            }
        ],
        [
            "detail_with_correct_phone_has_history",
            async () => {
                const { response, payload } = await request(
                    `/api/user/bookings/${state.booking.bookingCode}?phone=${encodeURIComponent(state.phone)}`
                );

                assert(response.status === 200 && payload.success, "detail endpoint failed");
                assert(payload.data?.bookingCode === state.booking.bookingCode, "detail bookingCode mismatch");
                assert(Array.isArray(payload.data?.statusHistory), "statusHistory missing");
                assert(payload.data.statusHistory.length >= 1, "statusHistory empty");
                assert(payload.data.internalNote === undefined, "internalNote leaked to user detail");
            }
        ],
        [
            "detail_with_wrong_phone_404",
            async () => {
                const { response, payload } = await request(
                    `/api/user/bookings/${state.booking.bookingCode}?phone=${encodeURIComponent(state.wrongPhone)}`
                );

                assert(response.status === 404, "wrong phone did not return 404");
                assert(payload.success === false, "wrong phone response was not controlled");
                assert(payload.code === "BOOKING_NOT_FOUND", "wrong phone code mismatch");
            }
        ],
        [
            "cancel_valid_booking",
            async () => {
                const { response, payload } = await request(
                    `/api/user/bookings/${state.booking.bookingCode}/cancel?phone=${encodeURIComponent(state.phone)}`,
                    {
                        method: "PATCH",
                        body: JSON.stringify({ reason: "smoke user cancel" })
                    }
                );

                assert(response.status === 200 && payload.success, "cancel endpoint failed");
                assert(payload.data?.status === "CANCELLED", "booking was not cancelled");
            }
        ],
        [
            "cancel_completed_booking_rejected",
            async () => {
                state.completedBooking = await createTestBooking({
                    phone: state.phone,
                    patientName: "Smoke User Completed",
                    offsetDays: 2
                });

                await completeBookingThroughValidPath(state.completedBooking.bookingCode);

                const { response, payload } = await request(
                    `/api/user/bookings/${state.completedBooking.bookingCode}/cancel?phone=${encodeURIComponent(state.phone)}`,
                    {
                        method: "PATCH",
                        body: JSON.stringify({ reason: "should reject" })
                    }
                );

                assert(response.status === 409, "completed cancel did not return 409");
                assert(payload.success === false, "completed cancel response was not controlled");
                assert(payload.code === "BOOKING_STATUS_TRANSITION_REJECTED", "completed cancel code mismatch");
            }
        ]
    ];

    const results = [];

    for (const [id, fn] of cases) {
        results.push(await runCase(id, fn, state));
    }

    const passed = results.filter((result) => result.passed).length;
    console.log(`\nSmoke user booking dashboard API 5C-2: ${passed}/${results.length} passed`);

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
