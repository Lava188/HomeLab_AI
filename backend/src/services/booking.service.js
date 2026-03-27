const mockSessions = require("../data/mockSessions");
const mockBookings = require("../data/mockBookings");
const { FLOWS, ACTIONS } = require("../constants/chat.constants");
const { createChatResult } = require("../utils/chat-response.util");
const {
    normalizeText,
    detectDateFromMessage,
    detectTimeFromMessage,
    formatDisplayDate
} = require("../utils/text.util");

const REQUIRED_FIELDS = [
    "testType",
    "appointmentDate",
    "appointmentTime",
    "address",
    "patientName",
    "phoneNumber"
];

const FIELD_LABELS = {
    testType: "Loại xét nghiệm",
    appointmentDate: "Ngày lấy mẫu",
    appointmentTime: "Giờ lấy mẫu",
    address: "Địa chỉ",
    patientName: "Tên người đặt",
    phoneNumber: "Số điện thoại"
};

const FIELD_PROMPTS = {
    testType:
        "loại xét nghiệm. Ví dụ: đường huyết, mỡ máu, công thức máu, nước tiểu",
    appointmentDate:
        "ngày lấy mẫu. Ví dụ: ngày mai, hôm nay, hoặc 27/03/2026",
    appointmentTime:
        "giờ lấy mẫu. Ví dụ: 7h30, 8h, 14:00",
    address:
        "địa chỉ lấy mẫu. Tốt nhất theo format: Địa chỉ: số nhà, đường, phường/xã, quận/huyện, tỉnh/thành",
    patientName:
        "tên người đặt. Tốt nhất theo format: Tên: Nguyễn Văn A",
    phoneNumber:
        "số điện thoại liên hệ. Ví dụ: 0912345678"
};

function getEmptyBookingDraft() {
    return {
        testType: null,
        appointmentDate: null,
        appointmentTime: null,
        address: null,
        patientName: null,
        phoneNumber: null
    };
}

function hasActiveBookingSession(sessionId) {
    const session = mockSessions.getSession(sessionId);

    return Boolean(
        session &&
        session.currentFlow === FLOWS.BOOKING &&
        session.bookingDraft &&
        session.status !== "booking_created"
    );
}

function getMissingFields(draft) {
    return REQUIRED_FIELDS.filter((field) => !draft[field]);
}

function detectTestType(message) {
    const normalizedMessage = normalizeText(message);

    const testTypeMappings = [
        {
            value: "Xét nghiệm đường huyết",
            keywords: ["duong huyet", "glucose", "tieu duong"]
        },
        {
            value: "Xét nghiệm mỡ máu",
            keywords: ["mo mau", "lipid", "cholesterol"]
        },
        {
            value: "Xét nghiệm công thức máu",
            keywords: ["cong thuc mau", "tong phan tich mau", "huyet hoc"]
        },
        {
            value: "Xét nghiệm nước tiểu",
            keywords: ["nuoc tieu", "urine"]
        },
        {
            value: "Xét nghiệm máu tổng quát",
            keywords: ["xet nghiem mau", "lay mau", "xet nghiem tong quat"]
        }
    ];

    for (const item of testTypeMappings) {
        const matched = item.keywords.some((keyword) =>
            normalizedMessage.includes(keyword)
        );

        if (matched) {
            return item.value;
        }
    }

    return null;
}

function detectPhoneNumber(message) {
    const match = String(message || "").match(/(\+84|0)\d(?:[\s.\-]?\d){8,10}/);

    if (!match) {
        return null;
    }

    return match[0].replace(/[\s.\-]/g, "");
}

function detectPatientName(message) {
    const nameMatch =
        String(message || "").match(/tên\s*[:\-]\s*([^\n,;]+)/i) ||
        String(message || "").match(/ten\s*[:\-]\s*([^\n,;]+)/i);

    if (!nameMatch) {
        return null;
    }

    return String(nameMatch[1] || "").trim();
}

function detectAddress(message) {
    const addressMatch =
        String(message || "").match(/địa chỉ\s*[:\-]\s*(.+)$/i) ||
        String(message || "").match(/dia chi\s*[:\-]\s*(.+)$/i) ||
        String(message || "").match(/address\s*[:\-]\s*(.+)$/i);

    if (!addressMatch) {
        return null;
    }

    return String(addressMatch[1] || "").trim();
}

