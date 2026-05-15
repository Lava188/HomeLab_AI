const bookingRuntime = require("../services/booking-runtime/booking.service");
const BookingRuntimeError = require("../services/booking-runtime/booking-runtime-error");

function getDemoContext(req) {
    return {
        role: req.get("x-demo-role") || "ADMIN_DEMO",
        userId: req.get("x-demo-user-id") || "ADMIN_DEMO"
    };
}

function sendRuntimeError(res, error) {
    return res.status(error.statusCode || 400).json({
        success: false,
        message: error.message,
        code: error.code,
        details: error.details || null
    });
}

async function listBookings(req, res, next) {
    try {
        const bookings = await bookingRuntime.listBookings(req.query || {});

        return res.status(200).json({
            success: true,
            data: {
                bookings,
                total: bookings.length
            }
        });
    } catch (error) {
        if (error instanceof BookingRuntimeError) {
            return sendRuntimeError(res, error);
        }

        next(error);
    }
}

async function getBookingDetail(req, res, next) {
    try {
        const booking = await bookingRuntime.getBookingDetailByCode(
            req.params.bookingCode
        );

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: `Booking '${req.params.bookingCode}' not found`,
                code: "BOOKING_NOT_FOUND"
            });
        }

        return res.status(200).json({
            success: true,
            data: booking
        });
    } catch (error) {
        if (error instanceof BookingRuntimeError) {
            return sendRuntimeError(res, error);
        }

        next(error);
    }
}

async function updateBookingStatus(req, res, next) {
    try {
        const booking = await bookingRuntime.updateBookingStatus(
            req.params.bookingCode,
            req.body?.status,
            {
                ...getDemoContext(req),
                reason: req.body?.reason
            }
        );

        return res.status(200).json({
            success: true,
            data: booking
        });
    } catch (error) {
        if (error instanceof BookingRuntimeError) {
            return sendRuntimeError(res, error);
        }

        next(error);
    }
}

async function assignStaff(req, res, next) {
    try {
        const booking = await bookingRuntime.assignStaffToBooking(
            req.params.bookingCode,
            req.body || {},
            getDemoContext(req)
        );

        return res.status(200).json({
            success: true,
            data: booking
        });
    } catch (error) {
        if (error instanceof BookingRuntimeError) {
            return sendRuntimeError(res, error);
        }

        next(error);
    }
}

async function updateInternalNote(req, res, next) {
    try {
        const booking = await bookingRuntime.updateInternalNote(
            req.params.bookingCode,
            req.body?.internalNote,
            getDemoContext(req)
        );

        return res.status(200).json({
            success: true,
            data: booking
        });
    } catch (error) {
        if (error instanceof BookingRuntimeError) {
            return sendRuntimeError(res, error);
        }

        next(error);
    }
}

module.exports = {
    listBookings,
    getBookingDetail,
    updateBookingStatus,
    assignStaff,
    updateInternalNote
};
