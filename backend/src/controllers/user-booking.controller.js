const bookingRuntime = require("../services/booking-runtime/booking.service");
const BookingRuntimeError = require("../services/booking-runtime/booking-runtime-error");
const { normalizePhone } = require("../services/booking-runtime/booking-validation.service");

function getDemoPhone(req) {
    return normalizePhone(req.query?.phone || req.get("x-demo-phone") || "");
}

function getDemoContext(req) {
    return {
        changedByType: req.get("x-demo-role") || "USER_DEMO",
        sessionId: req.get("x-demo-user-id") || "USER_DEMO"
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

function sendMissingPhone(res) {
    return res.status(400).json({
        success: false,
        message: "phone is required for user booking lookup",
        code: "USER_BOOKING_PHONE_REQUIRED",
        details: { field: "phone" }
    });
}

function toPublicBooking(booking) {
    if (!booking) return null;

    const {
        internalNote,
        createdSource,
        createdFromSessionId,
        statusHistory,
        ...publicBooking
    } = booking;

    return {
        ...publicBooking,
        statusHistory: Array.isArray(statusHistory)
            ? statusHistory.map((item) => ({
                id: item.id,
                fromStatus: item.fromStatus || null,
                toStatus: item.toStatus,
                createdAt: item.createdAt
            }))
            : undefined
    };
}

async function listBookings(req, res, next) {
    try {
        const phone = getDemoPhone(req);

        if (!phone) {
            return sendMissingPhone(res);
        }

        const bookings = await bookingRuntime.listBookingsForPhone(phone, req.query || {});

        return res.status(200).json({
            success: true,
            data: {
                bookings: bookings.map(toPublicBooking),
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
        const phone = getDemoPhone(req);

        if (!phone) {
            return sendMissingPhone(res);
        }

        const booking = await bookingRuntime.getBookingDetailByCodeForPhone(
            req.params.bookingCode,
            phone
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
            data: toPublicBooking(booking)
        });
    } catch (error) {
        if (error instanceof BookingRuntimeError) {
            return sendRuntimeError(res, error);
        }

        next(error);
    }
}

async function cancelBooking(req, res, next) {
    try {
        const phone = getDemoPhone(req);

        if (!phone) {
            return sendMissingPhone(res);
        }

        const booking = await bookingRuntime.cancelBookingForPhone(
            req.params.bookingCode,
            phone,
            {
                reason: req.body?.reason || "user_dashboard_cancel"
            },
            getDemoContext(req)
        );

        return res.status(200).json({
            success: true,
            data: toPublicBooking(booking)
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
    cancelBooking
};
