const availabilitySlotService = require("../src/services/booking-runtime/availability-slot.service");
const bookingRuntime = require("../src/services/booking-runtime/booking.service");
const prisma = require("../src/services/booking-runtime/prisma-client");

const API_BASE_URL = process.env.HOMELAB_API_BASE_URL || "http://localhost:5000";

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

function isoDate(offsetDays = 160) {
    const date = new Date();
    date.setDate(date.getDate() + offsetDays);

    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0")
    ].join("-");
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

function adminHeaders() {
    return {
        "x-demo-role": "ADMIN",
        "x-demo-user-id": "smoke_staff_5f1_admin"
    };
}

function collectorHeaders(phone) {
    return {
        "x-demo-role": "COLLECTOR",
        "x-demo-user-id": "smoke_staff_5f1_collector",
        "x-demo-phone": phone
    };
}

async function createSlot({ date, timeStart, timeEnd = "09:44", capacity = 4 }) {
    return availabilitySlotService.createAvailabilitySlot({
        date,
        timeStart,
        timeEnd,
        capacity,
        area: "default",
        active: true
    });
}

async function createBooking({ patientName, phone, sampleDate, sampleTimeStart }) {
    return bookingRuntime.createConfirmedBooking(
        {
            patientName,
            phone,
            testTypeText: "Cong thuc mau CBC",
            sampleDate,
            sampleTimeStart,
            address: "12 Nguyen Trai, Smoke Staff 5F1"
        },
        {
            sessionId: uniqueId("smoke_staff_5f1_booking"),
            createdSource: "CHAT",
            reason: "smoke_staff_management_workload_5f1"
        }
    );
}

