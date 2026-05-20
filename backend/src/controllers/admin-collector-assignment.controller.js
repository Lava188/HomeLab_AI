const collectorAssignmentService = require("../services/collector-assignment/collector-assignment.service");
const BookingRuntimeError = require("../services/booking-runtime/booking-runtime-error");

function getAdminActorId(req) {
    return (
        req.get("x-admin-id") ||
        req.get("x-admin-phone") ||
        req.get("x-demo-user-id") ||
        "admin"
    );
}

function sendRuntimeError(res, error) {
    return res.status(error.statusCode || 400).json({
        success: false,
        message: error.message,
        code: error.code,
        details: error.details || null
    });
}

async function listPendingRejections(req, res, next) {
    try {
        const assignments = await collectorAssignmentService.listPendingRejections({
            limit: req.query?.limit
        });

        return res.status(200).json({
            success: true,
            data: {
                assignments,
                total: assignments.length
            }
        });
    } catch (error) {
        if (error instanceof BookingRuntimeError) {
            return sendRuntimeError(res, error);
        }
        next(error);
    }
}

async function approveRejection(req, res, next) {
    try {
        const result = await collectorAssignmentService.reviewCollectorRejection(
            req.params.assignmentId,
            "APPROVED",
            { actorId: getAdminActorId(req) }
        );

        return res.status(200).json({
            success: true,
            data: normalizeReviewResult(result)
        });
    } catch (error) {
        if (error instanceof BookingRuntimeError) {
            return sendRuntimeError(res, error);
        }
        next(error);
    }
}

async function rejectRejection(req, res, next) {
    try {
        const result = await collectorAssignmentService.reviewCollectorRejection(
            req.params.assignmentId,
            "REJECTED",
            { actorId: getAdminActorId(req) }
        );

        return res.status(200).json({
            success: true,
            data: normalizeReviewResult(result)
        });
    } catch (error) {
        if (error instanceof BookingRuntimeError) {
            return sendRuntimeError(res, error);
        }
        next(error);
    }
}

async function manualReassign(req, res, next) {
    try {
        const result = await collectorAssignmentService.manualReassignCollector(
            req.params.bookingCode,
            req.body || {},
            { actorId: getAdminActorId(req) }
        );

        return res.status(201).json({
            success: true,
            data: normalizeManualReassignResult(result)
        });
    } catch (error) {
        if (error instanceof BookingRuntimeError) {
            return sendRuntimeError(res, error);
        }
        next(error);
    }
}

function normalizeReviewResult(result) {
    return {
        assignmentId: result.assignment?.id || null,
        assignmentStatus: result.assignment?.status || null,
        reviewStatus: result.assignment?.reviewStatus || null,
        adminReviewedAt: result.assignment?.adminReviewedAt || null,
        adminReviewedById: result.assignment?.adminReviewedById || null,
        bookingCode: result.booking?.bookingCode || null,
        bookingStatus: result.booking?.status || null,
        message: result.message || null
    };
}

function normalizeManualReassignResult(result) {
    return {
        assignmentId: result.assignment?.id || null,
        assignmentStatus: result.assignment?.status || null,
        assignmentSource: result.assignment?.assignmentSource || null,
        reviewStatus: result.assignment?.reviewStatus || null,
        bookingCode: result.booking?.bookingCode || null,
        bookingStatus: result.booking?.status || null,
        collectorId: result.collector?.id || null,
        collectorName: result.collector?.fullName || null,
        collectorPhone: result.collector?.phone || null,
        assignedAt: result.assignment?.assignedAt || null,
        message: result.message || null
    };
}

module.exports = {
    listPendingRejections,
    approveRejection,
    rejectRejection,
    manualReassign
};
