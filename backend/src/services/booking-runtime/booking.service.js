const repository = require("./booking.repository");
const BookingRuntimeError = require("./booking-runtime-error");
const { generateBookingCode } = require("./booking-code.service");
const {
    normalizePhone,
    validateConfirmedBookingInput,
} = require("./booking-validation.service");
const {
    assertBookingStatusTransition,
    getAllowedNextStatuses
} = require("./booking-status-transition.service");
const availabilitySlotService = require("./availability-slot.service");
const { buildWorkload } = require("../admin-staff.service");
const collectorAssignmentService = require("../collector-assignment/collector-assignment.service");
const notificationService = require("../notification.service");

const BOOKING_CODE_MAX_RETRIES = 5;

function parseDateOnly(value) {
    if (value instanceof Date) {
        return value;
    }

    const [year, month, day] = String(value || "").split("-").map(Number);

    return new Date(Date.UTC(year, month - 1, day));
}

function parseTimeOnly(value) {
    if (!value) return null;
    if (value instanceof Date) return value;

    const [hour, minute = 0, second = 0] = String(value).split(":").map(Number);

    return new Date(Date.UTC(1970, 0, 1, hour, minute, second));
}

function formatDateOnly(value) {
    if (!value) return null;

    const date = new Date(value);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function formatTimeOnly(value) {
    if (!value) return null;

    const date = new Date(value);
    const hour = String(date.getUTCHours()).padStart(2, "0");
    const minute = String(date.getUTCMinutes()).padStart(2, "0");

    return `${hour}:${minute}`;
}

function normalizeBooking(booking, extra = {}) {
    if (!booking) return null;

    return {
        id: booking.id,
        bookingCode: booking.bookingCode,
        status: booking.status,
        patientName: booking.patientName || booking.patient?.fullName || null,
        phone: booking.phone,
        testName: booking.testCatalogItem?.name || null,
        testCatalogItemId: booking.testCatalogItemId || null,
        testTypeText: booking.testTypeText,
        sampleDate: formatDateOnly(booking.sampleDate),
        sampleTimeStart: formatTimeOnly(booking.sampleTimeStart),
        sampleTimeEnd: formatTimeOnly(booking.sampleTimeEnd),
        address: booking.address,
        note: booking.note || null,
        internalNote: booking.internalNote || null,
        createdSource: booking.createdSource || null,
        createdFromSessionId: booking.createdFromSessionId || null,
        cancelledAt: booking.cancelledAt || null,
        completedAt: booking.completedAt || null,
        createdAt: booking.createdAt || null,
        updatedAt: booking.updatedAt || null,
        patient: booking.patient
            ? {
                id: booking.patient.id,
                fullName: booking.patient.fullName,
                phone: booking.patient.phone,
                email: booking.patient.email || null,
                defaultAddress: booking.patient.defaultAddress || null
            }
            : null,
        testCatalogItem: booking.testCatalogItem
            ? {
                id: booking.testCatalogItem.id,
                code: booking.testCatalogItem.code,
                name: booking.testCatalogItem.name,
                category: booking.testCatalogItem.category || null,
                sampleType: booking.testCatalogItem.sampleType || null
            }
            : null,
        assignedStaff: booking.assignedStaff
            ? {
                id: booking.assignedStaff.id,
                fullName: booking.assignedStaff.fullName,
                phone: booking.assignedStaff.phone || null,
                role: booking.assignedStaff.role,
                serviceArea: booking.assignedStaff.serviceArea || null,
                active: booking.assignedStaff.active
            }
            : null,
        collectorAssignments: Array.isArray(booking.collectorAssignments)
            ? booking.collectorAssignments.map((assignment) => ({
                id: assignment.id,
                assignmentId: assignment.id,
                status: assignment.status,
                assignmentSource: assignment.assignmentSource,
                reviewStatus: assignment.reviewStatus,
                collectorId: assignment.collectorId,
                collectorName: assignment.collector?.fullName || null,
                collectorPhone: assignment.collector?.phone || null,
                collectorRole: assignment.collector?.role || null,
                collectorActive: assignment.collector?.active ?? null,
                assignedAt: assignment.assignedAt || null,
                acceptedAt: assignment.acceptedAt || null,
                rejectedAt: assignment.rejectedAt || null,
                rejectReason: assignment.rejectReason || null,
                adminReviewedAt: assignment.adminReviewedAt || null,
                adminReviewedById: assignment.adminReviewedById || null,
                expiresAt: assignment.expiresAt || null,
                metadata: assignment.metadata || null,
                history: Array.isArray(assignment.assignmentHistory)
                    ? assignment.assignmentHistory.map((item) => ({
                        id: item.id,
                        fromStatus: item.fromStatus || null,
                        toStatus: item.toStatus,
                        actorType: item.actorType,
                        actorId: item.actorId || null,
                        reason: item.reason || null,
                        metadata: item.metadata || null,
                        createdAt: item.createdAt
                    }))
                    : []
            }))
            : undefined,
        statusHistory: Array.isArray(booking.statusHistory)
            ? booking.statusHistory.map((item) => ({
                id: item.id,
                fromStatus: item.fromStatus || null,
                toStatus: item.toStatus,
                reason: item.reason || null,
                changedByType: item.changedByType,
                changedById: item.changedById || null,
                metadata: item.metadata || null,
                createdAt: item.createdAt
            }))
            : undefined,
        ...extra
    };
}

function parseLimit(value) {
    const parsed = Number(value);

    if (!Number.isFinite(parsed) || parsed <= 0) {
        return 50;
    }

    return Math.min(Math.floor(parsed), 100);
}

function buildBookingWhere(filter = {}) {
    const where = {};

    if (filter.status) {
        where.status = String(filter.status).trim().toUpperCase();
    }

    if (filter.phone) {
        where.phone = { contains: String(filter.phone).trim() };
    }

    if (filter.bookingCode) {
        where.bookingCode = { contains: String(filter.bookingCode).trim().toUpperCase() };
    }

    if (filter.dateFrom || filter.dateTo) {
        where.sampleDate = {};

        if (filter.dateFrom) {
            where.sampleDate.gte = parseDateOnly(filter.dateFrom);
        }

        if (filter.dateTo) {
            where.sampleDate.lte = parseDateOnly(filter.dateTo);
        }
    }

    return where;
}

function buildActorContext(context = {}) {
    return {
        changedByType: context.role || context.changedByType || "ADMIN_DEMO",
        changedById: context.userId || context.changedById || "ADMIN_DEMO"
    };
}

function assertAssignableCollector(staff) {
    if (!staff.active) {
        throw new BookingRuntimeError("Nhân viên này đang tạm khóa, không thể phân công lịch mới.", {
            code: "STAFF_INACTIVE_ASSIGNMENT_REJECTED",
            statusCode: 409,
            details: { staffId: staff.id }
        });
    }

    if (staff.role !== "SAMPLE_COLLECTOR") {
        throw new BookingRuntimeError("Chỉ nhân viên lấy mẫu mới có thể nhận lịch lấy mẫu.", {
            code: "STAFF_ROLE_ASSIGNMENT_REJECTED",
            statusCode: 409,
            details: {
                staffId: staff.id,
                role: staff.role
            }
        });
    }
}

async function createBookingWithRetry(data) {
    let lastError = null;

    for (let attempt = 0; attempt < BOOKING_CODE_MAX_RETRIES; attempt += 1) {
        try {
            return await repository.createBooking({
                ...data,
                bookingCode: generateBookingCode()
            });
        } catch (error) {
            lastError = error;

            if (error?.code !== "P2002") {
                throw error;
            }
        }
    }

    throw new BookingRuntimeError("Could not generate a unique booking code", {
        code: "BOOKING_CODE_COLLISION",
        statusCode: 500,
        details: { cause: lastError?.message || null }
    });
}

async function createConfirmedBooking(input, context = {}) {
    const testTypeText = String(input.testTypeText || input.testType || "").trim();
    let testCatalogItem = null;

    if (input.testCatalogItemId) {
        testCatalogItem = { id: input.testCatalogItemId, name: input.testName || null };
    } else if (testTypeText) {
        testCatalogItem = await repository.findTestCatalogItemByCodeOrName(testTypeText);
    }

    const normalizedInput = {
        ...input,
        phone: normalizePhone(input.phone),
        testCatalogItemId: testCatalogItem?.id || null,
        testTypeText,
        sampleDate: parseDateOnly(input.sampleDate),
        sampleTimeStart: parseTimeOnly(input.sampleTimeStart),
        sampleTimeEnd: parseTimeOnly(input.sampleTimeEnd)
    };

    validateConfirmedBookingInput(normalizedInput);

    await availabilitySlotService.assertSlotAvailable({
        sampleDate: normalizedInput.sampleDate,
        sampleTimeStart: normalizedInput.sampleTimeStart,
        area: input.area || null
    });

    const patient = await repository.upsertPatient({
        fullName: normalizedInput.patientName,
        phone: normalizedInput.phone,
        email: normalizedInput.email || null,
        dateOfBirth: normalizedInput.dateOfBirth || null,
        gender: normalizedInput.gender || null,
        defaultAddress: normalizedInput.address
    });

    const booking = await createBookingWithRetry({
        patientId: patient.id,
        testCatalogItemId: normalizedInput.testCatalogItemId,
        testTypeText: normalizedInput.testTypeText,
        sampleDate: normalizedInput.sampleDate,
        sampleTimeStart: normalizedInput.sampleTimeStart,
        sampleTimeEnd: normalizedInput.sampleTimeEnd,
        address: normalizedInput.address,
        phone: normalizedInput.phone,
        patientName: normalizedInput.patientName,
        status: "CONFIRMED",
        note: normalizedInput.note || null,
        internalNote: normalizedInput.internalNote || null,
        createdFromSessionId: context.sessionId || null,
        createdSource: context.createdSource || "CHAT"
    });

    await repository.createStatusHistory({
        bookingId: booking.id,
        fromStatus: null,
        toStatus: "CONFIRMED",
        reason: context.reason || "chat_confirmed_booking",
        changedByType: context.changedByType || "CHATBOT",
        changedById: context.sessionId || null,
        metadata: {
            sessionId: context.sessionId || null
        }
    });
    // Fire-and-forget notification for booking created
    notificationService.notifyBookingCreated(booking).catch((err) => {
        console.error("[Notification] Failed to notify booking created:", err);
    });

    if (context.sessionId) {
        await repository.clearDraftBySessionId(context.sessionId);
    }

    let assignmentResult = null;
    try {
        assignmentResult = await collectorAssignmentService.autoCreateCollectorAssignmentForBooking(
            booking,
            {
                source: "AUTO",
                actorType: context.changedByType || "CHATBOT",
                actorId: context.sessionId || null,
                allowNoCandidate: true,
                metadata: {
                    createdSource: context.createdSource || "CHAT"
                }
            }
        );
    } catch (error) {
        if (!(error instanceof BookingRuntimeError)) {
            console.error("[5H-4] Auto assignment error (non-fatal):", error);
        }
        assignmentResult = {
            assignmentCreated: false,
            reason: "AUTO_ASSIGNMENT_ERROR",
            warnings: [error.message]
        };
    }

    return normalizeBooking(booking, {
        collectorAssignment: assignmentResult
    });
}

async function getBookingByCode(bookingCode) {
    return normalizeBooking(await repository.findBookingByCode(bookingCode));
}

async function listBookings(filter = {}) {
    const bookings = await repository.listBookings({
        where: buildBookingWhere(filter),
        take: parseLimit(filter.limit)
    });

    return bookings.map((booking) => normalizeBooking(booking));
}

async function listBookingsForPhone(phone, filter = {}) {
    const normalizedPhone = normalizePhone(phone);
    const where = {
        phone: normalizedPhone
    };

    if (filter.status) {
        where.status = String(filter.status).trim().toUpperCase();
    }

    if (filter.bookingCode) {
        where.bookingCode = { contains: String(filter.bookingCode).trim().toUpperCase() };
    }

    const bookings = await repository.listBookings({
        where,
        take: parseLimit(filter.limit)
    });

    return bookings.map((booking) => normalizeBooking(booking));
}

async function findCollectorByPhone(phone) {
    return repository.findStaffByPhone(normalizePhone(phone));
}

function buildCollectorBookingWhere(staffId, filter = {}) {
    const where = {
        assignedStaffId: staffId
    };

    if (filter.status) {
        where.status = String(filter.status).trim().toUpperCase();
    }

    if (filter.bookingCode) {
        where.bookingCode = { contains: String(filter.bookingCode).trim().toUpperCase() };
    }

    if (filter.dateFrom || filter.dateTo) {
        where.sampleDate = {};

        if (filter.dateFrom) {
            where.sampleDate.gte = parseDateOnly(filter.dateFrom);
        }

        if (filter.dateTo) {
            where.sampleDate.lte = parseDateOnly(filter.dateTo);
        }
    }

    return where;
}

async function listBookingsForCollectorPhone(phone, filter = {}) {
    const staff = await findCollectorByPhone(phone);

    if (!staff) {
        return [];
    }

    const bookings = await repository.listCollectorBookings({
        where: buildCollectorBookingWhere(staff.id, filter),
        take: parseLimit(filter.limit)
    });

    return bookings.map((booking) => normalizeBooking(booking));
}

async function getBookingDetailByCode(bookingCode) {
    return normalizeBooking(await repository.findBookingDetailByCode(bookingCode));
}

async function getBookingDetailByCodeForPhone(bookingCode, phone) {
    const normalizedPhone = normalizePhone(phone);
    const booking = await repository.findBookingDetailByCode(bookingCode);

    if (!booking || booking.phone !== normalizedPhone) {
        return null;
    }

    return normalizeBooking(booking);
}

async function getBookingDetailByCodeForCollectorPhone(bookingCode, phone) {
    const staff = await findCollectorByPhone(phone);

    if (!staff) {
        return null;
    }

    const booking = await repository.findBookingDetailByCode(bookingCode);

    if (!booking || booking.assignedStaffId !== staff.id) {
        return null;
    }

    return normalizeBooking(booking);
}

async function updateBookingStatus(bookingCode, status, context = {}) {
    const nextStatus = String(status || "").trim().toUpperCase();
    const existingBooking = await repository.findBookingByCode(bookingCode);

    if (!existingBooking) {
        throw new BookingRuntimeError("Booking not found", {
            code: "BOOKING_NOT_FOUND",
            statusCode: 404
        });
    }

    assertBookingStatusTransition(existingBooking.status, nextStatus, {
        ...context,
        source: "admin_booking_api"
    });

    const data = { status: nextStatus };

    if (nextStatus === "CANCELLED" && !existingBooking.cancelledAt) {
        data.cancelledAt = new Date();
    }

    if (nextStatus === "COMPLETED" && !existingBooking.completedAt) {
        data.completedAt = new Date();
    }

    const updatedBooking = await repository.updateBookingByCode(bookingCode, data);

    if (existingBooking.status !== nextStatus) {
        const actor = buildActorContext(context);

        await repository.createStatusHistory({
            bookingId: existingBooking.id,
            fromStatus: existingBooking.status,
            toStatus: nextStatus,
            reason: context.reason || "admin_status_update",
            changedByType: actor.changedByType,
            changedById: actor.changedById,
            metadata: {
                source: "admin_booking_api"
            }
        });
    }

    return normalizeBooking(updatedBooking);
}

async function findOrCreateStaff(staffInput = {}) {
    if (staffInput.staffId) {
        const staff = await repository.findStaffById(staffInput.staffId);

        if (!staff) {
            throw new BookingRuntimeError("Staff not found", {
                code: "STAFF_NOT_FOUND",
                statusCode: 404,
                details: { staffId: staffInput.staffId }
            });
        }

        assertAssignableCollector(staff);

        return staff;
    }

    const fullName = String(staffInput.staffName || "").trim();
    const phone = staffInput.staffPhone
        ? normalizePhone(staffInput.staffPhone)
        : null;

    if (!fullName) {
        throw new BookingRuntimeError("staffId or staffName is required", {
            code: "STAFF_VALIDATION_ERROR",
            statusCode: 400
        });
    }

    const existingStaff = phone
        ? await repository.findStaffByPhone(phone)
        : await repository.findStaffByPhoneOrName({
            phone,
            fullName
        });

    if (existingStaff) {
        assertAssignableCollector(existingStaff);
        return existingStaff;
    }

    const staff = await repository.createStaffProfile({
        fullName,
        phone,
        role: "SAMPLE_COLLECTOR",
        active: true
    });

    assertAssignableCollector(staff);

    return staff;
}

async function assignStaffToBooking(bookingCode, staffInput = {}, context = {}) {
    const existingBooking = await repository.findBookingByCode(bookingCode);

    if (!existingBooking) {
        throw new BookingRuntimeError("Booking not found", {
            code: "BOOKING_NOT_FOUND",
            statusCode: 404
        });
    }

    if (["COMPLETED", "CANCELLED", "NO_SHOW"].includes(existingBooking.status)) {
        throw new BookingRuntimeError("Không thể phân công nhân viên cho lịch hẹn đã kết thúc hoặc đã hủy.", {
            code: "BOOKING_STATUS_TRANSITION_REJECTED",
            statusCode: 409,
            details: { status: existingBooking.status }
        });
    }

    if (getAllowedNextStatuses(existingBooking.status).length === 0) {
        throw new BookingRuntimeError("Trạng thái hiện tại không cho phép phân công nhân viên.", {
            code: "BOOKING_STATUS_TRANSITION_REJECTED",
            statusCode: 409,
            details: { status: existingBooking.status }
        });
    }

    const staff = await findOrCreateStaff(staffInput);
    const workload = await buildWorkload(staff.id);
    const shouldSetAssignedStatus = ["CONFIRMED", "RESCHEDULED"].includes(
        existingBooking.status
    );
    const nextStatus = shouldSetAssignedStatus ? "ASSIGNED" : existingBooking.status;

    if (existingBooking.status !== nextStatus) {
        assertBookingStatusTransition(existingBooking.status, nextStatus, {
            ...context,
            source: "admin_booking_api"
        });
    }

    const updatedBooking = await repository.updateBookingByCode(bookingCode, {
        assignedStaffId: staff.id,
        status: nextStatus
    });

    if (existingBooking.status !== nextStatus) {
        const actor = buildActorContext(context);

        await repository.createStatusHistory({
            bookingId: existingBooking.id,
            fromStatus: existingBooking.status,
            toStatus: nextStatus,
            reason: context.reason || "admin_assign_staff",
            changedByType: actor.changedByType,
            changedById: actor.changedById,
            metadata: {
                staffId: staff.id,
                source: "admin_booking_api"
            }
        });
    }

    return normalizeBooking(updatedBooking, {
        assignmentWarning: workload.warning,
        assignedStaffWorkload: workload
    });
}

async function updateInternalNote(bookingCode, internalNote, context = {}) {
    const existingBooking = await repository.findBookingByCode(bookingCode);

    if (!existingBooking) {
        throw new BookingRuntimeError("Booking not found", {
            code: "BOOKING_NOT_FOUND",
            statusCode: 404
        });
    }

    const updatedBooking = await repository.updateBookingByCode(bookingCode, {
        internalNote: internalNote === undefined || internalNote === null
            ? null
            : String(internalNote)
    });

    return normalizeBooking(updatedBooking, {
        noteUpdatedBy: context.userId || context.changedById || "ADMIN_DEMO"
    });
}

async function rescheduleBooking(bookingCode, input, context = {}) {
    const existingBooking = await repository.findBookingByCode(bookingCode);
    if (!existingBooking) {
        throw new BookingRuntimeError("Booking not found", {
            code: "BOOKING_NOT_FOUND",
            statusCode: 404
        });
    }
    assertBookingStatusTransition(existingBooking.status, "RESCHEDULED", {
        ...context,
        source: "chat_reschedule"
    });

    const data = {
        status: "RESCHEDULED"
    };

    if (input.sampleDate) {
        data.sampleDate = parseDateOnly(input.sampleDate);
    }

    if (input.sampleTimeStart) {
        data.sampleTimeStart = parseTimeOnly(input.sampleTimeStart);
    }

    if (input.sampleTimeEnd) {
        data.sampleTimeEnd = parseTimeOnly(input.sampleTimeEnd);
    }

    if (input.address) {
        data.address = input.address;
    }

    if (data.sampleDate) {
        const validationSampleDate = data.sampleDate;
        validateConfirmedBookingInput({
            patientName: existingBooking.patientName || existingBooking.patient?.fullName,
            phone: existingBooking.phone,
            testCatalogItemId: existingBooking.testCatalogItemId,
            testTypeText: existingBooking.testTypeText,
            sampleDate: validationSampleDate,
            sampleTimeStart: data.sampleTimeStart || existingBooking.sampleTimeStart,
            address: data.address || existingBooking.address
        });
    }

    const scheduleChanged = Boolean(input.sampleDate || input.sampleTimeStart);

    if (scheduleChanged) {
        await availabilitySlotService.assertSlotAvailable({
            sampleDate: data.sampleDate || existingBooking.sampleDate,
            sampleTimeStart: data.sampleTimeStart || existingBooking.sampleTimeStart,
            area: input.area || null,
            excludeBookingCode: bookingCode
        });
    }

    const updatedBooking = await repository.updateBookingByCode(bookingCode, data);

    await repository.createStatusHistory({
        bookingId: existingBooking.id,
        fromStatus: existingBooking.status,
        toStatus: "RESCHEDULED",
        reason: context.reason || "chat_reschedule_booking",
        changedByType: context.changedByType || "CHATBOT",
        changedById: context.sessionId || null,
        metadata: {
            sessionId: context.sessionId || null
        }
    });

    return normalizeBooking(updatedBooking, {
        previousStatus: existingBooking.status,
        previousSampleDate: formatDateOnly(existingBooking.sampleDate),
        previousSampleTimeStart: formatTimeOnly(existingBooking.sampleTimeStart)
    });
}

async function rescheduleBookingForPhone(bookingCode, phone, input = {}, context = {}) {
    const normalizedPhone = normalizePhone(phone);
    const existingBooking = await repository.findBookingByCode(bookingCode);

    if (!existingBooking || existingBooking.phone !== normalizedPhone) {
        throw new BookingRuntimeError("Booking not found", {
            code: "BOOKING_NOT_FOUND",
            statusCode: 404
        });
    }

    return rescheduleBooking(bookingCode, input, {
        ...context,
        source: "user_booking_chat"
    });
}

async function cancelBooking(bookingCode, input = {}, context = {}) {
    const existingBooking = await repository.findBookingByCode(bookingCode);
    if (!existingBooking) {
        throw new BookingRuntimeError("Booking not found", {
            code: "BOOKING_NOT_FOUND",
            statusCode: 404
        });
    }

    if (existingBooking.status === "CANCELLED") {
        return normalizeBooking(existingBooking, { alreadyCancelled: true });
    }

    assertBookingStatusTransition(existingBooking.status, "CANCELLED", {
        ...context,
        source: context.source || "booking_cancel"
    });

    const updatedBooking = await repository.updateBookingByCode(bookingCode, {
        status: "CANCELLED",
        cancelledAt: new Date()
    });

    await repository.createStatusHistory({
        bookingId: existingBooking.id,
        fromStatus: existingBooking.status,
        toStatus: "CANCELLED",
        reason: input.reason || context.reason || "chat_cancel_booking",
        changedByType: context.changedByType || "CHATBOT",
        changedById: context.sessionId || null,
        metadata: {
            sessionId: context.sessionId || null
        }
    });

    return normalizeBooking(updatedBooking);
}

async function cancelBookingForPhone(bookingCode, phone, input = {}, context = {}) {
    const normalizedPhone = normalizePhone(phone);
    const existingBooking = await repository.findBookingByCode(bookingCode);

    if (!existingBooking || existingBooking.phone !== normalizedPhone) {
        throw new BookingRuntimeError("Booking not found", {
            code: "BOOKING_NOT_FOUND",
            statusCode: 404
        });
    }

    return cancelBooking(bookingCode, input, {
        ...context,
        source: "user_booking_api"
    });
}

function appendCollectorNote(existingNote, note) {
    const trimmedNote = String(note || "").trim();

    if (!trimmedNote) {
        return existingNote || null;
    }

    const timestamp = new Date().toISOString();
    const line = `[collector ${timestamp}] ${trimmedNote}`;

    return existingNote ? `${existingNote}\n${line}` : line;
}

async function markSampleCollectedForCollectorPhone(
    bookingCode,
    phone,
    input = {},
    context = {}
) {
    const staff = await findCollectorByPhone(phone);

    if (!staff) {
        throw new BookingRuntimeError("Collector not found", {
            code: "COLLECTOR_NOT_FOUND",
            statusCode: 404
        });
    }

    const existingBooking = await repository.findBookingByCode(bookingCode);

    if (!existingBooking || existingBooking.assignedStaffId !== staff.id) {
        throw new BookingRuntimeError("Booking not found", {
            code: "BOOKING_NOT_FOUND",
            statusCode: 404
        });
    }

    assertBookingStatusTransition(existingBooking.status, "SAMPLE_COLLECTED", {
        ...context,
        source: "collector_booking_api"
    });

    await repository.updateBookingByCode(bookingCode, {
        status: "SAMPLE_COLLECTED",
        internalNote: appendCollectorNote(existingBooking.internalNote, input.note)
    });

    await repository.createStatusHistory({
        bookingId: existingBooking.id,
        fromStatus: existingBooking.status,
        toStatus: "SAMPLE_COLLECTED",
        reason: "collector_sample_collected",
        changedByType: context.role || context.changedByType || "COLLECTOR_DEMO",
        changedById: context.userId || context.changedById || staff.id,
        metadata: {
            source: "collector_booking_api",
            collectorStaffId: staff.id,
            note: String(input.note || "").trim() || null
        }
    });

    return normalizeBooking(await repository.findBookingDetailByCode(bookingCode));
}

async function saveOrUpdateDraft(sessionId, slots, missingFields) {
    const status = missingFields.length === 0 ? "PENDING_CONFIRMATION" : "DRAFT";
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    return repository.upsertDraftBySessionId(sessionId, {
        slotsJson: slots,
        missingFields,
        status,
        expiresAt
    });
}

async function getDraft(sessionId) {
    return repository.findDraftBySessionId(sessionId);
}

async function clearDraft(sessionId) {
    return repository.clearDraftBySessionId(sessionId);
}

module.exports = {
    createConfirmedBooking,
    getBookingByCode,
    getBookingDetailByCode,
    getBookingDetailByCodeForPhone,
    getBookingDetailByCodeForCollectorPhone,
    listBookings,
    listBookingsForPhone,
    listBookingsForCollectorPhone,
    updateBookingStatus,
    assignStaffToBooking,
    updateInternalNote,
    rescheduleBooking,
    rescheduleBookingForPhone,
    cancelBooking,
    cancelBookingForPhone,
    markSampleCollectedForCollectorPhone,
    saveOrUpdateDraft,
    getDraft,
    clearDraft,
    normalizeBooking
};
