const prisma = require("./prisma-client");
const { normalizeText } = require("../../utils/text.util");

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
    findStaffByPhoneOrName,
    createStaffProfile,
    updateStaffProfile,
    findDraftBySessionId,
    upsertDraftBySessionId,
    clearDraftBySessionId,
    listBookings
};
