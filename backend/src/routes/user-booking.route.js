const express = require("express");
const router = express.Router();

const userBookingController = require("../controllers/user-booking.controller");

router.get("/", userBookingController.listBookings);
router.get("/:bookingCode", userBookingController.getBookingDetail);
router.patch("/:bookingCode/cancel", userBookingController.cancelBooking);

module.exports = router;
