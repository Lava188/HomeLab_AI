const express = require("express");
const router = express.Router();

const adminStaffController = require("../controllers/admin-staff.controller");

router.get("/", adminStaffController.listStaff);
router.post("/", adminStaffController.createStaff);
router.get("/:id", adminStaffController.getStaffDetail);
router.patch("/:id", adminStaffController.updateStaff);

module.exports = router;
