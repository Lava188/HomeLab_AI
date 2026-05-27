const prisma = require("../booking-runtime/prisma-client");
const collectorMatching = require("./collector-matching.service");
const BookingRuntimeError = require("../booking-runtime/booking-runtime-error");
const {
    assertBookingStatusTransition
} = require("../booking-runtime/booking-status-transition.service");
const notificationService = require("../notification.service");

const TERMINAL_BOOKING_STATUSES = new Set([
    "CANCELLED",
    "COMPLETED",
    "NO_SHOW"
]);

const ACTIVE_ASSIGNMENT_STATUSES = new Set([
    "PENDING_COLLECTOR_CONFIRMATION",
    "ACCEPTED"
]);

const ASSIGNMENT_EXPIRY_HOURS = 2;

function formatDateOnly(value) {
    if (!value) return null;
    const date = new Date(value);

    return [
        date.getUTCFullYear(),
        String(date.getUTCMonth() + 1).padStart(2, "0"),
        String(date.getUTCDate()).padStart(2, "0")
    ].join("-");
}

function formatTimeOnly(value) {
    if (!value) return null;
    const date = new Date(value);

    return [
        String(date.getUTCHours()).padStart(2, "0"),
        String(date.getUTCMinutes()).padStart(2, "0")
    ].join(":");
}

async function hasActiveAssignment(bookingId) {
    const count = await prisma.collectorAssignment.count({
        where: {
            bookingId,
            status: { in: Array.from(ACTIVE_ASSIGNMENT_STATUSES) }
        }
    });

    return count > 0;
}

async function createCollectorAssignment(booking, candidate, options = {}) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ASSIGNMENT_EXPIRY_HOURS * 60 * 60 * 1000);

    const assignment = await prisma.collectorAssignment.create({
        data: {
            bookingId: booking.id,
            collectorId: candidate.collectorId,
            status: "PENDING_COLLECTOR_CONFIRMATION",
            assignmentSource: options.source || "AUTO",
            reviewStatus: "NONE",
            assignedAt: now,
            expiresAt,
            metadata: {
                score: candidate.score,
                reasons: candidate.reasons,
                warnings: candidate.warnings,
                workload: candidate.workload,
                areaMatch: candidate.areaMatch,
                scheduleMatch: candidate.scheduleMatch,
                autoAssigned: true,
                ...(options.metadata || {})
            }
        }
    });

    await prisma.collectorAssignmentHistory.create({
        data: {
            assignmentId: assignment.id,
            fromStatus: null,
            toStatus: "PENDING_COLLECTOR_CONFIRMATION",
            actorType: options.actorType || "SYSTEM",
            actorId: options.actorId || null,
            reason: options.reason || "AUTO_ASSIGNMENT_CREATED",
            metadata: {
                selectedCandidate: {
                    collectorId: candidate.collectorId,
                    collectorName: candidate.collectorName,
                    score: candidate.score
                },
                bookingId: booking.id,
                bookingCode: booking.bookingCode,
                ...(options.historyMetadata || {})
            }
        }
    });

    return assignment;
}

