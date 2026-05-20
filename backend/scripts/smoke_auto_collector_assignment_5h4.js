const prisma = require("../src/services/booking-runtime/prisma-client");
const bookingRuntime = require("../src/services/booking-runtime/booking.service");
const collectorAssignmentService = require("../src/services/collector-assignment/collector-assignment.service");
const availabilitySlotService = require("../src/services/booking-runtime/availability-slot.service");

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

function futureDate(offsetDays = 45) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + offsetDays);
    return date;
}

function timeValue(hour, minute) {
    return new Date(Date.UTC(1970, 0, 1, hour, minute, 0));
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

async function createCollector(state, { name, phone, active = true, role = "SAMPLE_COLLECTOR" }) {
    const collector = await prisma.staffProfile.create({
        data: {
            fullName: name,
            phone,
            role,
            active,
            serviceArea: `Smoke auto assignment 5H4 - ${name}`
        }
    });
    state.collectorIds.push(collector.id);
    return collector;
}

async function createWorkingArea(state, { collectorId, province, district, ward, active = true }) {
    const area = await prisma.collectorWorkingArea.create({
        data: {
            staffProfileId: collectorId,
            province,
            district,
            ward,
            active
        }
    });
    state.areaIds.push(area.id);
    return area;
}

async function createWorkingSchedule(state, { collectorId, workDate, startTime, endTime, capacity = 4, active = true }) {
    const schedule = await prisma.collectorWorkingSchedule.create({
        data: {
            staffProfileId: collectorId,
            workDate,
            startTime,
            endTime,
            capacity,
            active
        }
    });
    state.scheduleIds.push(schedule.id);
    return schedule;
}

async function createBooking(state, { sampleDate, sampleTimeStart, address, status = "CONFIRMED" }) {
    const patient = await prisma.patient.create({
        data: {
            fullName: `Smoke Auto Assignment Patient ${state.suffix}`,
            phone: makePhone("09"),
            defaultAddress: address
        }
    });
    state.patientIds.push(patient.id);

    const bookingCode = `HLB-${Date.now()}-${state.suffix.slice(-4).toUpperCase()}`;
    const booking = await prisma.booking.create({
        data: {
            bookingCode,
            patientId: patient.id,
            sampleDate,
            sampleTimeStart,
            sampleTimeEnd: sampleTimeStart
                ? new Date(sampleTimeStart.getTime() + 60 * 60 * 1000)
                : null,
            address,
            phone: patient.phone,
            patientName: patient.fullName,
            status,
            testTypeText: "Smoke auto collector assignment 5H4",
            createdSource: "CHAT",
            createdFromSessionId: uniqueId("smoke_auto_5h4")
        }
    });
    state.bookingIds.push(booking.id);
    return booking;
}

async function cleanup(state) {
    await prisma.collectorAssignmentHistory.deleteMany({
        where: { assignmentId: { in: state.assignmentIds } }
    });
    await prisma.collectorAssignment.deleteMany({
        where: { id: { in: state.assignmentIds } }
    });
    await prisma.collectorWorkingSchedule.deleteMany({
        where: { id: { in: state.scheduleIds } }
    });
    await prisma.collectorWorkingArea.deleteMany({
        where: { id: { in: state.areaIds } }
    });
    await prisma.booking.deleteMany({
        where: { id: { in: state.bookingIds } }
    });
    await prisma.patient.deleteMany({
        where: { id: { in: state.patientIds } }
    });
    await prisma.staffProfile.deleteMany({
        where: { id: { in: state.collectorIds } }
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
    const suffix = uniqueId("5h4");
    const state = {
        suffix,
        collectorIds: [],
        areaIds: [],
        scheduleIds: [],
        bookingIds: [],
        patientIds: [],
        assignmentIds: [],
        historyIds: []
    };

    const targetDate = futureDate(46);

    const cases = [
        [
            "auto_assignment_created_for_matching_booking",
            async (state) => {
                const collector = await createCollector(state, {
                    name: `Auto Assignment Collector ${suffix}`,
                    phone: makePhone("08")
                });

                await createWorkingArea(state, {
                    collectorId: collector.id,
                    province: "Hà Nội",
                    district: "Cầu Giấy",
                    ward: "Dịch Vọng"
                });

                await createWorkingSchedule(state, {
                    collectorId: collector.id,
                    workDate: targetDate,
                    startTime: "08:00",
                    endTime: "12:00"
                });

                const booking = await createBooking(state, {
                    sampleDate: targetDate,
                    sampleTimeStart: timeValue(9, 0),
                    address: "12 Nguyễn Trãi, Dịch Vọng, Cầu Giấy, Hà Nội"
                });

                const result = await collectorAssignmentService.autoCreateCollectorAssignmentForBooking(
                    booking.id
                );

                assert(result.assignmentCreated === true, "Expected assignmentCreated=true");
                assert(result.assignment !== null, "Expected assignment object");
                assert(result.assignment.status === "PENDING_COLLECTOR_CONFIRMATION", "Expected PENDING_COLLECTOR_CONFIRMATION status");
                assert(result.reason === "ASSIGNMENT_CREATED", "Expected ASSIGNMENT_CREATED reason");

                const dbAssignment = await prisma.collectorAssignment.findFirst({
                    where: { bookingId: booking.id }
                });
                assert(dbAssignment !== null, "Assignment should exist in DB");
                assert(dbAssignment.assignmentSource === "AUTO", "Expected AUTO source");
                state.assignmentIds.push(dbAssignment.id);

                const dbBooking = await prisma.booking.findUnique({
                    where: { id: booking.id }
                });
                assert(dbBooking.status === "CONFIRMED", "Booking should remain CONFIRMED, not ASSIGNED");

                const history = await prisma.collectorAssignmentHistory.findFirst({
                    where: { assignmentId: dbAssignment.id }
                });
                assert(history !== null, "Assignment history should exist");
                assert(history.toStatus === "PENDING_COLLECTOR_CONFIRMATION", "History toStatus should be PENDING_COLLECTOR_CONFIRMATION");
                assert(history.actorType === "SYSTEM", "History actorType should be SYSTEM");
                state.historyIds.push(history.id);
            }
        ],
        [
            "no_candidate_does_not_fail_booking",
            async (state) => {
                const booking = await createBooking(state, {
                    sampleDate: targetDate,
                    sampleTimeStart: timeValue(9, 0),
                    address: "Unknown Location, No Match Area"
                });

                const result = await collectorAssignmentService.autoCreateCollectorAssignmentForBooking(
                    booking.id
                );

                assert(result.assignmentCreated === false, "Expected assignmentCreated=false");
                assert(result.assignment === null, "Expected no assignment");
                assert(result.reason === "NO_CANDIDATE", "Expected NO_CANDIDATE reason");

                const dbBooking = await prisma.booking.findUnique({
                    where: { id: booking.id }
                });
                assert(dbBooking !== null, "Booking should still exist");
                assert(dbBooking.status === "CONFIRMED", "Booking should still be CONFIRMED");

                const assignmentCount = await prisma.collectorAssignment.count({
                    where: { bookingId: booking.id }
                });
                assert(assignmentCount === 0, "Should have no assignments");
            }
        ],
        [
            "duplicate_active_assignment_not_created",
            async (state) => {
                const collector = await createCollector(state, {
                    name: `Duplicate Test Collector ${suffix}`,
                    phone: makePhone("08")
                });

                await createWorkingArea(state, {
                    collectorId: collector.id,
                    province: "Hà Nội",
                    district: "Cầu Giấy",
                    ward: "Dịch Vọng"
                });

                await createWorkingSchedule(state, {
                    collectorId: collector.id,
                    workDate: targetDate,
                    startTime: "08:00",
                    endTime: "12:00"
                });

                const booking = await createBooking(state, {
                    sampleDate: targetDate,
                    sampleTimeStart: timeValue(9, 0),
                    address: "15 Nguyễn Trãi, Dịch Vọng, Cầu Giấy, Hà Nội"
                });

                const result1 = await collectorAssignmentService.autoCreateCollectorAssignmentForBooking(
                    booking.id
                );
                assert(result1.assignmentCreated === true, "First assignment should be created");
                state.assignmentIds.push(result1.assignment.id);

                const result2 = await collectorAssignmentService.autoCreateCollectorAssignmentForBooking(
                    booking.id
                );
                assert(result2.assignmentCreated === false, "Second assignment should not be created");
                assert(result2.reason === "ALREADY_HAS_ACTIVE_ASSIGNMENT", "Expected ALREADY_HAS_ACTIVE_ASSIGNMENT reason");

                const assignmentCount = await prisma.collectorAssignment.count({
                    where: { bookingId: booking.id }
                });
                assert(assignmentCount === 1, "Should have exactly 1 assignment");
            }
        ],
        [
            "terminal_booking_not_eligible",
            async (state) => {
                const collector = await createCollector(state, {
                    name: `Terminal Test Collector ${suffix}`,
                    phone: makePhone("08")
                });

                await createWorkingArea(state, {
                    collectorId: collector.id,
                    province: "Hà Nội",
                    district: "Cầu Giấy",
                    ward: "Dịch Vọng"
                });

                await createWorkingSchedule(state, {
                    collectorId: collector.id,
                    workDate: targetDate,
                    startTime: "08:00",
                    endTime: "12:00"
                });

                for (const status of ["CANCELLED", "COMPLETED", "NO_SHOW"]) {
                    const patient = await prisma.patient.create({
                        data: {
                            fullName: `Terminal ${status} Patient ${suffix}`,
                            phone: makePhone("09"),
                            defaultAddress: "Dịch Vọng, Cầu Giấy, Hà Nội"
                        }
                    });
                    state.patientIds.push(patient.id);

                    const booking = await prisma.booking.create({
                        data: {
                            bookingCode: `HLB-TERM-${status}-${suffix.slice(-4).toUpperCase()}`,
                            patientId: patient.id,
                            sampleDate: targetDate,
                            sampleTimeStart: timeValue(9, 0),
                            address: "18 Nguyễn Trãi, Dịch Vọng, Cầu Giấy, Hà Nội",
                            phone: patient.phone,
                            patientName: patient.fullName,
                            status,
                            testTypeText: `Terminal test ${status}`,
                            createdSource: "CHAT"
                        }
                    });
                    state.bookingIds.push(booking.id);

                    const result = await collectorAssignmentService.autoCreateCollectorAssignmentForBooking(
                        booking.id
                    );

                    assert(result.assignmentCreated === false, `${status}: assignmentCreated should be false`);
                    assert(result.reason === "BOOKING_NOT_ELIGIBLE", `${status}: reason should be BOOKING_NOT_ELIGIBLE`);

                    const assignmentCount = await prisma.collectorAssignment.count({
                        where: { bookingId: booking.id }
                    });
                    assert(assignmentCount === 0, `${status}: should have no assignments`);
                }
            }
        ],
        [
            "top_ranked_candidate_selected",
            async (state) => {
                const busyCollector = await createCollector(state, {
                    name: `Busy Collector ${suffix}`,
                    phone: makePhone("08")
                });

                const freeCollector = await createCollector(state, {
                    name: `Free Collector ${suffix}`,
                    phone: makePhone("07")
                });

                const areaData = {
                    province: "Hà Nội",
                    district: "Cầu Giấy",
                    ward: "Dịch Vọng"
                };

                await createWorkingArea(state, { collectorId: busyCollector.id, ...areaData });
                await createWorkingArea(state, { collectorId: freeCollector.id, ...areaData });

                await createWorkingSchedule(state, {
                    collectorId: busyCollector.id,
                    workDate: targetDate,
                    startTime: "08:00",
                    endTime: "12:00"
                });

                await createWorkingSchedule(state, {
                    collectorId: freeCollector.id,
                    workDate: targetDate,
                    startTime: "08:00",
                    endTime: "12:00"
                });

                const booking = await createBooking(state, {
                    sampleDate: targetDate,
                    sampleTimeStart: timeValue(9, 0),
                    address: "21 Nguyễn Trãi, Dịch Vọng, Cầu Giấy, Hà Nội"
                });

                for (let i = 0; i < 3; i++) {
                    const tempPatient = await prisma.patient.create({
                        data: {
                            fullName: `Temp Patient ${i} ${suffix}`,
                            phone: makePhone("09"),
                            defaultAddress: "Dịch Vọng, Cầu Giấy, Hà Nội"
                        }
                    });
                    state.patientIds.push(tempPatient.id);

                    const tempBooking = await prisma.booking.create({
                        data: {
                            bookingCode: `HLB-TEMP-${i}-${suffix.slice(-4).toUpperCase()}`,
                            patientId: tempPatient.id,
                            sampleDate: targetDate,
                            sampleTimeStart: timeValue(9, 0),
                            address: `Temp ${i}, Dịch Vọng, Cầu Giấy, Hà Nội`,
                            phone: tempPatient.phone,
                            patientName: tempPatient.fullName,
                            status: "CONFIRMED",
                            testTypeText: `Temp booking ${i}`,
                            createdSource: "CHAT"
                        }
                    });
                    state.bookingIds.push(tempBooking.id);

                    await prisma.collectorAssignment.create({
                        data: {
                            bookingId: tempBooking.id,
                            collectorId: busyCollector.id,
                            status: "PENDING_COLLECTOR_CONFIRMATION",
                            assignmentSource: "AUTO",
                            reviewStatus: "NONE"
                        }
                    });
                }

                const result = await collectorAssignmentService.autoCreateCollectorAssignmentForBooking(
                    booking.id
                );

                assert(result.assignmentCreated === true, "Assignment should be created");
                assert(result.assignment !== null, "Assignment should not be null");
                assert(result.assignment.collectorId !== busyCollector.id, `Should NOT assign busy collector, got ${result.assignment.collectorId}`);
                assert(result.selectedCandidate.score >= 50, "Selected candidate should have decent score");
                state.assignmentIds.push(result.assignment.id);
            }
        ],
        [
            "booking_creation_flow_triggers_auto_assignment",
            async (state) => {
                const collector = await createCollector(state, {
                    name: `Flow Test Collector ${suffix}`,
                    phone: makePhone("08")
                });

                await createWorkingArea(state, {
                    collectorId: collector.id,
                    province: "Hà Nội",
                    district: "Cầu Giấy",
                    ward: "Dịch Vọng"
                });

                await createWorkingSchedule(state, {
                    collectorId: collector.id,
                    workDate: targetDate,
                    startTime: "08:00",
                    endTime: "12:00"
                });

                await prisma.availabilitySlot.create({
                    data: {
                        date: targetDate,
                        startTime: timeValue(9, 0),
                        endTime: timeValue(12, 0),
                        capacity: 100,
                        area: "Hà Nội - Cầu Giấy",
                        active: true
                    }
                });

                const booking = await bookingRuntime.createConfirmedBooking({
                    patientName: `Flow Test Patient ${suffix}`,
                    phone: makePhone("09"),
                    address: "24 Nguyễn Trãi, Dịch Vọng, Cầu Giấy, Hà Nội",
                    sampleDate: targetDate,
                    sampleTimeStart: "09:00",
                    sampleTimeEnd: "10:00",
                    testTypeText: "Flow test 5H4"
                }, {
                    sessionId: uniqueId("smoke_5h4_flow"),
                    createdSource: "CHAT"
                });

                assert(booking !== null, "Booking should be created");
                assert(booking.bookingCode !== undefined, "Booking should have bookingCode");
                assert(booking.status === "CONFIRMED", "Booking should be CONFIRMED");

                const assignment = await prisma.collectorAssignment.findFirst({
                    where: { bookingId: booking.id }
                });

                assert(assignment !== null, "Assignment should be created via flow");
                assert(assignment.status === "PENDING_COLLECTOR_CONFIRMATION", "Assignment should be PENDING_COLLECTOR_CONFIRMATION");
                assert(assignment.assignmentSource === "AUTO", "Assignment should be AUTO source");

                const assignedCollector = await prisma.staffProfile.findUnique({
                    where: { id: assignment.collectorId }
                });
                assert(assignedCollector !== null, "Assigned collector should exist");
                assert(assignedCollector.role === "SAMPLE_COLLECTOR", "Assigned staff should be SAMPLE_COLLECTOR");

                state.assignmentIds.push(assignment.id);
                state.bookingIds.push(booking.id);

                const dbBooking = await prisma.booking.findUnique({
                    where: { id: booking.id }
                });
                assert(dbBooking.status === "CONFIRMED", "Booking should still be CONFIRMED, not ASSIGNED");
            }
        ],
        [
            "chat_booking_response_contains_assignment_meta_if_supported",
            async (state) => {
                const collector = await createCollector(state, {
                    name: `Meta Test Collector ${suffix}`,
                    phone: makePhone("08")
                });

                await createWorkingArea(state, {
                    collectorId: collector.id,
                    province: "Hà Nội",
                    district: "Cầu Giấy",
                    ward: "Dịch Vọng"
                });

                await createWorkingSchedule(state, {
                    collectorId: collector.id,
                    workDate: targetDate,
                    startTime: "08:00",
                    endTime: "12:00"
                });

                await prisma.availabilitySlot.create({
                    data: {
                        date: targetDate,
                        startTime: timeValue(9, 0),
                        endTime: timeValue(12, 0),
                        capacity: 100,
                        area: "Hà Nội - Cầu Giấy",
                        active: true
                    }
                });

                const booking = await bookingRuntime.createConfirmedBooking({
                    patientName: `Meta Test Patient ${suffix}`,
                    phone: makePhone("09"),
                    address: "27 Nguyễn Trãi, Dịch Vọng, Cầu Giấy, Hà Nội",
                    sampleDate: targetDate,
                    sampleTimeStart: "09:00",
                    sampleTimeEnd: "10:00",
                    testTypeText: "Meta test 5H4"
                }, {
                    sessionId: uniqueId("smoke_5h4_meta"),
                    createdSource: "CHAT"
                });

                assert(booking !== null, "Booking should be created");
                assert(booking.collectorAssignment !== undefined, "Booking should have collectorAssignment meta");
                assert(booking.collectorAssignment.assignmentCreated === true, "assignmentCreated should be true");
                assert(booking.collectorAssignment.reason === "ASSIGNMENT_CREATED", "reason should be ASSIGNMENT_CREATED");
                assert(booking.collectorAssignment.assignment !== null, "assignment should exist");
                assert(booking.collectorAssignment.assignment.status === "PENDING_COLLECTOR_CONFIRMATION", "status should be PENDING_COLLECTOR_CONFIRMATION");
                state.assignmentIds.push(booking.collectorAssignment.assignment.id);
                state.bookingIds.push(booking.id);
            }
        ],
        [
            "existing_regression_admin_manual_assign_not_broken",
            async (state) => {
                const collector = await createCollector(state, {
                    name: `Regression Test Collector ${suffix}`,
                    phone: makePhone("08")
                });

                await createWorkingArea(state, {
                    collectorId: collector.id,
                    province: "Hà Nội",
                    district: "Cầu Giấy",
                    ward: "Dịch Vọng"
                });

                await createWorkingSchedule(state, {
                    collectorId: collector.id,
                    workDate: targetDate,
                    startTime: "08:00",
                    endTime: "12:00"
                });

                await prisma.availabilitySlot.create({
                    data: {
                        date: targetDate,
                        startTime: timeValue(9, 0),
                        endTime: timeValue(12, 0),
                        capacity: 100,
                        area: "Hà Nội - Cầu Giấy",
                        active: true
                    }
                });

                const booking = await bookingRuntime.createConfirmedBooking({
                    patientName: `Regression Test Patient ${suffix}`,
                    phone: makePhone("09"),
                    address: "30 Nguyễn Trãi, Dịch Vọng, Cầu Giấy, Hà Nội",
                    sampleDate: targetDate,
                    sampleTimeStart: "09:00",
                    sampleTimeEnd: "10:00",
                    testTypeText: "Regression test 5H4"
                }, {
                    sessionId: uniqueId("smoke_5h4_regression"),
                    createdSource: "CHAT"
                });

                assert(booking !== null, "Booking should be created");

                const assignmentBefore = await prisma.collectorAssignment.findFirst({
                    where: { bookingId: booking.id }
                });
                assert(assignmentBefore !== null, "Auto assignment should be created");

                const updatedBooking = await bookingRuntime.assignStaffToBooking(
                    booking.bookingCode,
                    { staffId: collector.id },
                    { role: "ADMIN", userId: "smoke_5h4_admin" }
                );

                assert(updatedBooking !== null, "Manual assign should work");

                const dbUpdatedBooking = await prisma.booking.findUnique({
                    where: { id: booking.id }
                });
                assert(dbUpdatedBooking !== null, "Updated booking should exist in DB");

                state.bookingIds.push(booking.id);
                state.assignmentIds.push(assignmentBefore.id);
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