function inferSingleFieldByContext(message, currentDraft) {
    const missingFields = getMissingFields(currentDraft);
    const firstMissingField = missingFields[0];
    const trimmedMessage = String(message || "").trim();

    if (!firstMissingField || !trimmedMessage) {
        return {};
    }

    if (firstMissingField === "address" && trimmedMessage.length >= 8) {
        if (
            !trimmedMessage.toLowerCase().startsWith("tên") &&
            !trimmedMessage.toLowerCase().startsWith("ten") &&
            !trimmedMessage.toLowerCase().startsWith("địa chỉ") &&
            !trimmedMessage.toLowerCase().startsWith("dia chi")
        ) {
            return { address: trimmedMessage };
        }
    }

    if (firstMissingField === "patientName") {
        const hasDigits = /\d/.test(trimmedMessage);
        const wordCount = trimmedMessage.split(/\s+/).length;

        if (!hasDigits && wordCount >= 2 && wordCount <= 6) {
            return { patientName: trimmedMessage };
        }
    }

    return {};
}

function extractBookingSlots(message, currentDraft) {
    const extracted = {};

    const testType = detectTestType(message);
    const appointmentDate = detectDateFromMessage(message);
    const appointmentTime = detectTimeFromMessage(message);
    const address = detectAddress(message);
    const patientName = detectPatientName(message);
    const phoneNumber = detectPhoneNumber(message);

    if (testType) extracted.testType = testType;
    if (appointmentDate) extracted.appointmentDate = appointmentDate;
    if (appointmentTime) extracted.appointmentTime = appointmentTime;
    if (address) extracted.address = address;
    if (patientName) extracted.patientName = patientName;
    if (phoneNumber) extracted.phoneNumber = phoneNumber;

    const contextInference = inferSingleFieldByContext(message, {
        ...currentDraft,
        ...extracted
    });

    return {
        ...extracted,
        ...contextInference
    };
}

function buildKnownFieldsText(draft) {
    const knownParts = [];

    if (draft.testType) {
        knownParts.push(`${FIELD_LABELS.testType}: ${draft.testType}`);
    }

    if (draft.appointmentDate) {
        knownParts.push(
            `${FIELD_LABELS.appointmentDate}: ${formatDisplayDate(draft.appointmentDate)}`
        );
    }

    if (draft.appointmentTime) {
        knownParts.push(`${FIELD_LABELS.appointmentTime}: ${draft.appointmentTime}`);
    }

    if (draft.address) {
        knownParts.push(`${FIELD_LABELS.address}: ${draft.address}`);
    }

    if (draft.patientName) {
        knownParts.push(`${FIELD_LABELS.patientName}: ${draft.patientName}`);
    }

    if (draft.phoneNumber) {
        knownParts.push(`${FIELD_LABELS.phoneNumber}: ${draft.phoneNumber}`);
    }

    return knownParts;
}

function buildCollectingReply(draft, missingFields) {
    const knownFields = buildKnownFieldsText(draft);
    const nextField = missingFields[0];

    let reply = "Mình đang hỗ trợ bạn đặt lịch xét nghiệm/lấy mẫu tại nhà.";

    if (knownFields.length > 0) {
        reply += ` Hiện mình đã ghi nhận: ${knownFields.join("; ")}.`;
    }

    reply += ` Bạn vui lòng cung cấp thêm ${FIELD_PROMPTS[nextField]}.`;

    return reply;
}

function buildReadyReply(draft) {
    const summary = [
        `${FIELD_LABELS.testType}: ${draft.testType}`,
        `${FIELD_LABELS.appointmentDate}: ${formatDisplayDate(draft.appointmentDate)}`,
        `${FIELD_LABELS.appointmentTime}: ${draft.appointmentTime}`,
        `${FIELD_LABELS.address}: ${draft.address}`,
        `${FIELD_LABELS.patientName}: ${draft.patientName}`,
        `${FIELD_LABELS.phoneNumber}: ${draft.phoneNumber}`
    ];

    return (
        "Mình đã thu thập đủ thông tin booking draft cho bạn: " +
        summary.join("; ") +
        ". Nếu bạn đồng ý tạo lịch hẹn, hãy trả lời: 'xác nhận'."
    );
}

function buildCreatedReply(booking) {
    return (
        `Đã tạo lịch hẹn thành công. Mã booking của bạn là ${booking.bookingId}. ` +
        `Thông tin đã ghi nhận gồm: ` +
        `${FIELD_LABELS.testType}: ${booking.testType}; ` +
        `${FIELD_LABELS.appointmentDate}: ${formatDisplayDate(booking.appointmentDate)}; ` +
        `${FIELD_LABELS.appointmentTime}: ${booking.appointmentTime}; ` +
        `${FIELD_LABELS.address}: ${booking.address}; ` +
        `${FIELD_LABELS.patientName}: ${booking.patientName}; ` +
        `${FIELD_LABELS.phoneNumber}: ${booking.phoneNumber}.`
    );
}

