const express = require("express");
const router = express.Router();

const adminBookingController = require("../controllers/admin-booking.controller");
const adminCollectorAssignmentController = require("../controllers/admin-collector-assignment.controller");

router.get("/", adminBookingController.listBookings);
router.get("/:bookingCode", adminBookingController.getBookingDetail);
router.get("/:bookingCode/collector-candidates", adminBookingController.getCollectorCandidates);
router.post(
    "/:bookingCode/collector-assignments/manual",
    adminCollectorAssignmentController.manualReassign
);
router.patch("/:bookingCode/status", adminBookingController.updateBookingStatus);
router.patch("/:bookingCode/assign", adminBookingController.assignStaff);
router.patch(
    "/:bookingCode/internal-note",
    adminBookingController.updateInternalNote
);

module.exports = router;
