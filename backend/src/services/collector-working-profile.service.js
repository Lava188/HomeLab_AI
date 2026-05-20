const prisma = require("./booking-runtime/prisma-client");
const BookingRuntimeError = require("./booking-runtime/booking-runtime-error");
const { normalizePhone } = require("./booking-runtime/booking-validation.service");

const SUPPORTED_PROVINCES = new Set(["Hà Nội", "TP.HCM", "TP. HCM", "Thành phố Hồ Chí Minh"]);

function formatDateOnly(value) {
    if (!value) return null;

    const date = new Date(value);

    return [
        date.getUTCFullYear(),
        String(date.getUTCMonth() + 1).padStart(2, "0"),
        String(date.getUTCDate()).padStart(2, "0")
    ].join("-");
}

function parseBoolean(value) {
    if (value === undefined) return undefined;
    if (typeof value === "boolean") return value;

    return String(value).toLowerCase() !== "false";
}

function parseDateOnly(value) {
    const raw = String(value || "").trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        throw new BookingRuntimeError("Ngày làm việc không hợp lệ.", {
            code: "COLLECTOR_WORK_DATE_INVALID",
            statusCode: 400,
            details: { field: "workDate" }
        });
    }

    const date = new Date(`${raw}T00:00:00.000Z`);

    if (Number.isNaN(date.getTime())) {
        throw new BookingRuntimeError("Ngày làm việc không hợp lệ.", {
            code: "COLLECTOR_WORK_DATE_INVALID",
            statusCode: 400,
            details: { field: "workDate" }
        });
    }

    return date;
}

function todayUtcDateOnly() {
    const now = new Date();

    return new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate()
    ));
}

function parseTimeToMinutes(value, field) {
    const raw = String(value || "").trim();

    if (!/^\d{2}:\d{2}$/.test(raw)) {
        throw new BookingRuntimeError("Giờ làm việc phải theo định dạng HH:mm.", {
            code: "COLLECTOR_WORK_TIME_INVALID",
            statusCode: 400,
            details: { field }
        });
    }

    const [hour, minute] = raw.split(":").map(Number);

    if (hour > 23 || minute > 59) {
        throw new BookingRuntimeError("Giờ làm việc phải theo định dạng HH:mm.", {
            code: "COLLECTOR_WORK_TIME_INVALID",
            statusCode: 400,
            details: { field }
        });
    }

    return { raw, minutes: hour * 60 + minute };
}

function normalizeArea(area) {
    return {
        id: area.id,
        staffProfileId: area.staffProfileId,
        province: area.province,
        district: area.district || null,
        ward: area.ward || null,
        active: area.active,
        createdAt: area.createdAt,
        updatedAt: area.updatedAt
    };
}

function normalizeSchedule(schedule) {
    return {
        id: schedule.id,
        staffProfileId: schedule.staffProfileId,
        workDate: formatDateOnly(schedule.workDate),
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        active: schedule.active,
        capacity: schedule.capacity,
        createdAt: schedule.createdAt,
        updatedAt: schedule.updatedAt
    };
}

async function getActiveCollectorByPhone(phoneValue) {
    const phone = normalizePhone(phoneValue || "");

    if (!phone) {
        throw new BookingRuntimeError("Thiếu số điện thoại nhân viên lấy mẫu.", {
            code: "COLLECTOR_PHONE_REQUIRED",
            statusCode: 400,
            details: { field: "phone" }
        });
    }

    const collector = await prisma.staffProfile.findFirst({ where: { phone } });

    if (!collector) {
        throw new BookingRuntimeError("Không tìm thấy nhân viên lấy mẫu.", {
            code: "COLLECTOR_NOT_FOUND",
            statusCode: 404
        });
    }

    if (!collector.active) {
        throw new BookingRuntimeError("Nhân viên lấy mẫu đang tạm khóa.", {
            code: "COLLECTOR_INACTIVE",
            statusCode: 403
        });
    }

    if (collector.role !== "SAMPLE_COLLECTOR") {
        throw new BookingRuntimeError("Tài khoản này không có quyền quản lý lịch lấy mẫu.", {
            code: "COLLECTOR_ROLE_REQUIRED",
            statusCode: 403,
            details: { role: collector.role }
        });
    }

    return collector;
}

function validateAreaInput(input = {}, { partial = false } = {}) {
    const data = {};

    if (!partial || input.province !== undefined) {
        const province = String(input.province || "").trim();

        if (!province) {
            throw new BookingRuntimeError("Tỉnh/thành phố là bắt buộc.", {
                code: "COLLECTOR_AREA_PROVINCE_REQUIRED",
                statusCode: 400,
                details: { field: "province" }
            });
        }

        if (!SUPPORTED_PROVINCES.has(province)) {
            throw new BookingRuntimeError("Hiện HomeLab chỉ hỗ trợ khu vực Hà Nội và TP.HCM.", {
                code: "COLLECTOR_AREA_PROVINCE_UNSUPPORTED",
                statusCode: 400,
                details: { field: "province", province }
            });
        }

        data.province = province;
    }

    if (input.district !== undefined) {
        data.district = String(input.district || "").trim() || null;
    }

    if (input.ward !== undefined) {
        data.ward = String(input.ward || "").trim() || null;
    }

    const active = parseBoolean(input.active);
    if (active !== undefined) {
        data.active = active;
    }

    return data;
}

