const repository = require("./booking-runtime/booking.repository");
const prisma = require("./booking-runtime/prisma-client");
const BookingRuntimeError = require("./booking-runtime/booking-runtime-error");
const { normalizePhone } = require("./booking-runtime/booking-validation.service");
const { hashPassword, isStrongEnoughPassword } = require("./password-auth.service");
const {
    normalizeArea,
    normalizeSchedule
} = require("./collector-working-profile.service");

const STAFF_ROLES = ["ADMIN", "STAFF", "SAMPLE_COLLECTOR", "LAB_TECHNICIAN"];
const ACTIVE_ASSIGNED_STATUSES = [
    "CONFIRMED",
    "RESCHEDULED",
    "ASSIGNED",
    "SAMPLE_COLLECTED",
    "IN_LAB_PROCESSING",
    "RESULT_READY"
];
const PENDING_COLLECTION_STATUSES = ["CONFIRMED", "RESCHEDULED", "ASSIGNED"];
const COLLECTED_TODAY_STATUSES = [
    "SAMPLE_COLLECTED",
    "IN_LAB_PROCESSING",
    "RESULT_READY",
    "COMPLETED"
];

function parseBoolean(value) {
    if (value === undefined || value === null || value === "") return undefined;
    if (typeof value === "boolean") return value;

    return String(value).toLowerCase() !== "false";
}

function parseLimit(value) {
    const parsed = Number(value);

    if (!Number.isFinite(parsed) || parsed <= 0) return 100;

    return Math.min(Math.floor(parsed), 200);
}

function todayDateOnly() {
    const now = new Date();

    return new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate()
    ));
}

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

function normalizeRole(role) {
    const normalizedRole = String(role || "").trim().toUpperCase();

    if (!STAFF_ROLES.includes(normalizedRole)) {
        throw new BookingRuntimeError("Vai trò nhân viên không hợp lệ.", {
            code: "STAFF_ROLE_INVALID",
            statusCode: 400,
            details: { role }
        });
    }

    return normalizedRole;
}

function validateStaffInput(input = {}, { partial = false } = {}) {
    const data = {};

    if (!partial || input.name !== undefined || input.fullName !== undefined) {
        const fullName = String(input.name || input.fullName || "").trim();

        if (!fullName) {
            throw new BookingRuntimeError("Tên nhân viên là bắt buộc.", {
                code: "STAFF_NAME_REQUIRED",
                statusCode: 400
            });
        }

        data.fullName = fullName;
    }

    if (!partial || input.phone !== undefined) {
        const phone = normalizePhone(input.phone || "");

        if (!phone) {
            throw new BookingRuntimeError("Số điện thoại nhân viên là bắt buộc.", {
                code: "STAFF_PHONE_REQUIRED",
                statusCode: 400
            });
        }

        data.phone = phone;
    }

    if (!partial || input.role !== undefined) {
        data.role = normalizeRole(input.role || "SAMPLE_COLLECTOR");
    }

    if (input.active !== undefined) {
        data.active = parseBoolean(input.active);
    } else if (!partial) {
        data.active = true;
    }

    return data;
}

function getStaffPasswordInput(input = {}, fieldName) {
    const value = input[fieldName];

    if (value === undefined || value === null || String(value).trim() === "") {
        return null;
    }

    const password = String(value);

    if (!isStrongEnoughPassword(password)) {
        throw new BookingRuntimeError("Mật khẩu cần có ít nhất 8 ký tự.", {
            code: "PASSWORD_TOO_WEAK",
            statusCode: 400
        });
    }

    return password;
}