async function autoCreateCollectorAssignmentForBooking(bookingIdOrBooking, options = {}) {
    const allowNoCandidate = options.allowNoCandidate !== undefined ? options.allowNoCandidate : true;
    const source = options.source || "AUTO";

    let booking = null;

    if (typeof bookingIdOrBooking === "string") {
        booking = await prisma.booking.findUnique({
            where: { id: bookingIdOrBooking }
        });
    } else if (typeof bookingIdOrBooking === "object" && bookingIdOrBooking.id) {
        booking = bookingIdOrBooking;
    } else {
        throw new BookingRuntimeError("Invalid booking identifier", {
            code: "COLLECTOR_ASSIGNMENT_INVALID_BOOKING",
            statusCode: 400
        });
    }

    if (!booking) {
        return {
            assignmentCreated: false,
            assignment: null,
            selectedCandidate: null,
            reason: "BOOKING_NOT_FOUND",
            warnings: ["Booking not found"]
        };
    }

    if (TERMINAL_BOOKING_STATUSES.has(booking.status)) {
        return {
            assignmentCreated: false,
            assignment: null,
            selectedCandidate: null,
            reason: "BOOKING_NOT_ELIGIBLE",
            warnings: [`Booking is ${booking.status}, not eligible for auto assignment`]
        };
    }

    if (!booking.sampleDate || !booking.sampleTimeStart || !booking.address) {
        return {
            assignmentCreated: false,
            assignment: null,
            selectedCandidate: null,
            reason: "BOOKING_NOT_ELIGIBLE",
            warnings: ["Booking missing sample date, time or address"]
        };
    }

    if (await hasActiveAssignment(booking.id)) {
        return {
            assignmentCreated: false,
            assignment: null,
            selectedCandidate: null,
            reason: "ALREADY_HAS_ACTIVE_ASSIGNMENT",
            warnings: ["Booking already has an active collector assignment"]
        };
    }

    const matchingResult = await collectorMatching.findCollectorCandidatesForBooking(
        booking,
        { includeDebug: false }
    );

    if (!matchingResult.candidates || matchingResult.candidates.length === 0) {
        if (!allowNoCandidate) {
            throw new BookingRuntimeError("No suitable collector found for booking", {
                code: "COLLECTOR_ASSIGNMENT_NO_CANDIDATE",
                statusCode: 400,
                details: { bookingId: booking.id, bookingCode: booking.bookingCode }
            });
        }

        return {
            assignmentCreated: false,
            assignment: null,
            selectedCandidate: null,
            reason: "NO_CANDIDATE",
            warnings: matchingResult.warnings || ["No matching collectors found"]
        };
    }

    const selectedCandidate = matchingResult.candidates[0];

    const assignment = await createCollectorAssignment(booking, selectedCandidate, {
        source,
        actorType: options.actorType || "SYSTEM",
        actorId: options.actorId || null,
        reason: options.reason || "AUTO_ASSIGNMENT_CREATED",
        metadata: options.metadata,
        historyMetadata: options.historyMetadata
    });

    // Fire-and-forget notification for auto assignment
    notificationService.notifyAutoAssignmentCreated(booking, assignment, selectedCandidate.collectorName).catch((err) => {
        console.error("[Notification] Failed to notify auto assignment:", err);
    });

    return {
        assignmentCreated: true,
        assignment: {
            id: assignment.id,
            status: assignment.status,
            collectorId: assignment.collectorId,
            collectorName: selectedCandidate.collectorName,
            collectorPhone: selectedCandidate.collectorPhone,
            assignedAt: assignment.assignedAt,
            expiresAt: assignment.expiresAt
        },
        selectedCandidate: {
            collectorId: selectedCandidate.collectorId,
            collectorName: selectedCandidate.collectorName,
            score: selectedCandidate.score,
            reasons: selectedCandidate.reasons
        },
        reason: "ASSIGNMENT_CREATED",
        warnings: selectedCandidate.warnings || []
    };
}

async function getCollectorAssignmentForBooking(bookingId) {
    const assignment = await prisma.collectorAssignment.findFirst({
        where: {
            bookingId,
            status: { in: Array.from(ACTIVE_ASSIGNMENT_STATUSES) }
        },
        include: {
            collector: {
                select: {
                    id: true,
                    fullName: true,
                    phone: true
                }
            }
        },
        orderBy: { assignedAt: "desc" }
    });

    if (!assignment) return null;

    return {
        id: assignment.id,
        status: assignment.status,
        collectorId: assignment.collectorId,
        collectorName: assignment.collector?.fullName || null,
        collectorPhone: assignment.collector?.phone || null,
        assignedAt: assignment.assignedAt,
        expiresAt: assignment.expiresAt,
        assignmentSource: assignment.assignmentSource,
        reviewStatus: assignment.reviewStatus
    };
}

function normalizeAdminAssignment(assignment) {
    return {
        assignmentId: assignment.id,
        id: assignment.id,
        status: assignment.status,
        reviewStatus: assignment.reviewStatus,
        assignmentSource: assignment.assignmentSource,
        bookingCode: assignment.booking?.bookingCode || null,
        bookingStatus: assignment.booking?.status || null,
        sampleDate: formatDateOnly(assignment.booking?.sampleDate),
        sampleTimeStart: formatTimeOnly(assignment.booking?.sampleTimeStart),
        sampleTimeEnd: formatTimeOnly(assignment.booking?.sampleTimeEnd),
        address: assignment.booking?.address || null,
        testTypeText: assignment.booking?.testTypeText || null,
        testName: assignment.booking?.testCatalogItem?.name || null,
        testCode: assignment.booking?.testCatalogItem?.code || null,
        collectorId: assignment.collectorId,
        collectorName: assignment.collector?.fullName || null,
        collectorPhone: assignment.collector?.phone || null,
        rejectReason: assignment.rejectReason || null,
        rejectedAt: assignment.rejectedAt || null,
        assignedAt: assignment.assignedAt || null,
        acceptedAt: assignment.acceptedAt || null,
        adminReviewedAt: assignment.adminReviewedAt || null,
        adminReviewedById: assignment.adminReviewedById || null,
        metadata: assignment.metadata || null
    };
}

