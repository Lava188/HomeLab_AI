const express = require("express");
const router = express.Router();

const collectorWorkingProfileController = require("../controllers/collector-working-profile.controller");

router.get("/", collectorWorkingProfileController.listWorkingAreas);
router.post("/", collectorWorkingProfileController.createWorkingArea);
router.patch("/:id", collectorWorkingProfileController.updateWorkingArea);
router.delete("/:id", collectorWorkingProfileController.deactivateWorkingArea);

module.exports = router;
