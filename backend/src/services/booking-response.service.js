const { formatDisplayDate } = require("../utils/text.util");

function getSlotDateTime(error, fallback = {}) {
    const details = error?.details || {};
    const slot = details.slot || {};

    return {
        date: slot.date || details.sampleDate || fallback.sampleDate || fallback.appointmentDate || fallback.newAppointmentDate || null,
        time: slot.timeStart || details.sampleTimeStart || fallback.sampleTimeStart || fallback.appointmentTime || fallback.newAppointmentTime || null
    };
}

function formatSlotTime(date, time) {
    const displayTime = time || "khung giờ này";
    const displayDate = date ? ` ngày ${formatDisplayDate(date)}` : "";

    return `${displayTime}${displayDate}`;
}

function isBookingSlotError(error) {
    return error?.code === "BOOKING_SLOT_NOT_OPEN" || error?.code === "BOOKING_SLOT_FULL";
}

function formatSlotErrorMessage(error, options = {}) {
    const { date, time } = getSlotDateTime(error, options.draft || {});
    const slotText = formatSlotTime(date, time);
    const mode = options.mode || "booking";
    const isReschedule = mode === "reschedule";

    if (error?.code === "BOOKING_SLOT_NOT_OPEN") {
        if (isReschedule) {
            return `Khung giờ mới bạn chọn (${slotText}) hiện chưa mở lịch lấy mẫu. Bạn vui lòng chọn khung giờ khác hoặc liên hệ HomeLab để được hỗ trợ.`;
        }

        return `Khung giờ ${slotText} hiện chưa mở lịch lấy mẫu. Bạn vui lòng chọn khung giờ khác hoặc liên hệ HomeLab để được hỗ trợ.`;
    }

    if (error?.code === "BOOKING_SLOT_FULL") {
        if (isReschedule) {
            return `Khung giờ mới bạn chọn (${slotText}) hiện đã hết chỗ. Bạn vui lòng chọn khung giờ khác để tiếp tục đổi lịch.`;
        }

        return `Khung giờ ${slotText} hiện đã hết chỗ. Bạn vui lòng chọn khung giờ khác để tiếp tục đặt lịch.`;
    }

    return "Khung giờ bạn chọn hiện chưa thể nhận lịch. Bạn vui lòng chọn khung giờ khác hoặc liên hệ HomeLab để được hỗ trợ.";
}

module.exports = {
    isBookingSlotError,
    formatSlotErrorMessage
};
