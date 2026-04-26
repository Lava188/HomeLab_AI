const safetyService = require("./safety.service");
const ragService = require("./rag.service");
const bookingService = require("./booking.service");
const rescheduleService = require("./reschedule.service");
const cancelService = require("./cancel.service");
const { detectFlow } = require("./router-intent.service");
const { runSemanticBridge } = require("./health-rag/semantic-bridge.service");

const {
    CHAT_ENGINE_VERSION,
    FLOWS
} = require("../constants/chat.constants");
const { createChatResult } = require("../utils/chat-response.util");

const SEMANTIC_ROUTER_GATE_MIN_SCORE = 0.8;

function mergeRouterMeta(result, safetyMeta, routeResult) {
    return {
        ...result.meta,
        intentGroup:
            result.meta?.intentGroup ||
            routeResult?.routerDebug?.intentGroup ||
            null,
        routedBy: "router.service",
        version: CHAT_ENGINE_VERSION,
        safety: safetyMeta,
        routing: routeResult?.routerDebug || null
    };
}

function isSemanticRouterGateEnabled() {
    return String(process.env.HOMELAB_SEMANTIC_ROUTER_GATE || "")
        .trim()
        .toLowerCase() === "true";
}

function getSemanticGateMinScore() {
    const configured = Number(process.env.HOMELAB_SEMANTIC_ROUTER_GATE_MIN_SCORE);

    return Number.isFinite(configured) && configured > 0
        ? configured
        : SEMANTIC_ROUTER_GATE_MIN_SCORE;
}

function getIntentScore(routeResult, flow) {
    return (routeResult?.routerDebug?.scoredIntents || []).find(
        (intent) => intent.flow === flow
    );
}

function getTopIntent(routeResult) {
    return routeResult?.routerDebug?.scoredIntents?.[0] || null;
}

function getNextIntent(routeResult) {
    return routeResult?.routerDebug?.scoredIntents?.[1] || null;
}

function hasExplicitBookingAction(routeResult) {
    const bookingIntent = getIntentScore(routeResult, FLOWS.BOOKING);

    return Boolean(bookingIntent?.keywordHits?.length);
}

function isLowConfidenceBooking(routeResult) {
    const topIntent = getTopIntent(routeResult);
    const nextIntent = getNextIntent(routeResult);

    if (!topIntent || topIntent.flow !== FLOWS.BOOKING) {
        return false;
    }

    const scoreMargin = nextIntent
        ? Number(topIntent.score) - Number(nextIntent.score)
        : Number(topIntent.score);

    return (
        !hasExplicitBookingAction(routeResult) &&
        (Number(topIntent.score) < 0.35 || scoreMargin < 0.08)
    );
}

function getSemanticTopChunk(semanticResult) {
    return semanticResult?.topChunks?.[0] || null;
}

function hasValidSemanticTopChunk(semanticResult) {
    const topChunk = getSemanticTopChunk(semanticResult);
    const semanticScore = Number(topChunk?.semanticScore);

    return Boolean(
        topChunk?.chunk_id &&
            topChunk?.source_id &&
            Number.isFinite(semanticScore) &&
            semanticScore >= getSemanticGateMinScore()
    );
}

function summarizeSemanticTopChunk(semanticResult) {
    const topChunk = getSemanticTopChunk(semanticResult);

    if (!topChunk) {
        return null;
    }

    return {
        chunkId: topChunk.chunk_id || null,
        sourceId: topChunk.source_id || null,
        title: topChunk.title || null
    };
}

function buildSemanticRouterGateDebug({
    enabled,
    attempted = false,
    status = "skipped",
    reason,
    originalFlow,
    finalFlow,
    semanticResult = null
}) {
    return {
        enabled,
        attempted,
        status,
        reason,
        originalFlow,
        finalFlow,
        semanticTopChunk: summarizeSemanticTopChunk(semanticResult),
        semanticScore: getSemanticTopChunk(semanticResult)?.semanticScore ?? null
    };
}

function attachSemanticRouterGateDebug(result, gateDebug) {
    if (!gateDebug) {
        return result;
    }

    return {
        ...result,
        meta: {
            ...result.meta,
            debug: {
                ...(result.meta?.debug || {}),
                semanticRouterGate: gateDebug
            }
        }
    };
}

