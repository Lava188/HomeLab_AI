const mockSessions = require("../data/mockSessions");
const bookingRuntime = require("./booking-runtime/booking.service");
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
        "loại xét nghiệm/gói xét nghiệm bạn muốn đặt. Ví dụ: công thức máu, HbA1c, mỡ máu, chức năng gan",
    appointmentDate:
        "ngày lấy mẫu. Ví dụ: ngày mai, hôm nay, hoặc 27/03/2026",
    appointmentTime:
        "giờ lấy mẫu. Ví dụ: 7h30, 8h, 14:00",
    address:
        "địa chỉ lấy mẫu. Ví dụ: 12 Nguyễn Trãi, Quận 1",
    patientName:
        "tên người đặt. Ví dụ: tên Nguyễn Văn A",
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
            value: "Công thức máu",
            keywords: ["cong thuc mau", "tong phan tich mau", "huyet hoc", "cbc"]
        },
        {
            value: "HbA1c",
            keywords: ["hba1c"]
        },
        {
            value: "Mỡ máu",
            keywords: ["mo mau", "lipid", "cholesterol"]
        },
        {
            value: "Chức năng gan",
            keywords: ["chuc nang gan", "men gan", "alt", "ast"]
        },
        {
            value: "Chức năng thận",
            keywords: ["chuc nang than", "creatinine", "egfr"]
        },
        {
            value: "Xét nghiệm tổng quát",
            keywords: ["xet nghiem tong quat", "kiem tra tong quat"]
        }
    ];

    for (const item of testTypeMappings) {
        if (item.keywords.some((keyword) => normalizedMessage.includes(keyword))) {
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
    const match = String(message || "").match(
        /(?:\btên\b|\bten\b)\s*[:\-]?\s*([^,;.]+)/i
    );

    if (!match) {
        return null;
    }

    return String(match[1] || "").trim();
}

function detectAddress(message) {
    const text = String(message || "");
    const explicitMatch = text.match(
        /(?:địa chỉ|dia chi|address)\s*[:\-]\s*([^;.]+)/i
    );

    if (explicitMatch) {
        return String(explicitMatch[1] || "")
            .replace(/,\s*(tên|ten|số điện thoại|so dien thoai|sdt|phone)\b.*$/i, "")
            .trim();
    }

    const atMatch = text.match(
        /(?:\btại\b|\btai\b|\bở\b|\bo\b)\s+(.+?)(?:,\s*(?:tên|ten|số điện thoại|so dien thoai|sdt|phone)\b|$)/i
    );

    if (!atMatch) {
        return null;
    }

    const candidate = String(atMatch[1] || "").trim();

    if (!/\d/.test(candidate) || candidate.length < 6) {
        return null;
    }

    return candidate;
}

function inferSingleFieldByContext(message, currentDraft) {
    const missingFields = getMissingFields(currentDraft);
    const firstMissingField = missingFields[0];
    const trimmedMessage = String(message || "").trim();

    if (!firstMissingField || !trimmedMessage) {
        return {};
    }

    if (firstMissingField === "address" && trimmedMessage.length >= 8) {
        const normalized = normalizeText(trimmedMessage);

        if (
            !normalized.startsWith("ten") &&
            !normalized.startsWith("dia chi") &&
            !normalized.startsWith("sdt") &&
            !detectPhoneNumber(trimmedMessage)
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

    if (draft.testType) knownParts.push(`${FIELD_LABELS.testType}: ${draft.testType}`);
    if (draft.appointmentDate) {
        knownParts.push(
            `${FIELD_LABELS.appointmentDate}: ${formatDisplayDate(draft.appointmentDate)}`
        );
    }
    if (draft.appointmentTime) {
        knownParts.push(`${FIELD_LABELS.appointmentTime}: ${draft.appointmentTime}`);
    }
    if (draft.address) knownParts.push(`${FIELD_LABELS.address}: ${draft.address}`);
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
        "Mình đã có đủ thông tin để đặt lịch. Bạn kiểm tra lại giúp mình: " +
        summary.join("; ") +
        ". Nếu đúng, hãy trả lời 'Xác nhận' hoặc 'Đồng ý' để mình tạo lịch hẹn."
    );
}

function buildCreatedReply(booking) {
    return (
        `Đã tạo lịch hẹn thành công. Mã đặt lịch của bạn là ${booking.bookingCode}. ` +
        `Thông tin đã ghi nhận gồm: ` +
        `${FIELD_LABELS.testType}: ${booking.testName || booking.testTypeText}; ` +
        `${FIELD_LABELS.appointmentDate}: ${formatDisplayDate(booking.sampleDate)}; ` +
        `${FIELD_LABELS.appointmentTime}: ${booking.sampleTimeStart}; ` +
        `${FIELD_LABELS.address}: ${booking.address}; ` +
        `${FIELD_LABELS.patientName}: ${booking.patientName}; ` +
        `${FIELD_LABELS.phoneNumber}: ${booking.phone}.`
    );
}

function isConfirmationMessage(message) {
    const normalizedMessage = normalizeText(message);

    const confirmationKeywords = [
        "xac nhan",
        "ok",
        "dong y",
        "dat lich",
        "ok dat lich",
        "tao lich"
    ];

    return confirmationKeywords.some((keyword) =>
        normalizedMessage.includes(keyword)
    );
}

function buildRuntimePayloadFromDraft(draft) {
    return {
        testTypeText: draft.testType,
        sampleDate: draft.appointmentDate,
        sampleTimeStart: draft.appointmentTime,
        address: draft.address,
        patientName: draft.patientName,
        phone: draft.phoneNumber
    };
}

async function persistDraft(sessionId, draft, missingFields) {
    if (!sessionId) return;

    await bookingRuntime.saveOrUpdateDraft(sessionId, draft, missingFields);
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

    const currentDraft = session.bookingDraft || getEmptyBookingDraft();
    const extractedSlots = extractBookingSlots(message, currentDraft);
    const nextDraft = {
        ...currentDraft,
        ...extractedSlots
    };
    const missingFields = getMissingFields(nextDraft);
    const canCreateFromConfirmation =
        isConfirmationMessage(message) &&
        getMissingFields(currentDraft).length === 0 &&
        Object.keys(extractedSlots).length === 0;

    if (canCreateFromConfirmation) {
        const createdBooking = await bookingRuntime.createConfirmedBooking(
            buildRuntimePayloadFromDraft(currentDraft),
            { sessionId, createdSource: "CHAT" }
        );

        const updatedSession = mockSessions.upsertSession(sessionId, {
            currentFlow: FLOWS.BOOKING,
            status: "booking_created",
            bookingDraft: currentDraft,
            confirmedBookingId: createdBooking.bookingCode
        });

        return createChatResult({
            sessionId,
            userMessage: message,
            flow: FLOWS.BOOKING,
            action: ACTIONS.BOOKING_CREATED,
            reply: buildCreatedReply(createdBooking),
            booking: createdBooking,
            meta: {
                handledBy: "booking.service",
                sessionState: updatedSession.status,
                extractedSlots,
                missingFields: [],
                nextExpectedField: null,
                confirmedBookingId: createdBooking.bookingCode
            }
        });
    }

    let status = "collecting_info";
    let action = ACTIONS.ASK_BOOKING_INFO;
    let reply = buildCollectingReply(nextDraft, missingFields);
    let booking = {
        status: "draft",
        draft: nextDraft,
        missingFields
    };

    if (missingFields.length === 0) {
        status = "ready_for_confirmation";
        action = ACTIONS.BOOKING_READY_TO_CONFIRM;
        reply = buildReadyReply(nextDraft);
        booking = {
            status: "pending_confirmation",
            draft: nextDraft,
            missingFields: []
        };
    }

    await persistDraft(sessionId, nextDraft, missingFields);

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
