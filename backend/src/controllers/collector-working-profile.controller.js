const collectorWorkingProfileService = require("../services/collector-working-profile.service");
const BookingRuntimeError = require("../services/booking-runtime/booking-runtime-error");
const { normalizePhone } = require("../services/booking-runtime/booking-validation.service");

function getCollectorPhone(req) {
    return normalizePhone(req.query?.phone || req.get("x-demo-phone") || "");
}

function sendRuntimeError(res, error) {
    return res.status(error.statusCode || 400).json({
        success: false,
        message: error.message,
        code: error.code,
        details: error.details || null
    });
}

async function listWorkingAreas(req, res, next) {
    try {
        const data = await collectorWorkingProfileService.listWorkingAreasForCollectorPhone(
            getCollectorPhone(req)
        );

        return res.status(200).json({ success: true, data });
    } catch (error) {
        if (error instanceof BookingRuntimeError) {
            return sendRuntimeError(res, error);
        }

        next(error);
    }
}

async function createWorkingArea(req, res, next) {
    try {
        const workingArea = await collectorWorkingProfileService.createWorkingAreaForCollectorPhone(
            getCollectorPhone(req),
            req.body || {}
        );

        return res.status(201).json({ success: true, data: workingArea });
    } catch (error) {
        if (error instanceof BookingRuntimeError) {
            return sendRuntimeError(res, error);
        }

        next(error);
    }
}

async function updateWorkingArea(req, res, next) {
    try {
        const workingArea = await collectorWorkingProfileService.updateWorkingAreaForCollectorPhone(
            getCollectorPhone(req),
            req.params.id,
            req.body || {}
        );

        return res.status(200).json({ success: true, data: workingArea });
    } catch (error) {
        if (error instanceof BookingRuntimeError) {
            return sendRuntimeError(res, error);
        }

        next(error);
    }
}

async function deactivateWorkingArea(req, res, next) {
    try {
        const workingArea = await collectorWorkingProfileService.updateWorkingAreaForCollectorPhone(
            getCollectorPhone(req),
            req.params.id,
            { active: false }
        );

        return res.status(200).json({ success: true, data: workingArea });
    } catch (error) {
        if (error instanceof BookingRuntimeError) {
            return sendRuntimeError(res, error);
        }

        next(error);
    }
}

async function listWorkingSchedules(req, res, next) {
    try {
        const data = await collectorWorkingProfileService.listWorkingSchedulesForCollectorPhone(
            getCollectorPhone(req)
        );

        return res.status(200).json({ success: true, data });
    } catch (error) {
        if (error instanceof BookingRuntimeError) {
            return sendRuntimeError(res, error);
        }

        next(error);
    }
}

async function createWorkingSchedule(req, res, next) {
    try {
        const workingSchedule = await collectorWorkingProfileService.createWorkingScheduleForCollectorPhone(
            getCollectorPhone(req),
            req.body || {}
        );

        return res.status(201).json({ success: true, data: workingSchedule });
    } catch (error) {
        if (error instanceof BookingRuntimeError) {
            return sendRuntimeError(res, error);
        }

        next(error);
    }
}

async function updateWorkingSchedule(req, res, next) {
    try {
        const workingSchedule = await collectorWorkingProfileService.updateWorkingScheduleForCollectorPhone(
            getCollectorPhone(req),
            req.params.id,
            req.body || {}
        );

        return res.status(200).json({ success: true, data: workingSchedule });
    } catch (error) {
        if (error instanceof BookingRuntimeError) {
            return sendRuntimeError(res, error);
        }

        next(error);
    }
}

async function deactivateWorkingSchedule(req, res, next) {
    try {
        const workingSchedule = await collectorWorkingProfileService.updateWorkingScheduleForCollectorPhone(
            getCollectorPhone(req),
            req.params.id,
            { active: false }
        );

        return res.status(200).json({ success: true, data: workingSchedule });
    } catch (error) {
        if (error instanceof BookingRuntimeError) {
            return sendRuntimeError(res, error);
        }

        next(error);
    }
}

module.exports = {
    listWorkingAreas,
    createWorkingArea,
    updateWorkingArea,
    deactivateWorkingArea,
    listWorkingSchedules,
    createWorkingSchedule,
    updateWorkingSchedule,
    deactivateWorkingSchedule
};
