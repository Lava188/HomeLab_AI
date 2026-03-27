const mockSessions = require("../data/mockSessions");
const mockBookings = require("../data/mockBookings");
const { FLOWS, ACTIONS } = require("../constants/chat.constants");
const { createChatResult } = require("../utils/chat-response.util");
const {
    normalizeText,
    formatDisplayDate,
    detectDateFromMessage,
    detectTimeFromMessage,
    extractBookingId
} = require("../utils/text.util");

function getEmptyRescheduleDraft(defaultBookingId = null) {
    return {
        bookingId: defaultBookingId,
        newAppointmentDate: null,
        newAppointmentTime: null
    };
}

function hasActiveRescheduleSession(sessionId) {
    const session = mockSessions.getSession(sessionId);

    return Boolean(
        session &&
        session.currentFlow === FLOWS.RESCHEDULE &&
        session.rescheduleDraft &&
        session.status !== "reschedule_completed"
    );
}

function getMissingFields(draft) {
    const missing = [];

    if (!draft.bookingId) {
        missing.push("bookingId");
    }

    if (!draft.newAppointmentDate) {
        missing.push("newAppointmentDate");
    }

    if (!draft.newAppointmentTime) {
        missing.push("newAppointmentTime");
    }

    return missing;
}

function buildAskBookingIdReply(session) {
    if (session && session.confirmedBookingId) {
        return (
            `Mình đã nhận yêu cầu đổi lịch. Nếu bạn muốn đổi lịch cho booking gần nhất ` +
            `${session.confirmedBookingId}, bạn có thể gửi luôn ngày giờ mới. ` +
            `Hoặc bạn gửi mã booking theo dạng BK... để mình hỗ trợ chính xác hơn.`
        );
    }

    return (
        "Mình đã nhận yêu cầu đổi lịch. Bạn vui lòng cung cấp mã booking theo dạng BK... " +
        "để mình xác định lịch hẹn cần đổi."
    );
}

function buildAskNewScheduleReply(booking, draft) {
    const knownParts = [];

    if (draft.newAppointmentDate) {
        knownParts.push(`Ngày mới: ${formatDisplayDate(draft.newAppointmentDate)}`);
    }

    if (draft.newAppointmentTime) {
        knownParts.push(`Giờ mới: ${draft.newAppointmentTime}`);
    }

    let reply =
        `Mình đã xác định booking ${booking.bookingId}. ` +
        `Lịch hiện tại là ${formatDisplayDate(booking.appointmentDate)} lúc ${booking.appointmentTime}.`;

    if (knownParts.length > 0) {
        reply += ` Hiện mình đã ghi nhận: ${knownParts.join("; ")}.`;
    }

    if (!draft.newAppointmentDate && !draft.newAppointmentTime) {
        reply +=
            " Bạn vui lòng cung cấp ngày và giờ mới. Ví dụ: ngày mai 9h hoặc 28/03/2026 08:30.";
        return reply;
    }

    if (!draft.newAppointmentDate) {
        reply += " Bạn vui lòng cung cấp thêm ngày mới.";
        return reply;
    }

    if (!draft.newAppointmentTime) {
        reply += " Bạn vui lòng cung cấp thêm giờ mới.";
        return reply;
    }

    return reply;
}

function buildInvalidBookingReply(bookingId) {
    return (
        `Mình không tìm thấy booking ${bookingId}. ` +
        "Bạn vui lòng kiểm tra lại mã booking hoặc gửi đúng mã BK... đã được tạo trước đó."
    );
}

function buildRescheduledReply(oldBooking, updatedBooking) {
    return (
        `Đã đổi lịch thành công cho booking ${updatedBooking.bookingId}. ` +
        `Lịch cũ: ${formatDisplayDate(oldBooking.appointmentDate)} lúc ${oldBooking.appointmentTime}. ` +
        `Lịch mới: ${formatDisplayDate(updatedBooking.appointmentDate)} lúc ${updatedBooking.appointmentTime}.`
    );
}