function isConfirmationMessage(message) {
    const normalizedMessage = normalizeText(message);

    const confirmationKeywords = [
        "xac nhan",
        "ok",
        "dong y",
        "dat lich di",
        "xac nhan dat lich"
    ];

    return confirmationKeywords.some((keyword) =>
        normalizedMessage.includes(keyword)
    );
}

function buildBookingPayloadFromDraft(draft, sessionId) {
    return {
        sessionId,
        testType: draft.testType,
        appointmentDate: draft.appointmentDate,
        appointmentTime: draft.appointmentTime,
        address: draft.address,
        patientName: draft.patientName,
        phoneNumber: draft.phoneNumber
    };
}

async function handleBookingMessage({ message, sessionId }) {
    let session = mockSessions.getSession(sessionId);

    if (!session || session.currentFlow !== FLOWS.BOOKING) {
        session = mockSessions.upsertSession(sessionId, {
            currentFlow: FLOWS.BOOKING,
            status: "collecting_info",
            bookingDraft: getEmptyBookingDraft(),
            confirmedBookingId: null
        });
    }

    if (session.status === "booking_created" && session.confirmedBookingId) {
        const existingBooking = mockBookings.getBookingById(
            session.confirmedBookingId
        );

        if (existingBooking) {
            return createChatResult({
                sessionId,
                userMessage: message,
                flow: FLOWS.BOOKING,
                action: ACTIONS.BOOKING_ALREADY_CREATED,
                reply:
                    `Booking của bạn đã được tạo trước đó với mã ${existingBooking.bookingId}. ` +
                    "Ở bước tiếp theo, mình sẽ làm thêm flow đổi lịch và hủy lịch thật.",
                booking: existingBooking,
                meta: {
                    handledBy: "booking.service",
                    sessionState: session.status,
                    extractedSlots: {},
                    missingFields: [],
                    nextExpectedField: null
                }
            });
        }
    }

    const currentDraft = session.bookingDraft || getEmptyBookingDraft();
    const extractedSlots = extractBookingSlots(message, currentDraft);
    const nextDraft = {
        ...currentDraft,
        ...extractedSlots
    };

    const missingFields = getMissingFields(nextDraft);

    let status = "collecting_info";
    let action = ACTIONS.ASK_BOOKING_INFO;
    let reply = buildCollectingReply(nextDraft, missingFields);
    let booking = {
        status: "draft",
        draft: nextDraft
    };

    if (missingFields.length === 0) {
        status = "ready_for_confirmation";
        action = ACTIONS.BOOKING_READY_TO_CONFIRM;
        reply = buildReadyReply(nextDraft);
        booking = {
            status: "ready_for_confirmation",
            draft: nextDraft
        };

        if (isConfirmationMessage(message)) {
            const createdBooking = mockBookings.createBooking(
                buildBookingPayloadFromDraft(nextDraft, sessionId)
            );

            status = "booking_created";
            action = ACTIONS.BOOKING_CREATED;
            reply = buildCreatedReply(createdBooking);
            booking = createdBooking;

            const updatedSession = mockSessions.upsertSession(sessionId, {
                currentFlow: FLOWS.BOOKING,
                status,
                bookingDraft: nextDraft,
                confirmedBookingId: createdBooking.bookingId
            });

            return createChatResult({
                sessionId,
                userMessage: message,
                flow: FLOWS.BOOKING,
                action,
                reply,
                booking,
                meta: {
                    handledBy: "booking.service",
                    sessionState: updatedSession.status,
                    extractedSlots,
                    missingFields: [],
                    nextExpectedField: null,
                    confirmedBookingId: createdBooking.bookingId
                }
            });
        }
    }

    const updatedSession = mockSessions.upsertSession(sessionId, {
        currentFlow: FLOWS.BOOKING,
        status,
        bookingDraft: nextDraft,
        confirmedBookingId: session.confirmedBookingId || null
    });

    return createChatResult({
        sessionId,
        userMessage: message,
        flow: FLOWS.BOOKING,
        action,
        reply,
        booking,
        meta: {
            handledBy: "booking.service",
            sessionState: updatedSession.status,
            extractedSlots,
            missingFields,
            nextExpectedField: missingFields[0] || null,
            confirmedBookingId: updatedSession.confirmedBookingId || null
        }
    });
}

module.exports = {
    handleBookingMessage,
    hasActiveBookingSession
};