async function listPendingRejections(options = {}) {
    const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 100);

    const assignments = await prisma.collectorAssignment.findMany({
        where: {
            status: "REJECTED_PENDING_ADMIN_REVIEW",
            reviewStatus: "PENDING"
        },
        include: {
            booking: {
                select: {
                    bookingCode: true,
                    status: true,
                    sampleDate: true,
                    sampleTimeStart: true,
                    sampleTimeEnd: true,
                    address: true,
                    testTypeText: true,
                    testCatalogItem: {
                        select: {
                            code: true,
                            name: true
                        }
                    }
                }
            },
            collector: {
                select: {
                    id: true,
                    fullName: true,
                    phone: true
                }
            }
        },
        orderBy: { rejectedAt: "desc" },
        take: limit
    });

    return assignments.map(normalizeAdminAssignment);
}

async function findPendingReviewAssignment(assignmentId) {
    if (!assignmentId || typeof assignmentId !== "string") {
        throw new BookingRuntimeError("Thiếu mã phân công.", {
            code: "ASSIGNMENT_ID_REQUIRED",
            statusCode: 400
        });
    }

    const assignment = await prisma.collectorAssignment.findUnique({
        where: { id: assignmentId },
        include: { booking: true }
    });

    if (!assignment) {
        throw new BookingRuntimeError("Không tìm thấy phân công.", {
            code: "ASSIGNMENT_NOT_FOUND",
            statusCode: 404
        });
    }

    if (assignment.status !== "REJECTED_PENDING_ADMIN_REVIEW" || assignment.reviewStatus !== "PENDING") {
        throw new BookingRuntimeError("Phân công không ở trạng thái chờ admin duyệt lý do từ chối.", {
            code: "ASSIGNMENT_NOT_PENDING_REVIEW",
            statusCode: 409,
            details: {
                currentStatus: assignment.status,
                reviewStatus: assignment.reviewStatus
            }
        });
    }

    return assignment;
}

async function reviewCollectorRejection(assignmentId, decision, options = {}) {
    const assignment = await findPendingReviewAssignment(assignmentId);
    const now = new Date();
    const isApproved = decision === "APPROVED";
    const toStatus = isApproved ? "REJECTION_APPROVED" : "REJECTION_REJECTED";
    const reviewStatus = isApproved ? "APPROVED" : "REJECTED";
    const historyReason = isApproved ? "ADMIN_APPROVED_REJECTION" : "ADMIN_REJECTED_REJECTION";
    const actorId = options.actorId || null;

    const updatedAssignment = await prisma.$transaction(async (tx) => {
        const nextAssignment = await tx.collectorAssignment.update({
            where: { id: assignment.id },
            data: {
                status: toStatus,
                reviewStatus,
                adminReviewedAt: now,
                adminReviewedById: actorId
            }
        });

        await tx.collectorAssignmentHistory.create({
            data: {
                assignmentId: assignment.id,
                fromStatus: "REJECTED_PENDING_ADMIN_REVIEW",
                toStatus,
                actorType: "ADMIN",
                actorId,
                reason: historyReason,
                metadata: {
                    assignmentId: assignment.id,
                    bookingId: assignment.bookingId,
                    bookingCode: assignment.booking.bookingCode,
                    reviewedAt: now.toISOString()
                }
            }
        });

        return nextAssignment;
    });

    return {
        assignment: updatedAssignment,
        booking: assignment.booking,
        message: isApproved
            ? "Đã duyệt lý do từ chối."
            : "Đã không duyệt lý do từ chối."
    };
}

