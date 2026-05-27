const prisma = require("./prisma-client");

const ACTIVE_CAPACITY_STATUSES = [
    "CONFIRMED",
    "RESCHEDULED",
    "ASSIGNED",
    "SAMPLE_COLLECTED",
    "IN_LAB_PROCESSING",
    "RESULT_READY"
];

function todayUtcDateOnly() {
    const now = new Date();
    return new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate()
    ));
}

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

function timeToMinutes(timeValue) {
    if (!timeValue) return 0;

    let timeStr;
    if (typeof timeValue === "string") {
        timeStr = timeValue;
    } else if (timeValue instanceof Date) {
        timeStr = `${String(timeValue.getUTCHours()).padStart(2, "0")}:${String(timeValue.getUTCMinutes()).padStart(2, "0")}`;
    } else {
        return 0;
    }

    const [hour, minute] = timeStr.split(":").map(Number);
    return hour * 60 + minute;
}

function isTimeInRange(time, startTime, endTime) {
    const timeMinutes = timeToMinutes(time);
    const startMinutes = timeToMinutes(startTime);
    const endMinutes = timeToMinutes(endTime);

    return timeMinutes >= startMinutes && timeMinutes < endMinutes;
}

async function getActiveCollectorsForWorkDate(workDate) {
    const date = parseDateOnly(workDate);

    const collectors = await prisma.staffProfile.findMany({
        where: {
            role: "SAMPLE_COLLECTOR",
            active: true,
            workingSchedules: {
                some: {
                    workDate: date,
                    active: true
                }
            }
        },
        include: {
            workingSchedules: {
                where: {
                    workDate: date,
                    active: true
                }
            },
            workingAreas: {
                where: {
                    active: true
                }
            }
        }
    });

    return collectors;
}

async function countActiveBookingsForSlot(date, startTime, endTime) {
    const bookings = await prisma.booking.findMany({
        where: {
            sampleDate: date,
            status: { in: ACTIVE_CAPACITY_STATUSES }
        },
        select: {
            sampleTimeStart: true
        }
    });

    const targetStart = formatTimeOnly(startTime);
    const targetEnd = formatTimeOnly(endTime);

    return bookings.filter(booking => {
        const bookingTime = formatTimeOnly(booking.sampleTimeStart);
        const bookingMinutes = timeToMinutes(bookingTime);
        const startMinutes = timeToMinutes(targetStart);
        const endMinutes = timeToMinutes(targetEnd);

        return bookingMinutes >= startMinutes && bookingMinutes < endMinutes;
    }).length;
}

async function getCollectorScheduleGroups(workDate) {
    const collectors = await getActiveCollectorsForWorkDate(workDate);

    const scheduleGroups = new Map();

    for (const collector of collectors) {
        for (const schedule of collector.workingSchedules) {
            const key = `${schedule.workDate.toISOString()}_${schedule.startTime}_${schedule.endTime}`;

            if (!scheduleGroups.has(key)) {
                scheduleGroups.set(key, {
                    workDate: schedule.workDate,
                    startTime: schedule.startTime,
                    endTime: schedule.endTime,
                    collectors: new Set()
                });
            }

            scheduleGroups.get(key).collectors.add(collector.id);
        }
    }

    return Array.from(scheduleGroups.values()).map(group => ({
        workDate: group.workDate,
        startTime: group.startTime,
        endTime: group.endTime,
        collectors: Array.from(group.collectors),
        capacity: group.collectors.size
    }));
}

