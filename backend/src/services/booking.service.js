const mockSessions = require("../data/mockSessions");
const bookingRuntime = require("./booking-runtime/booking.service");
const BookingRuntimeError = require("./booking-runtime/booking-runtime-error");
const { FLOWS, ACTIONS } = require("../constants/chat.constants");
const { createChatResult } = require("../utils/chat-response.util");
const {
    formatSlotErrorMessage,
    isBookingSlotError
} = require("./booking-response.service");
const {
    normalizeText,
    detectDateFromMessage,
    detectTimeFromMessage,
    formatDisplayDate
} = require("../utils/text.util");
const { normalizePhone } = require("./booking-runtime/booking-validation.service");
const packageCatalog = require("./booking-package-catalog.service");

const REQUIRED_FIELDS = [
    "testType",
    "appointmentDate",
    "appointmentTime",
    "address",
    "patientName",
    "phoneNumber"
];

const FIELD_LABELS = {
    testType: "Gói/xét nghiệm",
    appointmentDate: "Ngày lấy mẫu",
    appointmentTime: "Giờ lấy mẫu",
    address: "Địa chỉ",
    patientName: "Tên người đặt",
    phoneNumber: "Số điện thoại"
};

const FIELD_PROMPTS = {
    testType: `gói/xét nghiệm bạn muốn đặt. HomeLab hiện có: ${packageCatalog.buildPackageListText()}`,
    appointmentDate:
        "ngày lấy mẫu. Ví dụ: ngày mai, hôm nay, hoặc 27/03/2026",
    appointmentTime: "giờ lấy mẫu. Ví dụ: 7h30, 8h, 14:00",
    address: "địa chỉ lấy mẫu. Ví dụ: 12 Nguyễn Trãi, Quận 1",
    patientName: "tên người đặt. Ví dụ: tên Nguyễn Văn A",
    phoneNumber: "số điện thoại liên hệ. Ví dụ: 0912345678"
};