async function manualReassignCollector(bookingCode, input = {}, options = {}) {
    const collectorId = String(input.collectorId || "").trim();
    const reason = String(input.reason || "").trim();

    if (!collectorId) {
        throw new BookingRuntimeError("Vui lòng chọn nhân viên lấy mẫu.", {
            code: "COLLECTOR_ID_REQUIRED",
            statusCode: 400
        });
    }

    if (reason.length < 5) {
        throw new BookingRuntimeError("Vui lòng nhập lý do gán thủ công tối thiểu 5 ký tự.", {
            code: "MANUAL_REASSIGN_REASON_REQUIRED",
            statusCode: 400
        });
    }

    const [booking, collector] = await Promise.all([
        prisma.booking.findUnique({
            where: { bookingCode },
            include: {
                collectorAssignments: {
                    where: { status: { in: Array.from(ACTIVE_ASSIGNMENT_STATUSES) } },
                    select: {
                        id: true,
                        status: true,
                        collectorId: true
                    }
                }
            }
        }),
        prisma.staffProfile.findUnique({
            where: { id: collectorId }
        })
    ]);

    if (!booking) {
        throw new BookingRuntimeError("Không tìm thấy lịch hẹn.", {
            code: "BOOKING_NOT_FOUND",
            statusCode: 404
        });
    }

    if (TERMINAL_BOOKING_STATUSES.has(booking.status)) {
        throw new BookingRuntimeError("Lịch hẹn đã kết thúc, không thể gán nhân viên lấy mẫu.", {
            code: "BOOKING_TERMINAL_STATUS",
            statusCode: 409,
            details: { bookingStatus: booking.status }
        });
    }

    if (!collector) {
        throw new BookingRuntimeError("Không tìm thấy nhân viên lấy mẫu.", {
            code: "COLLECTOR_NOT_FOUND",
            statusCode: 404
        });
    }

    if (!collector.active) {
        throw new BookingRuntimeError("Nhân viên lấy mẫu đang không hoạt động.", {
            code: "COLLECTOR_INACTIVE",
            statusCode: 409,
            details: { collectorId }
        });
    }

    if (collector.role !== "SAMPLE_COLLECTOR") {
        throw new BookingRuntimeError("Nhân viên được chọn không có vai trò lấy mẫu.", {
            code: "COLLECTOR_WRONG_ROLE",
            statusCode: 409,
            details: { collectorId, role: collector.role }
        });
    }

    if (booking.collectorAssignments.length > 0) {
        throw new BookingRuntimeError("Lịch hẹn đã có phân công lấy mẫu đang hoạt động.", {
            code: "ACTIVE_ASSIGNMENT_ALREADY_EXISTS",
            statusCode: 409,
            details: {
                bookingCode,
                activeAssignmentId: booking.collectorAssignments[0].id,
                activeAssignmentStatus: booking.collectorAssignments[0].status
            }
        });
    }

    const now = new Date();
    const actorId = options.actorId || null;

    const assignment = await prisma.$transaction(async (tx) => {
        const nextAssignment = await tx.collectorAssignment.create({
            data: {
                bookingId: booking.id,
                collectorId,
                status: "PENDING_COLLECTOR_CONFIRMATION",
                assignmentSource: "ADMIN",
                reviewStatus: "NONE",
                assignedAt: now,
                metadata: {
                    adminManual: true,
                    reason,
                    assignedBy: actorId
                }
            }
        });

        await tx.collectorAssignmentHistory.create({
            data: {
                assignmentId: nextAssignment.id,
                fromStatus: null,
                toStatus: "PENDING_COLLECTOR_CONFIRMATION",
                actorType: "ADMIN",
                actorId,
                reason: "ADMIN_MANUAL_REASSIGN",
                metadata: {
                    assignmentId: nextAssignment.id,
                    bookingId: booking.id,
                    bookingCode: booking.bookingCode,
                    collectorId,
                    manualReason: reason,
                    assignedAt: now.toISOString()
                }
            }
        });

        return nextAssignment;
    });

    // Fire-and-forget notification for manual assignment
    notificationService.notifyManualAssignmentCreated(booking, assignment, collector.fullName).catch((err) => {
        console.error("[Notification] Failed to notify manual assignment:", err);
    });

    return {
        assignment,
        booking,
        collector,
        message: "Đã tạo phân công thủ công, chờ nhân viên lấy mẫu xác nhận."
    };
}

