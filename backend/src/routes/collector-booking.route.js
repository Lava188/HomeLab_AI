const express = require("express");
const router = express.Router();

const collectorBookingController = require("../controllers/collector-booking.controller");

router.get("/", collectorBookingController.listBookings);
router.get("/:bookingCode", collectorBookingController.getBookingDetail);
router.patch(
    "/:bookingCode/sample-collected",
    collectorBookingController.markSampleCollected
);

module.exports = router;