function shouldAttemptSemanticRouterGate({ routeResult, sessionId }) {
    if (
        routeResult.flow === FLOWS.RESCHEDULE ||
        routeResult.flow === FLOWS.CANCEL
    ) {
        return {
            attempt: false,
            reason: "operational_intent_preserved"
        };
    }

    if (
        bookingService.hasActiveBookingSession(sessionId) ||
        rescheduleService.hasActiveRescheduleSession(sessionId) ||
        cancelService.hasActiveCancelSession(sessionId)
    ) {
        return {
            attempt: false,
            reason: "active_operational_session_preserved"
        };
    }

    if (routeResult.flow === FLOWS.FALLBACK) {
        const healthIntent = getIntentScore(routeResult, FLOWS.HEALTH_RAG);

        return {
            attempt: Number(healthIntent?.score) > 0,
            reason:
                Number(healthIntent?.score) > 0
                    ? "fallback_with_health_classifier_signal"
                    : "fallback_without_health_classifier_signal"
        };
    }

    if (routeResult.flow === FLOWS.BOOKING) {
        if (hasExplicitBookingAction(routeResult)) {
            return {
                attempt: false,
                reason: "explicit_booking_action_preserved"
            };
        }

        const healthIntent = getIntentScore(routeResult, FLOWS.HEALTH_RAG);
        const lowConfidenceBooking = isLowConfidenceBooking(routeResult);

        return {
            attempt: lowConfidenceBooking && Number(healthIntent?.score) > 0,
            reason:
                lowConfidenceBooking && Number(healthIntent?.score) > 0
                    ? "low_confidence_booking_with_health_classifier_signal"
                    : "booking_confidence_preserved"
        };
    }

    return {
        attempt: false,
        reason: "flow_not_eligible"
    };
}

async function applySemanticRouterGate({ message, sessionId, routeResult }) {
    const enabled = isSemanticRouterGateEnabled();
    const originalFlow = routeResult.flow;

    if (!enabled) {
        return {
            routeResult,
            gateDebug: buildSemanticRouterGateDebug({
                enabled,
                reason: "disabled",
                originalFlow,
                finalFlow: originalFlow
            })
        };
    }

    if (routeResult.flow === FLOWS.HEALTH_RAG) {
        return {
            routeResult,
            gateDebug: buildSemanticRouterGateDebug({
                enabled,
                reason: "already_health_rag",
                originalFlow,
                finalFlow: originalFlow
            })
        };
    }

    const gateDecision = shouldAttemptSemanticRouterGate({
        routeResult,
        sessionId
    });

    if (!gateDecision.attempt) {
        return {
            routeResult,
            gateDebug: buildSemanticRouterGateDebug({
                enabled,
                reason: gateDecision.reason,
                originalFlow,
                finalFlow: originalFlow
            })
        };
    }

    const semanticResult = await runSemanticBridge({
        message,
        topK: 3,
        force: true
    });

    if (semanticResult.semanticBridgeStatus !== "ok") {
        return {
            routeResult,
            gateDebug: buildSemanticRouterGateDebug({
                enabled,
                attempted: true,
                status: "error",
                reason: `semantic_bridge_${semanticResult.semanticBridgeStatus}`,
                originalFlow,
                finalFlow: originalFlow,
                semanticResult
            })
        };
    }

    if (!hasValidSemanticTopChunk(semanticResult)) {
        return {
            routeResult,
            gateDebug: buildSemanticRouterGateDebug({
                enabled,
                attempted: true,
                reason: "semantic_top_chunk_not_valid",
                originalFlow,
                finalFlow: originalFlow,
                semanticResult
            })
        };
    }

    return {
        routeResult: {
            ...routeResult,
            flow: FLOWS.HEALTH_RAG,
            routerDebug: {
                ...(routeResult.routerDebug || {}),
                semanticRouterGateRouted: true
            }
        },
        gateDebug: buildSemanticRouterGateDebug({
            enabled,
            attempted: true,
            status: "routed",
            reason: gateDecision.reason,
            originalFlow,
            finalFlow: FLOWS.HEALTH_RAG,
            semanticResult
        })
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
                intentGroup: null,
                safety: safetyResult.meta,
                routing: null
            }
        });
    }

    let routeResult = detectFlow(message);
    const semanticGateResult = await applySemanticRouterGate({
        message,
        sessionId,
        routeResult
    });
    routeResult = semanticGateResult.routeResult;
    const { gateDebug } = semanticGateResult;

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
            meta: mergeRouterMeta(
                attachSemanticRouterGateDebug(ragResult, gateDebug),
                safetyResult.meta,
                routeResult
            )
        };
    }

    if (routeResult.flow === "booking") {
        const bookingResult = await bookingService.handleBookingMessage({
            message,
            sessionId
        });

        return {
            ...bookingResult,
            meta: mergeRouterMeta(
                attachSemanticRouterGateDebug(bookingResult, gateDebug),
                safetyResult.meta,
                routeResult
            )
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
                attachSemanticRouterGateDebug(rescheduleResult, gateDebug),
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
            meta: mergeRouterMeta(
                attachSemanticRouterGateDebug(cancelResult, gateDebug),
                safetyResult.meta,
                routeResult
            )
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
                attachSemanticRouterGateDebug(
                    bookingContinuationResult,
                    gateDebug
                ),
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
                attachSemanticRouterGateDebug(
                    rescheduleContinuationResult,
                    gateDebug
                ),
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
                attachSemanticRouterGateDebug(
                    cancelContinuationResult,
                    gateDebug
                ),
                safetyResult.meta,
                routeResult
            )
        };
    }

    return attachSemanticRouterGateDebug(createChatResult({
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
            intentGroup: routeResult.routerDebug?.intentGroup || null,
            routing: routeResult.routerDebug || null
        }
    }), gateDebug);
}

module.exports = {
    routeMessage
};
