const debugService = require("../services/debug.service");

async function getAllSessions(req, res, next) {
    try {
        const sessions = await debugService.getAllSessions();

        return res.status(200).json({
            success: true,
            data: sessions
        });
    } catch (error) {
        next(error);
    }
}

async function getSessionById(req, res, next) {
    try {
        const { sessionId } = req.params;
        const session = await debugService.getSessionById(sessionId);

        if (!session) {
            return res.status(404).json({
                success: false,
                message: `Session '${sessionId}' not found`
            });
        }

        return res.status(200).json({
            success: true,
            data: session
        });
    } catch (error) {
        next(error);
    }
}

async function getAllBookings(req, res, next) {
    try {
        const bookings = await debugService.getAllBookings();

        return res.status(200).json({
            success: true,
            data: bookings
        });
    } catch (error) {
        next(error);
    }
}

async function getBookingById(req, res, next) {
    try {
        const { bookingId } = req.params;
        const booking = await debugService.getBookingById(bookingId);

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: `Booking '${bookingId}' not found`
            });
        }

        return res.status(200).json({
            success: true,
            data: booking
        });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    getAllSessions,
    getSessionById,
    getAllBookings,
    getBookingById
};