const express = require("express");
const router = express.Router();

const adminAvailabilitySlotController = require("../controllers/admin-availability-slot.controller");

router.get("/", adminAvailabilitySlotController.listAvailabilitySlots);
router.post("/", adminAvailabilitySlotController.createAvailabilitySlot);
router.patch("/:id", adminAvailabilitySlotController.updateAvailabilitySlot);

module.exports = router;
