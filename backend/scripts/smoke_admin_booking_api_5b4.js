const bookingRuntime = require("../src/services/booking-runtime/booking.service");
const availabilitySlotService = require("../src/services/booking-runtime/availability-slot.service");
const prisma = require("../src/services/booking-runtime/prisma-client");

const API_BASE_URL = process.env.HOMELAB_API_BASE_URL || "http://localhost:5000";
const ADMIN_HEADERS = {
    "Content-Type": "application/json",
    "x-demo-role": "ADMIN",
    "x-demo-user-id": "smoke_admin_5b4"
};

function tomorrowIsoDate() {
    const date = new Date();
    date.setDate(date.getDate() + 1);

    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0")
    ].join("-");
}

async function createTestBooking() {
    const suffix = `${Date.now()}`.slice(-8);
    const sampleDate = tomorrowIsoDate();

    await availabilitySlotService.createAvailabilitySlot({
        date: sampleDate,
        timeStart: "08:30",
        timeEnd: "09:30",
        capacity: 10,
        area: "default"
    });

    return bookingRuntime.createConfirmedBooking(
        {
            patientName: "Smoke Admin Booking",
            phone: `09${suffix}`,
            testTypeText: "Công thức máu",
            sampleDate,
            sampleTimeStart: "08:30",
            address: "12 Nguyen Trai, Smoke Test"
        },
        {
            sessionId: `smoke_admin_5b4_${Date.now()}`,
            createdSource: "ADMIN",
            reason: "smoke_admin_booking_api_5b4"
        }
    );
}

async function request(path, options = {}) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers: {
            ...ADMIN_HEADERS,
            ...(options.headers || {})
        }
    });
    const payload = await response.json();

    return {
        response,
        payload
    };
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

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

async function main() {
    const state = {
        booking: null,
        bookingCode: null,
        internalNote: "Smoke internal note 5B-4"
    };

    const cases = [
        [
            "create_test_booking",
            async () => {
                state.booking = await createTestBooking();
                state.bookingCode = state.booking.bookingCode;

                assert(/^HLB-\d{8}-[A-Z0-9]{4,}$/.test(state.bookingCode), "bookingCode was not generated");
            }
        ],
        [
            "list_bookings_has_booking",
            async () => {
                const { response, payload } = await request(
                    `/api/admin/bookings?bookingCode=${state.bookingCode}&limit=10`
                );

                assert(response.status === 200 && payload.success, "list endpoint failed");
                assert(Array.isArray(payload.data?.bookings), "bookings list missing");
                assert(
                    payload.data.bookings.some(
                        (booking) => booking.bookingCode === state.bookingCode
                    ),
                    "created booking not found in list"
                );
            }
        ],
        [
            "detail_has_status_history",
            async () => {
                const { response, payload } = await request(
                    `/api/admin/bookings/${state.bookingCode}`
                );

                assert(response.status === 200 && payload.success, "detail endpoint failed");
                assert(payload.data?.bookingCode === state.bookingCode, "detail bookingCode mismatch");
                assert(Array.isArray(payload.data?.statusHistory), "statusHistory missing");
                assert(payload.data.statusHistory.length >= 1, "statusHistory is empty");
            }
        ],
        [
            "assign_sample_collector",
            async () => {
                const { response, payload } = await request(
                    `/api/admin/bookings/${state.bookingCode}/assign`,
                    {
                        method: "PATCH",
                        body: JSON.stringify({
                            staffName: "Smoke Sample Collector",
                            staffPhone: `08${Date.now().toString().slice(-8)}`,
                            role: "SAMPLE_COLLECTOR"
                        })
                    }
                );

                assert(response.status === 200 && payload.success, "assign endpoint failed");
                assert(payload.data?.status === "ASSIGNED", "booking status was not ASSIGNED");
                assert(payload.data?.assignedStaff?.fullName === "Smoke Sample Collector", "assignedStaff missing");
            }
        ],
        [
            "status_sample_collected",
            async () => {
                const { response, payload } = await request(
                    `/api/admin/bookings/${state.bookingCode}/status`,
                    {
                        method: "PATCH",
                        body: JSON.stringify({
                            status: "SAMPLE_COLLECTED",
                            reason: "smoke sample collected"
                        })
                    }
                );

                assert(response.status === 200 && payload.success, "status endpoint failed");
                assert(payload.data?.status === "SAMPLE_COLLECTED", "status was not SAMPLE_COLLECTED");
            }
        ],
        [
            "update_internal_note",
            async () => {
                const { response, payload } = await request(
                    `/api/admin/bookings/${state.bookingCode}/internal-note`,
                    {
                        method: "PATCH",
                        body: JSON.stringify({
                            internalNote: state.internalNote
                        })
                    }
                );

                assert(response.status === 200 && payload.success, "internal-note endpoint failed");
                assert(payload.data?.internalNote === state.internalNote, "internalNote mismatch");
            }
        ],
        [
            "status_completed",
            async () => {
                for (const status of ["IN_LAB_PROCESSING", "RESULT_READY", "COMPLETED"]) {
                    var { response, payload } = await request(
                        `/api/admin/bookings/${state.bookingCode}/status`,
                        {
                            method: "PATCH",
                            body: JSON.stringify({
                                status,
                                reason: `smoke ${status.toLowerCase()}`
                            })
                        }
                    );

                    assert(response.status === 200 && payload.success, `${status} endpoint failed`);
                }

                assert(payload.data?.status === "COMPLETED", "status was not COMPLETED");
                assert(Boolean(payload.data?.completedAt), "completedAt was not set");
            }
        ],
        [
            "detail_final_state",
            async () => {
                const { response, payload } = await request(
                    `/api/admin/bookings/${state.bookingCode}`
                );

                assert(response.status === 200 && payload.success, "final detail endpoint failed");
                assert(payload.data?.status === "COMPLETED", "final status mismatch");
                assert(payload.data?.assignedStaff?.fullName === "Smoke Sample Collector", "final assignedStaff missing");
                assert(payload.data?.internalNote === state.internalNote, "final internalNote mismatch");
            }
        ],
        [
            "invalid_booking_code_404",
            async () => {
                const { response, payload } = await request(
                    "/api/admin/bookings/HLB-20990101-XXXX"
                );

                assert(response.status === 404, "invalid booking did not return 404");
                assert(payload.success === false, "invalid booking response was not controlled");
                assert(payload.code === "BOOKING_NOT_FOUND", "invalid booking code missing");
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

    await prisma.$disconnect();

    if (failed > 0) {
        process.exit(1);
    }
}

main().catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
});
