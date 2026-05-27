const express = require("express");
const router = express.Router();
const adminNotificationController = require("../controllers/admin-notification.controller");

router.get("/", adminNotificationController.listNotifications);
router.post("/:id/read", adminNotificationController.markRead);
router.post("/read-all", adminNotificationController.markAllRead);

module.exports = router;
