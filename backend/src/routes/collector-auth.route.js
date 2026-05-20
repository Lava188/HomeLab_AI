const express = require("express");
const router = express.Router();

const passwordAuthController = require("../controllers/password-auth.controller");

router.post("/login", passwordAuthController.loginCollector);

module.exports = router;
