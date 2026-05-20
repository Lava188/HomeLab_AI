const mockSessions = require("../data/mockSessions");
const bookingRuntime = require("./booking-runtime/booking.service");
const BookingRuntimeError = require("./booking-runtime/booking-runtime-error");
const { FLOWS, ACTIONS } = require("../constants/chat.constants");
const { createChatResult } = require("../utils/chat-response.util");
const {
    formatDisplayDate,
    detectDateFromMessage,
    detectTimeFromMessage,
    extractBookingId
} = require("../utils/text.util");
const {
    formatSlotErrorMessage,
    isBookingSlotError
} = require("./booking-response.service");
const { normalizePhone } = require("./booking-runtime/booking-validation.service");

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

    if (!draft.bookingId) missing.push("bookingId");
    if (!draft.newAppointmentDate) missing.push("newAppointmentDate");
    if (!draft.newAppointmentTime) missing.push("newAppointmentTime");

    return missing;
}

function buildAskBookingIdReply() {
    return (
        "Mình đã nhận yêu cầu đổi lịch. Bạn vui lòng cung cấp mã đặt lịch dạng HLB-YYYYMMDD-XXXX " +
        "để mình xác định lịch hẹn cần đổi."
    );
}

function buildAskNewScheduleReply(booking, draft) {
    const knownParts = [];

    if (draft.newAppointmentDate) {
        knownParts.push(`ngày mới: ${formatDisplayDate(draft.newAppointmentDate)}`);
    }

    if (draft.newAppointmentTime) {
        knownParts.push(`giờ mới: ${draft.newAppointmentTime}`);
    }

    let reply =
        `Mình đã tìm thấy lịch ${booking.bookingCode}. ` +
        `Lịch hiện tại là ${formatDisplayDate(booking.sampleDate)} lúc ${booking.sampleTimeStart}.`;

    if (knownParts.length > 0) {
        reply += ` Hiện mình đã ghi nhận ${knownParts.join("; ")}.`;
    }

    if (!draft.newAppointmentDate && !draft.newAppointmentTime) {
        return `${reply} Bạn vui lòng cung cấp ngày và giờ mới, ví dụ: ngày mai 9h.`;
    }

    if (!draft.newAppointmentDate) {
        return `${reply} Bạn vui lòng cung cấp thêm ngày mới.`;
    }

    return `${reply} Bạn vui lòng cung cấp thêm giờ mới.`;
}

function buildInvalidBookingReply(bookingId) {
    return (
        `Mình không tìm thấy lịch ${bookingId}. ` +
        "Bạn vui lòng kiểm tra lại và gửi đúng mã dạng HLB-YYYYMMDD-XXXX."
    );
}

function buildRescheduledReply(updatedBooking) {
    return (
        `Đã đổi lịch thành công cho mã ${updatedBooking.bookingCode}. ` +
        `Lịch mới: ${formatDisplayDate(updatedBooking.sampleDate)} lúc ${updatedBooking.sampleTimeStart}.`
    );
}

function buildUnauthorizedReply() {
    return "Bạn không có quyền thao tác lịch hẹn này.";
}

async function handleRescheduleMessage({ message, sessionId, userSession = {} }) {
    const sessionPhone = normalizePhone(userSession.phone || "");
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

    if (extractedBookingId) extractedSlots.bookingId = extractedBookingId;
    if (extractedDate) extractedSlots.newAppointmentDate = extractedDate;
    if (extractedTime) extractedSlots.newAppointmentTime = extractedTime;

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
            reply: buildAskBookingIdReply(),
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

    const existingBooking = await bookingRuntime.getBookingByCode(nextDraft.bookingId);

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

    if (sessionPhone && existingBooking.phone !== sessionPhone) {
        return createChatResult({
            sessionId,
            userMessage: message,
            flow: FLOWS.RESCHEDULE,
            action: ACTIONS.RESCHEDULE_NOT_ALLOWED,
            reply: buildUnauthorizedReply(),
            booking: null,
            meta: {
                handledBy: "reschedule.service",
                sessionState: "unauthorized",
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
            confirmedBookingId: existingBooking.bookingCode
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

    try {
        const updatedBooking = await bookingRuntime.rescheduleBookingForPhone(
            nextDraft.bookingId,
            sessionPhone,
            {
                sampleDate: nextDraft.newAppointmentDate,
                sampleTimeStart: nextDraft.newAppointmentTime
            },
            { sessionId }
        );

        const updatedSession = mockSessions.upsertSession(sessionId, {
            currentFlow: FLOWS.RESCHEDULE,
            status: "reschedule_completed",
            rescheduleDraft: nextDraft,
            confirmedBookingId: updatedBooking.bookingCode
        });

        return createChatResult({
            sessionId,
            userMessage: message,
            flow: FLOWS.RESCHEDULE,
            action: ACTIONS.RESCHEDULE_COMPLETED,
            reply: buildRescheduledReply(updatedBooking),
            booking: updatedBooking,
            meta: {
                handledBy: "reschedule.service",
                sessionState: updatedSession.status,
                extractedSlots,
                missingFields: [],
                nextExpectedField: null,
                rescheduledBookingId: updatedBooking.bookingCode
            }
        });
    } catch (error) {
        if (!(error instanceof BookingRuntimeError)) {
            throw error;
        }

        const isSlotError = isBookingSlotError(error);
        const updatedSession = mockSessions.upsertSession(sessionId, {
            currentFlow: FLOWS.RESCHEDULE,
            status: "awaiting_new_schedule",
            rescheduleDraft: nextDraft,
            confirmedBookingId: existingBooking.bookingCode
        });

        return createChatResult({
            sessionId,
            userMessage: message,
            flow: FLOWS.RESCHEDULE,
            action: ACTIONS.RESCHEDULE_NOT_ALLOWED,
            reply: isSlotError
                ? formatSlotErrorMessage(error, {
                    mode: "reschedule",
                    draft: nextDraft
                })
                : `Lịch ${nextDraft.bookingId} hiện không thể đổi vì trạng thái hiện tại không cho phép.`,
            booking: existingBooking,
            meta: {
                handledBy: "reschedule.service",
                sessionState: updatedSession.status,
                extractedSlots,
                missingFields: [],
                nextExpectedField: null,
                ...(isSlotError ? {} : { errorCode: error.code })
            }
        });
    }
}

module.exports = {
    handleRescheduleMessage,
    hasActiveRescheduleSession
};
