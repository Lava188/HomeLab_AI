const express = require("express");
const router = express.Router();

const debugController = require("../controllers/debug.controller");

router.get("/sessions", debugController.getAllSessions);
router.get("/sessions/:sessionId", debugController.getSessionById);

router.get("/bookings", debugController.getAllBookings);
router.get("/bookings/:bookingId", debugController.getBookingById);

module.exports = router;