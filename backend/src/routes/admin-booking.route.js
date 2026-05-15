const express = require("express");
const router = express.Router();

const adminBookingController = require("../controllers/admin-booking.controller");

router.get("/", adminBookingController.listBookings);
router.get("/:bookingCode", adminBookingController.getBookingDetail);
router.patch("/:bookingCode/status", adminBookingController.updateBookingStatus);
router.patch("/:bookingCode/assign", adminBookingController.assignStaff);
router.patch(
    "/:bookingCode/internal-note",
    adminBookingController.updateInternalNote
);

module.exports = router;
