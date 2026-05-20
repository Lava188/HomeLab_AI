const bookingRuntime = require("../services/booking-runtime/booking.service");
const BookingRuntimeError = require("../services/booking-runtime/booking-runtime-error");
const { normalizePhone } = require("../services/booking-runtime/booking-validation.service");

function getCollectorPhone(req) {
    return normalizePhone(req.query?.phone || req.get("x-demo-phone") || "");
}

function getDemoContext(req) {
    return {
        role: req.get("x-demo-role") || "COLLECTOR_DEMO",
        userId: req.get("x-demo-user-id") || "COLLECTOR_DEMO"
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
        message: "collector phone is required for collector booking lookup",
        code: "COLLECTOR_PHONE_REQUIRED",
        details: { field: "phone" }
    });
}

function toCollectorBooking(booking) {
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
                reason: item.reason || null,
                createdAt: item.createdAt
            }))
            : undefined
    };
}

async function listBookings(req, res, next) {
    try {
        const phone = getCollectorPhone(req);

        if (!phone) {
            return sendMissingPhone(res);
        }

        const bookings = await bookingRuntime.listBookingsForCollectorPhone(
            phone,
            req.query || {}
        );

        return res.status(200).json({
            success: true,
            data: {
                bookings: bookings.map(toCollectorBooking),
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
        const phone = getCollectorPhone(req);

        if (!phone) {
            return sendMissingPhone(res);
        }

        const booking = await bookingRuntime.getBookingDetailByCodeForCollectorPhone(
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
            data: toCollectorBooking(booking)
        });
    } catch (error) {
        if (error instanceof BookingRuntimeError) {
            return sendRuntimeError(res, error);
        }

        next(error);
    }
}

async function markSampleCollected(req, res, next) {
    try {
        const phone = getCollectorPhone(req);

        if (!phone) {
            return sendMissingPhone(res);
        }

        const booking = await bookingRuntime.markSampleCollectedForCollectorPhone(
            req.params.bookingCode,
            phone,
            {
                note: req.body?.note
            },
            getDemoContext(req)
        );

        return res.status(200).json({
            success: true,
            data: toCollectorBooking(booking)
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
    markSampleCollected
};
