const express = require("express");
const router = express.Router();
const collectorNotificationController = require("../controllers/collector-notification.controller");

router.get("/", collectorNotificationController.listNotifications);
router.post("/:id/read", collectorNotificationController.markRead);
router.post("/read-all", collectorNotificationController.markAllRead);

module.exports = router;