async function syncAvailabilitySlotsForDate(workDate) {
    const today = todayUtcDateOnly();
    const targetDate = parseDateOnly(workDate);

    if (targetDate < today) {
        return {
            synced: false,
            reason: "past_date",
            message: "Không đồng bộ slot cho ngày trong quá khứ.",
            slotsCreated: 0,
            slotsUpdated: 0,
            slotsDisabled: 0
        };
    }

    const scheduleGroups = await getCollectorScheduleGroups(targetDate);

    let slotsCreated = 0;
    let slotsUpdated = 0;
    let slotsDisabled = 0;

    for (const group of scheduleGroups) {
        const existingSlot = await prisma.availabilitySlot.findFirst({
            where: {
                date: group.workDate,
                startTime: parseTimeOnly(group.startTime),
                endTime: parseTimeOnly(group.endTime)
            }
        });

        const bookedCount = await countActiveBookingsForSlot(group.workDate, group.startTime, group.endTime);

        if (existingSlot) {
            const newCapacity = group.capacity;

            if (existingSlot.capacity !== newCapacity || !existingSlot.active) {
                await prisma.availabilitySlot.update({
                    where: { id: existingSlot.id },
                    data: {
                        capacity: newCapacity,
                        bookedCount,
                        active: true
                    }
                });
                slotsUpdated++;
            }
        } else {
            await prisma.availabilitySlot.create({
                data: {
                    date: group.workDate,
                    startTime: parseTimeOnly(group.startTime),
                    endTime: parseTimeOnly(group.endTime),
                    capacity: group.capacity,
                    bookedCount,
                    active: true,
                    area: null
                }
            });
            slotsCreated++;
        }
    }

    const allSlots = await prisma.availabilitySlot.findMany({
        where: {
            date: targetDate
        }
    });

    for (const slot of allSlots) {
        const hasMatchingSchedule = scheduleGroups.some(group => {
            const slotTime = formatTimeOnly(slot.startTime);
            const groupStart = group.startTime;
            const groupEnd = group.endTime;

            return slotTime === groupStart;
        });

        if (!hasMatchingSchedule && slot.active) {
            await prisma.availabilitySlot.update({
                where: { id: slot.id },
                data: { active: false }
            });
            slotsDisabled++;
        }
    }

    return {
        synced: true,
        date: formatDateOnly(targetDate),
        scheduleGroups: scheduleGroups.length,
        slotsCreated,
        slotsUpdated,
        slotsDisabled,
        message: `Đã đồng bộ ${slotsCreated + slotsUpdated} slot, disabled ${slotsDisabled} slot.`
    };
}

async function syncAvailabilitySlotsForDateRange(dateFrom, dateTo) {
    const startDate = parseDateOnly(dateFrom);
    const endDate = parseDateOnly(dateTo || startDate);

    const results = [];
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
        const result = await syncAvailabilitySlotsForDate(new Date(currentDate));
        results.push(result);

        currentDate.setUTCDate(currentDate.getUTCDate() + 1);
    }

    const totalCreated = results.reduce((sum, r) => sum + (r.slotsCreated || 0), 0);
    const totalUpdated = results.reduce((sum, r) => sum + (r.slotsUpdated || 0), 0);
    const totalDisabled = results.reduce((sum, r) => sum + (r.slotsDisabled || 0), 0);

    return {
        dateFrom: formatDateOnly(startDate),
        dateTo: formatDateOnly(endDate),
        daysProcessed: results.length,
        slotsCreated: totalCreated,
        slotsUpdated: totalUpdated,
        slotsDisabled: totalDisabled,
        details: results
    };
}

async function syncAvailabilitySlotsForNextDays(days = 7) {
    const today = todayUtcDateOnly();
    const endDate = new Date(today);
    endDate.setUTCDate(today.getUTCDate() + days);

    return syncAvailabilitySlotsForDateRange(today, endDate);
}

async function disablePastAvailabilitySlots() {
    const today = todayUtcDateOnly();

    const result = await prisma.availabilitySlot.updateMany({
        where: {
            date: {
                lt: today
            },
            active: true
        },
        data: {
            active: false
        }
    });

    return {
        disabled: result.count,
        message: `Đã đóng ${result.count} slot trong quá khứ.`
    };
}

module.exports = {
    getActiveCollectorsForWorkDate,
    getCollectorScheduleGroups,
    countActiveBookingsForSlot,
    syncAvailabilitySlotsForDate,
    syncAvailabilitySlotsForDateRange,
    syncAvailabilitySlotsForNextDays,
    disablePastAvailabilitySlots,
    timeToMinutes,
    isTimeInRange
};
