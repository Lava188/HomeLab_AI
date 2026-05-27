const notificationService = require("../services/notification.service");

async function listNotifications(req, res, next) {
  try {
    const unreadOnly = req.query.unreadOnly === "true";
    const limit = req.query.limit || 20;

    const result = await notificationService.listAdminNotifications({
      unreadOnly,
      limit
    });

    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
}

async function markRead(req, res, next) {
  try {
    const notification = await notificationService.markNotificationRead({
      id: req.params.id,
      roleTarget: "ADMIN"
    });

    return res.status(200).json({
      success: true,
      data: {
        id: notification.id,
        readAt: notification.readAt
      }
    });
  } catch (error) {
    if (error.message === "Notification not found") {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy thông báo."
      });
    }
    if (error.message === "Notification access denied") {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền truy cập thông báo này."
      });
    }
    next(error);
  }
}

async function markAllRead(req, res, next) {
  try {
    const result = await notificationService.markAllNotificationsRead({
      roleTarget: "ADMIN"
    });

    return res.status(200).json({
      success: true,
      data: {
        count: result.count,
        message: `Đã đánh dấu ${result.count} thông báo là đã đọc.`
      }
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listNotifications,
  markRead,
  markAllRead
};
