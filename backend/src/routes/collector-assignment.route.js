const express = require("express");
const router = express.Router();

const collectorAssignmentController = require("../controllers/collector-assignment.controller");

router.get("/", collectorAssignmentController.listAssignments);
router.post("/:assignmentId/accept", collectorAssignmentController.acceptAssignment);
router.post("/:assignmentId/reject", collectorAssignmentController.rejectAssignment);

module.exports = router;
