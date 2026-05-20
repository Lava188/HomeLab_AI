const prisma = require("./prisma-client");
const { normalizeText } = require("../../utils/text.util");

function formatTimeOnly(value) {
    if (!value) return null;

    const date = new Date(value);
    const hour = String(date.getUTCHours()).padStart(2, "0");
    const minute = String(date.getUTCMinutes()).padStart(2, "0");

    return `${hour}:${minute}`;
}

async function findPatientByPhone(phone) {
    if (!phone) return null;

    return prisma.patient.findUnique({
        where: { phone }
    });
}

async function upsertPatient({
    fullName,
    phone,
    email = null,
    dateOfBirth = null,
    gender = null,
    defaultAddress = null
}) {
    return prisma.patient.upsert({
        where: { phone },
        update: {
            fullName,
            email,
            dateOfBirth,
            gender,
            defaultAddress
        },
        create: {
            fullName,
            phone,
            email,
            dateOfBirth,
            gender,
            defaultAddress
        }
    });
}

async function findTestCatalogItemByCodeOrName(input) {
    const value = String(input || "").trim();

    if (!value) return null;

    const directMatch = await prisma.testCatalogItem.findFirst({
        where: {
            active: true,
            OR: [
                { code: value.toUpperCase() },
                { name: { contains: value } }
            ]
        }
    });

    if (directMatch) return directMatch;

    const normalizedInput = normalizeText(value);
    const activeItems = await prisma.testCatalogItem.findMany({
        where: { active: true }
    });

    return (
        activeItems.find((item) => {
            const normalizedName = normalizeText(item.name);
            const normalizedCode = normalizeText(item.code);

            return (
                normalizedInput.includes(normalizedName) ||
                normalizedName.includes(normalizedInput) ||
                normalizedInput.includes(normalizedCode)
            );
        }) || null
    );
}

async function createBooking(data) {
    return prisma.booking.create({
        data,
        include: {
            patient: true,
            testCatalogItem: true
        }
    });
}

async function findBookingByCode(bookingCode) {
    if (!bookingCode) return null;

    return prisma.booking.findUnique({
        where: { bookingCode },
        include: {
            patient: true,
            testCatalogItem: true,
            assignedStaff: true
        }
    });
}

async function findBookingDetailByCode(bookingCode) {
    if (!bookingCode) return null;

    return prisma.booking.findUnique({
        where: { bookingCode },
        include: {
            patient: true,
            testCatalogItem: true,
            assignedStaff: true,
            collectorAssignments: {
                include: {
                    collector: {
                        select: {
                            id: true,
                            fullName: true,
                            phone: true,
                            role: true,
                            active: true
                        }
                    },
                    assignmentHistory: {
                        orderBy: { createdAt: "asc" }
                    }
                },
                orderBy: { assignedAt: "desc" }
            },
            statusHistory: {
                orderBy: { createdAt: "asc" }
            }
        }
    });
}

async function updateBookingByCode(bookingCode, data) {
    return prisma.booking.update({
        where: { bookingCode },
        data,
        include: {
            patient: true,
            testCatalogItem: true,
            assignedStaff: true
        }
    });
}

async function createStatusHistory(data) {
    return prisma.bookingStatusHistory.create({
        data
    });
}

async function findDraftBySessionId(sessionId) {
    if (!sessionId) return null;

    return prisma.bookingDraft.findFirst({
        where: { sessionId },
        orderBy: { updatedAt: "desc" }
    });
}

async function upsertDraftBySessionId(sessionId, data) {
    const existingDraft = await findDraftBySessionId(sessionId);

    if (existingDraft) {
        return prisma.bookingDraft.update({
            where: { id: existingDraft.id },
            data
        });
    }

    return prisma.bookingDraft.create({
        data: {
            sessionId,
            ...data
        }
    });
}

async function clearDraftBySessionId(sessionId) {
    if (!sessionId) return { count: 0 };

    return prisma.bookingDraft.deleteMany({
        where: { sessionId }
    });
}

async function findStaffById(staffId) {
    if (!staffId) return null;

    return prisma.staffProfile.findUnique({
        where: { id: staffId }
    });
}

async function findStaffByPhoneOrName({ phone = null, fullName = null }) {
    const or = [];

    if (phone) or.push({ phone });
    if (fullName) or.push({ fullName });

    if (or.length === 0) return null;

    return prisma.staffProfile.findFirst({
        where: { OR: or }
    });
}

async function findStaffByPhone(phone) {
    if (!phone) return null;

    return prisma.staffProfile.findFirst({
        where: { phone }
    });
}

async function createStaffProfile(data) {
    return prisma.staffProfile.create({
        data
    });
}

