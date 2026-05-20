const repository = require("./booking.repository");
const BookingRuntimeError = require("./booking-runtime-error");

const ACTIVE_CAPACITY_STATUSES = [
    "CONFIRMED",
    "RESCHEDULED",
    "ASSIGNED",
    "SAMPLE_COLLECTED",
    "IN_LAB_PROCESSING",
    "RESULT_READY"
];

function parseDateOnly(value) {
    if (value instanceof Date) {
        return new Date(Date.UTC(
            value.getUTCFullYear(),
            value.getUTCMonth(),
            value.getUTCDate()
        ));
    }

    const [year, month, day] = String(value || "").split("-").map(Number);

    return new Date(Date.UTC(year, month - 1, day));
}

function parseTimeOnly(value) {
    if (!value) return null;
    if (value instanceof Date) return value;

    const [hour, minute = 0, second = 0] = String(value).split(":").map(Number);

    return new Date(Date.UTC(1970, 0, 1, hour, minute, second));
}

function formatDateOnly(value) {
    if (!value) return null;

    const date = new Date(value);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function formatTimeOnly(value) {
    if (!value) return null;

    const date = new Date(value);
    const hour = String(date.getUTCHours()).padStart(2, "0");
    const minute = String(date.getUTCMinutes()).padStart(2, "0");

    return `${hour}:${minute}`;
}

function normalizeCapacity(value) {
    const capacity = Number(value);

    if (!Number.isInteger(capacity) || capacity <= 0) {
        throw new BookingRuntimeError("capacity must be a positive integer", {
            code: "AVAILABILITY_SLOT_VALIDATION_ERROR",
            statusCode: 400
        });
    }

    return capacity;
}

function normalizeBoolean(value, fallback = true) {
    if (value === undefined) return fallback;
    if (typeof value === "boolean") return value;

    return String(value).toLowerCase() !== "false";
}

function assertValidDateTime(value, label) {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
        throw new BookingRuntimeError(`${label} is invalid`, {
            code: "AVAILABILITY_SLOT_VALIDATION_ERROR",
            statusCode: 400,
            details: { field: label }
        });
    }
}

function normalizeSlot(slot, activeBookingCount = null) {
    if (!slot) return null;

    const bookedCount = activeBookingCount === null
        ? slot.bookedCount
        : activeBookingCount;

    return {
        id: slot.id,
        date: formatDateOnly(slot.date),
        timeStart: formatTimeOnly(slot.startTime),
        timeEnd: formatTimeOnly(slot.endTime),
        capacity: slot.capacity,
        bookedCount,
        remainingCapacity: Math.max(slot.capacity - bookedCount, 0),
        area: slot.area || null,
        active: slot.active,
        createdAt: slot.createdAt || null,
        updatedAt: slot.updatedAt || null
    };
}

async function getSlotUsage(slot, { excludeBookingCode = null } = {}) {
    return repository.countActiveBookingsForSlot({
        sampleDate: slot.date,
        sampleTimeStart: slot.startTime,
        excludeBookingCode,
        statuses: ACTIVE_CAPACITY_STATUSES
    });
}

async function assertSlotAvailable({
    sampleDate,
    sampleTimeStart,
    area = null,
    excludeBookingCode = null
}) {
    const date = parseDateOnly(sampleDate);
    const startTime = parseTimeOnly(sampleTimeStart);

    assertValidDateTime(date, "sampleDate");
    assertValidDateTime(startTime, "sampleTimeStart");

    const slot = await repository.findAvailabilitySlotByDateTime({
        date,
        startTime,
        area
    });

    if (!slot) {
        throw new BookingRuntimeError("Khung gio nay chua mo lich lay mau.", {
            code: "BOOKING_SLOT_NOT_OPEN",
            statusCode: 409,
            details: {
                sampleDate: formatDateOnly(date),
                sampleTimeStart: formatTimeOnly(startTime),
                area: area || null
            }
        });
    }

    const activeBookingCount = await getSlotUsage(slot, { excludeBookingCode });

    if (activeBookingCount >= slot.capacity) {
        throw new BookingRuntimeError(
            "Khung gio nay da het cho, vui long chon khung gio khac.",
            {
                code: "BOOKING_SLOT_FULL",
                statusCode: 409,
                details: {
                    slot: normalizeSlot(slot, activeBookingCount)
                }
            }
        );
    }

    return normalizeSlot(slot, activeBookingCount);
}

