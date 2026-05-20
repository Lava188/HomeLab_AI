const prisma = require("../src/services/booking-runtime/prisma-client");

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

async function createCollector(state) {
    const collector = await prisma.staffProfile.create({
        data: {
            fullName: `Smoke Collector Assignment ${state.suffix}`,
            phone: makePhone("08"),
            role: "SAMPLE_COLLECTOR",
            serviceArea: "Smoke collector assignment schema 5H1",
            active: true
        }
    });

    state.collectorId = collector.id;

    return collector;
}

async function createBooking(state) {
    const patient = await prisma.patient.create({
        data: {
            fullName: `Smoke Assignment Patient ${state.suffix}`,
            phone: makePhone("09"),
            defaultAddress: "Smoke 5H1 Address"
        }
    });

    state.patientId = patient.id;

    const booking = await prisma.booking.create({
        data: {
            bookingCode: `HLB-${Date.now()}-${state.suffix.slice(-4).toUpperCase()}`,
            patientId: patient.id,
            sampleDate: futureDate(46),
            sampleTimeStart: timeValue(8, 0),
            sampleTimeEnd: timeValue(9, 0),
            address: "Smoke 5H1 Address, Cau Giay, Ha Noi",
            phone: patient.phone,
            patientName: patient.fullName,
            status: "CONFIRMED",
            testTypeText: "Smoke collector assignment schema",
            createdSource: "CHAT",
            createdFromSessionId: uniqueId("smoke_assignment_schema_5h1")
        }
    });

    state.bookingId = booking.id;

    return booking;
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

    if (state.bookingId) {
        await prisma.booking.deleteMany({ where: { id: state.bookingId } });
    }

    if (state.patientId) {
        await prisma.patient.deleteMany({ where: { id: state.patientId } });
    }

    if (state.collectorId) {
        await prisma.staffProfile.deleteMany({ where: { id: state.collectorId } });
    }
}

async function main() {
    const state = {
        suffix: uniqueId("5h1"),
        collectorId: null,
        patientId: null,
        bookingId: null,
        areaIds: [],
        scheduleIds: [],
        assignmentIds: [],
        historyIds: [],
        area: null,
        schedule: null,
        booking: null,
        assignment: null
    };

    await createCollector(state);
    state.booking = await createBooking(state);

    const cases = [
        [
            "create_collector_working_area",
            async () => {
                const area = await prisma.collectorWorkingArea.create({
                    data: {
                        staffProfileId: state.collectorId,
                        province: "Hà Nội",
                        district: "Cầu Giấy",
                        ward: "Dịch Vọng"
                    }
                });

                state.area = area;
                state.areaIds.push(area.id);

                assert(area.active === true, "working area is not active by default");
                assert(area.province === "Hà Nội", "province mismatch");
                assert(area.district === "Cầu Giấy", "district mismatch");
                assert(area.ward === "Dịch Vọng", "ward mismatch");
            }
        ],
        [
            "create_collector_working_schedule",
            async () => {
                const schedule = await prisma.collectorWorkingSchedule.create({
                    data: {
                        staffProfileId: state.collectorId,
                        workDate: futureDate(47),
                        startTime: "08:00",
                        endTime: "12:00",
                        capacity: 4
                    }
                });

                state.schedule = schedule;
                state.scheduleIds.push(schedule.id);

                assert(schedule.active === true, "working schedule is not active by default");
                assert(schedule.startTime === "08:00", "startTime mismatch");
                assert(schedule.endTime === "12:00", "endTime mismatch");
                assert(schedule.capacity === 4, "capacity mismatch");
            }
        ],
        [
            "create_assignment_for_booking",
            async () => {
                const assignment = await prisma.collectorAssignment.create({
                    data: {
                        bookingId: state.bookingId,
                        collectorId: state.collectorId,
                        status: "PENDING_COLLECTOR_CONFIRMATION",
                        assignmentSource: "AUTO",
                        reviewStatus: "NONE",
                        metadata: {
                            smoke: "collector_assignment_schema_5h1",
                            suffix: state.suffix
                        }
                    }
                });

                state.assignment = assignment;
                state.assignmentIds.push(assignment.id);

                assert(assignment.status === "PENDING_COLLECTOR_CONFIRMATION", "assignment status mismatch");
                assert(assignment.assignmentSource === "AUTO", "assignment source mismatch");
            }
        ],
        [
            "create_assignment_history",
            async () => {
                const history = await prisma.collectorAssignmentHistory.create({
                    data: {
                        assignmentId: state.assignment.id,
                        fromStatus: null,
                        toStatus: "PENDING_COLLECTOR_CONFIRMATION",
                        actorType: "SYSTEM",
                        actorId: "smoke_collector_assignment_schema_5h1",
                        reason: "Initial smoke assignment history",
                        metadata: { suffix: state.suffix }
                    }
                });

                state.historyIds.push(history.id);

                assert(history.toStatus === "PENDING_COLLECTOR_CONFIRMATION", "history toStatus mismatch");
                assert(history.fromStatus === null, "history fromStatus should be null");
            }
        ],
        [
            "multiple_assignments_per_booking_allowed",
            async () => {
                const assignment = await prisma.collectorAssignment.create({
                    data: {
                        bookingId: state.bookingId,
                        collectorId: state.collectorId,
                        status: "SUPERSEDED",
                        assignmentSource: "AUTO",
                        reviewStatus: "NONE",
                        metadata: { smoke: "multiple_assignments_per_booking_allowed" }
                    }
                });

                state.assignmentIds.push(assignment.id);

                const count = await prisma.collectorAssignment.count({
                    where: { bookingId: state.bookingId }
                });

                assert(count >= 2, `expected at least 2 assignments, got ${count}`);
            }
        ],
        [
            "staff_profile_relations_readable",
            async () => {
                const collector = await prisma.staffProfile.findUnique({
                    where: { id: state.collectorId },
                    include: {
                        workingAreas: true,
                        workingSchedules: true,
                        collectorAssignments: true
                    }
                });

                assert(Array.isArray(collector.workingAreas), "workingAreas is not readable");
                assert(Array.isArray(collector.workingSchedules), "workingSchedules is not readable");
                assert(Array.isArray(collector.collectorAssignments), "collectorAssignments is not readable");
                assert(collector.workingAreas.length >= 1, "workingAreas missing created area");
                assert(collector.workingSchedules.length >= 1, "workingSchedules missing created schedule");
                assert(collector.collectorAssignments.length >= 2, "collectorAssignments missing created assignments");
            }
        ],
        [
            "booking_relation_readable",
            async () => {
                const booking = await prisma.booking.findUnique({
                    where: { id: state.bookingId },
                    include: { collectorAssignments: true }
                });

                assert(Array.isArray(booking.collectorAssignments), "booking collectorAssignments is not readable");
                assert(booking.collectorAssignments.length >= 2, "booking collectorAssignments missing assignments");
            }
        ],
        [
            "enum_values_available",
            async () => {
                const assignment = await prisma.collectorAssignment.create({
                    data: {
                        bookingId: state.bookingId,
                        collectorId: state.collectorId,
                        status: "CANCELLED",
                        assignmentSource: "ADMIN",
                        reviewStatus: "REJECTED",
                        metadata: { smoke: "enum_values_available" }
                    }
                });

                state.assignmentIds.push(assignment.id);

                assert(assignment.status === "CANCELLED", "CANCELLED status not available");
                assert(assignment.assignmentSource === "ADMIN", "ADMIN assignment source not available");
                assert(assignment.reviewStatus === "REJECTED", "REJECTED review status not available");
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