async function assertNoOtherAcceptedAssignment({ bookingId, assignmentId }) {
    const acceptedAssignment = await prisma.collectorAssignment.findFirst({
        where: {
            bookingId,
            status: "ACCEPTED",
            id: { not: assignmentId }
        }
    });

    if (acceptedAssignment) {
        throw new BookingRuntimeError("Lịch hẹn này đã có nhân viên lấy mẫu chấp nhận.", {
            code: "ASSIGNMENT_ALREADY_ACCEPTED_FOR_BOOKING",
            statusCode: 409,
            details: { bookingId }
        });
    }
}

async function acceptCollectorAssignment(assignmentId, collectorId, options = {}) {
    const assignment = await prisma.collectorAssignment.findUnique({
        where: { id: assignmentId },
        include: { booking: true }
    });

    if (!assignment) {
        throw new BookingRuntimeError("Không tìm thấy nhiệm vụ.", {
            code: "ASSIGNMENT_NOT_FOUND",
            statusCode: 404
        });
    }

    if (assignment.collectorId !== collectorId) {
        throw new BookingRuntimeError("Bạn không có quyền thực hiện tác vụ này.", {
            code: "ASSIGNMENT_ACCESS_DENIED",
            statusCode: 403
        });
    }

    if (assignment.status !== "PENDING_COLLECTOR_CONFIRMATION") {
        throw new BookingRuntimeError(`Nhiệm vụ ở trạng thái ${assignment.status}, không thể chấp nhận.`, {
            code: "ASSIGNMENT_INVALID_STATUS",
            statusCode: 400,
            details: { currentStatus: assignment.status }
        });
    }

    if (TERMINAL_BOOKING_STATUSES.has(assignment.booking.status)) {
        throw new BookingRuntimeError(`Lịch hẹn đã ${assignment.booking.status}, không thể chấp nhận nhiệm vụ.`, {
            code: "BOOKING_TERMINAL_STATUS",
            statusCode: 409,
            details: { bookingStatus: assignment.booking.status }
        });
    }

    await assertNoOtherAcceptedAssignment({
        bookingId: assignment.bookingId,
        assignmentId: assignment.id
    });

    if (assignment.booking.status === "ASSIGNED" && assignment.booking.assignedStaffId !== collectorId) {
        throw new BookingRuntimeError("Lịch hẹn này đã được phân công cho nhân viên khác.", {
            code: "BOOKING_ALREADY_ASSIGNED",
            statusCode: 409,
            details: { bookingId: assignment.bookingId }
        });
    }

    assertBookingStatusTransition(assignment.booking.status, "ASSIGNED", {
        ...options,
        source: "collector_assignment_accept"
    });

    const now = new Date();
    const actorType = options.actorType || "COLLECTOR";
    const actorId = options.actorId || collectorId;

    const result = await prisma.$transaction(async (tx) => {
        const updatedAssignment = await tx.collectorAssignment.update({
            where: { id: assignment.id },
            data: {
                status: "ACCEPTED",
                acceptedAt: now,
                reviewStatus: "NONE"
            }
        });

        await tx.collectorAssignmentHistory.create({
            data: {
                assignmentId: assignment.id,
                fromStatus: "PENDING_COLLECTOR_CONFIRMATION",
                toStatus: "ACCEPTED",
                actorType,
                actorId,
                reason: options.reason || "COLLECTOR_ACCEPTED",
                metadata: {
                    assignmentId: assignment.id,
                    bookingId: assignment.bookingId,
                    bookingCode: assignment.booking.bookingCode,
                    acceptedAt: now.toISOString()
                }
            }
        });

        const updatedBooking = await tx.booking.update({
            where: { id: assignment.bookingId },
            data: {
                assignedStaffId: collectorId,
                status: "ASSIGNED"
            }
        });

        await tx.bookingStatusHistory.create({
            data: {
                bookingId: assignment.bookingId,
                fromStatus: assignment.booking.status,
                toStatus: "ASSIGNED",
                reason: "collector_assignment_accepted",
                changedByType: actorType,
                changedById: actorId,
                metadata: {
                    source: "collector_assignment_api",
                    assignmentId: assignment.id,
                    collectorId
                }
            }
        });

        return {
            assignment: updatedAssignment,
            booking: updatedBooking
        };
    });

    return {
        ...result,
        message: "Đã chấp nhận nhiệm vụ."
    };
}