async function handleRescheduleMessage({ message, sessionId }) {
    const session = mockSessions.getSession(sessionId);

    const currentDraft =
        session &&
            session.currentFlow === FLOWS.RESCHEDULE &&
            session.rescheduleDraft
            ? session.rescheduleDraft
            : getEmptyRescheduleDraft(session?.confirmedBookingId || null);

    const extractedBookingId = extractBookingId(message);
    const extractedDate = detectDateFromMessage(message);
    const extractedTime = detectTimeFromMessage(message);

    const extractedSlots = {};

    if (extractedBookingId) {
        extractedSlots.bookingId = extractedBookingId;
    }

    if (extractedDate) {
        extractedSlots.newAppointmentDate = extractedDate;
    }

    if (extractedTime) {
        extractedSlots.newAppointmentTime = extractedTime;
    }

    const nextDraft = {
        ...currentDraft,
        ...extractedSlots
    };

    if (!nextDraft.bookingId) {
        const updatedSession = mockSessions.upsertSession(sessionId, {
            currentFlow: FLOWS.RESCHEDULE,
            status: "awaiting_booking_id",
            rescheduleDraft: nextDraft,
            confirmedBookingId: session?.confirmedBookingId || null
        });

        return createChatResult({
            sessionId,
            userMessage: message,
            flow: FLOWS.RESCHEDULE,
            action: ACTIONS.ASK_RESCHEDULE_BOOKING_ID,
            reply: buildAskBookingIdReply(session),
            booking: null,
            meta: {
                handledBy: "reschedule.service",
                sessionState: updatedSession.status,
                extractedSlots,
                missingFields: getMissingFields(nextDraft),
                nextExpectedField: "bookingId"
            }
        });
    }

    const existingBooking = mockBookings.getBookingById(nextDraft.bookingId);

    if (!existingBooking) {
        const updatedSession = mockSessions.upsertSession(sessionId, {
            currentFlow: FLOWS.RESCHEDULE,
            status: "awaiting_booking_id",
            rescheduleDraft: nextDraft,
            confirmedBookingId: session?.confirmedBookingId || null
        });

        return createChatResult({
            sessionId,
            userMessage: message,
            flow: FLOWS.RESCHEDULE,
            action: ACTIONS.RESCHEDULE_BOOKING_NOT_FOUND,
            reply: buildInvalidBookingReply(nextDraft.bookingId),
            booking: null,
            meta: {
                handledBy: "reschedule.service",
                sessionState: updatedSession.status,
                extractedSlots,
                missingFields: getMissingFields(nextDraft),
                nextExpectedField: "bookingId"
            }
        });
    }

    if (existingBooking.status === "cancelled") {
        return createChatResult({
            sessionId,
            userMessage: message,
            flow: FLOWS.RESCHEDULE,
            action: ACTIONS.RESCHEDULE_NOT_ALLOWED,
            reply:
                `Booking ${existingBooking.bookingId} hiện đã ở trạng thái cancelled nên không thể đổi lịch.`,
            booking: existingBooking,
            meta: {
                handledBy: "reschedule.service",
                sessionState: "blocked",
                extractedSlots,
                missingFields: [],
                nextExpectedField: null
            }
        });
    }

    if (!nextDraft.newAppointmentDate || !nextDraft.newAppointmentTime) {
        const updatedSession = mockSessions.upsertSession(sessionId, {
            currentFlow: FLOWS.RESCHEDULE,
            status: "awaiting_new_schedule",
            rescheduleDraft: nextDraft,
            confirmedBookingId: existingBooking.bookingId
        });

        return createChatResult({
            sessionId,
            userMessage: message,
            flow: FLOWS.RESCHEDULE,
            action: ACTIONS.ASK_RESCHEDULE_INFO,
            reply: buildAskNewScheduleReply(existingBooking, nextDraft),
            booking: existingBooking,
            meta: {
                handledBy: "reschedule.service",
                sessionState: updatedSession.status,
                extractedSlots,
                missingFields: getMissingFields(nextDraft).filter(
                    (field) => field !== "bookingId"
                ),
                nextExpectedField: !nextDraft.newAppointmentDate
                    ? "newAppointmentDate"
                    : "newAppointmentTime"
            }
        });
    }

    const oldBookingSnapshot = {
        ...existingBooking
    };

    const updatedBooking = mockBookings.updateBooking(existingBooking.bookingId, {
        appointmentDate: nextDraft.newAppointmentDate,
        appointmentTime: nextDraft.newAppointmentTime,
        status: "rescheduled"
    });

    const updatedSession = mockSessions.upsertSession(sessionId, {
        currentFlow: FLOWS.RESCHEDULE,
        status: "reschedule_completed",
        rescheduleDraft: nextDraft,
        confirmedBookingId: updatedBooking.bookingId
    });

    return createChatResult({
        sessionId,
        userMessage: message,
        flow: FLOWS.RESCHEDULE,
        action: ACTIONS.RESCHEDULE_COMPLETED,
        reply: buildRescheduledReply(oldBookingSnapshot, updatedBooking),
        booking: updatedBooking,
        meta: {
            handledBy: "reschedule.service",
            sessionState: updatedSession.status,
            extractedSlots,
            missingFields: [],
            nextExpectedField: null,
            rescheduledBookingId: updatedBooking.bookingId
        }
    });
}

module.exports = {
    handleRescheduleMessage,
    hasActiveRescheduleSession
};