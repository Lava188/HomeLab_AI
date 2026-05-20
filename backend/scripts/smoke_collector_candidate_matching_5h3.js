let prisma;
let collectorMatching;

function reloadModules() {
    delete require.cache[require.resolve("../src/services/booking-runtime/prisma-client")];
    delete require.cache[require.resolve("../src/services/collector-assignment/collector-matching.service")];

    prisma = require("../src/services/booking-runtime/prisma-client");
    collectorMatching = require("../src/services/collector-assignment/collector-matching.service");
}

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

function adminHeaders() {
    return {
        "Content-Type": "application/json",
        "x-demo-role": "ADMIN",
        "x-demo-user-id": "smoke_collector_matching_5h3"
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

async function createCollector(state, { name, phone, active = true, role = "SAMPLE_COLLECTOR" }) {
    const collector = await prisma.staffProfile.create({
        data: {
            fullName: name,
            phone,
            role,
            active,
            serviceArea: `Smoke collector matching 5H3 - ${name}`
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
            fullName: `Smoke Matching Patient ${state.suffix}`,
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
            testTypeText: "Smoke collector matching 5H3",
            createdSource: "CHAT",
            createdFromSessionId: uniqueId("smoke_matching_5h3")
        }
    });
    state.bookingIds.push(booking.id);
    return booking;
}

async function createAssignment(state, { bookingId, collectorId, status = "PENDING_COLLECTOR_CONFIRMATION" }) {
    const assignment = await prisma.collectorAssignment.create({
        data: {
            bookingId,
            collectorId,
            status,
            assignmentSource: "AUTO",
            reviewStatus: "NONE",
            metadata: { smoke: "collector_matching_5h3" }
        }
    });
    state.assignmentIds.push(assignment.id);
    return assignment;
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
    reloadModules();

    const suffix = uniqueId("5h3");
    const state = {
        suffix,
        collectorIds: [],
        areaIds: [],
        scheduleIds: [],
        bookingIds: [],
        patientIds: [],
        assignmentIds: []
    };

    const targetDate = futureDate(46);

    const cases = [
        [
            "matched_collector_by_ward_and_schedule",
            async (state) => {
                const collector = await createCollector(state, {
                    name: `Matched Collector ${suffix}`,
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

                const result = await collectorMatching.findCollectorCandidatesForBooking(
                    booking.id
                );

                assert(result.candidates.length >= 1, "Expected at least 1 candidate");
                const candidate = result.candidates[0];
                assert(candidate.collectorId === collector.id, "Collector ID mismatch");
                assert(candidate.areaMatch.level === "WARD", `Expected WARD match, got ${candidate.areaMatch.level}`);
                assert(candidate.scheduleMatch.matched === true, "Expected schedule match");
                assert(candidate.score > 0, `Expected positive score, got ${candidate.score}`);
            }
        ],
        [
            "inactive_collector_excluded",
            async (state) => {
                const inactiveCollector = await createCollector(state, {
                    name: `Inactive Collector ${suffix}`,
                    phone: makePhone("07"),
                    active: false
                });

                await createWorkingArea(state, {
                    collectorId: inactiveCollector.id,
                    province: "Hà Nội",
                    district: "Cầu Giấy",
                    ward: "Dịch Vọng"
                });

                await createWorkingSchedule(state, {
                    collectorId: inactiveCollector.id,
                    workDate: targetDate,
                    startTime: "08:00",
                    endTime: "12:00"
                });

                const booking = await createBooking(state, {
                    sampleDate: targetDate,
                    sampleTimeStart: timeValue(9, 0),
                    address: "15 Nguyễn Trãi, Dịch Vọng, Cầu Giấy, Hà Nội"
                });

                const result = await collectorMatching.findCollectorCandidatesForBooking(
                    booking.id
                );

                const hasInactive = result.candidates.some(c => c.collectorId === inactiveCollector.id);
                assert(!hasInactive, "Inactive collector should not appear in candidates");
            }
        ],
        [
            "wrong_role_excluded",
            async (state) => {
                const adminStaff = await createCollector(state, {
                    name: `Admin Staff ${suffix}`,
                    phone: makePhone("09"),
                    role: "ADMIN"
                });

                await createWorkingArea(state, {
                    collectorId: adminStaff.id,
                    province: "Hà Nội",
                    district: "Cầu Giấy",
                    ward: "Dịch Vọng"
                });

                await createWorkingSchedule(state, {
                    collectorId: adminStaff.id,
                    workDate: targetDate,
                    startTime: "08:00",
                    endTime: "12:00"
                });

                const booking = await createBooking(state, {
                    sampleDate: targetDate,
                    sampleTimeStart: timeValue(9, 0),
                    address: "18 Nguyễn Trãi, Dịch Vọng, Cầu Giấy, Hà Nội"
                });

                const result = await collectorMatching.findCollectorCandidatesForBooking(
                    booking.id
                );

                const hasAdmin = result.candidates.some(c => c.collectorId === adminStaff.id);
                assert(!hasAdmin, "Admin role staff should not appear in candidates");
            }
        ],
        [
            "area_mismatch_excluded",
            async (state) => {
                const hcmCollector = await createCollector(state, {
                    name: `HCM Collector ${suffix}`,
                    phone: makePhone("07")
                });

                await createWorkingArea(state, {
                    collectorId: hcmCollector.id,
                    province: "Thành phố Hồ Chí Minh",
                    district: "Quận 1",
                    ward: "Bến Nghé"
                });

                await createWorkingSchedule(state, {
                    collectorId: hcmCollector.id,
                    workDate: targetDate,
                    startTime: "08:00",
                    endTime: "12:00"
                });

                const booking = await createBooking(state, {
                    sampleDate: targetDate,
                    sampleTimeStart: timeValue(9, 0),
                    address: "21 Nguyễn Trãi, Dịch Vọng, Cầu Giấy, Hà Nội"
                });

                const result = await collectorMatching.findCollectorCandidatesForBooking(
                    booking.id
                );

                const hasHCM = result.candidates.some(c => c.collectorId === hcmCollector.id);
                assert(!hasHCM, "HCM collector should not match Hanoi booking");
            }
        ],
        [
            "schedule_mismatch_excluded",
            async (state) => {
                const afternoonCollector = await createCollector(state, {
                    name: `Afternoon Collector ${suffix}`,
                    phone: makePhone("08")
                });

                await createWorkingArea(state, {
                    collectorId: afternoonCollector.id,
                    province: "Hà Nội",
                    district: "Cầu Giấy",
                    ward: "Dịch Vọng"
                });

                await createWorkingSchedule(state, {
                    collectorId: afternoonCollector.id,
                    workDate: targetDate,
                    startTime: "14:00",
                    endTime: "18:00"
                });

                const booking = await createBooking(state, {
                    sampleDate: targetDate,
                    sampleTimeStart: timeValue(9, 0),
                    address: "24 Nguyễn Trãi, Dịch Vọng, Cầu Giấy, Hà Nội"
                });

                const result = await collectorMatching.findCollectorCandidatesForBooking(
                    booking.id
                );

                const hasAfternoon = result.candidates.some(c => c.collectorId === afternoonCollector.id);
                assert(!hasAfternoon, "Afternoon-only collector should not match morning booking");
            }
        ],
        [
            "workload_affects_ranking",
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
                    address: "27 Nguyễn Trãi, Dịch Vọng, Cầu Giấy, Hà Nội"
                });

                for (let i = 0; i < 3; i++) {
                    const tempBooking = await createBooking(state, {
                        sampleDate: targetDate,
                        sampleTimeStart: timeValue(9, 0),
                        address: `Temp ${i}, Dịch Vọng, Cầu Giấy, Hà Nội`
                    });
                    await createAssignment(state, {
                        bookingId: tempBooking.id,
                        collectorId: busyCollector.id
                    });
                }

                const result = await collectorMatching.findCollectorCandidatesForBooking(
                    booking.id,
                    { includeDebug: false }
                );

                assert(result.candidates.length >= 2, `Expected at least 2 candidates, got ${result.candidates.length}`);

                const busyCandidate = result.candidates.find(c => c.collectorId === busyCollector.id);
                const freeCandidate = result.candidates.find(c => c.collectorId === freeCollector.id);

                assert(busyCandidate, "Busy collector should be in candidates");
                assert(freeCandidate, "Free collector should be in candidates");

                assert(
                    busyCandidate.workload.activeAssignedCount >= 3,
                    `Busy collector should have at least 3 assignments, got ${busyCandidate.workload.activeAssignedCount}`
                );

                assert(
                    freeCandidate.score > busyCandidate.score,
                    `Free collector (${freeCandidate.score}) should score higher than busy collector (${busyCandidate.score})`
                );
            }
        ],
        [
            "booking_missing_area_or_time_returns_controlled_empty",
            async (state) => {
                const collector = await createCollector(state, {
                    name: `Missing Area Test Collector ${suffix}`,
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

                const mockBookingNoAddress = {
                    id: `mock-no-address-${suffix}`,
                    bookingCode: `HLB-NOADDR-${suffix.slice(-4).toUpperCase()}`,
                    sampleDate: targetDate,
                    sampleTimeStart: timeValue(9, 0),
                    address: null,
                    status: "CONFIRMED"
                };

                const resultNoAddress = await collectorMatching.findCollectorCandidatesForBooking(
                    mockBookingNoAddress
                );

                assert(resultNoAddress.candidates.length === 0, "Expected no candidates for booking without address");
                assert(resultNoAddress.warnings.length > 0, "Expected warnings for missing address");

                const mockBookingNoTime = {
                    id: `mock-no-time-${suffix}`,
                    bookingCode: `HLB-NOTIME-${suffix.slice(-4).toUpperCase()}`,
                    sampleDate: targetDate,
                    sampleTimeStart: null,
                    address: "30 Nguyễn Trãi, Dịch Vọng, Cầu Giấy, Hà Nội",
                    status: "CONFIRMED"
                };

                const resultNoTime = await collectorMatching.findCollectorCandidatesForBooking(
                    mockBookingNoTime
                );

                assert(resultNoTime.candidates.length === 0, "Expected no candidates for booking without time");
                assert(resultNoTime.warnings.length > 0, "Expected warnings for missing time");
            }
        ],
        [
            "terminal_booking_returns_no_candidates",
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
                            bookingCode: `HLB-${status}-${suffix.slice(-4).toUpperCase()}`,
                            patientId: patient.id,
                            sampleDate: targetDate,
                            sampleTimeStart: timeValue(9, 0),
                            address: "33 Nguyễn Trãi, Dịch Vọng, Cầu Giấy, Hà Nội",
                            phone: patient.phone,
                            patientName: patient.fullName,
                            status,
                            testTypeText: `Terminal status test ${status}`,
                            createdSource: "CHAT"
                        }
                    });
                    state.bookingIds.push(booking.id);

                    const result = await collectorMatching.findCollectorCandidatesForBooking(
                        booking.id
                    );

                    assert(result.candidates.length === 0, `Expected no candidates for ${status} booking`);
                    assert(result.warnings.length > 0, `Expected warnings for ${status} booking`);
                }
            }
        ],
        [
            "admin_candidate_preview_does_not_create_assignment",
            async (state) => {
                const collector = await createCollector(state, {
                    name: `Preview Test Collector ${suffix}`,
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
                    address: "36 Nguyễn Trãi, Dịch Vọng, Cầu Giấy, Hà Nội"
                });

                const assignmentCountBefore = await prisma.collectorAssignment.count({
                    where: { bookingId: booking.id }
                });

                const { response, payload } = await request(
                    `/api/admin/bookings/${booking.bookingCode}/collector-candidates`,
                    { headers: adminHeaders() }
                );

                assert(response.status === 200, `Expected 200, got ${response.status}`);
                assert(payload.success === true, "API should return success");

                const assignmentCountAfter = await prisma.collectorAssignment.count({
                    where: { bookingId: booking.id }
                });

                assert(
                    assignmentCountAfter === assignmentCountBefore,
                    `Assignment count should not change: before=${assignmentCountBefore}, after=${assignmentCountAfter}`
                );

                assert(
                    payload.data.candidates.length >= 1,
                    "API should return at least one candidate"
                );
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
