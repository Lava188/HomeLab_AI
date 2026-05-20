const mockSessions = require("../data/mockSessions");
const bookingRuntime = require("./booking-runtime/booking.service");
const BookingRuntimeError = require("./booking-runtime/booking-runtime-error");
const { FLOWS, ACTIONS } = require("../constants/chat.constants");
const { createChatResult } = require("../utils/chat-response.util");
const { formatDisplayDate, extractBookingId } = require("../utils/text.util");
const { normalizePhone } = require("./booking-runtime/booking-validation.service");

function getEmptyCancelDraft(defaultBookingId = null) {
    return {
        bookingId: defaultBookingId
    };
}

function hasActiveCancelSession(sessionId) {
    const session = mockSessions.getSession(sessionId);

    return Boolean(
        session &&
        session.currentFlow === FLOWS.CANCEL &&
        session.cancelDraft &&
        session.status !== "cancel_completed"
    );
}

function buildAskBookingIdReply() {
    return (
        "Mình đã nhận yêu cầu hủy lịch. Bạn vui lòng cung cấp mã đặt lịch dạng HLB-YYYYMMDD-XXXX " +
        "để mình xác định lịch hẹn cần hủy."
    );
}

function buildInvalidBookingReply(bookingId) {
    return (
        `Mình không tìm thấy lịch ${bookingId}. ` +
        "Bạn vui lòng kiểm tra lại và gửi đúng mã dạng HLB-YYYYMMDD-XXXX."
    );
}

function buildCancelledReply(booking) {
    if (booking.alreadyCancelled) {
        return `Lịch ${booking.bookingCode} đã ở trạng thái CANCELLED trước đó.`;
    }

    return (
        `Đã hủy thành công lịch ${booking.bookingCode}. ` +
        `Lịch hẹn ngày ${formatDisplayDate(booking.sampleDate)} lúc ${booking.sampleTimeStart} đã được chuyển sang trạng thái CANCELLED.`
    );
}

function buildUnauthorizedReply() {
    return "Bạn không có quyền thao tác lịch hẹn này.";
}

async function handleCancelMessage({ message, sessionId, userSession = {} }) {
    const sessionPhone = normalizePhone(userSession.phone || "");
    const session = mockSessions.getSession(sessionId);
    const extractedBookingId = extractBookingId(message);
    const currentDraft =
        session &&
        session.currentFlow === FLOWS.CANCEL &&
        session.cancelDraft
            ? session.cancelDraft
            : getEmptyCancelDraft(session?.confirmedBookingId || null);

    const nextDraft = {
        ...currentDraft,
        bookingId: extractedBookingId || currentDraft.bookingId
    };

    if (!nextDraft.bookingId) {
        const updatedSession = mockSessions.upsertSession(sessionId, {
            currentFlow: FLOWS.CANCEL,
            status: "awaiting_booking_id",
            cancelDraft: nextDraft,
            confirmedBookingId: session?.confirmedBookingId || null
        });

        return createChatResult({
            sessionId,
            userMessage: message,
            flow: FLOWS.CANCEL,
            action: ACTIONS.ASK_CANCEL_BOOKING_ID,
            reply: buildAskBookingIdReply(),
            booking: null,
            meta: {
                handledBy: "cancel.service",
                sessionState: updatedSession.status,
                nextExpectedField: "bookingId"
            }
        });
    }

    const existingBooking = await bookingRuntime.getBookingByCode(nextDraft.bookingId);

    if (!existingBooking) {
        const updatedSession = mockSessions.upsertSession(sessionId, {
            currentFlow: FLOWS.CANCEL,
            status: "awaiting_booking_id",
            cancelDraft: getEmptyCancelDraft(session?.confirmedBookingId || null),
            confirmedBookingId: session?.confirmedBookingId || null
        });

        return createChatResult({
            sessionId,
            userMessage: message,
            flow: FLOWS.CANCEL,
            action: ACTIONS.CANCEL_BOOKING_NOT_FOUND,
            reply: buildInvalidBookingReply(nextDraft.bookingId),
            booking: null,
            meta: {
                handledBy: "cancel.service",
                sessionState: updatedSession.status,
                nextExpectedField: "bookingId"
            }
        });
    }

    if (sessionPhone && existingBooking.phone !== sessionPhone) {
        return createChatResult({
            sessionId,
            userMessage: message,
            flow: FLOWS.CANCEL,
            action: ACTIONS.CANCEL_BOOKING_NOT_FOUND,
            reply: buildUnauthorizedReply(),
            booking: null,
            meta: {
                handledBy: "cancel.service",
                sessionState: "unauthorized",
                nextExpectedField: null
            }
        });
    }

    try {
        const cancelledBooking = await bookingRuntime.cancelBookingForPhone(
            nextDraft.bookingId,
            sessionPhone,
            {},
            { sessionId }
        );

        const updatedSession = mockSessions.upsertSession(sessionId, {
            currentFlow: FLOWS.CANCEL,
            status: "cancel_completed",
            cancelDraft: {
                bookingId: cancelledBooking.bookingCode
            },
            confirmedBookingId: cancelledBooking.bookingCode
        });

        return createChatResult({
            sessionId,
            userMessage: message,
            flow: FLOWS.CANCEL,
            action: cancelledBooking.alreadyCancelled
                ? ACTIONS.CANCEL_ALREADY_CANCELLED
                : ACTIONS.CANCEL_COMPLETED,
            reply: buildCancelledReply(cancelledBooking),
            booking: cancelledBooking,
            meta: {
                handledBy: "cancel.service",
                sessionState: updatedSession.status,
                nextExpectedField: null
            }
        });
    } catch (error) {
        if (!(error instanceof BookingRuntimeError)) {
            throw error;
        }

        return createChatResult({
            sessionId,
            userMessage: message,
            flow: FLOWS.CANCEL,
            action: ACTIONS.ASK_CANCEL_CONFIRMATION,
            reply: `Lịch ${nextDraft.bookingId} hiện không thể hủy vì trạng thái hiện tại không cho phép.`,
            booking: existingBooking,
            meta: {
                handledBy: "cancel.service",
                sessionState: "blocked",
                nextExpectedField: null,
                errorCode: error.code
            }
        });
    }
}

module.exports = {
    handleCancelMessage,
    hasActiveCancelSession
};
