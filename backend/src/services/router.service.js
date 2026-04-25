const safetyService = require("./safety.service");
const ragService = require("./rag.service");
const bookingService = require("./booking.service");
const rescheduleService = require("./reschedule.service");
const cancelService = require("./cancel.service");
const { detectFlow } = require("./router-intent.service");

const {
    CHAT_ENGINE_VERSION
} = require("../constants/chat.constants");
const { createChatResult } = require("../utils/chat-response.util");

function mergeRouterMeta(result, safetyMeta, routeResult) {
    return {
        ...result.meta,
        routedBy: "router.service",
        version: CHAT_ENGINE_VERSION,
        safety: safetyMeta,
        routing: routeResult?.routerDebug || null
    };
}

function applyCustomerTestSafetyGate(result, routeResult) {
    if (
        !routeResult?.routerDebug?.customerTestSafetyGate ||
        result.flow !== "health_rag"
    ) {
        return result;
    }

    const safetyPrefix =
        "Vì bạn nhắc đến nghi nhiễm trùng, nếu bạn rất mệt, rất không ổn, lú lẫn, khó thở, đau ngực hoặc xấu đi nhanh, hãy liên hệ cơ sở y tế khẩn cấp thay vì chỉ chọn xét nghiệm. Xét nghiệm chỉ là thông tin hỗ trợ và không tự chẩn đoán hoặc loại trừ nhiễm trùng. ";

    return {
        ...result,
        reply: `${safetyPrefix}${result.reply || ""}`.trim(),
        meta: {
            ...result.meta,
            customerTestSafetyGateApplied: true
        }
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

    if (routeResult.flow === "health_rag") {
        const ragResult = applyCustomerTestSafetyGate(
            await ragService.answerHealthQuery({
            message,
            sessionId
            }),
            routeResult
        );

        return {
            ...ragResult,
            meta: mergeRouterMeta(ragResult, safetyResult.meta, routeResult)
        };
    }

    if (routeResult.flow === "booking") {
        const bookingResult = await bookingService.handleBookingMessage({
            message,
            sessionId
        });

        return {
            ...bookingResult,
            meta: mergeRouterMeta(bookingResult, safetyResult.meta, routeResult)
        };
    }

    if (routeResult.flow === "reschedule") {
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

    if (routeResult.flow === "cancel") {
        const cancelResult = await cancelService.handleCancelMessage({
            message,
            sessionId
        });

        return {
            ...cancelResult,
            meta: mergeRouterMeta(cancelResult, safetyResult.meta, routeResult)
        };
    }

    if (bookingService.hasActiveBookingSession(sessionId)) {
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

    if (rescheduleService.hasActiveRescheduleSession(sessionId)) {
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

    if (cancelService.hasActiveCancelSession(sessionId)) {
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
