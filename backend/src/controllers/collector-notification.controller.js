const notificationService = require("../services/notification.service");
const collectorWorkingProfileService = require("../services/collector-working-profile.service");
const { normalizePhone } = require("../services/booking-runtime/booking-validation.service");

function getCollectorPhone(req) {
  return normalizePhone(req.query?.phone || req.get("x-demo-phone") || req.get("x-collector-phone") || "");
}

async function listNotifications(req, res, next) {
  try {
    const phone = getCollectorPhone(req);

    if (!phone) {
      return res.status(401).json({
        success: false,
        message: "Thiếu số điện thoại nhân viên lấy mẫu.",
        code: "COLLECTOR_PHONE_REQUIRED"
      });
    }

    const collector = await collectorWorkingProfileService.getActiveCollectorByPhone(phone);
    const unreadOnly = req.query.unreadOnly === "true";
    const limit = req.query.limit || 20;

    const result = await notificationService.listCollectorNotifications({
      staffProfileId: collector.id,
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
    const phone = getCollectorPhone(req);

    if (!phone) {
      return res.status(401).json({
        success: false,
        message: "Thiếu số điện thoại nhân viên lấy mẫu.",
        code: "COLLECTOR_PHONE_REQUIRED"
      });
    }

    const collector = await collectorWorkingProfileService.getActiveCollectorByPhone(phone);
    const notification = await notificationService.markNotificationRead({
      id: req.params.id,
      roleTarget: "COLLECTOR"
    });

    if (notification.staffProfileId !== collector.id) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền truy cập thông báo này."
      });
    }

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
    next(error);
  }
}

async function markAllRead(req, res, next) {
  try {
    const phone = getCollectorPhone(req);

    if (!phone) {
      return res.status(401).json({
        success: false,
        message: "Thiếu số điện thoại nhân viên lấy mẫu.",
        code: "COLLECTOR_PHONE_REQUIRED"
      });
    }

    const collector = await collectorWorkingProfileService.getActiveCollectorByPhone(phone);
    const result = await notificationService.markAllNotificationsRead({
      roleTarget: "COLLECTOR",
      staffProfileId: collector.id
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
