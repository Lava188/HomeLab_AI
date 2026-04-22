const mockSessions = require("../data/mockSessions");
const mockBookings = require("../data/mockBookings");
const { FLOWS, ACTIONS } = require("../constants/chat.constants");
const { createChatResult } = require("../utils/chat-response.util");
const { normalizeText, extractBookingId } = require("../utils/text.util");

function getEmptyCancelDraft(defaultBookingId = null) {
    return {
        bookingId: defaultBookingId,
        confirmed: false
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

function detectConfirmation(message) {
    const normalizedMessage = normalizeText(message);

    const confirmKeywords = ["dong y", "xac nhan", "co", "ok", "duoc", "huy"];
    const rejectKeywords = ["khong", "thoi", "dung", "khong huy"];

    if (rejectKeywords.some((keyword) => normalizedMessage.includes(keyword))) {
        return false;
    }

    if (confirmKeywords.some((keyword) => normalizedMessage.includes(keyword))) {
        return true;
    }

    return null;
}

function buildAskBookingIdReply(session) {
    if (session && session.confirmedBookingId) {
        return (
            `Mình đã nhận yêu cầu hủy lịch. Nếu bạn muốn hủy booking gần nhất ` +
            `${session.confirmedBookingId}, bạn có thể xác nhận luôn. ` +
            `Hoặc gửi mã booking theo dạng BK... để mình kiểm tra chính xác hơn.`
        );
    }

    return (
        "Mình đã nhận yêu cầu hủy lịch. Bạn vui lòng cung cấp mã booking theo dạng BK... " +
        "để mình xác định lịch hẹn cần hủy."
    );
}

function buildConfirmReply(booking) {
    return (
        `Mình đã tìm thấy booking ${booking.bookingId} vào ngày ${booking.appointmentDate} ` +
        `lúc ${booking.appointmentTime}. Bạn có chắc muốn hủy lịch này không?`
    );
}

function buildInvalidBookingReply(bookingId) {
    return (
        `Mình không tìm thấy booking ${bookingId}. ` +
        "Bạn vui lòng kiểm tra lại mã booking hoặc gửi đúng mã BK... đã được tạo trước đó."
    );
}

function buildCancelledReply(booking) {
    return (
        `Đã hủy thành công booking ${booking.bookingId}. ` +
        `Lịch hẹn ngày ${booking.appointmentDate} lúc ${booking.appointmentTime} đã được chuyển sang trạng thái cancelled.`
    );
}

async function handleCancelMessage({ message, sessionId }) {
    const session = mockSessions.getSession(sessionId);
    const extractedBookingId = extractBookingId(message);
    const confirmation = detectConfirmation(message);

    const currentDraft =
        session &&
        session.currentFlow === FLOWS.CANCEL &&
        session.cancelDraft
            ? session.cancelDraft
            : getEmptyCancelDraft(session?.confirmedBookingId || null);

    const nextDraft = {
        ...currentDraft,
        bookingId: extractedBookingId || currentDraft.bookingId,
        confirmed: confirmation === true ? true : currentDraft.confirmed
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
            reply: buildAskBookingIdReply(session),
            booking: null,
            meta: {
                handledBy: "cancel.service",
                sessionState: updatedSession.status,
                nextExpectedField: "bookingId"
            }
        });
    }

    const existingBooking = mockBookings.getBookingById(nextDraft.bookingId);

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

    if (existingBooking.status === "cancelled") {
        return createChatResult({
            sessionId,
            userMessage: message,
            flow: FLOWS.CANCEL,
            action: ACTIONS.CANCEL_ALREADY_CANCELLED,
            reply: `Booking ${existingBooking.bookingId} hiện đã ở trạng thái cancelled.`,
            booking: existingBooking,
            meta: {
                handledBy: "cancel.service",
                sessionState: "cancel_completed",
                nextExpectedField: null
            }
        });
    }

    if (confirmation === false) {
        mockSessions.upsertSession(sessionId, {
            currentFlow: FLOWS.CANCEL,
            status: "cancel_aborted",
            cancelDraft: getEmptyCancelDraft(existingBooking.bookingId),
            confirmedBookingId: existingBooking.bookingId
        });

        return createChatResult({
            sessionId,
            userMessage: message,
            flow: FLOWS.CANCEL,
            action: ACTIONS.ASK_CANCEL_CONFIRMATION,
            reply: "Mình sẽ giữ nguyên lịch hẹn hiện tại. Nếu bạn muốn hủy lại, cứ gửi mã booking BK... cho mình.",
            booking: existingBooking,
            meta: {
                handledBy: "cancel.service",
                sessionState: "cancel_aborted",
                nextExpectedField: null
            }
        });
    }

    if (confirmation !== true) {
        const updatedSession = mockSessions.upsertSession(sessionId, {
            currentFlow: FLOWS.CANCEL,
            status: "awaiting_confirmation",
            cancelDraft: nextDraft,
            confirmedBookingId: existingBooking.bookingId
        });

        return createChatResult({
            sessionId,
            userMessage: message,
            flow: FLOWS.CANCEL,
            action: ACTIONS.ASK_CANCEL_CONFIRMATION,
            reply: buildConfirmReply(existingBooking),
            booking: existingBooking,
            meta: {
                handledBy: "cancel.service",
                sessionState: updatedSession.status,
                nextExpectedField: "confirmation"
            }
        });
    }

    const cancelledBooking = mockBookings.updateBooking(existingBooking.bookingId, {
        status: "cancelled"
    });

    const updatedSession = mockSessions.upsertSession(sessionId, {
        currentFlow: FLOWS.CANCEL,
        status: "cancel_completed",
        cancelDraft: {
            bookingId: cancelledBooking.bookingId,
            confirmed: true
        },
        confirmedBookingId: cancelledBooking.bookingId
    });

    return createChatResult({
        sessionId,
        userMessage: message,
        flow: FLOWS.CANCEL,
        action: ACTIONS.CANCEL_COMPLETED,
        reply: buildCancelledReply(cancelledBooking),
        booking: cancelledBooking,
        meta: {
            handledBy: "cancel.service",
            sessionState: updatedSession.status,
            nextExpectedField: null
        }
    });
}

module.exports = {
    handleCancelMessage,
    hasActiveCancelSession
};
