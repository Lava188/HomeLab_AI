const prisma = require("../src/services/booking-runtime/prisma-client");

const API_BASE_URL = process.env.HOMELAB_API_BASE_URL || "http://localhost:5000";

function uniqueId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makePhone(prefix = "08") {
    const suffix = `${Date.now()}${Math.floor(Math.random() * 10000)}`
        .replace(/\D/g, "")
        .slice(-8)
        .padStart(8, "0");
    return `${prefix}${suffix}`;
}

function futureDate(offsetDays = 55) {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() + offsetDays);
    return date;
}

function timeValue(hour, minute) {
    return new Date(Date.UTC(1970, 0, 1, hour, minute, 0));
}

function adminHeaders() {
    return {
        "Content-Type": "application/json",
        "x-admin-id": "smoke_5h6_admin"
    };
}

function collectorHeaders(phone) {
    return {
        "Content-Type": "application/json",
        "x-demo-phone": phone
    };
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
    const payload = await response.json();
    return { response, payload };
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

async function createCollector(state, { name, active = true, role = "SAMPLE_COLLECTOR", phone = makePhone("08") }) {
    const collector = await prisma.staffProfile.create({
        data: {
            fullName: `${name} ${state.suffix}`,
            phone,
            role,
            active,
            serviceArea: `Smoke admin assignment review 5H6 - ${state.suffix}`
        }
    });
    state.collectorIds.push(collector.id);
    return collector;
}

async function createBooking(state, { status = "CONFIRMED", codePrefix = "HLB-5H6" } = {}) {
    const patient = await prisma.patient.create({
        data: {
            fullName: `Smoke 5H6 Patient ${state.suffix}`,
            phone: makePhone("09"),
            defaultAddress: "12 Nguyễn Trãi, Dịch Vọng, Cầu Giấy, Hà Nội"
        }
    });
    state.patientIds.push(patient.id);

    const booking = await prisma.booking.create({
        data: {
            bookingCode: `${codePrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
            patientId: patient.id,
            sampleDate: futureDate(),
            sampleTimeStart: timeValue(9, 0),
            sampleTimeEnd: timeValue(10, 0),
            address: patient.defaultAddress,
            phone: patient.phone,
            patientName: patient.fullName,
            status,
            testTypeText: `Smoke admin assignment review 5H6 ${state.suffix}`,
            createdSource: "CHAT",
            createdFromSessionId: uniqueId("smoke_5h6")
        }
    });
    state.bookingIds.push(booking.id);
    return booking;
}

async function createAssignment(state, {
    bookingId,
    collectorId,
    status = "PENDING_COLLECTOR_CONFIRMATION",
    reviewStatus = "NONE",
    rejectReason = null
}) {
    const assignment = await prisma.collectorAssignment.create({
        data: {
            bookingId,
            collectorId,
            status,
            reviewStatus,
            rejectedAt: status === "REJECTED_PENDING_ADMIN_REVIEW" ? new Date() : null,
            rejectReason,
            assignmentSource: "AUTO",
            metadata: { smoke: "admin_assignment_review_5h6" }
        }
    });
    state.assignmentIds.push(assignment.id);
    return assignment;
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
        await prisma.booking.deleteMany({ where: { id: { in: state.bookingIds } } });
    }
    if (state.patientIds.length > 0) {
        await prisma.patient.deleteMany({ where: { id: { in: state.patientIds } } });
    }
    if (state.collectorIds.length > 0) {
        await prisma.staffProfile.deleteMany({ where: { id: { in: state.collectorIds } } });
    }
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
    const state = {
        suffix: uniqueId("5h6"),
        collectorIds: [],
        bookingIds: [],
        patientIds: [],
        assignmentIds: []
    };

    const cases = [
        [
            "admin_lists_pending_rejections",
            async (state) => {
                const collector = await createCollector(state, { name: "Pending Rejection Collector" });
                const booking = await createBooking(state);
                const assignment = await createAssignment(state, {
                    bookingId: booking.id,
                    collectorId: collector.id,
                    status: "REJECTED_PENDING_ADMIN_REVIEW",
                    reviewStatus: "PENDING",
                    rejectReason: "Bận ca lấy mẫu khác"
                });

                const { response, payload } = await request("/api/admin/collector-assignments/rejections", {
                    headers: adminHeaders()
                });

                assert(response.ok, `Expected 200, got ${response.status}`);
                assert(payload.success === true, "Expected success payload");
                assert(
                    payload.data.assignments.some((item) => item.assignmentId === assignment.id),
                    "Expected pending rejection in list"
                );
            }
        ],
        [
            "admin_approves_rejection",
            async (state) => {
                const collector = await createCollector(state, { name: "Approve Rejection Collector" });
                const booking = await createBooking(state);
                const assignment = await createAssignment(state, {
                    bookingId: booking.id,
                    collectorId: collector.id,
                    status: "REJECTED_PENDING_ADMIN_REVIEW",
                    reviewStatus: "PENDING",
                    rejectReason: "Không đủ thời gian di chuyển"
                });

                const { response, payload } = await request(
                    `/api/admin/collector-assignments/${assignment.id}/approve-rejection`,
                    { method: "POST", headers: adminHeaders(), body: JSON.stringify({}) }
                );

                assert(response.ok, `Expected 200, got ${response.status}`);
                assert(payload.data.assignmentStatus === "REJECTION_APPROVED", "Expected REJECTION_APPROVED");
                assert(payload.data.reviewStatus === "APPROVED", "Expected APPROVED");
                assert(payload.data.adminReviewedAt, "Expected adminReviewedAt");

                const [dbAssignment, history, dbBooking] = await Promise.all([
                    prisma.collectorAssignment.findUnique({ where: { id: assignment.id } }),
                    prisma.collectorAssignmentHistory.findFirst({
                        where: {
                            assignmentId: assignment.id,
                            toStatus: "REJECTION_APPROVED"
                        }
                    }),
                    prisma.booking.findUnique({ where: { id: booking.id } })
                ]);

                assert(dbAssignment.status === "REJECTION_APPROVED", "DB assignment should be approved");
                assert(dbAssignment.reviewStatus === "APPROVED", "DB reviewStatus should be APPROVED");
                assert(dbAssignment.adminReviewedAt, "DB adminReviewedAt should be set");
                assert(history !== null, "Approval history should exist");
                assert(history.actorType === "ADMIN", "History actorType should be ADMIN");
                assert(dbBooking.status !== "ASSIGNED", "Booking should not become ASSIGNED");
            }
        ],
        [
            "admin_rejects_rejection",
            async (state) => {
                const collector = await createCollector(state, { name: "Reject Rejection Collector" });
                const booking = await createBooking(state);
                const assignment = await createAssignment(state, {
                    bookingId: booking.id,
                    collectorId: collector.id,
                    status: "REJECTED_PENDING_ADMIN_REVIEW",
                    reviewStatus: "PENDING",
                    rejectReason: "Lý do chưa phù hợp"
                });

                const { response, payload } = await request(
                    `/api/admin/collector-assignments/${assignment.id}/reject-rejection`,
                    { method: "POST", headers: adminHeaders(), body: JSON.stringify({}) }
                );

                assert(response.ok, `Expected 200, got ${response.status}`);
                assert(payload.data.assignmentStatus === "REJECTION_REJECTED", "Expected REJECTION_REJECTED");
                assert(payload.data.reviewStatus === "REJECTED", "Expected REJECTED");

                const history = await prisma.collectorAssignmentHistory.findFirst({
                    where: {
                        assignmentId: assignment.id,
                        toStatus: "REJECTION_REJECTED"
                    }
                });
                assert(history !== null, "Reject-review history should exist");
            }
        ],
        [
            "cannot_review_non_pending_assignment",
            async (state) => {
                const collector = await createCollector(state, { name: "Non Pending Collector" });
                const booking = await createBooking(state);
                const assignment = await createAssignment(state, {
                    bookingId: booking.id,
                    collectorId: collector.id,
                    status: "PENDING_COLLECTOR_CONFIRMATION"
                });

                const { response, payload } = await request(
                    `/api/admin/collector-assignments/${assignment.id}/approve-rejection`,
                    { method: "POST", headers: adminHeaders(), body: JSON.stringify({}) }
                );

                assert(response.status === 409, `Expected controlled 409, got ${response.status}`);
                assert(payload.code === "ASSIGNMENT_NOT_PENDING_REVIEW", "Expected ASSIGNMENT_NOT_PENDING_REVIEW");
            }
        ],
        [
            "manual_reassign_after_approved_rejection",
            async (state) => {
                const oldCollector = await createCollector(state, { name: "Old Collector" });
                const newCollector = await createCollector(state, { name: "New Collector" });
                const booking = await createBooking(state);
                await createAssignment(state, {
                    bookingId: booking.id,
                    collectorId: oldCollector.id,
                    status: "REJECTION_APPROVED",
                    reviewStatus: "APPROVED",
                    rejectReason: "Admin đã duyệt lý do"
                });

                const { response, payload } = await request(
                    `/api/admin/bookings/${booking.bookingCode}/collector-assignments/manual`,
                    {
                        method: "POST",
                        headers: adminHeaders(),
                        body: JSON.stringify({
                            collectorId: newCollector.id,
                            reason: "Gán lại sau khi duyệt lý do từ chối"
                        })
                    }
                );

                assert(response.status === 201, `Expected 201, got ${response.status}`);
                assert(payload.data.assignmentStatus === "PENDING_COLLECTOR_CONFIRMATION", "Expected pending status");
                assert(payload.data.assignmentSource === "ADMIN", "Expected ADMIN source");
                state.assignmentIds.push(payload.data.assignmentId);

                const [newAssignment, history, dbBooking] = await Promise.all([
                    prisma.collectorAssignment.findUnique({ where: { id: payload.data.assignmentId } }),
                    prisma.collectorAssignmentHistory.findFirst({
                        where: {
                            assignmentId: payload.data.assignmentId,
                            toStatus: "PENDING_COLLECTOR_CONFIRMATION"
                        }
                    }),
                    prisma.booking.findUnique({ where: { id: booking.id } })
                ]);

                assert(newAssignment.assignmentSource === "ADMIN", "DB assignment source should be ADMIN");
                assert(history !== null, "Manual reassign history should exist");
                assert(dbBooking.status !== "ASSIGNED", "Booking should not become ASSIGNED");
            }
        ],
        [
            "manual_reassign_rejects_inactive_collector",
            async (state) => {
                const inactiveCollector = await createCollector(state, {
                    name: "Inactive Collector",
                    active: false
                });
                const booking = await createBooking(state);

                const { response, payload } = await request(
                    `/api/admin/bookings/${booking.bookingCode}/collector-assignments/manual`,
                    {
                        method: "POST",
                        headers: adminHeaders(),
                        body: JSON.stringify({
                            collectorId: inactiveCollector.id,
                            reason: "Thử gán nhân viên không hoạt động"
                        })
                    }
                );

                assert(response.status === 409, `Expected 409, got ${response.status}`);
                assert(payload.code === "COLLECTOR_INACTIVE", "Expected COLLECTOR_INACTIVE");
            }
        ],
        [
            "manual_reassign_rejects_wrong_role",
            async (state) => {
                const adminStaff = await createCollector(state, {
                    name: "Wrong Role Staff",
                    role: "ADMIN"
                });
                const booking = await createBooking(state);

                const { response, payload } = await request(
                    `/api/admin/bookings/${booking.bookingCode}/collector-assignments/manual`,
                    {
                        method: "POST",
                        headers: adminHeaders(),
                        body: JSON.stringify({
                            collectorId: adminStaff.id,
                            reason: "Thử gán nhân viên sai vai trò"
                        })
                    }
                );

                assert(response.status === 409, `Expected 409, got ${response.status}`);
                assert(payload.code === "COLLECTOR_WRONG_ROLE", "Expected COLLECTOR_WRONG_ROLE");
            }
        ],
        [
            "manual_reassign_rejects_when_active_assignment_exists",
            async (state) => {
                const collectorA = await createCollector(state, { name: "Active Collector A" });
                const collectorB = await createCollector(state, { name: "Active Collector B" });
                const booking = await createBooking(state);
                await createAssignment(state, {
                    bookingId: booking.id,
                    collectorId: collectorA.id,
                    status: "PENDING_COLLECTOR_CONFIRMATION"
                });

                const beforeCount = await prisma.collectorAssignment.count({ where: { bookingId: booking.id } });
                const { response, payload } = await request(
                    `/api/admin/bookings/${booking.bookingCode}/collector-assignments/manual`,
                    {
                        method: "POST",
                        headers: adminHeaders(),
                        body: JSON.stringify({
                            collectorId: collectorB.id,
                            reason: "Không được tạo trùng phân công đang hoạt động"
                        })
                    }
                );
                const afterCount = await prisma.collectorAssignment.count({ where: { bookingId: booking.id } });

                assert(response.status === 409, `Expected 409, got ${response.status}`);
                assert(payload.code === "ACTIVE_ASSIGNMENT_ALREADY_EXISTS", "Expected ACTIVE_ASSIGNMENT_ALREADY_EXISTS");
                assert(afterCount === beforeCount, "Should not create duplicate assignment");
            }
        ],
        [
            "manual_reassign_rejects_terminal_booking",
            async (state) => {
                const collector = await createCollector(state, { name: "Terminal Collector" });

                for (const status of ["CANCELLED", "COMPLETED", "NO_SHOW"]) {
                    const booking = await createBooking(state, { status, codePrefix: `HLB-5H6-${status}` });
                    const { response, payload } = await request(
                        `/api/admin/bookings/${booking.bookingCode}/collector-assignments/manual`,
                        {
                            method: "POST",
                            headers: adminHeaders(),
                            body: JSON.stringify({
                                collectorId: collector.id,
                                reason: `Không được gán lịch ${status}`
                            })
                        }
                    );

                    assert(response.status === 409, `${status}: expected 409, got ${response.status}`);
                    assert(payload.code === "BOOKING_TERMINAL_STATUS", `${status}: expected BOOKING_TERMINAL_STATUS`);
                }
            }
        ],
        [
            "full_rejection_to_manual_reassign_flow",
            async (state) => {
                const collectorA = await createCollector(state, {
                    name: "Full Flow Collector A",
                    phone: makePhone("08")
                });
                const collectorB = await createCollector(state, {
                    name: "Full Flow Collector B",
                    phone: makePhone("07")
                });
                const booking = await createBooking(state);
                const oldAssignment = await createAssignment(state, {
                    bookingId: booking.id,
                    collectorId: collectorA.id,
                    status: "PENDING_COLLECTOR_CONFIRMATION"
                });

                const rejectResult = await request(
                    `/api/collector/assignments/${oldAssignment.id}/reject`,
                    {
                        method: "POST",
                        headers: collectorHeaders(collectorA.phone),
                        body: JSON.stringify({ reason: "Bận ca lấy mẫu đã xác nhận" })
                    }
                );
                assert(rejectResult.response.ok, `Collector reject expected 200, got ${rejectResult.response.status}`);

                const approveResult = await request(
                    `/api/admin/collector-assignments/${oldAssignment.id}/approve-rejection`,
                    { method: "POST", headers: adminHeaders(), body: JSON.stringify({}) }
                );
                assert(approveResult.response.ok, `Admin approve expected 200, got ${approveResult.response.status}`);

                const manualResult = await request(
                    `/api/admin/bookings/${booking.bookingCode}/collector-assignments/manual`,
                    {
                        method: "POST",
                        headers: adminHeaders(),
                        body: JSON.stringify({
                            collectorId: collectorB.id,
                            reason: "Gán nhân viên khác sau khi duyệt lý do từ chối"
                        })
                    }
                );
                assert(manualResult.response.status === 201, `Manual reassign expected 201, got ${manualResult.response.status}`);
                const newAssignmentId = manualResult.payload.data.assignmentId;
                state.assignmentIds.push(newAssignmentId);

                const acceptResult = await request(
                    `/api/collector/assignments/${newAssignmentId}/accept`,
                    {
                        method: "POST",
                        headers: collectorHeaders(collectorB.phone),
                        body: JSON.stringify({})
                    }
                );
                assert(acceptResult.response.ok, `Collector B accept expected 200, got ${acceptResult.response.status}`);

                const [oldDbAssignment, newDbAssignment, dbBooking, historyCount] = await Promise.all([
                    prisma.collectorAssignment.findUnique({ where: { id: oldAssignment.id } }),
                    prisma.collectorAssignment.findUnique({ where: { id: newAssignmentId } }),
                    prisma.booking.findUnique({ where: { id: booking.id } }),
                    prisma.collectorAssignmentHistory.count({
                        where: { assignmentId: { in: [oldAssignment.id, newAssignmentId] } }
                    })
                ]);

                assert(oldDbAssignment.status === "REJECTION_APPROVED", "Old assignment should be REJECTION_APPROVED");
                assert(newDbAssignment.status === "ACCEPTED", "New assignment should be ACCEPTED");
                assert(dbBooking.status === "ASSIGNED", "Booking should be ASSIGNED");
                assert(dbBooking.assignedStaffId === collectorB.id, "Booking should be assigned to collector B");
                assert(historyCount >= 4, "Expected histories for reject, approve, manual assign, accept");
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
