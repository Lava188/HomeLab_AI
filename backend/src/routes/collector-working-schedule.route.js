const express = require("express");
const router = express.Router();

const collectorWorkingProfileController = require("../controllers/collector-working-profile.controller");

router.get("/", collectorWorkingProfileController.listWorkingSchedules);
router.post("/", collectorWorkingProfileController.createWorkingSchedule);
router.patch("/:id", collectorWorkingProfileController.updateWorkingSchedule);
router.delete("/:id", collectorWorkingProfileController.deactivateWorkingSchedule);

module.exports = router;