function buildGeneratedInitialPassword() {
    return `HomeLab-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeBooking(booking) {
    return {
        id: booking.id,
        bookingCode: booking.bookingCode,
        status: booking.status,
        patientName: booking.patientName || booking.patient?.fullName || null,
        phone: booking.phone,
        testName: booking.testCatalogItem?.name || null,
        testTypeText: booking.testTypeText || null,
        sampleDate: formatDateOnly(booking.sampleDate),
        sampleTimeStart: formatTimeOnly(booking.sampleTimeStart),
        address: booking.address
    };
}

async function buildWorkload(staffId) {
    const today = todayDateOnly();
    const [
        assignedToday,
        pendingToday,
        collectedToday,
        totalActiveAssigned
    ] = await Promise.all([
        repository.countAssignedBookingsForStaff({
            staffId,
            statuses: ACTIVE_ASSIGNED_STATUSES,
            sampleDate: today
        }),
        repository.countAssignedBookingsForStaff({
            staffId,
            statuses: PENDING_COLLECTION_STATUSES,
            sampleDate: today
        }),
        repository.countAssignedBookingsForStaff({
            staffId,
            statuses: COLLECTED_TODAY_STATUSES,
            sampleDate: today
        }),
        repository.countAssignedBookingsForStaff({
            staffId,
            statuses: ACTIVE_ASSIGNED_STATUSES
        })
    ]);

    return {
        assignedToday,
        pendingToday,
        collectedToday,
        totalActiveAssigned,
        warning: assignedToday >= 8
            ? "Nhân viên đang có khối lượng lịch cao trong ngày."
            : null
    };
}

async function getWorkingProfileSummary(staffId) {
    const today = todayDateOnly();
    const [workingAreas, workingSchedules] = await Promise.all([
        prisma.collectorWorkingArea.findMany({
            where: { staffProfileId: staffId },
            orderBy: [{ active: "desc" }, { createdAt: "desc" }],
            take: 20
        }),
        prisma.collectorWorkingSchedule.findMany({
            where: {
                staffProfileId: staffId,
                workDate: { gte: today }
            },
            orderBy: [{ workDate: "asc" }, { startTime: "asc" }],
            take: 20
        })
    ]);

    return {
        workingAreas: workingAreas.map(normalizeArea),
        workingSchedules: workingSchedules.map(normalizeSchedule)
    };
}

async function normalizeStaff(staff, { includeBookings = false, includeWorkingProfile = false } = {}) {
    const workload = await buildWorkload(staff.id);
    const normalized = {
        id: staff.id,
        fullName: staff.fullName,
        name: staff.fullName,
        phone: staff.phone || null,
        role: staff.role,
        serviceArea: staff.serviceArea || null,
        active: staff.active,
        createdAt: staff.createdAt || null,
        updatedAt: staff.updatedAt || null,
        workload
    };

    if (includeBookings) {
        const assignedBookings = await repository.listAssignedBookingsForStaff({
            staffId: staff.id,
            statuses: ACTIVE_ASSIGNED_STATUSES,
            sampleDateFrom: todayDateOnly(),
            take: 20
        });

        normalized.assignedBookings = assignedBookings.map(normalizeBooking);
    }

    if (includeWorkingProfile) {
        const workingProfile = await getWorkingProfileSummary(staff.id);

        normalized.workingAreas = workingProfile.workingAreas;
        normalized.workingSchedules = workingProfile.workingSchedules;
    }

    return normalized;
}

function buildStaffWhere(filter = {}) {
    const where = {};

    if (filter.role) {
        where.role = normalizeRole(filter.role);
    }

    const active = parseBoolean(filter.active);
    if (active !== undefined) {
        where.active = active;
    }

    if (filter.search) {
        const search = String(filter.search).trim();
        if (search) {
            where.OR = [
                { fullName: { contains: search } },
                { phone: { contains: search } }
            ];
        }
    }

    return where;
}

async function listStaff(filter = {}) {
    const staffProfiles = await repository.listStaffProfiles({
        where: buildStaffWhere(filter),
        take: parseLimit(filter.limit)
    });

    return Promise.all(staffProfiles.map((staff) => normalizeStaff(staff)));
}

async function getStaffDetail(id) {
    if (!id) {
        throw new BookingRuntimeError("Thiếu mã nhân viên.", {
            code: "STAFF_ID_REQUIRED",
            statusCode: 400
        });
    }

    const staff = await repository.findStaffById(id);

    if (!staff) {
        throw new BookingRuntimeError("Không tìm thấy nhân viên.", {
            code: "STAFF_NOT_FOUND",
            statusCode: 404
        });
    }

    return normalizeStaff(staff, {
        includeBookings: true,
        includeWorkingProfile: true
    });
}

async function createStaff(input = {}) {
    const data = validateStaffInput(input);
    const initialPassword = getStaffPasswordInput(input, "initialPassword");
    const existingByPhone = await repository.findStaffByPhone(data.phone);

    if (existingByPhone) {
        if (initialPassword) {
            data.passwordHash = await hashPassword(initialPassword);
        }

        const updatedStaff = await repository.updateStaffProfile(existingByPhone.id, data);

        return normalizeStaff(updatedStaff, { includeBookings: true });
    }

    data.passwordHash = await hashPassword(initialPassword || buildGeneratedInitialPassword());

    const staff = await repository.createStaffProfile(data);

    return normalizeStaff(staff, { includeBookings: true });
}

async function updateStaff(id, input = {}) {
    if (!id) {
        throw new BookingRuntimeError("Thiếu mã nhân viên.", {
            code: "STAFF_ID_REQUIRED",
            statusCode: 400
        });
    }

    const existingStaff = await repository.findStaffById(id);

    if (!existingStaff) {
        throw new BookingRuntimeError("Không tìm thấy nhân viên.", {
            code: "STAFF_NOT_FOUND",
            statusCode: 404
        });
    }

    const data = validateStaffInput(input, { partial: true });
    const newPassword = getStaffPasswordInput(input, "newPassword");

    if (data.phone && data.phone !== existingStaff.phone) {
        const duplicate = await repository.findStaffByPhone(data.phone);

        if (duplicate && duplicate.id !== id) {
            throw new BookingRuntimeError("Số điện thoại này đã thuộc nhân viên khác.", {
                code: "STAFF_PHONE_DUPLICATED",
                statusCode: 409
            });
        }
    }

    if (newPassword) {
        data.passwordHash = await hashPassword(newPassword);
    }

    const updatedStaff = await repository.updateStaffProfile(id, data);

    return normalizeStaff(updatedStaff, { includeBookings: true });
}

module.exports = {
    ACTIVE_ASSIGNED_STATUSES,
    STAFF_ROLES,
    buildWorkload,
    listStaff,
    getStaffDetail,
    createStaff,
    updateStaff
};
