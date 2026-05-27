const prisma = require("./booking-runtime/prisma-client");

const NOTIFICATION_TITLES = {
  BOOKING_CREATED: "Có lịch hẹn mới cần xử lý",
  ASSIGNMENT_AUTO_CREATED: "Đã tự động phân công collector",
  ASSIGNMENT_MANUAL_CREATED: "Đã phân công thủ công collector",
  ASSIGNMENT_REJECTED: "Collector đã từ chối nhiệm vụ",
  COLLECTOR_TASK_ASSIGNED: "Bạn có nhiệm vụ lấy mẫu mới"
};

async function createNotification(data) {
  const { roleTarget, staffProfileId, type, title, message, bookingId, assignmentId, metadata } = data;

  return prisma.notification.create({
    data: {
      roleTarget,
      staffProfileId,
      type,
      title,
      message,
      bookingId,
      assignmentId,
      metadata: metadata ? JSON.stringify(metadata) : null
    }
  });
}

async function createAdminNotification({ type, title, message, bookingId, assignmentId, metadata }) {
  return createNotification({
    roleTarget: "ADMIN",
    staffProfileId: null,
    type,
    title: title || NOTIFICATION_TITLES[type] || "Thông báo mới",
    message,
    bookingId,
    assignmentId,
    metadata
  });
}

async function createCollectorNotification({ staffProfileId, type, title, message, bookingId, assignmentId, metadata }) {
  return createNotification({
    roleTarget: "COLLECTOR",
    staffProfileId,
    type,
    title: title || NOTIFICATION_TITLES[type] || "Thông báo mới",
    message,
    bookingId,
    assignmentId,
    metadata
  });
}

async function listAdminNotifications({ unreadOnly, limit }) {
  const take = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const where = { roleTarget: "ADMIN" };

  if (unreadOnly) {
    where.readAt = null;
  }

  const notifications = await prisma.notification.findMany({
    where,
    include: {
      booking: {
        select: {
          bookingCode: true,
          status: true,
          sampleDate: true,
          sampleTimeStart: true,
          address: true,
          patientName: true,
          phone: true
        }
      },
      assignment: {
        select: {
          id: true,
          status: true,
          rejectReason: true,
          collector: {
            select: {
              id: true,
              fullName: true,
              phone: true
            }
          }
        }
      }
    },
    orderBy: { createdAt: "desc" },
    take
  });

  const unreadCount = await prisma.notification.count({
    where: { roleTarget: "ADMIN", readAt: null }
  });

  return {
    notifications: normalizeNotifications(notifications),
    unreadCount
  };
}

async function listCollectorNotifications({ staffProfileId, unreadOnly, limit }) {
  const take = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const where = { roleTarget: "COLLECTOR", staffProfileId };

  if (unreadOnly) {
    where.readAt = null;
  }

  const notifications = await prisma.notification.findMany({
    where,
    include: {
      booking: {
        select: {
          bookingCode: true,
          status: true,
          sampleDate: true,
          sampleTimeStart: true,
          address: true,
          patientName: true,
          phone: true
        }
      },
      assignment: {
        select: {
          id: true,
          status: true,
          rejectReason: true
        }
      }
    },
    orderBy: { createdAt: "desc" },
    take
  });

  const unreadCount = await prisma.notification.count({
    where: { roleTarget: "COLLECTOR", staffProfileId, readAt: null }
  });

  return {
    notifications: normalizeNotifications(notifications),
    unreadCount
  };
}

async function markNotificationRead({ id, roleTarget }) {
  const notification = await prisma.notification.findUnique({
    where: { id }
  });

  if (!notification) {
    throw new Error("Notification not found");
  }

  if (notification.roleTarget !== roleTarget) {
    throw new Error("Notification access denied");
  }

  return prisma.notification.update({
    where: { id },
    data: { readAt: new Date() }
  });
}

async function markAllNotificationsRead({ roleTarget, staffProfileId }) {
  const where = { roleTarget, readAt: null };

  if (roleTarget === "COLLECTOR") {
    if (!staffProfileId) {
      throw new Error("staffProfileId is required for collector notifications");
    }
    where.staffProfileId = staffProfileId;
  }

  const result = await prisma.notification.updateMany({
    where,
    data: { readAt: new Date() }
  });

  return { count: result.count };
}

