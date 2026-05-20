const express = require("express");
const router = express.Router();

const userAuthController = require("../controllers/user-auth.controller");

router.post("/login", userAuthController.login);
router.post("/register", userAuthController.register);

module.exports = router;
