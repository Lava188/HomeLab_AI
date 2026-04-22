const safetyService = require("./safety.service");
const ragService = require("./rag.service");
const bookingService = require("./booking.service");
const rescheduleService = require("./reschedule.service");
const cancelService = require("./cancel.service");
const { detectFlow } = require("./router-intent.service");

const {
    CHAT_ENGINE_VERSION,
    FLOWS
} = require("../constants/chat.constants");
const { createChatResult } = require("../utils/chat-response.util");
const { normalizeText } = require("../utils/text.util");

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
        "nuoc tieu",
        "dau nguc",
        "tuc nguc",
        "kho tho",
        "tho doc",
        "tim moi",
        "tim tai",
        "nhiem trung",
        "sepsis",
        "sot cao",
        "xau di nhanh"
    ];

    if (hasAnyKeyword(normalizedMessage, rescheduleKeywords)) {
        return { flow: FLOWS.RESCHEDULE };
    }

    if (hasAnyKeyword(normalizedMessage, cancelKeywords)) {
        return { flow: FLOWS.CANCEL };
    }

    if (hasAnyKeyword(normalizedMessage, bookingKeywords)) {
        return { flow: FLOWS.BOOKING };
    }

    if (hasAnyKeyword(normalizedMessage, healthRagKeywords)) {
        return { flow: FLOWS.HEALTH_RAG };
    }

    return {
        flow: FLOWS.FALLBACK,
        action: ACTIONS.FALLBACK_RESPONSE,
        reply:
            "Xin lỗi, hiện tại mình chưa hiểu rõ yêu cầu của bạn. Bạn có thể hỏi về tư vấn sức khỏe cơ bản, đặt lịch xét nghiệm tại nhà, đổi lịch hoặc hủy lịch."
    };
}

function mergeRouterMeta(result, safetyMeta) {
    return {
        ...result.meta,
        routedBy: "router.service",
        version: CHAT_ENGINE_VERSION,
        safety: safetyMeta,
        routing: routeResult?.routerDebug || null
    };
}

async function routeMessage({ message, sessionId }) {
    const safetyResult = safetyService.checkSafety({ message });

    if (!safetyResult.isSafe) {
        return createChatResult({
            sessionId,
            userMessage: message,
            flow: safetyResult.flow,
            action: safetyResult.action,
            reply: safetyResult.reply,
            booking: null,
            meta: {
                routedBy: "router.service",
                version: CHAT_ENGINE_VERSION,
                safety: safetyResult.meta,
                routing: null
            }
        });
    }

    const routeResult = detectFlow(message);

    if (routeResult.flow === FLOWS.HEALTH_RAG) {
        const ragResult = await ragService.answerHealthQuery({
            message,
            sessionId
        });

        return {
            ...ragResult,
            meta: mergeRouterMeta(ragResult, safetyResult.meta, routeResult)
        };
    }

    if (routeResult.flow === FLOWS.BOOKING) {
        const bookingResult = await bookingService.handleBookingMessage({
            message,
            sessionId
        });

        return {
            ...bookingResult,
            meta: mergeRouterMeta(bookingResult, safetyResult.meta, routeResult)
        };
    }

    if (routeResult.flow === FLOWS.RESCHEDULE) {
        const rescheduleResult = await rescheduleService.handleRescheduleMessage({
            message,
            sessionId
        });

        return {
            ...rescheduleResult,
            meta: mergeRouterMeta(
                rescheduleResult,
                safetyResult.meta,
                routeResult
            )
        };
    }

    if (routeResult.flow === FLOWS.CANCEL) {
        const cancelResult = await cancelService.handleCancelMessage({
            message,
            sessionId
        });

        return {
            ...cancelResult,
            meta: mergeRouterMeta(cancelResult, safetyResult.meta, routeResult)
        };
    }

    if (
        routeResult.flow === FLOWS.FALLBACK &&
        bookingService.hasActiveBookingSession(sessionId)
    ) {
        const bookingContinuationResult =
            await bookingService.handleBookingMessage({
                message,
                sessionId
            });

        return {
            ...bookingContinuationResult,
            meta: mergeRouterMeta(
                bookingContinuationResult,
                safetyResult.meta,
                routeResult
            )
        };
    }

    if (
        routeResult.flow === FLOWS.FALLBACK &&
        rescheduleService.hasActiveRescheduleSession(sessionId)
    ) {
        const rescheduleContinuationResult =
            await rescheduleService.handleRescheduleMessage({
                message,
                sessionId
            });

        return {
            ...rescheduleContinuationResult,
            meta: mergeRouterMeta(
                rescheduleContinuationResult,
                safetyResult.meta,
                routeResult
            )
        };
    }

    if (
        routeResult.flow === FLOWS.FALLBACK &&
        cancelService.hasActiveCancelSession(sessionId)
    ) {
        const cancelContinuationResult =
            await cancelService.handleCancelMessage({
                message,
                sessionId
            });

        return {
            ...cancelContinuationResult,
            meta: mergeRouterMeta(
                cancelContinuationResult,
                safetyResult.meta,
                routeResult
            )
        };
    }

    return createChatResult({
        sessionId,
        userMessage: message,
        flow: routeResult.flow,
        action: routeResult.action,
        reply: routeResult.reply,
        booking: null,
        meta: {
            routedBy: "router.service",
            version: CHAT_ENGINE_VERSION,
            safety: safetyResult.meta,
            routing: routeResult.routerDebug || null
        }
    });
}

module.exports = {
    routeMessage
};
