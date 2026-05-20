const adminStaffService = require("../services/admin-staff.service");
const BookingRuntimeError = require("../services/booking-runtime/booking-runtime-error");

function sendRuntimeError(res, error) {
    return res.status(error.statusCode || 400).json({
        success: false,
        message: error.message,
        code: error.code,
        details: error.details || null
    });
}

async function listStaff(req, res, next) {
    try {
        const staff = await adminStaffService.listStaff(req.query || {});

        return res.status(200).json({
            success: true,
            data: {
                staff,
                total: staff.length
            }
        });
    } catch (error) {
        if (error instanceof BookingRuntimeError) {
            return sendRuntimeError(res, error);
        }

        next(error);
    }
}

async function getStaffDetail(req, res, next) {
    try {
        const staff = await adminStaffService.getStaffDetail(req.params.id);

        return res.status(200).json({
            success: true,
            data: staff
        });
    } catch (error) {
        if (error instanceof BookingRuntimeError) {
            return sendRuntimeError(res, error);
        }

        next(error);
    }
}

async function createStaff(req, res, next) {
    try {
        const staff = await adminStaffService.createStaff(req.body || {});

        return res.status(201).json({
            success: true,
            data: staff
        });
    } catch (error) {
        if (error instanceof BookingRuntimeError) {
            return sendRuntimeError(res, error);
        }

        next(error);
    }
}

async function updateStaff(req, res, next) {
    try {
        const staff = await adminStaffService.updateStaff(
            req.params.id,
            req.body || {}
        );

        return res.status(200).json({
            success: true,
            data: staff
        });
    } catch (error) {
        if (error instanceof BookingRuntimeError) {
            return sendRuntimeError(res, error);
        }

        next(error);
    }
}

module.exports = {
    listStaff,
    getStaffDetail,
    createStaff,
    updateStaff
};