function normalizeNotifications(notifications) {
  return notifications.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message,
    readAt: n.readAt,
    createdAt: n.createdAt,
    bookingCode: n.booking?.bookingCode || null,
    assignmentId: n.assignmentId,
    bookingId: n.bookingId,
    metadata: n.metadata ? (() => {
      try {
        return JSON.parse(n.metadata);
      } catch {
        return { raw: n.metadata };
      }
    })() : null,
    booking: n.booking ? {
      bookingCode: n.booking.bookingCode,
      status: n.booking.status,
      sampleDate: n.booking.sampleDate,
      sampleTimeStart: n.booking.sampleTimeStart,
      address: n.booking.address,
      patientName: n.booking.patientName,
      phone: n.booking.phone
    } : null,
    assignment: n.assignment ? {
      id: n.assignment.id,
      status: n.assignment.status,
      rejectReason: n.assignment.rejectReason,
      collector: n.assignment.collector
    } : null
  }));
}

async function notifyBookingCreated(booking) {
  await createAdminNotification({
    type: "BOOKING_CREATED",
    message: `Có lịch hẹn mới ${booking.bookingCode} cần xử lý.`,
    bookingId: booking.id,
    metadata: {
      bookingCode: booking.bookingCode,
      patientName: booking.patientName,
      phone: booking.phone,
      sampleDate: booking.sampleDate,
      sampleTimeStart: booking.sampleTimeStart
    }
  });
}

async function notifyAutoAssignmentCreated(booking, assignment, collectorName) {
  await Promise.all([
    createAdminNotification({
      type: "ASSIGNMENT_AUTO_CREATED",
      message: `Lịch ${booking.bookingCode} đã được tự động phân công cho ${collectorName}.`,
      bookingId: booking.id,
      assignmentId: assignment.id,
      metadata: {
        bookingCode: booking.bookingCode,
        collectorId: assignment.collectorId,
        collectorName
      }
    }),
    createCollectorNotification({
      staffProfileId: assignment.collectorId,
      type: "COLLECTOR_TASK_ASSIGNED",
      message: `Bạn có nhiệm vụ lấy mẫu mới từ hệ thống: ${booking.bookingCode}.`,
      bookingId: booking.id,
      assignmentId: assignment.id,
      metadata: {
        bookingCode: booking.bookingCode,
        assignmentId: assignment.id,
        source: "AUTO"
      }
    })
  ]);
}

async function notifyManualAssignmentCreated(booking, assignment, collectorName) {
  await Promise.all([
    createAdminNotification({
      type: "ASSIGNMENT_MANUAL_CREATED",
      message: `Lịch ${booking.bookingCode} đã được phân công thủ công cho ${collectorName}.`,
      bookingId: booking.id,
      assignmentId: assignment.id,
      metadata: {
        bookingCode: booking.bookingCode,
        collectorId: assignment.collectorId,
        collectorName
      }
    }),
    createCollectorNotification({
      staffProfileId: assignment.collectorId,
      type: "COLLECTOR_TASK_ASSIGNED",
      message: `Bạn được admin phân công lịch lấy mẫu ${booking.bookingCode}.`,
      bookingId: booking.id,
      assignmentId: assignment.id,
      metadata: {
        bookingCode: booking.bookingCode,
        assignmentId: assignment.id,
        source: "ADMIN"
      }
    })
  ]);
}

async function notifyAssignmentRejected(assignment, booking, collectorName) {
  await createAdminNotification({
    type: "ASSIGNMENT_REJECTED",
    message: `Collector ${collectorName} đã từ chối lịch ${booking.bookingCode}.`,
    bookingId: booking.id,
    assignmentId: assignment.id,
    metadata: {
      bookingCode: booking.bookingCode,
      collectorId: assignment.collectorId,
      collectorName,
      rejectReason: assignment.rejectReason,
      sampleDate: booking.sampleDate,
      sampleTimeStart: booking.sampleTimeStart,
      address: booking.address
    }
  });
}

module.exports = {
  createAdminNotification,
  createCollectorNotification,
  listAdminNotifications,
  listCollectorNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  notifyBookingCreated,
  notifyAutoAssignmentCreated,
  notifyManualAssignmentCreated,
  notifyAssignmentRejected
};
