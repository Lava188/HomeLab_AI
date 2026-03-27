const safetyService = require("./safety.service");
const ragService = require("./rag.service");
const bookingService = require("./booking.service");
const rescheduleService = require("./reschedule.service");
const cancelService = require("./cancel.service");

function removeVietnameseTones(text) {
    return text
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/Đ/g, "D");
}

function normalizeText(text) {
    return removeVietnameseTones(text || "")
        .toLowerCase()
        .trim();
}

function hasAnyKeyword(text, keywords) {
    return keywords.some((keyword) => text.includes(keyword));
}

function detectFlow(message) {
    const normalizedMessage = normalizeText(message);

    const bookingKeywords = [
        "dat lich",
        "book lich",
        "dang ky lich",
        "lay mau tai nha",
        "xet nghiem tai nha",
        "toi muon xet nghiem",
        "toi muon dat lich"
    ];

    const rescheduleKeywords = [
        "doi lich",
        "doi hen",
        "doi ngay",
        "doi gio",
        "reschedule",
        "chuyen lich",
        "doi lich hen"
    ];

    const cancelKeywords = [
        "huy lich",
        "huy hen",
        "cancel lich",
        "khong dat nua",
        "toi muon huy",
        "xac nhan huy"
    ];

    const healthRagKeywords = [
        "xet nghiem",
        "nhin an",
        "duong huyet",
        "mo mau",
        "chi so",
        "suc khoe",
        "trieu chung",
        "can chuan bi gi",
        "co y nghia gi",
        "tu van",
        "mau",
        "nuoc tieu"
    ];

    if (hasAnyKeyword(normalizedMessage, rescheduleKeywords)) {
        return {
            flow: "reschedule",
            action: "START_RESCHEDULE"
        };
    }

    if (hasAnyKeyword(normalizedMessage, cancelKeywords)) {
        return {
            flow: "cancel",
            action: "START_CANCEL"
        };
    }

    if (hasAnyKeyword(normalizedMessage, bookingKeywords)) {
        return {
            flow: "booking",
            action: "START_BOOKING"
        };
    }

    if (hasAnyKeyword(normalizedMessage, healthRagKeywords)) {
        return {
            flow: "health_rag",
            action: "ANSWER_HEALTH_QUERY"
        };
    }

    return {
        flow: "fallback",
        action: "FALLBACK_RESPONSE",
        reply:
            "Xin lỗi, hiện tại mình chưa hiểu rõ yêu cầu của bạn. Bạn có thể hỏi về tư vấn sức khỏe cơ bản, đặt lịch xét nghiệm tại nhà, đổi lịch hoặc hủy lịch."
    };
}

async function routeMessage({ message, sessionId }) {
    const safetyResult = safetyService.checkSafety({ message });

    if (!safetyResult.isSafe) {
        return {
            sessionId,
            userMessage: message,
            flow: safetyResult.flow,
            action: safetyResult.action,
            reply: safetyResult.reply,
            booking: null,
            meta: {
                routedBy: "router.service",
                version: "mvp-rule-based-v6",
                safety: safetyResult.meta
            }
        };
    }

    const routeResult = detectFlow(message);

    if (routeResult.flow === "health_rag") {
        const ragResult = await ragService.answerHealthQuery({
            message,
            sessionId
        });

        return {
            ...ragResult,
            meta: {
                ...ragResult.meta,
                routedBy: "router.service",
                version: "mvp-rule-based-v6",
                safety: safetyResult.meta
            }
        };
    }

    if (routeResult.flow === "booking") {
        const bookingResult = await bookingService.handleBookingMessage({
            message,
            sessionId
        });

        return {
            ...bookingResult,
            meta: {
                ...bookingResult.meta,
                routedBy: "router.service",
                version: "mvp-rule-based-v6",
                safety: safetyResult.meta
            }
        };
    }

    if (routeResult.flow === "reschedule") {
        const rescheduleResult = await rescheduleService.handleRescheduleMessage({
            message,
            sessionId
        });

        return {
            ...rescheduleResult,
            meta: {
                ...rescheduleResult.meta,
                routedBy: "router.service",
                version: "mvp-rule-based-v6",
                safety: safetyResult.meta
            }
        };
    }

    if (routeResult.flow === "cancel") {
        const cancelResult = await cancelService.handleCancelMessage({
            message,
            sessionId
        });

        return {
            ...cancelResult,
            meta: {
                ...cancelResult.meta,
                routedBy: "router.service",
                version: "mvp-rule-based-v6",
                safety: safetyResult.meta
            }
        };
    }

    if (
        routeResult.flow === "fallback" &&
        bookingService.hasActiveBookingSession(sessionId)
    ) {
        const bookingContinuationResult =
            await bookingService.handleBookingMessage({
                message,
                sessionId
            });

        return {
            ...bookingContinuationResult,
            meta: {
                ...bookingContinuationResult.meta,
                routedBy: "router.service",
                version: "mvp-rule-based-v6",
                safety: safetyResult.meta
            }
        };
    }

    if (
        routeResult.flow === "fallback" &&
        rescheduleService.hasActiveRescheduleSession(sessionId)
    ) {
        const rescheduleContinuationResult =
            await rescheduleService.handleRescheduleMessage({
                message,
                sessionId
            });

        return {
            ...rescheduleContinuationResult,
            meta: {
                ...rescheduleContinuationResult.meta,
                routedBy: "router.service",
                version: "mvp-rule-based-v6",
                safety: safetyResult.meta
            }
        };
    }

    if (
        routeResult.flow === "fallback" &&
        cancelService.hasActiveCancelSession(sessionId)
    ) {
        const cancelContinuationResult =
            await cancelService.handleCancelMessage({
                message,
                sessionId
            });

        return {
            ...cancelContinuationResult,
            meta: {
                ...cancelContinuationResult.meta,
                routedBy: "router.service",
                version: "mvp-rule-based-v6",
                safety: safetyResult.meta
            }
        };
    }

    return {
        sessionId,
        userMessage: message,
        flow: routeResult.flow,
        action: routeResult.action,
        reply: routeResult.reply,
        booking: null,
        meta: {
            routedBy: "router.service",
            version: "mvp-rule-based-v6",
            safety: safetyResult.meta
        }
    };
}

module.exports = {
    routeMessage
};