async function updateStaffProfile(staffId, data) {
    return prisma.staffProfile.update({
        where: { id: staffId },
        data
    });
}

async function listStaffProfiles({ where = {}, take = 100 } = {}) {
    return prisma.staffProfile.findMany({
        where,
        orderBy: [
            { active: "desc" },
            { fullName: "asc" },
            { createdAt: "desc" }
        ],
        take
    });
}

async function countAssignedBookingsForStaff({
    staffId,
    statuses = [],
    sampleDate = null
}) {
    if (!staffId) return 0;

    const where = {
        assignedStaffId: staffId
    };

    if (statuses.length > 0) {
        where.status = { in: statuses };
    }

    if (sampleDate) {
        where.sampleDate = sampleDate;
    }

    return prisma.booking.count({ where });
}

async function listAssignedBookingsForStaff({
    staffId,
    statuses = [],
    sampleDateFrom = null,
    take = 20
}) {
    if (!staffId) return [];

    const where = {
        assignedStaffId: staffId
    };

    if (statuses.length > 0) {
        where.status = { in: statuses };
    }

    if (sampleDateFrom) {
        where.sampleDate = { gte: sampleDateFrom };
    }

    return prisma.booking.findMany({
        where,
        include: {
            patient: true,
            testCatalogItem: true,
            assignedStaff: true
        },
        orderBy: [
            { sampleDate: "asc" },
            { sampleTimeStart: "asc" },
            { createdAt: "desc" }
        ],
        take
    });
}

async function listBookings({ where = {}, take = 50 } = {}) {
    return prisma.booking.findMany({
        where,
        include: {
            patient: true,
            testCatalogItem: true,
            assignedStaff: true
        },
        orderBy: { createdAt: "desc" },
        take
    });
}

async function listCollectorBookings({ where = {}, take = 50 } = {}) {
    return prisma.booking.findMany({
        where,
        include: {
            patient: true,
            testCatalogItem: true,
            assignedStaff: true
        },
        orderBy: [
            { sampleDate: "asc" },
            { sampleTimeStart: "asc" },
            { createdAt: "desc" }
        ],
        take
    });
}

async function findAvailabilitySlotByDateTime({ date, startTime, area = null }) {
    if (!date || !startTime) return null;

    const where = {
        date,
        active: true
    };

    if (area) {
        where.OR = [{ area }, { area: null }];
    }

    const slots = await prisma.availabilitySlot.findMany({
        where,
        orderBy: [{ area: "desc" }, { createdAt: "desc" }]
    });

    const targetTime = formatTimeOnly(startTime);

    return slots.find((slot) => formatTimeOnly(slot.startTime) === targetTime) || null;
}

async function countActiveBookingsForSlot({
    sampleDate,
    sampleTimeStart,
    excludeBookingCode = null,
    statuses = []
}) {
    if (!sampleDate || !sampleTimeStart || statuses.length === 0) return 0;

    const where = {
        sampleDate,
        status: { in: statuses }
    };

    if (excludeBookingCode) {
        where.bookingCode = { not: excludeBookingCode };
    }

    const bookings = await prisma.booking.findMany({
        where,
        select: {
            bookingCode: true,
            sampleTimeStart: true
        }
    });
    const targetTime = formatTimeOnly(sampleTimeStart);

    return bookings.filter((booking) =>
        formatTimeOnly(booking.sampleTimeStart) === targetTime
    ).length;
}

async function listAvailabilitySlots({ where = {}, take = 100 } = {}) {
    return prisma.availabilitySlot.findMany({
        where,
        orderBy: [
            { date: "asc" },
            { startTime: "asc" },
            { createdAt: "desc" }
        ],
        take
    });
}

async function createAvailabilitySlot(data) {
    return prisma.availabilitySlot.create({ data });
}

async function updateAvailabilitySlot(id, data) {
    return prisma.availabilitySlot.update({
        where: { id },
        data
    });
}

module.exports = {
    findPatientByPhone,
    upsertPatient,
    findTestCatalogItemByCodeOrName,
    createBooking,
    findBookingByCode,
    findBookingDetailByCode,
    updateBookingByCode,
    createStatusHistory,
    findStaffById,
    findStaffByPhone,
    findStaffByPhoneOrName,
    createStaffProfile,
    updateStaffProfile,
    listStaffProfiles,
    countAssignedBookingsForStaff,
    listAssignedBookingsForStaff,
    findDraftBySessionId,
    upsertDraftBySessionId,
    clearDraftBySessionId,
    listBookings,
    listCollectorBookings,
    findAvailabilitySlotByDateTime,
    countActiveBookingsForSlot,
    listAvailabilitySlots,
    createAvailabilitySlot,
    updateAvailabilitySlot
};
