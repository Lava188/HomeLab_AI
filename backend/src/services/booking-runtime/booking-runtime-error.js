class BookingRuntimeError extends Error {
    constructor(message, { code, statusCode = 400, details = null } = {}) {
        super(message);
        this.name = "BookingRuntimeError";
        this.code = code || "BOOKING_RUNTIME_ERROR";
        this.statusCode = statusCode;
        this.details = details;
    }
}

module.exports = BookingRuntimeError;
