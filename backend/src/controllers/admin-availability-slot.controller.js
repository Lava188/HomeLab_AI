const availabilitySlotService = require("../services/booking-runtime/availability-slot.service");
const BookingRuntimeError = require("../services/booking-runtime/booking-runtime-error");

function sendRuntimeError(res, error) {
    return res.status(error.statusCode || 400).json({
        success: false,
        message: error.message,
        code: error.code,
        details: error.details || null
    });
}

async function listAvailabilitySlots(req, res, next) {
    try {
        const slots = await availabilitySlotService.listAvailabilitySlots(
            req.query || {}
        );

        return res.status(200).json({
            success: true,
            data: {
                slots,
                total: slots.length
            }
        });
    } catch (error) {
        if (error instanceof BookingRuntimeError) {
            return sendRuntimeError(res, error);
        }

        next(error);
    }
}

async function createAvailabilitySlot(req, res, next) {
    try {
        const slot = await availabilitySlotService.createAvailabilitySlot(
            req.body || {}
        );

        return res.status(201).json({
            success: true,
            data: slot
        });
    } catch (error) {
        if (error instanceof BookingRuntimeError) {
            return sendRuntimeError(res, error);
        }

        next(error);
    }
}

async function updateAvailabilitySlot(req, res, next) {
    try {
        const slot = await availabilitySlotService.updateAvailabilitySlot(
            req.params.id,
            req.body || {}
        );

        return res.status(200).json({
            success: true,
            data: slot
        });
    } catch (error) {
        if (error instanceof BookingRuntimeError) {
            return sendRuntimeError(res, error);
        }

        next(error);
    }
}

module.exports = {
    listAvailabilitySlots,
    createAvailabilitySlot,
    updateAvailabilitySlot
};
