const express = require("express");
const router = express.Router();

const adminCollectorAssignmentController = require("../controllers/admin-collector-assignment.controller");

router.get("/rejections", adminCollectorAssignmentController.listPendingRejections);
router.post("/:assignmentId/approve-rejection", adminCollectorAssignmentController.approveRejection);
router.post("/:assignmentId/reject-rejection", adminCollectorAssignmentController.rejectRejection);

module.exports = router;