async function getBookingRecord(bookingCode) {
    return prisma.booking.findUnique({
        where: { bookingCode },
        include: {
            assignedStaff: true,
            statusHistory: { orderBy: { createdAt: "asc" } }
        }
    });
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function assertControlledReject(response, payload, label) {
    assert(response.status >= 400, `${label} unexpectedly succeeded`);
    assert(payload.success === false, `${label} response was not controlled JSON`);
    assert(Boolean(payload.message || payload.code), `${label} missing message/code`);
}

async function adminCreateStaff(payload) {
    return request("/api/admin/staff", {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify(payload)
    });
}

async function adminUpdateStaff(staffId, payload) {
    return request(`/api/admin/staff/${staffId}`, {
        method: "PATCH",
        headers: adminHeaders(),
        body: JSON.stringify(payload)
    });
}

async function adminAssign(bookingCode, staffId) {
    return request(`/api/admin/bookings/${bookingCode}/assign`, {
        method: "PATCH",
        headers: adminHeaders(),
        body: JSON.stringify({ staffId })
    });
}

async function adminUpdateStatus(bookingCode, status, reason) {
    return request(`/api/admin/bookings/${bookingCode}/status`, {
        method: "PATCH",
        headers: adminHeaders(),
        body: JSON.stringify({ status, reason })
    });
}

async function collectorSampleCollected(bookingCode, phone) {
    return request(
        `/api/collector/bookings/${bookingCode}/sample-collected?phone=${encodeURIComponent(phone)}`,
        {
            method: "PATCH",
            headers: collectorHeaders(phone),
            body: JSON.stringify({ note: "Smoke staff workload sample collected" })
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
    const offsetBase = 160 + Math.floor(Math.random() * 160);
    const state = {
        collectorPhone: makePhone("08"),
        wrongRolePhone: makePhone("07"),
        bookingPhone: makePhone("09"),
        sampleDate: isoDate(offsetBase),
        sampleTime: "08:44",
        collector: null,
        wrongRoleStaff: null,
        booking: null
    };

    const cases = [
        [
            "create_active_collector",
            async () => {
                const { response, payload } = await adminCreateStaff({
                    name: "Smoke Staff Collector",
                    phone: state.collectorPhone,
                    role: "SAMPLE_COLLECTOR",
                    active: true
                });

                assert(response.status === 201 && payload.success, "create staff failed");
                assert(payload.data?.role === "SAMPLE_COLLECTOR", "staff role mismatch");
                assert(payload.data?.active === true, "staff not active");
                state.collector = payload.data;
            }
        ],
        [
            "list_staff_contains_collector",
            async () => {
                const { response, payload } = await request("/api/admin/staff", {
                    headers: adminHeaders()
                });

                assert(response.status === 200 && payload.success, "list staff failed");
                assert(
                    payload.data?.staff?.some((staff) => staff.id === state.collector.id),
                    "staff list does not contain collector"
                );
            }
        ],
        [
            "update_staff_inactive",
            async () => {
                const { response, payload } = await adminUpdateStaff(state.collector.id, {
                    active: false
                });

                assert(response.status === 200 && payload.success, "update inactive failed");
                assert(payload.data?.active === false, "staff is not inactive");
                state.collector = payload.data;
            }
        ],
        [
            "assign_inactive_collector_rejected",
            async () => {
                await createSlot({
                    date: state.sampleDate,
                    timeStart: state.sampleTime,
                    timeEnd: "09:44",
                    capacity: 3
                });
                state.booking = await createBooking({
                    patientName: "Smoke Staff Assignment User",
                    phone: state.bookingPhone,
                    sampleDate: state.sampleDate,
                    sampleTimeStart: state.sampleTime
                });

                const { response, payload } = await adminAssign(
                    state.booking.bookingCode,
                    state.collector.id
                );

                assertControlledReject(response, payload, "inactive staff assign");
                assert(payload.code === "STAFF_INACTIVE_ASSIGNMENT_REJECTED", `unexpected code ${payload.code}`);

                const record = await getBookingRecord(state.booking.bookingCode);
                assert(record.status === "CONFIRMED", `booking status changed to ${record.status}`);
                assert(!record.assignedStaffId, "booking was assigned to inactive staff");
            }
        ],
        [
            "reactivate_staff",
            async () => {
                const { response, payload } = await adminUpdateStaff(state.collector.id, {
                    active: true
                });

                assert(response.status === 200 && payload.success, "reactivate failed");
                assert(payload.data?.active === true, "staff is not active");
                state.collector = payload.data;
            }
        ],
        [
            "assign_active_collector_succeeds",
            async () => {
                const { response, payload } = await adminAssign(
                    state.booking.bookingCode,
                    state.collector.id
                );

                assert(response.status === 200 && payload.success, "active staff assign failed");
                assert(payload.data?.assignedStaff?.id === state.collector.id, "assignedStaff mismatch");
                assert(payload.data?.status === "ASSIGNED", `status is ${payload.data?.status}`);
            }
        ],
        [
            "collector_workload_reflects_assigned_booking",
            async () => {
                const { response, payload } = await request(`/api/admin/staff/${state.collector.id}`, {
                    headers: adminHeaders()
                });

                assert(response.status === 200 && payload.success, "staff detail failed");
                assert(
                    Number(payload.data?.workload?.totalActiveAssigned || 0) >= 1,
                    "totalActiveAssigned did not reflect assignment"
                );
                assert(
                    Array.isArray(payload.data?.assignedBookings) &&
                        payload.data.assignedBookings.some((booking) => booking.bookingCode === state.booking.bookingCode),
                    "assignedBookings missing test booking"
                );
            }
        ],
        [
            "wrong_role_assignment_rejected_if_supported",
            async () => {
                const createResult = await adminCreateStaff({
                    name: "Smoke Staff Lab Technician",
                    phone: state.wrongRolePhone,
                    role: "LAB_TECHNICIAN",
                    active: true
                });

                assert(createResult.response.status === 201 && createResult.payload.success, "wrong role staff create failed");
                state.wrongRoleStaff = createResult.payload.data;

                const booking = await createBooking({
                    patientName: "Smoke Staff Wrong Role User",
                    phone: makePhone("09"),
                    sampleDate: state.sampleDate,
                    sampleTimeStart: state.sampleTime
                });
                const { response, payload } = await adminAssign(
                    booking.bookingCode,
                    state.wrongRoleStaff.id
                );

                assertControlledReject(response, payload, "wrong role assign");
                assert(payload.code === "STAFF_ROLE_ASSIGNMENT_REJECTED", `unexpected code ${payload.code}`);

                const record = await getBookingRecord(booking.bookingCode);
                assert(record.status === "CONFIRMED", `wrong-role booking status changed to ${record.status}`);
                assert(!record.assignedStaffId, "wrong-role staff was assigned");
            }
        ],
        [
            "terminal_booking_assignment_rejected",
            async () => {
                const collected = await collectorSampleCollected(
                    state.booking.bookingCode,
                    state.collectorPhone
                );
                assert(collected.response.status === 200 && collected.payload.success, "sample collected failed");

                for (const [status, reason] of [
                    ["IN_LAB_PROCESSING", "smoke staff in lab"],
                    ["RESULT_READY", "smoke staff result ready"],
                    ["COMPLETED", "smoke staff completed"]
                ]) {
                    const result = await adminUpdateStatus(state.booking.bookingCode, status, reason);
                    assert(result.response.status === 200 && result.payload.success, `admin ${status} failed`);
                }

                const { response, payload } = await adminAssign(
                    state.booking.bookingCode,
                    state.collector.id
                );

                assertControlledReject(response, payload, "terminal booking assign");
                assert(payload.code === "BOOKING_STATUS_TRANSITION_REJECTED", `unexpected code ${payload.code}`);

                const record = await getBookingRecord(state.booking.bookingCode);
                assert(record.status === "COMPLETED", `terminal booking status changed to ${record.status}`);
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
