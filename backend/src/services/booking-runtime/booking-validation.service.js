const BookingRuntimeError = require("./booking-runtime-error");

const TERMINAL_STATUSES = new Set(["CANCELLED", "COMPLETED"]);
const NON_RESCHEDULABLE_STATUSES = new Set(["CANCELLED", "COMPLETED", "NO_SHOW"]);

function normalizePhone(phone) {
    return String(phone || "").replace(/[\s.\-()]/g, "");
}

function validatePhone(phone) {
    const normalized = normalizePhone(phone);

    return /^(0\d{9,10}|\+84\d{9,10}|84\d{9,10})$/.test(normalized);
}

function validateRequired(value, field) {
    if (value === null || value === undefined || String(value).trim() === "") {
        throw new BookingRuntimeError(`${field} is required`, {
            code: "BOOKING_VALIDATION_ERROR",
            statusCode: 400,
            details: { field }
        });
    }
}

function validateNotPastDate(sampleDate) {
    const date = new Date(sampleDate);

    if (Number.isNaN(date.getTime())) {
        throw new BookingRuntimeError("sampleDate is invalid", {
            code: "BOOKING_VALIDATION_ERROR",
            details: { field: "sampleDate" }
        });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);

    if (date < today) {
        throw new BookingRuntimeError("sampleDate cannot be in the past", {
            code: "BOOKING_VALIDATION_ERROR",
            details: { field: "sampleDate" }
        });
    }
}

function validateConfirmedBookingInput(input) {
    validateRequired(input.patientName, "patientName");
    validateRequired(input.phone, "phone");

    if (!validatePhone(input.phone)) {
        throw new BookingRuntimeError("phone is invalid", {
            code: "BOOKING_VALIDATION_ERROR",
            details: { field: "phone" }
        });
    }

    if (!input.testCatalogItemId && !input.testTypeText) {
        throw new BookingRuntimeError("testCatalogItemId or testTypeText is required", {
            code: "BOOKING_VALIDATION_ERROR",
            details: { field: "testType" }
        });
    }

    validateRequired(input.sampleDate, "sampleDate");
    validateNotPastDate(input.sampleDate);
    validateRequired(input.sampleTimeStart, "sampleTimeStart");
    validateRequired(input.address, "address");
}

function assertCanReschedule(booking) {
    if (!booking) {
        throw new BookingRuntimeError("Booking not found", {
            code: "BOOKING_NOT_FOUND",
            statusCode: 404
        });
    }

    if (NON_RESCHEDULABLE_STATUSES.has(booking.status)) {
        throw new BookingRuntimeError("Booking cannot be rescheduled", {
            code: "BOOKING_STATUS_TRANSITION_REJECTED",
            details: { status: booking.status }
        });
    }
}

function assertCanCancel(booking) {
    if (!booking) {
        throw new BookingRuntimeError("Booking not found", {
            code: "BOOKING_NOT_FOUND",
            statusCode: 404
        });
    }

    if (booking.status === "COMPLETED") {
        throw new BookingRuntimeError("Completed booking cannot be cancelled", {
            code: "BOOKING_STATUS_TRANSITION_REJECTED",
            details: { status: booking.status }
        });
    }
}

function isTerminalStatus(status) {
    return TERMINAL_STATUSES.has(status);
}

module.exports = {
    normalizePhone,
    validateConfirmedBookingInput,
    assertCanReschedule,
    assertCanCancel,
    isTerminalStatus
};
