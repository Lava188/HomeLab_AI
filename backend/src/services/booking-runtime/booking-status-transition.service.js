const BookingRuntimeError = require("./booking-runtime-error");

const BOOKING_STATUS_TRANSITIONS = {
    CONFIRMED: ["ASSIGNED", "RESCHEDULED", "CANCELLED", "NO_SHOW"],
    RESCHEDULED: ["ASSIGNED", "CANCELLED", "NO_SHOW"],
    ASSIGNED: ["SAMPLE_COLLECTED", "RESCHEDULED", "CANCELLED", "NO_SHOW"],
    SAMPLE_COLLECTED: ["IN_LAB_PROCESSING"],
    IN_LAB_PROCESSING: ["RESULT_READY"],
    RESULT_READY: ["COMPLETED"],
    COMPLETED: [],
    CANCELLED: [],
    NO_SHOW: []
};

function normalizeStatus(status) {
    return String(status || "").trim().toUpperCase();
}

function getAllowedNextStatuses(status, context = {}) {
    const normalizedStatus = normalizeStatus(status);

    return [...(BOOKING_STATUS_TRANSITIONS[normalizedStatus] || [])];
}

function canTransitionBookingStatus(fromStatus, toStatus, context = {}) {
    const from = normalizeStatus(fromStatus);
    const to = normalizeStatus(toStatus);

    if (!from || !to) return false;
    if (from === to) return true;

    return getAllowedNextStatuses(from, context).includes(to);
}

function assertBookingStatusTransition(fromStatus, toStatus, context = {}) {
    const from = normalizeStatus(fromStatus);
    const to = normalizeStatus(toStatus);

    if (!BOOKING_STATUS_TRANSITIONS[from]) {
        throw new BookingRuntimeError("Invalid current booking status", {
            code: "BOOKING_INVALID_STATUS",
            statusCode: 400,
            details: { fromStatus }
        });
    }

    if (!BOOKING_STATUS_TRANSITIONS[to]) {
        throw new BookingRuntimeError("Invalid target booking status", {
            code: "BOOKING_INVALID_STATUS",
            statusCode: 400,
            details: { toStatus }
        });
    }

    if (!canTransitionBookingStatus(from, to, context)) {
        throw new BookingRuntimeError(
            `Không thể chuyển trạng thái từ ${from} sang ${to}`,
            {
                code: "BOOKING_STATUS_TRANSITION_REJECTED",
                statusCode: 409,
                details: {
                    fromStatus: from,
                    toStatus: to,
                    allowedNextStatuses: getAllowedNextStatuses(from, context)
                }
            }
        );
    }
}

module.exports = {
    canTransitionBookingStatus,
    assertBookingStatusTransition,
    getAllowedNextStatuses
};
