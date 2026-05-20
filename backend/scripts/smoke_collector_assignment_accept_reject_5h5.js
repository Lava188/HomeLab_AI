const prisma = require("../src/services/booking-runtime/prisma-client");
const bookingRuntime = require("../src/services/booking-runtime/booking.service");
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

function formatTimeOnly(value) {
    return [
        String(value.getUTCHours()).padStart(2, "0"),
        String(value.getUTCMinutes()).padStart(2, "0")
    ].join(":");
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

async function createCollector(state, { name, phone, active = true, role = "SAMPLE_COLLECTOR" }) {
    const collector = await prisma.staffProfile.create({
        data: {
            fullName: name,
            phone,
            role,
            active,
            serviceArea: `Smoke accept/reject 5H5 - ${name}`
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

async function createAssignment(state, { bookingId, collectorId, status = "PENDING_COLLECTOR_CONFIRMATION" }) {
    const assignment = await prisma.collectorAssignment.create({
        data: {
            bookingId,
            collectorId,
            status,
            assignmentSource: "AUTO",
            reviewStatus: "NONE",
            metadata: { smoke: "accept_reject_5h5" }
        }
    });
    state.assignmentIds.push(assignment.id);
    return assignment;
}

async function createBookingWithSlot(state, { sampleDate, sampleTimeStart, address, status = "CONFIRMED" }) {
    await prisma.availabilitySlot.create({
        data: {
            date: sampleDate,
            startTime: sampleTimeStart,
            endTime: timeValue(12, 0),
            capacity: 100,
            area: "Hà Nội - Cầu Giấy",
            active: true
        }
    });

    const booking = await bookingRuntime.createConfirmedBooking({
        patientName: `Smoke 5H5 Patient ${state.suffix}`,
        phone: makePhone("09"),
        address,
        sampleDate,
        sampleTimeStart: formatTimeOnly(sampleTimeStart),
        sampleTimeEnd: formatTimeOnly(new Date(sampleTimeStart.getTime() + 3600000)),
        testTypeText: "Smoke 5H5 test"
    }, {
        sessionId: uniqueId("smoke_5h5"),
        createdSource: "CHAT"
    });

    state.bookingIds.push(booking.id);
    return booking;
}

async function createDirectBookingWithSlot(state, { sampleDate, sampleTimeStart, address, status = "CONFIRMED" }) {
    await prisma.availabilitySlot.create({
        data: {
            date: sampleDate,
            startTime: sampleTimeStart,
            endTime: timeValue(12, 0),
            capacity: 100,
            area: "Hanoi - Cau Giay",
            active: true
        }
    });

    const patient = await prisma.patient.create({
        data: {
            fullName: `Smoke 5H5 Patient ${state.suffix}`,
            phone: makePhone("09"),
            defaultAddress: address
        }
    });

    const booking = await prisma.booking.create({
        data: {
            bookingCode: `HLB-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
            patientId: patient.id,
            sampleDate,
            sampleTimeStart,
            sampleTimeEnd: new Date(sampleTimeStart.getTime() + 3600000),
            address,
            phone: patient.phone,
            patientName: patient.fullName,
            status,
            testTypeText: "Smoke 5H5 test",
            createdSource: "CHAT"
        }
    });

    state.bookingIds.push(booking.id);
    state.patientIds.push(patient.id);

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
    await prisma.availabilitySlot.deleteMany({
        where: { area: "Hà Nội - Cầu Giấy" }
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
    const suffix = uniqueId("5h5");
    const state = {
        suffix,
        collectorIds: [],
        areaIds: [],
        scheduleIds: [],
        bookingIds: [],
        assignmentIds: [],
        patientIds: []
    };

    const targetDate = futureDate(46);
    const targetTime = timeValue(9, 0);

    const cases = [
        [
            "collector_lists_pending_assignment",
            async (state) => {
                const collector = await createCollector(state, {
                    name: `List Test Collector ${suffix}`,
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

                const booking = await createDirectBookingWithSlot(state, {
                    sampleDate: targetDate,
                    sampleTimeStart: targetTime,
                    address: "12 Nguyễn Trãi, Dịch Vọng, Cầu Giấy, Hà Nội"
                });

                await createAssignment(state, {
                    bookingId: booking.id,
                    collectorId: collector.id
                });

                const { response, payload } = await request(
                    `/api/collector/assignments?status=PENDING_COLLECTOR_CONFIRMATION`,
                    { headers: collectorHeaders(collector.phone) }
                );

                assert(response.status === 200 && payload.success, "List assignments should succeed");
                assert(Array.isArray(payload.data?.assignments), "Should return assignments array");

                const pendingAssignments = payload.data.assignments.filter(
                    a => a.status === "PENDING_COLLECTOR_CONFIRMATION"
                );
                assert(pendingAssignments.length > 0, "Should have at least one pending assignment");
            }
        ],
        [
            "collector_accepts_assignment",
            async (state) => {
                const collector = await createCollector(state, {
                    name: `Accept Test Collector ${suffix}`,
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

                const booking = await createDirectBookingWithSlot(state, {
                    sampleDate: targetDate,
                    sampleTimeStart: targetTime,
                    address: "15 Nguyễn Trãi, Dịch Vọng, Cầu Giấy, Hà Nội"
                });

                await createAssignment(state, {
                    bookingId: booking.id,
                    collectorId: collector.id
                });

                const { response: listResp, payload: listPayload } = await request(
                    `/api/collector/assignments?status=PENDING_COLLECTOR_CONFIRMATION`,
                    { headers: collectorHeaders(collector.phone) }
                );

                const assignment = listPayload.data.assignments.find(
                    a => a.bookingCode === booking.bookingCode
                );
                assert(assignment !== undefined, "Should find pending assignment for booking");

                const { response: acceptResp, payload: acceptPayload } = await request(
                    `/api/collector/assignments/${assignment.id}/accept`,
                    {
                        method: "POST",
                        headers: collectorHeaders(collector.phone)
                    }
                );

                assert(acceptResp.status === 200 && acceptPayload.success, "Accept should succeed");
                assert(acceptPayload.data.assignmentStatus === "ACCEPTED", "Assignment should be ACCEPTED");
                assert(acceptPayload.data.bookingStatus === "ASSIGNED", "Booking should be ASSIGNED");
                assert(acceptPayload.data.acceptedAt !== null, "acceptedAt should be set");

                const dbAssignment = await prisma.collectorAssignment.findUnique({
                    where: { id: assignment.id },
                    include: { assignmentHistory: true }
                });
                assert(dbAssignment.status === "ACCEPTED", "DB assignment should be ACCEPTED");
                assert(dbAssignment.assignmentHistory.length > 0, "Should have history");

                const dbBooking = await prisma.booking.findUnique({
                    where: { id: booking.id },
                    include: { statusHistory: true }
                });
                assert(dbBooking.status === "ASSIGNED", "DB booking should be ASSIGNED");
                assert(dbBooking.statusHistory.some(h => h.toStatus === "ASSIGNED"), "Should have ASSIGNED status history");
            }
        ],
        [
            "wrong_collector_cannot_accept",
            async (state) => {
                const collectorA = await createCollector(state, {
                    name: `Wrong Collector A ${suffix}`,
                    phone: makePhone("08")
                });

                const collectorB = await createCollector(state, {
                    name: `Wrong Collector B ${suffix}`,
                    phone: makePhone("07")
                });

                await createWorkingArea(state, {
                    collectorId: collectorA.id,
                    province: "Hà Nội",
                    district: "Cầu Giấy",
                    ward: "Dịch Vọng"
                });

                await createWorkingSchedule(state, {
                    collectorId: collectorA.id,
                    workDate: targetDate,
                    startTime: "08:00",
                    endTime: "12:00"
                });

                const booking = await createDirectBookingWithSlot(state, {
                    sampleDate: targetDate,
                    sampleTimeStart: targetTime,
                    address: "18 Nguyễn Trãi, Dịch Vọng, Cầu Giấy, Hà Nội"
                });

                await createAssignment(state, {
                    bookingId: booking.id,
                    collectorId: collectorA.id
                });

                const { response: listResp, payload: listPayload } = await request(
                    `/api/collector/assignments?status=PENDING_COLLECTOR_CONFIRMATION`,
                    { headers: collectorHeaders(collectorA.phone) }
                );

                const assignment = listPayload.data.assignments.find(
                    a => a.bookingCode === booking.bookingCode
                );

                const { response: acceptResp, payload: acceptPayload } = await request(
                    `/api/collector/assignments/${assignment.id}/accept`,
                    {
                        method: "POST",
                        headers: collectorHeaders(collectorB.phone)
                    }
                );

                assert(acceptResp.status === 403 || acceptResp.status === 400, "Should reject wrong collector");
                assert(acceptPayload.success === false, "Should return success=false");

                const dbAssignment = await prisma.collectorAssignment.findUnique({
                    where: { id: assignment.id }
                });
                assert(dbAssignment.status === "PENDING_COLLECTOR_CONFIRMATION", "Status should not change");
            }
        ],
        [
            "cannot_accept_already_accepted",
            async (state) => {
                const collector = await createCollector(state, {
                    name: `Already Accepted Test ${suffix}`,
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

                const booking = await createDirectBookingWithSlot(state, {
                    sampleDate: targetDate,
                    sampleTimeStart: targetTime,
                    address: "21 Nguyễn Trãi, Dịch Vọng, Cầu Giấy, Hà Nội"
                });

                await createAssignment(state, {
                    bookingId: booking.id,
                    collectorId: collector.id
                });

                const { response: listResp, payload: listPayload } = await request(
                    `/api/collector/assignments?status=PENDING_COLLECTOR_CONFIRMATION`,
                    { headers: collectorHeaders(collector.phone) }
                );

                const assignment = listPayload.data.assignments.find(
                    a => a.bookingCode === booking.bookingCode
                );

                await request(
                    `/api/collector/assignments/${assignment.id}/accept`,
                    {
                        method: "POST",
                        headers: collectorHeaders(collector.phone)
                    }
                );

                const { response: accept2Resp, payload: accept2Payload } = await request(
                    `/api/collector/assignments/${assignment.id}/accept`,
                    {
                        method: "POST",
                        headers: collectorHeaders(collector.phone)
                    }
                );

                assert(accept2Resp.status === 400, "Should reject duplicate accept");
                assert(accept2Payload.success === false, "Should return success=false");

                const dbAssignment = await prisma.collectorAssignment.findUnique({
                    where: { id: assignment.id }
                });
                assert(dbAssignment.status === "ACCEPTED", "Status should remain ACCEPTED");
            }
        ],
        [
            "collector_rejects_assignment_with_reason",
            async (state) => {
                const collector = await createCollector(state, {
                    name: `Reject Test Collector ${suffix}`,
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

                const booking = await createDirectBookingWithSlot(state, {
                    sampleDate: targetDate,
                    sampleTimeStart: targetTime,
                    address: "24 Nguyễn Trãi, Dịch Vọng, Cầu Giấy, Hà Nội"
                });

                await createAssignment(state, {
                    bookingId: booking.id,
                    collectorId: collector.id
                });

                const { response: listResp, payload: listPayload } = await request(
                    `/api/collector/assignments?status=PENDING_COLLECTOR_CONFIRMATION`,
                    { headers: collectorHeaders(collector.phone) }
                );

                const assignment = listPayload.data.assignments.find(
                    a => a.bookingCode === booking.bookingCode
                );

                const rejectReason = "Đang bận, không thể thực hiện nhiệm vụ này.";

                const { response: rejectResp, payload: rejectPayload } = await request(
                    `/api/collector/assignments/${assignment.id}/reject`,
                    {
                        method: "POST",
                        headers: collectorHeaders(collector.phone),
                        body: JSON.stringify({ reason: rejectReason })
                    }
                );

                assert(rejectResp.status === 200 && rejectPayload.success, "Reject should succeed");
                assert(rejectPayload.data.assignmentStatus === "REJECTED_PENDING_ADMIN_REVIEW", "Assignment should be REJECTED_PENDING_ADMIN_REVIEW");

                const dbAssignment = await prisma.collectorAssignment.findUnique({
                    where: { id: assignment.id }
                });
                assert(dbAssignment.status === "REJECTED_PENDING_ADMIN_REVIEW", "DB assignment should be REJECTED_PENDING_ADMIN_REVIEW");
                assert(dbAssignment.reviewStatus === "PENDING", "reviewStatus should be PENDING");
                assert(dbAssignment.rejectReason === rejectReason, "rejectReason should be saved");
                assert(dbAssignment.rejectedAt !== null, "rejectedAt should be set");

                const dbBooking = await prisma.booking.findUnique({
                    where: { id: booking.id }
                });
                assert(dbBooking.status !== "ASSIGNED", "Booking should NOT be ASSIGNED");
                assert(dbBooking.status === "CONFIRMED", "Booking should remain CONFIRMED");

                const history = await prisma.collectorAssignmentHistory.findFirst({
                    where: {
                        assignmentId: assignment.id,
                        toStatus: "REJECTED_PENDING_ADMIN_REVIEW"
                    }
                });
                assert(history !== null, "Should have history");
                assert(history.toStatus === "REJECTED_PENDING_ADMIN_REVIEW", "History should show REJECTED_PENDING_ADMIN_REVIEW");
            }
        ],
        [
            "reject_without_reason_rejected",
            async (state) => {
                const collector = await createCollector(state, {
                    name: `No Reason Test ${suffix}`,
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

                const booking = await createDirectBookingWithSlot(state, {
                    sampleDate: targetDate,
                    sampleTimeStart: targetTime,
                    address: "27 Nguyễn Trãi, Dịch Vọng, Cầu Giấy, Hà Nội"
                });

                await createAssignment(state, {
                    bookingId: booking.id,
                    collectorId: collector.id
                });

                const { response: listResp, payload: listPayload } = await request(
                    `/api/collector/assignments?status=PENDING_COLLECTOR_CONFIRMATION`,
                    { headers: collectorHeaders(collector.phone) }
                );

                const assignment = listPayload.data.assignments.find(
                    a => a.bookingCode === booking.bookingCode
                );

                const { response: rejectResp, payload: rejectPayload } = await request(
                    `/api/collector/assignments/${assignment.id}/reject`,
                    {
                        method: "POST",
                        headers: collectorHeaders(collector.phone),
                        body: JSON.stringify({ reason: "" })
                    }
                );

                assert(rejectResp.status === 400, "Should reject without reason");
                assert(rejectPayload.success === false, "Should return success=false");

                const dbAssignment = await prisma.collectorAssignment.findUnique({
                    where: { id: assignment.id }
                });
                assert(dbAssignment.status === "PENDING_COLLECTOR_CONFIRMATION", "Status should not change");
            }
        ],
        [
            "cannot_reject_accepted_assignment",
            async (state) => {
                const collector = await createCollector(state, {
                    name: `Reject Accepted Test ${suffix}`,
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

                const booking = await createDirectBookingWithSlot(state, {
                    sampleDate: targetDate,
                    sampleTimeStart: targetTime,
                    address: "30 Nguyễn Trãi, Dịch Vọng, Cầu Giấy, Hà Nội"
                });

                await createAssignment(state, {
                    bookingId: booking.id,
                    collectorId: collector.id
                });

                const { response: listResp, payload: listPayload } = await request(
                    `/api/collector/assignments?status=PENDING_COLLECTOR_CONFIRMATION`,
                    { headers: collectorHeaders(collector.phone) }
                );

                const assignment = listPayload.data.assignments.find(
                    a => a.bookingCode === booking.bookingCode
                );

                await request(
                    `/api/collector/assignments/${assignment.id}/accept`,
                    {
                        method: "POST",
                        headers: collectorHeaders(collector.phone)
                    }
                );

                const { response: rejectResp, payload: rejectPayload } = await request(
                    `/api/collector/assignments/${assignment.id}/reject`,
                    {
                        method: "POST",
                        headers: collectorHeaders(collector.phone),
                        body: JSON.stringify({ reason: "Already accepted, cannot reject" })
                    }
                );

                assert(rejectResp.status === 400, "Should reject accepted assignment");
                assert(rejectPayload.success === false, "Should return success=false");

                const dbAssignment = await prisma.collectorAssignment.findUnique({
                    where: { id: assignment.id }
                });
                assert(dbAssignment.status === "ACCEPTED", "Status should remain ACCEPTED");
            }
        ],
        [
            "inactive_collector_cannot_act",
            async (state) => {
                const inactiveCollector = await createCollector(state, {
                    name: `Inactive Test ${suffix}`,
                    phone: makePhone("07"),
                    active: false
                });

                const activeCollector = await createCollector(state, {
                    name: `Active For Assignment ${suffix}`,
                    phone: makePhone("08")
                });

                await createWorkingArea(state, {
                    collectorId: activeCollector.id,
                    province: "Hà Nội",
                    district: "Cầu Giấy",
                    ward: "Dịch Vọng"
                });

                await createWorkingSchedule(state, {
                    collectorId: activeCollector.id,
                    workDate: targetDate,
                    startTime: "08:00",
                    endTime: "12:00"
                });

                const booking = await createDirectBookingWithSlot(state, {
                    sampleDate: targetDate,
                    sampleTimeStart: targetTime,
                    address: "33 Nguyễn Trãi, Dịch Vọng, Cầu Giấy, Hà Nội"
                });

                await createAssignment(state, {
                    bookingId: booking.id,
                    collectorId: activeCollector.id
                });

                const { response: listResp, payload: listPayload } = await request(
                    `/api/collector/assignments?status=PENDING_COLLECTOR_CONFIRMATION`,
                    { headers: collectorHeaders(activeCollector.phone) }
                );

                const assignment = listPayload.data.assignments.find(
                    a => a.bookingCode === booking.bookingCode
                );

                const { response: acceptResp, payload: acceptPayload } = await request(
                    `/api/collector/assignments/${assignment.id}/accept`,
                    {
                        method: "POST",
                        headers: collectorHeaders(inactiveCollector.phone)
                    }
                );

                assert(acceptResp.status === 403, "Should reject inactive collector");
                assert(acceptPayload.success === false, "Should return success=false");
            }
        ],
        [
            "terminal_booking_accept_rejected",
            async (state) => {
                const collector = await createCollector(state, {
                    name: `Terminal Test ${suffix}`,
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

                const patient = await prisma.patient.create({
                    data: {
                        fullName: `Terminal Test Patient ${suffix}`,
                        phone: makePhone("09"),
                        defaultAddress: "Dịch Vọng, Cầu Giấy, Hà Nội"
                    }
                });

                const booking = await prisma.booking.create({
                    data: {
                        bookingCode: `HLB-TERM-${suffix.slice(-4).toUpperCase()}`,
                        patientId: patient.id,
                        sampleDate: targetDate,
                        sampleTimeStart: targetTime,
                        sampleTimeEnd: new Date(targetTime.getTime() + 3600000),
                        address: "36 Nguyễn Trãi, Dịch Vọng, Cầu Giấy, Hà Nội",
                        phone: patient.phone,
                        patientName: patient.fullName,
                        status: "CANCELLED",
                        testTypeText: "Terminal test",
                        createdSource: "CHAT"
                    }
                });
                state.bookingIds.push(booking.id);
                state.patientIds.push(patient.id);

                const assignment = await createAssignment(state, {
                    bookingId: booking.id,
                    collectorId: collector.id,
                    status: "PENDING_COLLECTOR_CONFIRMATION"
                });

                const { response, payload } = await request(
                    `/api/collector/assignments/${assignment.id}/accept`,
                    {
                        method: "POST",
                        headers: collectorHeaders(collector.phone)
                    }
                );

                assert(response.status === 400 || response.status === 409, "Should reject terminal booking");
                assert(payload.success === false, "Should return success=false");

                const dbAssignment = await prisma.collectorAssignment.findUnique({
                    where: { id: assignment.id }
                });
                assert(dbAssignment.status === "PENDING_COLLECTOR_CONFIRMATION", "Status should not change");
            }
        ],
        [
            "auto_created_assignment_can_be_accepted",
            async (state) => {
                const collector = await createCollector(state, {
                    name: `Auto Accept Test ${suffix}`,
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

                const booking = await createBookingWithSlot(state, {
                    sampleDate: targetDate,
                    sampleTimeStart: targetTime,
                    address: "39 Nguyễn Trãi, Dịch Vọng, Cầu Giấy, Hà Nội"
                });

                await new Promise(resolve => setTimeout(resolve, 500));

                const assignment = await prisma.collectorAssignment.findFirst({
                    where: { bookingId: booking.id }
                });
                assert(assignment !== null, "Auto assignment should be created");
                assert(assignment.status === "PENDING_COLLECTOR_CONFIRMATION", "Should be pending");
                assert(assignment.assignmentSource === "AUTO", "Should be AUTO source");
                const assignedCollector = await prisma.staffProfile.findUnique({
                    where: { id: assignment.collectorId }
                });
                assert(assignedCollector?.phone, "Auto assignment collector should have phone");

                const { response, payload } = await request(
                    `/api/collector/assignments/${assignment.id}/accept`,
                    {
                        method: "POST",
                        headers: collectorHeaders(assignedCollector.phone)
                    }
                );

                assert(response.status === 200 && payload.success, "Accept should succeed");
                assert(payload.data.assignmentStatus === "ACCEPTED", "Assignment should be ACCEPTED");
                assert(payload.data.bookingStatus === "ASSIGNED", "Booking should be ASSIGNED");

                const dbBooking = await prisma.booking.findUnique({
                    where: { id: booking.id }
                });
                assert(dbBooking.status === "ASSIGNED", "DB booking should be ASSIGNED");
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