function getEmptyBookingDraft() {
    return {
        testType: null,
        appointmentDate: null,
        appointmentTime: null,
        address: null,
        patientName: null,
        phoneNumber: null,
        testCatalogItemId: null,
        selectedPackage: null,
        packageConfirmed: false
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

async function suspendActiveBookingSession(sessionId) {
    if (!sessionId) {
        return {
            clearedMemorySession: false,
            clearedDraftCount: 0
        };
    }

    const clearedMemorySession = mockSessions.clearSession(sessionId);
    const clearedDraft = await bookingRuntime.clearDraft(sessionId);

    return {
        clearedMemorySession,
        clearedDraftCount: clearedDraft?.count || 0
    };
}

function getMissingFields(draft) {
    return REQUIRED_FIELDS.filter((field) => !draft[field]);
}

async function detectPackageSelection(message) {
    const intent = await packageCatalog.resolvePackageIntent(message);

    if (intent.type !== "selected" || !intent.package) {
        return { intent, slots: {} };
    }

    return {
        intent,
        slots: {
            testType: intent.package.name,
            testCatalogItemId: intent.package.id,
            selectedPackage: intent.package,
            packageConfirmed: false
        }
    };
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
        /(?:địa chỉ|dia chi|address)\s*[:\-]?\s*([^;.]+)/i
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

async function extractBookingSlots(message, currentDraft) {
    const extracted = {};
    const { intent: packageIntent, slots: packageSlots } =
        await detectPackageSelection(message);
    const appointmentDate = detectDateFromMessage(message);
    const appointmentTime = detectTimeFromMessage(message);
    const address = detectAddress(message);
    const patientName = detectPatientName(message);
    const phoneNumber = detectPhoneNumber(message);

    Object.assign(extracted, packageSlots);

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
        slots: {
            ...extracted,
            ...contextInference
        },
        packageIntent
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

function buildDifferentPhoneReply(sessionPhone) {
    return `Lịch hẹn sẽ được tạo theo số điện thoại tài khoản đang đăng nhập: ${sessionPhone}. Nếu bạn muốn đặt cho số khác, vui lòng đăng xuất và đăng nhập bằng tài khoản phù hợp.`;
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
        testCatalogItemId: draft.testCatalogItemId || draft.selectedPackage?.id || null,
        testTypeText: draft.selectedPackage?.name || draft.testType,
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

function buildBookingMeta({
    updatedSession,
    extractedSlots,
    packageIntent,
    missingFields,
    nextExpectedField
}) {
    return {
        handledBy: "booking.service",
        sessionState: updatedSession.status,
        extractedSlots,
        missingFields,
        nextExpectedField: nextExpectedField || null,
        confirmedBookingId: updatedSession.confirmedBookingId || null,
        packageIntent: packageIntent?.type || null,
        packageCandidates:
            packageIntent?.type === "ambiguous" ? packageIntent.candidates : undefined,
        selectedPackage:
            packageIntent?.package || updatedSession.bookingDraft?.selectedPackage || null,
        packageConfirmed:
            Boolean(updatedSession.bookingDraft?.packageConfirmed)
    };
}

async function returnDraftResult({
    sessionId,
    message,
    status,
    action,
    reply,
    booking,
    draft,
    missingFields,
    extractedSlots,
    packageIntent,
    nextExpectedField
}) {
    await persistDraft(sessionId, draft, missingFields);

    const updatedSession = mockSessions.upsertSession(sessionId, {
        currentFlow: FLOWS.BOOKING,
        status,
        bookingDraft: draft,
        confirmedBookingId: null
    });

    return createChatResult({
        sessionId,
        userMessage: message,
        flow: FLOWS.BOOKING,
        action,
        reply,
        booking,
        meta: buildBookingMeta({
            updatedSession,
            extractedSlots,
            packageIntent,
            missingFields,
            nextExpectedField
        })
    });
}

async function handleBookingMessage({ message, sessionId, userSession = {} }) {
    const sessionPhone = normalizePhone(userSession.phone || "");
    let session = mockSessions.getSession(sessionId);

    if (!session || session.currentFlow !== FLOWS.BOOKING) {
        session = mockSessions.upsertSession(sessionId, {
            currentFlow: FLOWS.BOOKING,
            status: "collecting_info",
            bookingDraft: getEmptyBookingDraft(),
            confirmedBookingId: null
        });
    }

    const currentDraft = {
        ...getEmptyBookingDraft(),
        ...(session.bookingDraft || {})
    };
    const { slots: extractedSlots, packageIntent } = await extractBookingSlots(
        message,
        currentDraft
    );
    const extractedPhone = normalizePhone(extractedSlots.phoneNumber || "");

    if (sessionPhone && extractedPhone && extractedPhone !== sessionPhone) {
        return createChatResult({
            sessionId,
            userMessage: message,
            flow: FLOWS.BOOKING,
            action: ACTIONS.ASK_BOOKING_INFO,
            reply: buildDifferentPhoneReply(sessionPhone),
            booking: null,
            meta: {
                handledBy: "booking.service",
                sessionState: "phone_mismatch",
                authRequired: false,
                sessionPhone,
                rejectedPhone: extractedPhone
            }
        });
    }

    if (packageIntent.type === "ambiguous" && !currentDraft.selectedPackage) {
        const nextDraft = {
            ...currentDraft,
            ...(sessionPhone ? { phoneNumber: sessionPhone } : {})
        };
        const missingFields = getMissingFields(nextDraft);

        return returnDraftResult({
            sessionId,
            message,
            status: "collecting_package",
            action: ACTIONS.ASK_BOOKING_INFO,
            reply: packageCatalog.buildAmbiguousPackageReply(),
            booking: {
                status: "draft",
                draft: nextDraft,
                missingFields
            },
            draft: nextDraft,
            missingFields,
            extractedSlots,
            packageIntent,
            nextExpectedField: "testType"
        });
    }

    const nextDraft = {
        ...currentDraft,
        ...extractedSlots,
        ...(sessionPhone ? { phoneNumber: sessionPhone } : {})
    };
    const missingFields = getMissingFields(nextDraft);

    if (
        isConfirmationMessage(message) &&
        currentDraft.selectedPackage &&
        !currentDraft.packageConfirmed &&
        Object.keys(extractedSlots).length === 0
    ) {
        const confirmedDraft = {
            ...nextDraft,
            packageConfirmed: true
        };
        const confirmedMissingFields = getMissingFields(confirmedDraft);

        if (confirmedMissingFields.length > 0) {
            return returnDraftResult({
                sessionId,
                message,
                status: "collecting_info",
                action: ACTIONS.ASK_BOOKING_INFO,
                reply: buildCollectingReply(confirmedDraft, confirmedMissingFields),
                booking: {
                    status: "draft",
                    draft: confirmedDraft,
                    missingFields: confirmedMissingFields
                },
                draft: confirmedDraft,
                missingFields: confirmedMissingFields,
                extractedSlots,
                packageIntent,
                nextExpectedField: confirmedMissingFields[0]
            });
        }

        let createdBooking = null;

        try {
            createdBooking = await bookingRuntime.createConfirmedBooking(
                buildRuntimePayloadFromDraft(confirmedDraft),
                { sessionId, createdSource: "CHAT" }
            );
        } catch (error) {
            if (!(error instanceof BookingRuntimeError)) {
                throw error;
            }

            const isSlotError = isBookingSlotError(error);

            return createChatResult({
                sessionId,
                userMessage: message,
                flow: FLOWS.BOOKING,
                action: ACTIONS.BOOKING_READY_TO_CONFIRM,
                reply: isSlotError
                    ? formatSlotErrorMessage(error, {
                        mode: "booking",
                        draft: confirmedDraft
                    })
                    : "Mình chưa thể tạo lịch hẹn với thông tin hiện tại. Bạn vui lòng kiểm tra lại thông tin đặt lịch hoặc liên hệ HomeLab để được hỗ trợ.",
                booking: {
                    status: "pending_confirmation",
                    draft: confirmedDraft,
                    missingFields: []
                },
                meta: {
                    handledBy: "booking.service",
                    sessionState: "slot_blocked",
                    extractedSlots,
                    missingFields: [],
                    nextExpectedField: "appointmentTime",
                    selectedPackage: confirmedDraft.selectedPackage || null,
                    packageConfirmed: true,
                    ...(isSlotError ? {} : { errorCode: error.code })
                }
            });
        }

        const updatedSession = mockSessions.upsertSession(sessionId, {
            currentFlow: FLOWS.BOOKING,
            status: "booking_created",
            bookingDraft: confirmedDraft,
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
                selectedPackage: confirmedDraft.selectedPackage || null,
                packageConfirmed: true,
                confirmedBookingId: createdBooking.bookingCode
            }
        });
    }

    if (nextDraft.selectedPackage && !nextDraft.packageConfirmed) {
        return returnDraftResult({
            sessionId,
            message,
            status: "confirming_package",
            action: ACTIONS.ASK_BOOKING_INFO,
            reply: packageCatalog.buildPackageConfirmationReply(
                nextDraft.selectedPackage
            ),
            booking: {
                status: "draft",
                draft: nextDraft,
                missingFields
            },
            draft: nextDraft,
            missingFields,
            extractedSlots,
            packageIntent,
            nextExpectedField: "packageConfirmation"
        });
    }

    const currentDraftForCreate = {
        ...currentDraft,
        ...(sessionPhone ? { phoneNumber: sessionPhone } : {})
    };
    const canCreateFromConfirmation =
        isConfirmationMessage(message) &&
        currentDraftForCreate.packageConfirmed === true &&
        getMissingFields(currentDraftForCreate).length === 0 &&
        Object.keys(extractedSlots).length === 0;

    if (canCreateFromConfirmation) {
        let createdBooking = null;

        try {
            createdBooking = await bookingRuntime.createConfirmedBooking(
                buildRuntimePayloadFromDraft(currentDraftForCreate),
                { sessionId, createdSource: "CHAT" }
            );
        } catch (error) {
            if (!(error instanceof BookingRuntimeError)) {
                throw error;
            }

            const isSlotError = isBookingSlotError(error);

            return createChatResult({
                sessionId,
                userMessage: message,
                flow: FLOWS.BOOKING,
                action: ACTIONS.BOOKING_READY_TO_CONFIRM,
                reply: isSlotError
                    ? formatSlotErrorMessage(error, {
                        mode: "booking",
                        draft: currentDraftForCreate
                    })
                    : "Mình chưa thể tạo lịch hẹn với thông tin hiện tại. Bạn vui lòng kiểm tra lại thông tin đặt lịch hoặc liên hệ HomeLab để được hỗ trợ.",
                booking: {
                    status: "pending_confirmation",
                    draft: currentDraftForCreate,
                    missingFields: []
                },
                meta: {
                    handledBy: "booking.service",
                    sessionState: "slot_blocked",
                    extractedSlots,
                    missingFields: [],
                    nextExpectedField: "appointmentTime",
                    selectedPackage: currentDraftForCreate.selectedPackage || null,
                    packageConfirmed: true,
                    ...(isSlotError ? {} : { errorCode: error.code })
                }
            });
        }

        const updatedSession = mockSessions.upsertSession(sessionId, {
            currentFlow: FLOWS.BOOKING,
            status: "booking_created",
            bookingDraft: currentDraftForCreate,
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
                selectedPackage: currentDraftForCreate.selectedPackage || null,
                packageConfirmed: true,
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

    return returnDraftResult({
        sessionId,
        message,
        status,
        action,
        reply,
        booking,
        draft: nextDraft,
        missingFields,
        extractedSlots,
        packageIntent,
        nextExpectedField: missingFields[0] || null
    });
}

module.exports = {
    handleBookingMessage,
    hasActiveBookingSession,
    suspendActiveBookingSession
};
