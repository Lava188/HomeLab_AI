const express = require("express");
const router = express.Router();

const passwordAuthController = require("../controllers/password-auth.controller");

router.post("/login", passwordAuthController.loginAdmin);

module.exports = router;
