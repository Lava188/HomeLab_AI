const prisma = require("../src/services/booking-runtime/prisma-client");
const bookingRuntime = require("../src/services/booking-runtime/booking.service");
const packageCatalog = require("../src/services/booking-package-catalog.service");
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

function futureDate(offsetDays = 170) {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() + offsetDays);
    return date;
}

function dateToIso(value) {
    const date = new Date(value);
    return [
        date.getUTCFullYear(),
        String(date.getUTCMonth() + 1).padStart(2, "0"),
        String(date.getUTCDate()).padStart(2, "0")
    ].join("-");
}

function timeValue(hour, minute) {
    return new Date(Date.UTC(1970, 0, 1, hour, minute, 0));
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function adminHeaders() {
    return {
        "Content-Type": "application/json",
        "x-demo-role": "ADMIN",
        "x-demo-user-id": "smoke_5h7_admin",
        "x-admin-id": "smoke_5h7_admin"
    };
}

function userHeaders(phone) {
    return {
        "Content-Type": "application/json",
        "x-demo-role": "USER",
        "x-demo-user-id": `smoke_5h7_user_${phone}`,
        "x-demo-phone": phone
    };
}

function collectorHeaders(phone) {
    return {
        "Content-Type": "application/json",
        "x-demo-role": "COLLECTOR",
        "x-demo-user-id": `smoke_5h7_collector_${phone}`,
        "x-demo-phone": phone
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

async function postChat(message, sessionId, headers = {}) {
    const response = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...headers
        },
        body: JSON.stringify({ message, sessionId }),
        signal: AbortSignal.timeout(20000)
    });
    const payload = await parseJsonResponse(response);
    return { response, payload };
}

async function createCollector(state, { name, phone, serviceArea }) {
    const collector = await prisma.staffProfile.create({
        data: {
            fullName: `${name} ${state.suffix}`,
            phone,
            role: "SAMPLE_COLLECTOR",
            active: true,
            serviceArea
        }
    });
    state.collectorIds.push(collector.id);
    return collector;
}

async function createWorkingArea(state, { collectorId, province, district = null, ward = null }) {
    const area = await prisma.collectorWorkingArea.create({
        data: {
            staffProfileId: collectorId,
            province,
            district,
            ward,
            active: true
        }
    });
    state.areaIds.push(area.id);
    return area;
}

async function createWorkingSchedule(state, { collectorId, workDate }) {
    const schedule = await prisma.collectorWorkingSchedule.create({
        data: {
            staffProfileId: collectorId,
            workDate,
            startTime: "08:00",
            endTime: "12:00",
            capacity: 8,
            active: true
        }
    });
    state.scheduleIds.push(schedule.id);
    return schedule;
}

async function createAvailabilitySlot(state, { date, startTime, endTime }) {
    const slot = await prisma.availabilitySlot.create({
        data: {
            date,
            startTime,
            endTime,
            capacity: 5,
            bookedCount: 0,
            area: "default",
            active: true
        }
    });
    state.slotIds.push(slot.id);
    return slot;
}

async function cleanup(state) {
    if (state.assignmentIds.length > 0) {
        await prisma.collectorAssignmentHistory.deleteMany({
            where: { assignmentId: { in: state.assignmentIds } }
        });
        await prisma.collectorAssignment.deleteMany({
            where: { id: { in: state.assignmentIds } }
        });
    }
    if (state.bookingIds.length > 0) {
        await prisma.bookingStatusHistory.deleteMany({
            where: { bookingId: { in: state.bookingIds } }
        });
        await prisma.booking.deleteMany({
            where: { id: { in: state.bookingIds } }
        });
    }
    if (state.slotIds.length > 0) {
        await prisma.availabilitySlot.deleteMany({
            where: { id: { in: state.slotIds } }
        });
    }
    if (state.patientIds.length > 0) {
        await prisma.patient.deleteMany({
            where: { id: { in: state.patientIds } }
        });
    }
    if (state.scheduleIds.length > 0) {
        await prisma.collectorWorkingSchedule.deleteMany({
            where: { id: { in: state.scheduleIds } }
        });
    }
    if (state.areaIds.length > 0) {
        await prisma.collectorWorkingArea.deleteMany({
            where: { id: { in: state.areaIds } }
        });
    }
    if (state.collectorIds.length > 0) {
        await prisma.staffProfile.deleteMany({
            where: { id: { in: state.collectorIds } }
        });
    }
}

