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

function mergeRouterMeta(result, safetyMeta, routeResult) {
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