async function rejectCollectorAssignment(assignmentId, collectorId, reason, options = {}) {
    const assignment = await prisma.collectorAssignment.findUnique({
        where: { id: assignmentId },
        include: { booking: true }
    });

    if (!assignment) {
        throw new BookingRuntimeError("Không tìm thấy nhiệm vụ.", {
            code: "ASSIGNMENT_NOT_FOUND",
            statusCode: 404
        });
    }

    if (assignment.collectorId !== collectorId) {
        throw new BookingRuntimeError("Bạn không có quyền thực hiện tác vụ này.", {
            code: "ASSIGNMENT_ACCESS_DENIED",
            statusCode: 403
        });
    }

    if (assignment.status !== "PENDING_COLLECTOR_CONFIRMATION") {
        throw new BookingRuntimeError(`Nhiệm vụ ở trạng thái ${assignment.status}, không thể từ chối.`, {
            code: "ASSIGNMENT_INVALID_STATUS",
            statusCode: 400,
            details: { currentStatus: assignment.status }
        });
    }

    const trimmedReason = String(reason || "").trim();
    if (trimmedReason.length < 50) {
        throw new BookingRuntimeError("Vui lòng cung cấp lý do từ chối tối thiểu 50 ký tự.", {
            code: "COLLECTOR_REJECT_REASON_REQUIRED",
            statusCode: 400
        });
    }

    const now = new Date();
    const actorType = options.actorType || "COLLECTOR";
    const actorId = options.actorId || collectorId;

    const updatedAssignment = await prisma.collectorAssignment.update({
        where: { id: assignment.id },
        data: {
            status: "REJECTED_PENDING_ADMIN_REVIEW",
            rejectedAt: now,
            rejectReason: trimmedReason,
            reviewStatus: "PENDING"
        },
        include: {
            collector: {
                select: {
                    fullName: true
                }
            }
        }
    });

    // Fire-and-forget notification for assignment rejection
    notificationService.notifyAssignmentRejected(updatedAssignment, assignment.booking, updatedAssignment.collector.fullName).catch((err) => {
        console.error("[Notification] Failed to notify assignment rejection:", err);
    });

    await prisma.collectorAssignmentHistory.create({
        data: {
            assignmentId: assignment.id,
            fromStatus: "PENDING_COLLECTOR_CONFIRMATION",
            toStatus: "REJECTED_PENDING_ADMIN_REVIEW",
            actorType,
            actorId,
            reason: trimmedReason,
            metadata: {
                assignmentId: assignment.id,
                bookingId: assignment.bookingId,
                bookingCode: assignment.booking.bookingCode,
                rejectedAt: now.toISOString()
            }
        }
    });

    return {
        assignment: updatedAssignment,
        booking: assignment.booking,
        message: "Đã từ chối nhiệm vụ."
    };
}

async function listCollectorAssignments(collectorId, options = {}) {
    const { status, limit = 20 } = options;
    const where = { collectorId };

    if (status) {
        where.status = status;
    }

    const assignments = await prisma.collectorAssignment.findMany({
        where,
        include: {
            booking: {
                select: {
                    bookingCode: true,
                    sampleDate: true,
                    sampleTimeStart: true,
                    sampleTimeEnd: true,
                    address: true,
                    testTypeText: true,
                    patientName: true,
                    phone: true,
                    status: true,
                    testCatalogItem: {
                        select: {
                            code: true,
                            name: true
                        }
                    }
                }
            },
            collector: {
                select: {
                    id: true,
                    fullName: true,
                    phone: true
                }
            }
        },
        orderBy: { assignedAt: "desc" },
        take: Math.min(Math.max(Number(limit) || 20, 1), 100)
    });

    return assignments.map((assignment) => ({
        ...assignment,
        booking: assignment.booking
            ? {
                ...assignment.booking,
                sampleDate: formatDateOnly(assignment.booking.sampleDate),
                sampleTimeStart: formatTimeOnly(assignment.booking.sampleTimeStart),
                sampleTimeEnd: formatTimeOnly(assignment.booking.sampleTimeEnd)
            }
            : null
    }));
}

module.exports = {
    autoCreateCollectorAssignmentForBooking,
    createCollectorAssignment,
    hasActiveAssignment,
    getCollectorAssignmentForBooking,
    listPendingRejections,
    reviewCollectorRejection,
    manualReassignCollector,
    acceptCollectorAssignment,
    rejectCollectorAssignment,
    listCollectorAssignments,
    normalizeAdminAssignment
};