async function refreshBookingState(state) {
    state.dbBooking = await prisma.booking.findUnique({
        where: { id: state.bookingId },
        include: {
            testCatalogItem: true,
            collectorAssignments: {
                include: {
                    assignmentHistory: true,
                    collector: true
                },
                orderBy: { assignedAt: "asc" }
            },
            statusHistory: true
        }
    });
    return state.dbBooking;
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
    const suffix = uniqueId("5h7");
    const sampleDate = futureDate(180 + Math.floor(Math.random() * 40));
    const sampleTimeStart = timeValue(9, 15);
    const sampleTimeEnd = timeValue(10, 15);
    const patientPhone = makePhone("09");
    const collectorAPhone = makePhone("08");
    const collectorBPhone = makePhone("07");

    const state = {
        suffix,
        sampleDate,
        sampleTimeStart,
        sampleTimeEnd,
        patientPhone,
        collectorAPhone,
        collectorBPhone,
        sessionId: uniqueId("smoke_5h7_booking"),
        urgentSessionId: uniqueId("smoke_5h7_urgent"),
        collectorIds: [],
        areaIds: [],
        scheduleIds: [],
        slotIds: [],
        patientIds: [],
        bookingIds: [],
        assignmentIds: [],
        bookingCode: null,
        bookingId: null,
        collectorA: null,
        collectorB: null,
        assignmentAId: null,
        assignmentBId: null
    };

    const cases = [
        [
            "setup_collectors_profiles_package_and_slot",
            async (state) => {
                await packageCatalog.ensureRequiredCatalogItems();
                const packageItem = await prisma.testCatalogItem.findUnique({
                    where: { code: "GENERAL_CHECKUP" }
                });
                assert(packageItem && packageItem.active, "GENERAL_CHECKUP package missing");
                state.packageItem = packageItem;

                state.collectorA = await createCollector(state, {
                    name: "Collector A Auto First",
                    phone: collectorAPhone,
                    serviceArea: "Smoke 5H7 ward-level collector"
                });
                state.collectorB = await createCollector(state, {
                    name: "Collector B Manual Fallback",
                    phone: collectorBPhone,
                    serviceArea: "Smoke 5H7 province-level collector"
                });

                await createWorkingArea(state, {
                    collectorId: state.collectorA.id,
                    province: "Hà Nội",
                    district: "Cầu Giấy",
                    ward: "Dịch Vọng"
                });
                await createWorkingArea(state, {
                    collectorId: state.collectorB.id,
                    province: "Hà Nội"
                });
                await createWorkingSchedule(state, { collectorId: state.collectorA.id, workDate: sampleDate });
                await createWorkingSchedule(state, { collectorId: state.collectorB.id, workDate: sampleDate });
                await createAvailabilitySlot(state, {
                    date: sampleDate,
                    startTime: sampleTimeStart,
                    endTime: sampleTimeEnd
                });
            }
        ],
        [
            "user_booking_with_package_auto_assigns_collector_a",
            async (state) => {
                const booking = await bookingRuntime.createConfirmedBooking({
                    patientName: `Smoke 5H7 Patient ${suffix}`,
                    phone: patientPhone,
                    address: "12 Nguyễn Trãi, Dịch Vọng, Cầu Giấy, Hà Nội",
                    sampleDate: dateToIso(sampleDate),
                    sampleTimeStart: "09:15",
                    sampleTimeEnd: "10:15",
                    testCatalogItemId: state.packageItem.id,
                    testTypeText: "Gói tổng quát cơ bản",
                    area: "default"
                }, {
                    sessionId: state.sessionId,
                    createdSource: "CHAT",
                    changedByType: "CHATBOT"
                });

                assert(booking && booking.bookingCode, "Booking not created");
                assert(booking.status === "CONFIRMED", "Booking should be CONFIRMED");
                assert(booking.testCatalogItemId === state.packageItem.id, "Booking missing package catalog item");
                assert(booking.testTypeText === "Gói tổng quát cơ bản", "Booking testTypeText mismatch");

                state.bookingCode = booking.bookingCode;
                state.bookingId = booking.id;
                state.bookingIds.push(booking.id);

                const patient = await prisma.patient.findUnique({ where: { phone: patientPhone } });
                if (patient) state.patientIds.push(patient.id);

                await refreshBookingState(state);
                const assignmentA = state.dbBooking.collectorAssignments.find(
                    (assignment) => assignment.collectorId === state.collectorA.id
                );

                assert(assignmentA, "Auto assignment for collector A missing");
                assert(assignmentA.status === "PENDING_COLLECTOR_CONFIRMATION", "Assignment A should be pending");
                assert(assignmentA.assignmentSource === "AUTO", "Assignment A should be AUTO");
                assert(state.dbBooking.status === "CONFIRMED", "Booking should remain CONFIRMED");
                assert(state.dbBooking.assignedStaffId === null, "Booking should not have assignedStaffId yet");

                state.assignmentAId = assignmentA.id;
                state.assignmentIds.push(assignmentA.id);
            }
        ],
        [
            "collector_a_sees_pending_assignment",
            async (state) => {
                const { response, payload } = await request(
                    "/api/collector/assignments?status=PENDING_COLLECTOR_CONFIRMATION",
                    { headers: collectorHeaders(state.collectorAPhone) }
                );

                assert(response.status === 200 && payload.success, "Collector assignment list failed");
                assert(
                    payload.data.assignments.some((assignment) => assignment.id === state.assignmentAId),
                    "Collector A does not see pending assignment"
                );
            }
        ],
        [
            "collector_a_rejects_with_reason",
            async (state) => {
                const reason = "Bận ca lấy mẫu khác trong cùng khung giờ";
                const { response, payload } = await request(
                    `/api/collector/assignments/${state.assignmentAId}/reject`,
                    {
                        method: "POST",
                        headers: collectorHeaders(state.collectorAPhone),
                        body: JSON.stringify({ reason })
                    }
                );

                assert(response.status === 200 && payload.success, "Collector reject failed");
                assert(payload.data.assignmentStatus === "REJECTED_PENDING_ADMIN_REVIEW", "Assignment A should be rejected pending review");

                await refreshBookingState(state);
                const assignmentA = state.dbBooking.collectorAssignments.find((assignment) => assignment.id === state.assignmentAId);
                assert(assignmentA.status === "REJECTED_PENDING_ADMIN_REVIEW", "DB assignment A status mismatch");
                assert(assignmentA.reviewStatus === "PENDING", "Assignment A reviewStatus should be PENDING");
                assert(assignmentA.rejectReason === reason, "Reject reason not saved");
                assert(state.dbBooking.status !== "ASSIGNED", "Booking should not be ASSIGNED after rejection");
            }
        ],
        [
            "admin_sees_pending_rejection",
            async (state) => {
                const { response, payload } = await request(
                    "/api/admin/collector-assignments/rejections",
                    { headers: adminHeaders() }
                );

                assert(response.status === 200 && payload.success, "Admin rejection list failed");
                const item = payload.data.assignments.find((assignment) => assignment.assignmentId === state.assignmentAId);
                assert(item, "Admin does not see pending rejection");
                assert(item.rejectReason && item.rejectReason.includes("Bận ca"), "Admin rejection reason missing");
            }
        ],
        [
            "admin_approves_rejection",
            async (state) => {
                const { response, payload } = await request(
                    `/api/admin/collector-assignments/${state.assignmentAId}/approve-rejection`,
                    {
                        method: "POST",
                        headers: adminHeaders(),
                        body: JSON.stringify({})
                    }
                );

                assert(response.status === 200 && payload.success, "Admin approve rejection failed");
                assert(payload.data.assignmentStatus === "REJECTION_APPROVED", "Assignment A should be REJECTION_APPROVED");
                assert(payload.data.reviewStatus === "APPROVED", "Assignment A reviewStatus should be APPROVED");

                await refreshBookingState(state);
                const assignmentA = state.dbBooking.collectorAssignments.find((assignment) => assignment.id === state.assignmentAId);
                assert(assignmentA.status === "REJECTION_APPROVED", "DB assignment A not approved");
                assert(assignmentA.reviewStatus === "APPROVED", "DB assignment A reviewStatus not approved");
                assert(
                    assignmentA.assignmentHistory.some((history) => history.toStatus === "REJECTION_APPROVED"),
                    "Approval history missing"
                );
                assert(state.dbBooking.status !== "ASSIGNED", "Booking should not be ASSIGNED after approve");
            }
        ],
        [
            "admin_manual_reassigns_to_collector_b",
            async (state) => {
                const { response, payload } = await request(
                    `/api/admin/bookings/${state.bookingCode}/collector-assignments/manual`,
                    {
                        method: "POST",
                        headers: adminHeaders(),
                        body: JSON.stringify({
                            collectorId: state.collectorB.id,
                            reason: "Gán lại cho collector B sau khi duyệt lý do từ chối"
                        })
                    }
                );

                assert(response.status === 201 && payload.success, "Manual reassign failed");
                assert(payload.data.assignmentStatus === "PENDING_COLLECTOR_CONFIRMATION", "Assignment B should be pending");
                assert(payload.data.assignmentSource === "ADMIN", "Assignment B source should be ADMIN");

                state.assignmentBId = payload.data.assignmentId;
                state.assignmentIds.push(state.assignmentBId);

                await refreshBookingState(state);
                const assignmentA = state.dbBooking.collectorAssignments.find((assignment) => assignment.id === state.assignmentAId);
                const assignmentB = state.dbBooking.collectorAssignments.find((assignment) => assignment.id === state.assignmentBId);
                assert(assignmentA.status === "REJECTION_APPROVED", "Old assignment A should stay approved");
                assert(assignmentB.status === "PENDING_COLLECTOR_CONFIRMATION", "New assignment B should stay pending");
                assert(assignmentB.assignmentSource === "ADMIN", "New assignment B should be ADMIN");
                assert(state.dbBooking.status !== "ASSIGNED", "Booking should not be ASSIGNED before collector B accepts");
            }
        ],
        [
            "collector_b_accepts_assignment",
            async (state) => {
                const { response, payload } = await request(
                    `/api/collector/assignments/${state.assignmentBId}/accept`,
                    {
                        method: "POST",
                        headers: collectorHeaders(state.collectorBPhone),
                        body: JSON.stringify({})
                    }
                );

                assert(response.status === 200 && payload.success, "Collector B accept failed");
                assert(payload.data.assignmentStatus === "ACCEPTED", "Assignment B should be ACCEPTED");
                assert(payload.data.bookingStatus === "ASSIGNED", "Booking should be ASSIGNED");

                await refreshBookingState(state);
                const assignmentB = state.dbBooking.collectorAssignments.find((assignment) => assignment.id === state.assignmentBId);
                assert(assignmentB.status === "ACCEPTED", "DB assignment B not ACCEPTED");
                assert(state.dbBooking.status === "ASSIGNED", "DB booking not ASSIGNED");
                assert(state.dbBooking.assignedStaffId === state.collectorB.id, "Booking should be assigned to collector B");
                assert(
                    assignmentB.assignmentHistory.some((history) => history.toStatus === "ACCEPTED"),
                    "Accept history missing"
                );
            }
        ],
        [
            "collector_b_marks_sample_collected",
            async (state) => {
                const { response, payload } = await request(
                    `/api/collector/bookings/${state.bookingCode}/sample-collected`,
                    {
                        method: "PATCH",
                        headers: collectorHeaders(state.collectorBPhone),
                        body: JSON.stringify({ note: "Đã lấy mẫu tại nhà" })
                    }
                );

                assert(response.status === 200 && payload.success, "Sample collected API failed");
                assert(payload.data.status === "SAMPLE_COLLECTED", "Booking should be SAMPLE_COLLECTED");

                await refreshBookingState(state);
                assert(state.dbBooking.status === "SAMPLE_COLLECTED", "DB booking should be SAMPLE_COLLECTED");
            }
        ],
        [
            "admin_progresses_lab_result_completed",
            async (state) => {
                for (const status of ["IN_LAB_PROCESSING", "RESULT_READY", "COMPLETED"]) {
                    const { response, payload } = await request(
                        `/api/admin/bookings/${state.bookingCode}/status`,
                        {
                            method: "PATCH",
                            headers: adminHeaders(),
                            body: JSON.stringify({
                                status,
                                reason: `Smoke 5H7 transition to ${status}`
                            })
                        }
                    );

                    assert(response.status === 200 && payload.success, `Admin status update to ${status} failed`);
                    assert(payload.data.status === status, `Expected booking status ${status}`);
                }

                await refreshBookingState(state);
                assert(state.dbBooking.status === "COMPLETED", "Final booking should be COMPLETED");
                const statusHistory = new Set(state.dbBooking.statusHistory.map((item) => item.toStatus));
                for (const status of ["CONFIRMED", "ASSIGNED", "SAMPLE_COLLECTED", "IN_LAB_PROCESSING", "RESULT_READY", "COMPLETED"]) {
                    assert(statusHistory.has(status), `Booking history missing ${status}`);
                }
            }
        ],
        [
            "user_sees_completed_and_cannot_cancel",
            async (state) => {
                const detailResult = await request(
                    `/api/user/bookings/${state.bookingCode}`,
                    { headers: userHeaders(state.patientPhone) }
                );
                assert(detailResult.response.status === 200 && detailResult.payload.success, "User booking detail failed");
                assert(detailResult.payload.data.status === "COMPLETED", "User should see COMPLETED booking");

                const listResult = await request(
                    `/api/user/bookings?phone=${encodeURIComponent(state.patientPhone)}`,
                    { headers: userHeaders(state.patientPhone) }
                );
                assert(listResult.response.status === 200 && listResult.payload.success, "User booking list failed");
                assert(
                    listResult.payload.data.bookings.some((booking) => booking.bookingCode === state.bookingCode && booking.status === "COMPLETED"),
                    "User list should include completed booking"
                );

                const cancelResult = await request(
                    `/api/user/bookings/${state.bookingCode}/cancel`,
                    {
                        method: "PATCH",
                        headers: userHeaders(state.patientPhone),
                        body: JSON.stringify({ reason: "Không thể hủy lịch đã hoàn thành" })
                    }
                );
                assert(cancelResult.response.status >= 400, "Completed booking cancel should be rejected");
                assert(cancelResult.payload.success === false, "Cancel rejection should be controlled");
            }
        ],
        [
            "urgent_booking_like_query_does_not_create_booking",
            async (state) => {
                const before = await prisma.booking.count({
                    where: { createdFromSessionId: state.urgentSessionId }
                });
                const { response, payload } = await postChat(
                    "Tôi muốn đặt lịch xét nghiệm nhưng đang đau ngực khó thở vã mồ hôi",
                    state.urgentSessionId,
                    userHeaders(makePhone("09"))
                );
                const after = await prisma.booking.count({
                    where: { createdFromSessionId: state.urgentSessionId }
                });

                assert(response.status === 200 && payload.success, "Urgent chat failed");
                const reply = normalizeText(payload.data?.reply || "");
                const action = payload.data?.action || "";
                assert(
                    action === "URGENT_CARE" ||
                        payload.data?.meta?.urgent === true ||
                        reply.includes("cap cuu") ||
                        reply.includes("115"),
                    "Urgent response not detected"
                );
                assert(after === before, "Urgent query should not create booking");
            }
        ]
    ];

    const results = [];

    try {
        for (const [id, fn] of cases) {
            results.push(await runCase(id, fn, state));
        }
    } finally {
        await cleanup(state);
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
