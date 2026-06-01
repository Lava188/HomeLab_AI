const safetyService = require("./safety.service");
const ragService = require("./rag.service");
const bookingService = require("./booking.service");
const rescheduleService = require("./reschedule.service");
const cancelService = require("./cancel.service");
const packageCatalog = require("./booking-package-catalog.service");
const { detectFlow } = require("./router-intent.service");
const { runSemanticBridge } = require("./health-rag/semantic-bridge.service");
const {
    extractCurrentHealthDetails,
    extractPreviousSymptoms,
    mergeHealthConsultationState
} = require("./health-rag/health-consultation-context.service");
const { normalizeText } = require("../utils/text.util");
const mockSessions = require("../data/mockSessions");

const {
    CHAT_ENGINE_VERSION,
    FLOWS,
    ACTIONS
} = require("../constants/chat.constants");
const { createChatResult } = require("../utils/chat-response.util");
const { isAuthenticatedUserSession } = require("../utils/demo-session.util");

const SEMANTIC_ROUTER_GATE_MIN_SCORE = 0.8;
const BOOKING_LOGIN_REQUIRED_REPLY =
    "Để đặt lịch xét nghiệm, bạn vui lòng đăng nhập hoặc tạo tài khoản người dùng trước. Sau khi đăng nhập, HomeLab sẽ tiếp tục hỗ trợ bạn chọn xét nghiệm, khung giờ và địa chỉ lấy mẫu.";

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

function isBookingConfirmationContinuation(message, sessionId) {
    if (!bookingService.hasActiveBookingSession(sessionId)) {
        return false;
    }

    const normalizedMessage = normalizeText(message);
    const confirmationSignals = [
        "xac nhan",
        "dong y",
        "ok dat lich",
        "oke dat lich",
        "dung roi"
    ];

    if (isBookingEditOrNegativeText(message)) {
        return false;
    }

    return confirmationSignals.some((signal) =>
        normalizedMessage.includes(signal)
    );
}

function isBookingEditOrNegativeText(message) {
    const normalizedMessage = normalizeText(message);
    const editOrNegativeSignals = [
        "khong phai",
        "chua dung",
        "khong dung",
        "thay doi thong tin",
        "sua thong tin",
        "doi sang",
        "chuyen sang",
        "doi lich",
        "doi dia chi",
        "doi gio",
        "doi ngay",
        "doi goi",
        "huy di",
        "huy lich nay",
        "thoi khong dat nua",
        "bo lich nay"
    ];

    return editOrNegativeSignals.some((signal) =>
        normalizedMessage.includes(signal)
    );
}

function isReadOnlyConsultationRequest(message) {
    const normalizedMessage = normalizeText(message);
    const readOnlySignals = [
        "chi hoi truoc",
        "hoi truoc",
        "chua muon dat",
        "chưa muốn đặt",
        "chua dat lich",
        "chưa đặt lịch",
        "chua muon kham",
        "chưa muốn khám",
        "chua muon xet nghiem",
        "chưa muốn xét nghiệm",
        "chi tu van",
        "chỉ tư vấn",
        "chi hoi thong tin",
        "chỉ hỏi thông tin",
        "tim hieu truoc",
        "tim hiểu trước"
    ];

    return readOnlySignals.some((signal) =>
        normalizedMessage.includes(signal)
    );
}

function isBookingStatusQuestion(message) {
    const normalizedMessage = normalizeText(message);
    const statusQuestionPatterns = [
        / nhac lai|xem lai|tom tat|toi dang nhap|toi o dau|tien do|da nhap gi|dang co gi|thong tin dang co/,
        / ban nhap|nhap den gio|xem giúp|cho toi xem/,
        / toi con phai|con thieu|can lam gi|tiep theo|phai cung cap|can bo sung|can them/
    ];

    return statusQuestionPatterns.some(pattern => pattern.test(normalizedMessage));
}

function shouldKeepActiveBookingContext(message, routeResult) {
    const normalizedMessage = normalizeText(message);
    const contextSignals = [
        "de toi hoi lai",
        "hoi lai da",
        "khong huy",
        "khong huy nua",
        "tiep tuc dat",
        "quay lai",
        "giu gio cu",
        "giu nhu cu",
        "dong y doi",
        "dung roi sua"
    ];

    return (
        [FLOWS.RESCHEDULE, FLOWS.CANCEL].includes(routeResult.flow) ||
        contextSignals.some((signal) => normalizedMessage.includes(signal))
    );
}