function validateScheduleInput(input = {}, { partial = false } = {}) {
    const data = {};

    if (!partial || input.workDate !== undefined) {
        const workDate = parseDateOnly(input.workDate);

        if (workDate < todayUtcDateOnly()) {
            throw new BookingRuntimeError("Không thể tạo lịch làm việc trong quá khứ.", {
                code: "COLLECTOR_WORK_DATE_PAST",
                statusCode: 400,
                details: { field: "workDate" }
            });
        }

        data.workDate = workDate;
    }

    const shouldValidateTimeRange = !partial || input.startTime !== undefined || input.endTime !== undefined;
    let start = null;
    let end = null;

    if (shouldValidateTimeRange) {
        start = parseTimeToMinutes(input.startTime, "startTime");
        end = parseTimeToMinutes(input.endTime, "endTime");

        if (end.minutes <= start.minutes) {
            throw new BookingRuntimeError("Giờ kết thúc phải sau giờ bắt đầu.", {
                code: "COLLECTOR_WORK_TIME_RANGE_INVALID",
                statusCode: 400
            });
        }

        data.startTime = start.raw;
        data.endTime = end.raw;
    }

    if (!partial || input.capacity !== undefined) {
        const capacity = Number(input.capacity);

        if (!Number.isFinite(capacity) || capacity <= 0) {
            throw new BookingRuntimeError("Sức chứa tối đa phải lớn hơn 0.", {
                code: "COLLECTOR_WORK_CAPACITY_INVALID",
                statusCode: 400,
                details: { field: "capacity" }
            });
        }

        data.capacity = Math.floor(capacity);
    }

    const active = parseBoolean(input.active);
    if (active !== undefined) {
        data.active = active;
    }

    return data;
}

async function listWorkingAreasForCollectorPhone(phone) {
    const collector = await getActiveCollectorByPhone(phone);
    const areas = await prisma.collectorWorkingArea.findMany({
        where: { staffProfileId: collector.id },
        orderBy: [{ active: "desc" }, { createdAt: "desc" }]
    });

    return {
        collectorId: collector.id,
        workingAreas: areas.map(normalizeArea)
    };
}

async function createWorkingAreaForCollectorPhone(phone, input = {}) {
    const collector = await getActiveCollectorByPhone(phone);
    const area = await prisma.collectorWorkingArea.create({
        data: {
            staffProfileId: collector.id,
            ...validateAreaInput(input)
        }
    });

    return normalizeArea(area);
}

async function updateWorkingAreaForCollectorPhone(phone, areaId, input = {}) {
    const collector = await getActiveCollectorByPhone(phone);
    const existingArea = await prisma.collectorWorkingArea.findUnique({
        where: { id: areaId }
    });

    if (!existingArea || existingArea.staffProfileId !== collector.id) {
        throw new BookingRuntimeError("Bạn không có quyền cập nhật vùng làm việc này.", {
            code: "COLLECTOR_WORKING_AREA_ACCESS_DENIED",
            statusCode: 403
        });
    }

    const area = await prisma.collectorWorkingArea.update({
        where: { id: areaId },
        data: validateAreaInput(input, { partial: true })
    });

    return normalizeArea(area);
}

async function listWorkingSchedulesForCollectorPhone(phone) {
    const collector = await getActiveCollectorByPhone(phone);
    const schedules = await prisma.collectorWorkingSchedule.findMany({
        where: { staffProfileId: collector.id },
        orderBy: [{ workDate: "asc" }, { startTime: "asc" }, { createdAt: "desc" }]
    });

    return {
        collectorId: collector.id,
        workingSchedules: schedules.map(normalizeSchedule)
    };
}

async function createWorkingScheduleForCollectorPhone(phone, input = {}) {
    const collector = await getActiveCollectorByPhone(phone);
    const schedule = await prisma.collectorWorkingSchedule.create({
        data: {
            staffProfileId: collector.id,
            ...validateScheduleInput(input)
        }
    });

    return normalizeSchedule(schedule);
}

async function updateWorkingScheduleForCollectorPhone(phone, scheduleId, input = {}) {
    const collector = await getActiveCollectorByPhone(phone);
    const existingSchedule = await prisma.collectorWorkingSchedule.findUnique({
        where: { id: scheduleId }
    });

    if (!existingSchedule || existingSchedule.staffProfileId !== collector.id) {
        throw new BookingRuntimeError("Bạn không có quyền cập nhật lịch làm việc này.", {
            code: "COLLECTOR_WORKING_SCHEDULE_ACCESS_DENIED",
            statusCode: 403
        });
    }

    const schedule = await prisma.collectorWorkingSchedule.update({
        where: { id: scheduleId },
        data: validateScheduleInput(input, { partial: true })
    });

    return normalizeSchedule(schedule);
}

module.exports = {
    formatDateOnly,
    normalizeArea,
    normalizeSchedule,
    getActiveCollectorByPhone,
    listWorkingAreasForCollectorPhone,
    createWorkingAreaForCollectorPhone,
    updateWorkingAreaForCollectorPhone,
    listWorkingSchedulesForCollectorPhone,
    createWorkingScheduleForCollectorPhone,
    updateWorkingScheduleForCollectorPhone
};
