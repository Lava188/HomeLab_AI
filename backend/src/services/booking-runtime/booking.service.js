const repository = require("./booking.repository");
const BookingRuntimeError = require("./booking-runtime-error");
const { generateBookingCode } = require("./booking-code.service");
const {
    normalizePhone,
    validateConfirmedBookingInput,
    assertCanReschedule,
    assertCanCancel
} = require("./booking-validation.service");

const BOOKING_CODE_MAX_RETRIES = 5;
const ADMIN_ALLOWED_STATUSES = new Set([
    "CONFIRMED",
    "ASSIGNED",
    "SAMPLE_COLLECTED",
    "IN_LAB_PROCESSING",
    "RESULT_READY",
    "COMPLETED",
    "CANCELLED",
    "NO_SHOW"
]);

const LOCKED_STATUSES = new Set(["COMPLETED", "CANCELLED", "NO_SHOW"]);

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

function validateAdminStatusTransition(currentStatus, nextStatus) {
    if (!ADMIN_ALLOWED_STATUSES.has(nextStatus)) {
        throw new BookingRuntimeError("Invalid booking status", {
            code: "BOOKING_INVALID_STATUS",
            statusCode: 400,
            details: { status: nextStatus }
        });
    }

    if (currentStatus === nextStatus) {
        return;
    }

    if (LOCKED_STATUSES.has(currentStatus)) {
        throw new BookingRuntimeError("Booking status transition is not allowed", {
            code: "BOOKING_STATUS_TRANSITION_REJECTED",
            statusCode: 409,
            details: { fromStatus: currentStatus, toStatus: nextStatus }
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

    if (context.sessionId) {
        await repository.clearDraftBySessionId(context.sessionId);
    }

    return normalizeBooking(booking);
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

async function getBookingDetailByCode(bookingCode) {
    return normalizeBooking(await repository.findBookingDetailByCode(bookingCode));
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

    validateAdminStatusTransition(existingBooking.status, nextStatus);

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

    const existingStaff = await repository.findStaffByPhoneOrName({
        phone,
        fullName
    });

    if (existingStaff) {
        const patch = {};

        if (phone && existingStaff.phone !== phone) {
            patch.phone = phone;
        }

        if (staffInput.role && existingStaff.role !== staffInput.role) {
            patch.role = staffInput.role;
        }

        if (Object.keys(patch).length > 0) {
            return repository.updateStaffProfile(existingStaff.id, patch);
        }

        return existingStaff;
    }

    return repository.createStaffProfile({
        fullName,
        phone,
        role: staffInput.role || "SAMPLE_COLLECTOR",
        active: true
    });
}

async function assignStaffToBooking(bookingCode, staffInput = {}, context = {}) {
    const existingBooking = await repository.findBookingByCode(bookingCode);

    if (!existingBooking) {
        throw new BookingRuntimeError("Booking not found", {
            code: "BOOKING_NOT_FOUND",
            statusCode: 404
        });
    }

    if (LOCKED_STATUSES.has(existingBooking.status)) {
        throw new BookingRuntimeError("Booking cannot be assigned", {
            code: "BOOKING_STATUS_TRANSITION_REJECTED",
            statusCode: 409,
            details: { status: existingBooking.status }
        });
    }

    const staff = await findOrCreateStaff(staffInput);
    const shouldSetAssignedStatus = ["CONFIRMED", "RESCHEDULED"].includes(
        existingBooking.status
    );
    const nextStatus = shouldSetAssignedStatus ? "ASSIGNED" : existingBooking.status;

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

    return normalizeBooking(updatedBooking);
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
    assertCanReschedule(existingBooking);

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

async function cancelBooking(bookingCode, input = {}, context = {}) {
    const existingBooking = await repository.findBookingByCode(bookingCode);
    assertCanCancel(existingBooking);

    if (existingBooking.status === "CANCELLED") {
        return normalizeBooking(existingBooking, { alreadyCancelled: true });
    }

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
    listBookings,
    updateBookingStatus,
    assignStaffToBooking,
    updateInternalNote,
    rescheduleBooking,
    cancelBooking,
    saveOrUpdateDraft,
    getDraft,
    clearDraft,
    normalizeBooking
};
