const express = require("express");
const router = express.Router();

const adminAvailabilitySlotController = require("../controllers/admin-availability-slot.controller");

router.get("/", adminAvailabilitySlotController.listAvailabilitySlots);
router.get("/stats", adminAvailabilitySlotController.getSlotStats);
router.post("/", adminAvailabilitySlotController.createAvailabilitySlot);
router.post("/sync", adminAvailabilitySlotController.syncAvailabilitySlots);
router.post("/disable-past", adminAvailabilitySlotController.disablePastSlots);
router.patch("/:id", adminAvailabilitySlotController.updateAvailabilitySlot);

module.exports = router;
