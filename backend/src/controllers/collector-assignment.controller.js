const collectorAssignmentService = require("../services/collector-assignment/collector-assignment.service");
const collectorWorkingProfileService = require("../services/collector-working-profile.service");
const BookingRuntimeError = require("../services/booking-runtime/booking-runtime-error");
const { normalizePhone } = require("../services/booking-runtime/booking-validation.service");

function getCollectorPhone(req) {
    return normalizePhone(req.query?.phone || req.get("x-demo-phone") || req.get("x-collector-phone") || "");
}

function sendError(res, error) {
    return res.status(error.statusCode || 400).json({
        success: false,
        message: error.message,
        code: error.code,
        details: error.details || null
    });
}

async function listAssignments(req, res, next) {
    try {
        const phone = getCollectorPhone(req);

        if (!phone) {
            throw new BookingRuntimeError("Thiếu số điện thoại nhân viên lấy mẫu.", {
                code: "COLLECTOR_PHONE_REQUIRED",
                statusCode: 401
            });
        }

        const collector = await collectorWorkingProfileService.getActiveCollectorByPhone(phone);

        const status = req.query.status;
        const limit = req.query.limit ? parseInt(req.query.limit, 10) : 20;

        const assignments = await collectorAssignmentService.listCollectorAssignments(
            collector.id,
            { status, limit }
        );

        return res.status(200).json({
            success: true,
            data: {
                collectorId: collector.id,
                collectorName: collector.fullName,
                assignments: assignments.map(normalizeAssignment)
            }
        });
    } catch (error) {
        if (error instanceof BookingRuntimeError) {
            return sendError(res, error);
        }
        next(error);
    }
}

async function acceptAssignment(req, res, next) {
    try {
        const phone = getCollectorPhone(req);

        if (!phone) {
            throw new BookingRuntimeError("Thiếu số điện thoại nhân viên lấy mẫu.", {
                code: "COLLECTOR_PHONE_REQUIRED",
                statusCode: 401
            });
        }

        const collector = await collectorWorkingProfileService.getActiveCollectorByPhone(phone);

        const result = await collectorAssignmentService.acceptCollectorAssignment(
            req.params.assignmentId,
            collector.id,
            { actorType: "COLLECTOR", actorId: collector.id }
        );

        return res.status(200).json({
            success: true,
            data: normalizeAssignmentResult(result)
        });
    } catch (error) {
        if (error instanceof BookingRuntimeError) {
            return sendError(res, error);
        }
        next(error);
    }
}

async function rejectAssignment(req, res, next) {
    try {
        const phone = getCollectorPhone(req);

        if (!phone) {
            throw new BookingRuntimeError("Thiếu số điện thoại nhân viên lấy mẫu.", {
                code: "COLLECTOR_PHONE_REQUIRED",
                statusCode: 401
            });
        }

        const collector = await collectorWorkingProfileService.getActiveCollectorByPhone(phone);

        const reason = req.body?.reason;

        if (!reason || String(reason).trim().length < 5) {
            throw new BookingRuntimeError("Vui lòng cung cấp lý do từ chối (tối thiểu 5 ký tự).", {
                code: "COLLECTOR_REJECT_REASON_REQUIRED",
                statusCode: 400
            });
        }

        const result = await collectorAssignmentService.rejectCollectorAssignment(
            req.params.assignmentId,
            collector.id,
            String(reason).trim(),
            { actorType: "COLLECTOR", actorId: collector.id }
        );

        return res.status(200).json({
            success: true,
            data: normalizeAssignmentResult(result)
        });
    } catch (error) {
        if (error instanceof BookingRuntimeError) {
            return sendError(res, error);
        }
        next(error);
    }
}

function normalizeAssignment(assignment) {
    return {
        id: assignment.id,
        status: assignment.status,
        bookingCode: assignment.booking?.bookingCode || null,
        sampleDate: assignment.booking?.sampleDate || null,
        sampleTimeStart: assignment.booking?.sampleTimeStart || null,
        sampleTimeEnd: assignment.booking?.sampleTimeEnd || null,
        address: assignment.booking?.address || null,
        testTypeText: assignment.booking?.testTypeText || null,
        testName: assignment.booking?.testCatalogItem?.name || null,
        testCode: assignment.booking?.testCatalogItem?.code || null,
        patientName: assignment.booking?.patientName || null,
        patientPhone: assignment.booking?.phone || null,
        assignedAt: assignment.assignedAt || null,
        acceptedAt: assignment.acceptedAt || null,
        rejectedAt: assignment.rejectedAt || null,
        rejectReason: assignment.rejectReason || null,
        expiresAt: assignment.expiresAt || null,
        reviewStatus: assignment.reviewStatus || null
    };
}

function normalizeAssignmentResult(result) {
    return {
        assignmentId: result.assignment?.id || null,
        assignmentStatus: result.assignment?.status || null,
        bookingStatus: result.booking?.status || null,
        bookingCode: result.booking?.bookingCode || null,
        assignedAt: result.assignment?.assignedAt || null,
        acceptedAt: result.assignment?.acceptedAt || null,
        rejectedAt: result.assignment?.rejectedAt || null,
        message: result.message || null
    };
}

module.exports = {
    listAssignments,
    acceptAssignment,
    rejectAssignment
};
