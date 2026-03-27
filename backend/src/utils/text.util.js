function removeVietnameseTones(text) {
    return String(text || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/Đ/g, "D");
}

function normalizeText(text) {
    return removeVietnameseTones(text).toLowerCase().trim();
}

function formatDateToISO(year, month, day) {
    const date = new Date(year, month - 1, day);

    if (
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day
    ) {
        return null;
    }

    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function formatDisplayDate(isoDate) {
    if (!isoDate) return "Chưa có";

    const [year, month, day] = String(isoDate).split("-");
    return `${day}/${month}/${year}`;
}

function detectDateFromMessage(message, baseDate = new Date()) {
    const normalizedMessage = normalizeText(message);

    if (normalizedMessage.includes("hom nay")) {
        return formatDateToISO(
            baseDate.getFullYear(),
            baseDate.getMonth() + 1,
            baseDate.getDate()
        );
    }

    if (normalizedMessage.includes("ngay mai")) {
        const tomorrow = new Date(baseDate);
        tomorrow.setDate(baseDate.getDate() + 1);

        return formatDateToISO(
            tomorrow.getFullYear(),
            tomorrow.getMonth() + 1,
            tomorrow.getDate()
        );
    }

    const dateMatch = String(message || "").match(
        /(?:ngày\s*)?(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{4}))?/i
    );

    if (!dateMatch) {
        return null;
    }

    const day = Number(dateMatch[1]);
    const month = Number(dateMatch[2]);
    const year = dateMatch[3] ? Number(dateMatch[3]) : baseDate.getFullYear();

    return formatDateToISO(year, month, day);
}

function detectTimeFromMessage(message) {
    const text = String(message || "");
    const timePattern1 = text.match(/\b(\d{1,2})[:hH](\d{1,2})?\b/);
    const timePattern2 = text.match(/\b(\d{1,2})\s*giờ(?:\s*(\d{1,2}))?\b/i);

    const match = timePattern1 || timePattern2;

    if (!match) {
        return null;
    }

    const hour = Number(match[1]);
    const minute = match[2] ? Number(match[2]) : 0;

    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
        return null;
    }

    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function extractBookingId(message) {
    const match = String(message || "").match(/\bBK\d{8,}\b/i);

    if (!match) {
        return null;
    }

    return match[0].toUpperCase();
}

module.exports = {
    removeVietnameseTones,
    normalizeText,
    formatDateToISO,
    formatDisplayDate,
    detectDateFromMessage,
    detectTimeFromMessage,
    extractBookingId
};