function buildSlotWhere(filter = {}) {
    const where = {};

    if (filter.date) {
        where.date = parseDateOnly(filter.date);
    } else if (filter.dateFrom || filter.dateTo) {
        where.date = {};

        if (filter.dateFrom) where.date.gte = parseDateOnly(filter.dateFrom);
        if (filter.dateTo) where.date.lte = parseDateOnly(filter.dateTo);
    }

    if (filter.area) {
        where.area = String(filter.area).trim();
    }

    if (filter.active !== undefined) {
        where.active = String(filter.active) !== "false";
    }

    return where;
}

function parseLimit(value) {
    const parsed = Number(value);

    if (!Number.isFinite(parsed) || parsed <= 0) return 100;

    return Math.min(Math.floor(parsed), 200);
}

async function listAvailabilitySlots(filter = {}) {
    const slots = await repository.listAvailabilitySlots({
        where: buildSlotWhere(filter),
        take: parseLimit(filter.limit)
    });

    const normalized = [];

    for (const slot of slots) {
        const activeBookingCount = await getSlotUsage(slot);
        normalized.push(normalizeSlot(slot, activeBookingCount));
    }

    return normalized;
}

async function createAvailabilitySlot(input = {}) {
    const date = parseDateOnly(input.date);
    const startTime = parseTimeOnly(input.timeStart || input.startTime);
    const endTime = parseTimeOnly(input.timeEnd || input.endTime);
    const capacity = normalizeCapacity(input.capacity);

    if (!input.date || !(input.timeStart || input.startTime) || !(input.timeEnd || input.endTime)) {
        throw new BookingRuntimeError("date, timeStart, timeEnd are required", {
            code: "AVAILABILITY_SLOT_VALIDATION_ERROR",
            statusCode: 400
        });
    }

    assertValidDateTime(date, "date");
    assertValidDateTime(startTime, "timeStart");
    assertValidDateTime(endTime, "timeEnd");

    const slot = await repository.createAvailabilitySlot({
        date,
        startTime,
        endTime,
        capacity,
        bookedCount: 0,
        area: input.area ? String(input.area).trim() : null,
        active: normalizeBoolean(input.active, true)
    });

    return normalizeSlot(slot, 0);
}

async function updateAvailabilitySlot(id, input = {}) {
    if (!id) {
        throw new BookingRuntimeError("slot id is required", {
            code: "AVAILABILITY_SLOT_VALIDATION_ERROR",
            statusCode: 400
        });
    }

    const data = {};

    if (input.date !== undefined) {
        data.date = parseDateOnly(input.date);
        assertValidDateTime(data.date, "date");
    }
    if (input.timeStart !== undefined || input.startTime !== undefined) {
        data.startTime = parseTimeOnly(input.timeStart || input.startTime);
        assertValidDateTime(data.startTime, "timeStart");
    }
    if (input.timeEnd !== undefined || input.endTime !== undefined) {
        data.endTime = parseTimeOnly(input.timeEnd || input.endTime);
        assertValidDateTime(data.endTime, "timeEnd");
    }
    if (input.capacity !== undefined) data.capacity = normalizeCapacity(input.capacity);
    if (input.area !== undefined) {
        data.area = input.area ? String(input.area).trim() : null;
    }
    if (input.active !== undefined) data.active = normalizeBoolean(input.active, true);

    const slot = await repository.updateAvailabilitySlot(id, data);
    const activeBookingCount = await getSlotUsage(slot);

    return normalizeSlot(slot, activeBookingCount);
}

module.exports = {
    ACTIVE_CAPACITY_STATUSES,
    assertSlotAvailable,
    listAvailabilitySlots,
    createAvailabilitySlot,
    updateAvailabilitySlot,
    normalizeSlot,
    parseDateOnly,
    parseTimeOnly,
    formatDateOnly,
    formatTimeOnly
};
