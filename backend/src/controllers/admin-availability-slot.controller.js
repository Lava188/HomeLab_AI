const availabilitySlotService = require("../services/booking-runtime/availability-slot.service");
const syncService = require("../services/booking-runtime/availability-slot-sync.service");
const prisma = require("../services/booking-runtime/prisma-client");
const BookingRuntimeError = require("../services/booking-runtime/booking-runtime-error");

function sendRuntimeError(res, error) {
    return res.status(error.statusCode || 400).json({
        success: false,
        message: error.message,
        code: error.code,
        details: error.details || null
    });
}

function getSlotStatus(slot) {
    const today = availabilitySlotService.todayUtcDateOnly();
    const slotDate = availabilitySlotService.parseDateOnly(slot.date);

    if (slotDate < today) {
        return "PAST";
    }

    if (!slot.active) {
        return "CLOSED";
    }

    const remainingCapacity = slot.remainingCapacity ?? (slot.capacity - slot.bookedCount);

    if (remainingCapacity <= 0) {
        return "FULL";
    }

    return "OPEN";
}

async function listAvailabilitySlots(req, res, next) {
    try {
        const slots = await availabilitySlotService.listAvailabilitySlots(
            req.query || {}
        );

        const enrichedSlots = slots.map(slot => ({
            ...slot,
            status: getSlotStatus(slot)
        }));

        const summary = {
            total: enrichedSlots.length,
            open: enrichedSlots.filter(s => s.status === "OPEN").length,
            full: enrichedSlots.filter(s => s.status === "FULL").length,
            closed: enrichedSlots.filter(s => s.status === "CLOSED").length,
            past: enrichedSlots.filter(s => s.status === "PAST").length
        };

        return res.status(200).json({
            success: true,
            data: {
                slots: enrichedSlots,
                summary
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
            data: {
                ...slot,
                status: getSlotStatus(slot)
            }
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
            data: {
                ...slot,
                status: getSlotStatus(slot)
            }
        });
    } catch (error) {
        if (error instanceof BookingRuntimeError) {
            return sendRuntimeError(res, error);
        }

        next(error);
    }
}

async function syncAvailabilitySlots(req, res, next) {
    try {
        const { date, dateFrom, dateTo, days } = req.query || {};

        let result;

        if (date) {
            result = await syncService.syncAvailabilitySlotsForDate(date);
        } else if (dateFrom && dateTo) {
            result = await syncService.syncAvailabilitySlotsForDateRange(dateFrom, dateTo);
        } else {
            const syncDays = days ? parseInt(days, 10) : 7;
            result = await syncService.syncAvailabilitySlotsForNextDays(syncDays);
        }

        return res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        if (error instanceof BookingRuntimeError) {
            return sendRuntimeError(res, error);
        }

        next(error);
    }
}

async function disablePastSlots(req, res, next) {
    try {
        const result = await syncService.disablePastAvailabilitySlots();

        return res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        if (error instanceof BookingRuntimeError) {
            return sendRuntimeError(res, error);
        }

        next(error);
    }
}

async function getSlotStats(req, res, next) {
    try {
        const today = availabilitySlotService.todayUtcDateOnly();

        const [
            totalSlots,
            activeSlots,
            futureActiveSlots,
            totalCollectors,
            futureSchedules
        ] = await Promise.all([
            prisma.availabilitySlot.count(),
            prisma.availabilitySlot.count({ where: { active: true } }),
            prisma.availabilitySlot.count({
                where: {
                    active: true,
                    date: { gte: today }
                }
            }),
            prisma.staffProfile.count({
                where: {
                    role: "SAMPLE_COLLECTOR",
                    active: true
                }
            }),
            prisma.collectorWorkingSchedule.count({
                where: {
                    active: true,
                    workDate: { gte: today }
                }
            })
        ]);

        return res.status(200).json({
            success: true,
            data: {
                slots: {
                    total: totalSlots,
                    active: activeSlots,
                    futureActive: futureActiveSlots,
                    inactive: totalSlots - activeSlots
                },
                collectors: {
                    totalActive: totalCollectors,
                    futureSchedules
                }
            }
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
    updateAvailabilitySlot,
    syncAvailabilitySlots,
    disablePastSlots,
    getSlotStats
};