function isStandaloneBookingConfirmation(message) {
    const normalizedMessage = normalizeText(message);
    const confirmationSignals = [
        "xac nhan",
        "dung roi xac nhan",
        "tao lich",
        "tao lich giup",
        "tao lich giup toi"
    ];

    return confirmationSignals.some((signal) =>
        normalizedMessage.includes(signal)
    );
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

function buildAuthRequiredResult({ message, sessionId, flow }) {
    return createChatResult({
        sessionId,
        userMessage: message,
        flow,
        action: ACTIONS.AUTH_REQUIRED,
        reply: BOOKING_LOGIN_REQUIRED_REPLY,
        booking: null,
        meta: {
            handledBy: "router.service",
            authRequired: true,
            allowedActions: ["login", "register"]
        }
    });
}

function getConversationContext(sessionId) {
    return mockSessions.getSession(sessionId)?.chatContext || {};
}

function hasSymptomSignal(message) {
    const normalizedMessage = normalizeText(message);
    const symptomSignals = [
        "nhuc dau",
        "dau dau",
        "chan an",
        "an uong kem",
        "hay non",
        "non",
        "buon non",
        "met",
        "met moi",
        "chong mat",
        "choang"
    ];

    return symptomSignals.some((signal) => normalizedMessage.includes(signal));
}

function isPackageChoiceFollowUp(message) {
    const normalizedMessage = normalizeText(message);
    const followUpSignals = [
        "vay toi nen chon goi nao",
        "vay nen chon goi nao",
        "toi nen chon goi nao",
        "nen chon goi nao",
        "vay dat goi nao",
        "dat goi nao",
        "goi nao phu hop",
        "chon goi nao"
    ];

    return followUpSignals.some((signal) => normalizedMessage.includes(signal));
}

function buildContextAwareHealthMessage(message, conversationContext) {
    if (
        isPackageChoiceFollowUp(message) &&
        conversationContext?.lastSymptomMessage &&
        !hasSymptomSignal(message)
    ) {
        return [
            message,
            `Triệu chứng người dùng đã cung cấp trước đó: ${conversationContext.lastSymptomMessage}`
        ].join("\n");
    }

    return message;
}

function shouldRouteHealthConsultationFollowUp(message, conversationContext = {}) {
    const details = extractCurrentHealthDetails(message);
    const previousSymptoms = extractPreviousSymptoms(conversationContext);
    const normalizedMessage = normalizeText(message);
    const asksForGuidance =
        normalizedMessage.includes("xet nghiem gi") ||
        normalizedMessage.includes("chon goi nao") ||
        normalizedMessage.includes("goi nao phu hop");

    return (
        (previousSymptoms.length > 0 && (details.hasFollowUpDetail || asksForGuidance)) ||
        (previousSymptoms.length === 0 && Boolean(details.duration))
    );
}

function rememberConversationContext({ sessionId, message, result, packageIntent }) {
    if (!sessionId || result?.flow === FLOWS.BOOKING) {
        return result;
    }

    const previous = getConversationContext(sessionId);
    const existingMessages = Array.isArray(previous?.recentMessages)
        ? previous.recentMessages
        : [];
    const nextContext = {
        ...previous,
        lastIntentGroup: result?.meta?.intentGroup || previous.lastIntentGroup || null,
        lastUserMessage: message,
        healthConsultation: mergeHealthConsultationState(previous, message),
        recentMessages: [
            ...existingMessages.slice(-9),
            { role: "user", content: message, timestamp: new Date().toISOString() }
        ]
    };

    if (packageIntent?.type === "listing") {
        nextContext.lastCatalogListedAt = new Date().toISOString();
    }

    if (hasSymptomSignal(message)) {
        nextContext.lastSymptomMessage = message;
    }

    mockSessions.upsertSession(sessionId, {
        chatContext: nextContext
    });

    return result;
}

function buildCatalogInfoResult({ message, sessionId, packageIntent }) {
    const selectedPackage = packageIntent.package || null;
    const isAmbiguous = packageIntent.type === "ambiguous";
    const isListing = packageIntent.type === "listing";

    return createChatResult({
        sessionId,
        userMessage: message,
        flow: FLOWS.HEALTH_RAG,
        action: ACTIONS.ANSWER_HEALTH_QUERY,
        reply: isListing
            ? packageCatalog.buildCatalogListingReply()
            : isAmbiguous
            ? packageCatalog.buildAmbiguousPackageReply()
            : packageCatalog.buildPackageDetailReply(selectedPackage),
        booking: null,
        meta: {
            handledBy: "booking-package-catalog.service",
            intentGroup: "test_advice",
            packageIntent: packageIntent.type,
            packageCandidates: isAmbiguous || isListing ? packageIntent.candidates : undefined,
            selectedPackage
        }
    });
}

function shouldContinueBookingForPackageSelection(message, sessionId, packageIntent) {
    if (!bookingService.hasActiveBookingSession(sessionId)) {
        return false;
    }

    if (packageIntent.type !== "selected") {
        return false;
    }

    const normalizedMessage = normalizeText(message);
    const questionSignals = [
        "la gi",
        "nhu the nao",
        "ket qua",
        "cao co",
        "bat thuong",
        "co phai",
        "nguy hiem"
    ];

    return !questionSignals.some((signal) => normalizedMessage.includes(signal));
}

function shouldContinueBookingForInformationalDetour(message, sessionId, packageIntent) {
    if (!bookingService.hasActiveBookingSession(sessionId)) {
        return false;
    }

    const normalizedMessage = normalizeText(message);
    const detourSignals = [
        "la gi",
        "giai thich",
        "gom gi",
        "gom nhung gi",
        "bao gom gi",
        "bao gom",
        "y nghia",
        "xem chi tiet"
    ];

    return (
        packageIntent.type === "detail_question" ||
        detourSignals.some((signal) => normalizedMessage.includes(signal))
    );
}

function hasExplicitBookingRequestText(message) {
    const normalizedMessage = normalizeText(message);
    const bookingSignals = [
        "dat lich",
        "tao lich",
        "hen lay mau",
        "lay mau tai nha"
    ];

    return bookingSignals.some((signal) => normalizedMessage.includes(signal));
}

async function suspendPendingStateForUrgent(sessionId) {
    const bookingSuspension =
        await bookingService.suspendActiveBookingSession(sessionId);

    return {
        booking: bookingSuspension
    };
}

async function buildUrgentOverrideResult({
    message,
    sessionId,
    safetyResult,
    routeResult,
    gateDebug
}) {
    const suspendedState = await suspendPendingStateForUrgent(sessionId);
    const urgentResult = applyCustomerTestSafetyGate(
        await ragService.answerHealthQuery({
            message,
            sessionId
        }),
        routeResult
    );

    return {
        ...urgentResult,
        meta: {
            ...mergeRouterMeta(
                attachSemanticRouterGateDebug(urgentResult, gateDebug),
                safetyResult.meta,
                routeResult
            ),
            urgentOverride: {
                applied: true,
                suspendedState
            }
        }
    };
}

async function routeMessage({ message, sessionId, userSession = {} }) {
    const safetyResult = safetyService.checkSafety({ message });

    if (!safetyResult.isSafe) {
        const suspendedState = await suspendPendingStateForUrgent(sessionId);

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
                routing: null,
                urgentOverride: {
                    applied: true,
                    suspendedState
                }
            }
        });
    }

    let routeResult = detectFlow(message);
    const packageIntent = await packageCatalog.resolvePackageIntent(message);
    const conversationContext = getConversationContext(sessionId);
    const healthConsultationFollowUp = shouldRouteHealthConsultationFollowUp(
        message,
        conversationContext
    );
    if (
        routeResult.flow === FLOWS.FALLBACK &&
        healthConsultationFollowUp
    ) {
        routeResult = {
            flow: FLOWS.HEALTH_RAG,
            routerDebug: {
                ...(routeResult.routerDebug || {}),
                intentGroup: "test_advice",
                healthConsultationFollowUpOverride: true
            }
        };
    }
    const healthMessage = buildContextAwareHealthMessage(
        message,
        conversationContext
    );
    const semanticGateResult = await applySemanticRouterGate({
        message,
        sessionId,
        routeResult
    });
    routeResult = semanticGateResult.routeResult;
    const { gateDebug } = semanticGateResult;

    if (
        routeResult.flow === FLOWS.HEALTH_RAG &&
        routeResult.routerDebug?.intentGroup === "urgent_health"
    ) {
        return buildUrgentOverrideResult({
            message,
            sessionId,
            safetyResult,
            routeResult,
            gateDebug
        });
    }

    if (
        packageIntent.type === "selected" &&
        hasExplicitBookingRequestText(message)
    ) {
        if (!isAuthenticatedUserSession(userSession)) {
            return buildAuthRequiredResult({
                message,
                sessionId,
                flow: FLOWS.BOOKING
            });
        }

        const bookingResult = await bookingService.handleBookingMessage({
            message,
            sessionId,
            userSession
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

    if (shouldContinueBookingForPackageSelection(message, sessionId, packageIntent)) {
        if (!isAuthenticatedUserSession(userSession)) {
            return buildAuthRequiredResult({
                message,
                sessionId,
                flow: FLOWS.BOOKING
            });
        }

        const bookingContinuationResult =
            await bookingService.handleBookingMessage({
                message,
                sessionId,
                userSession
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

    if (shouldContinueBookingForInformationalDetour(message, sessionId, packageIntent)) {
        if (!isAuthenticatedUserSession(userSession)) {
            return buildAuthRequiredResult({
                message,
                sessionId,
                flow: FLOWS.BOOKING
            });
        }

        const bookingContinuationResult =
            await bookingService.handleBookingMessage({
                message,
                sessionId,
                userSession
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

    if (bookingService.shouldHandleBookingFailureFollowup(sessionId, message)) {
        if (!isAuthenticatedUserSession(userSession)) {
            return buildAuthRequiredResult({
                message,
                sessionId,
                flow: FLOWS.BOOKING
            });
        }

        const bookingContinuationResult =
            await bookingService.handleBookingMessage({
                message,
                sessionId,
                userSession
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

    if (
        bookingService.hasActiveBookingSession(sessionId) &&
        isBookingEditOrNegativeText(message) &&
        !isReadOnlyConsultationRequest(message)
    ) {
        if (!isAuthenticatedUserSession(userSession)) {
            return buildAuthRequiredResult({
                message,
                sessionId,
                flow: FLOWS.BOOKING
            });
        }

        const bookingContinuationResult =
            await bookingService.handleBookingMessage({
                message,
                sessionId,
                userSession
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

    if (
        bookingService.hasActiveBookingSession(sessionId) &&
        isBookingStatusQuestion(message)
    ) {
        if (!isAuthenticatedUserSession(userSession)) {
            return buildAuthRequiredResult({
                message,
                sessionId,
                flow: FLOWS.BOOKING
            });
        }

        const bookingContinuationResult =
            await bookingService.handleBookingMessage({
                message,
                sessionId,
                userSession
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

    if (
        isBookingStatusQuestion(message) &&
        !bookingService.hasActiveBookingSession(sessionId)
    ) {
        if (!isAuthenticatedUserSession(userSession)) {
            return buildAuthRequiredResult({
                message,
                sessionId,
                flow: FLOWS.BOOKING
            });
        }

        const bookingResult = await bookingService.handleBookingMessage({
            message,
            sessionId,
            userSession
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

    if (
        bookingService.hasActiveBookingSession(sessionId) &&
        shouldKeepActiveBookingContext(message, routeResult)
    ) {
        if (!isAuthenticatedUserSession(userSession)) {
            return buildAuthRequiredResult({
                message,
                sessionId,
                flow: FLOWS.BOOKING
            });
        }

        const bookingContinuationResult =
            await bookingService.handleBookingMessage({
                message,
                sessionId,
                userSession
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

    if (
        [FLOWS.HEALTH_RAG, FLOWS.FALLBACK].includes(routeResult.flow) &&
        routeResult.routerDebug?.intentGroup !== "urgent_health" &&
        !healthConsultationFollowUp &&
        ["listing", "ambiguous", "detail_question"].includes(packageIntent.type)
    ) {
        const catalogResult = buildCatalogInfoResult({
            message,
            sessionId,
            packageIntent
        });

        return rememberConversationContext({
            sessionId,
            message,
            packageIntent,
            result: {
            ...catalogResult,
            meta: mergeRouterMeta(
                attachSemanticRouterGateDebug(catalogResult, gateDebug),
                safetyResult.meta,
                routeResult
            )
            }
        });
    }

    if (
        routeResult.flow === FLOWS.FALLBACK &&
        routeResult.routerDebug?.intentGroup !== "urgent_health" &&
        packageIntent.type === "selected" &&
        packageIntent.package?.code === "GENERAL_CHECKUP"
    ) {
        const normalizedMessage = normalizeText(message);
        const explicitPackageName =
            normalizedMessage.includes("goi tong quat co ban") ||
            normalizedMessage.includes("goi tong quat");

        if (!explicitPackageName) {
            const catalogResult = buildCatalogInfoResult({
                message,
                sessionId,
                packageIntent: {
                    type: "ambiguous",
                    package: null,
                    candidates: packageCatalog.getCandidateSummaries()
                }
            });

            return rememberConversationContext({
                sessionId,
                message,
                packageIntent,
                result: {
                ...catalogResult,
                meta: mergeRouterMeta(
                    attachSemanticRouterGateDebug(catalogResult, gateDebug),
                    safetyResult.meta,
                    routeResult
                )
                }
            });
        }
    }

    if (routeResult.flow === "health_rag") {
        const ragResult = applyCustomerTestSafetyGate(
            await ragService.answerHealthQuery({
            message: healthMessage,
            sessionId
            }),
            routeResult
        );

        return rememberConversationContext({
            sessionId,
            message,
            packageIntent,
            result: {
            ...ragResult,
            userMessage: message,
            meta: mergeRouterMeta(
                attachSemanticRouterGateDebug(ragResult, gateDebug),
                safetyResult.meta,
                routeResult
            )
            }
        });
    }

    if (isBookingConfirmationContinuation(message, sessionId)) {
        if (!isAuthenticatedUserSession(userSession)) {
            return buildAuthRequiredResult({
                message,
                sessionId,
                flow: FLOWS.BOOKING
            });
        }

        const bookingContinuationResult =
            await bookingService.handleBookingMessage({
                message,
                sessionId,
                userSession
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

    if (
        !isAuthenticatedUserSession(userSession) &&
        isStandaloneBookingConfirmation(message)
    ) {
        return buildAuthRequiredResult({
            message,
            sessionId,
            flow: FLOWS.BOOKING
        });
    }

    if (
        isAuthenticatedUserSession(userSession) &&
        isStandaloneBookingConfirmation(message)
    ) {
        const bookingConfirmationResult =
            await bookingService.handleBookingMessage({
                message,
                sessionId,
                userSession
            });

        return {
            ...bookingConfirmationResult,
            meta: mergeRouterMeta(
                attachSemanticRouterGateDebug(
                    bookingConfirmationResult,
                    gateDebug
                ),
                safetyResult.meta,
                routeResult
            )
        };
    }

    if (routeResult.flow === "booking") {
        if (!isAuthenticatedUserSession(userSession)) {
            return buildAuthRequiredResult({
                message,
                sessionId,
                flow: FLOWS.BOOKING
            });
        }

        const bookingResult = await bookingService.handleBookingMessage({
            message,
            sessionId,
            userSession
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
        if (!isAuthenticatedUserSession(userSession)) {
            return buildAuthRequiredResult({
                message,
                sessionId,
                flow: FLOWS.RESCHEDULE
            });
        }

        const rescheduleResult = await rescheduleService.handleRescheduleMessage({
            message,
            sessionId,
            userSession
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
        if (!isAuthenticatedUserSession(userSession)) {
            return buildAuthRequiredResult({
                message,
                sessionId,
                flow: FLOWS.CANCEL
            });
        }

        const cancelResult = await cancelService.handleCancelMessage({
            message,
            sessionId,
            userSession
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
        if (!isAuthenticatedUserSession(userSession)) {
            return buildAuthRequiredResult({
                message,
                sessionId,
                flow: FLOWS.BOOKING
            });
        }

        const bookingContinuationResult =
            await bookingService.handleBookingMessage({
                message,
                sessionId,
                userSession
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
        if (!isAuthenticatedUserSession(userSession)) {
            return buildAuthRequiredResult({
                message,
                sessionId,
                flow: FLOWS.RESCHEDULE
            });
        }

        const rescheduleContinuationResult =
            await rescheduleService.handleRescheduleMessage({
                message,
                sessionId,
                userSession
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
        if (!isAuthenticatedUserSession(userSession)) {
            return buildAuthRequiredResult({
                message,
                sessionId,
                flow: FLOWS.CANCEL
            });
        }

        const cancelContinuationResult =
            await cancelService.handleCancelMessage({
                message,
                sessionId,
                userSession
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

    const fallbackResult = attachSemanticRouterGateDebug(createChatResult({
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

    return rememberConversationContext({
        sessionId,
        message,
        packageIntent,
        result: fallbackResult
    });
}

module.exports = {
    routeMessage
};
