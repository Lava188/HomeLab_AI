const { FLOWS, ACTIONS } = require("../constants/chat.constants");
const { createChatResult } = require("../utils/chat-response.util");
const { normalizeText } = require("../utils/text.util");
const { retrieveTopChunks } = require("./health-rag/retriever.service");
const { loadArtifacts } = require("./health-rag/artifact-loader.service");
const { choosePolicyMode } = require("./health-rag/policy.service");
const { composeGroundedAnswer } = require("./health-rag/answer.service");
const { runSemanticBridge } = require("./health-rag/semantic-bridge.service");
const {
    isRecommendationRuntimeEnabled,
    runRecommendationRuntime
} = require("./recommendation/recommendation-runtime.service");

function isSemanticRetrievalEnabled() {
    return String(process.env.HOMELAB_SEMANTIC_RETRIEVAL_ENABLED || "")
        .trim()
        .toLowerCase() === "true";
}

function summarizeSemanticTopChunk(semanticBridgeResult) {
    const chunk = semanticBridgeResult?.topChunks?.[0];

    if (!chunk) {
        return null;
    }

    return {
        chunkId: chunk.chunk_id || null,
        sourceId: chunk.source_id || null,
        score: Number.isFinite(Number(chunk.semanticScore))
            ? Number(chunk.semanticScore)
            : null
    };
}

function includesAny(text, signals) {
    return signals.some((signal) => text.includes(signal));
}

function hasExplicitNegativeSignal(text, signal) {
    return (
        text.includes(`khong ${signal}`) ||
        text.includes(`khong bi ${signal}`) ||
        text.includes(`khong co ${signal}`) ||
        text.includes(`khong thay ${signal}`)
    );
}

function includesAnyNonNegated(text, signals) {
    return signals.some(
        (signal) =>
            text.includes(signal) &&
            !hasExplicitNegativeSignal(text, signal)
    );
}

function getIntentGroup(message) {
    const normalizedMessage = normalizeText(message);
    const redFlagSignals = [
        "dau nguc",
        "kho tho",
        "ngat"
    ];
    const urgentSignals = [
        "va mo hoi",
        "sot cao",
        "ret run",
        "la di",
        "nhiem trung",
        "xau di nhanh",
        "sepsis",
        "lu lan",
        "ho ra mau",
        "non ra mau",
        "phan den"
    ];
    const testAdviceSignals = [
        "nen xet nghiem gi",
        "xet nghiem gi",
        "goi xet nghiem",
        "goi xet nghiem nao",
        "xet nghiem tong quat",
        "kiem tra tong quat",
        "kiem tra suc khoe tong quat",
        "goi nao phu hop",
        "kiem tra than",
        "chuc nang than",
        "kiem tra thieu mau",
        "thieu mau",
        "cbc"
    ];

    if (
        includesAnyNonNegated(normalizedMessage, redFlagSignals) ||
        includesAny(normalizedMessage, urgentSignals)
    ) {
        return "urgent_health";
    }

    if (includesAny(normalizedMessage, testAdviceSignals)) {
        return "test_advice";
    }

    return "general_health";
}

function hydrateSemanticChunks(semanticBridgeResult) {
    const semanticChunks = Array.isArray(semanticBridgeResult?.topChunks)
        ? semanticBridgeResult.topChunks
        : [];

    if (!semanticChunks.length) {
        return [];
    }

    const { chunks } = loadArtifacts();
    const chunksById = new Map(chunks.map((chunk) => [chunk.chunk_id, chunk]));

    return semanticChunks
        .map((semanticChunk) => {
            const artifactChunk = chunksById.get(semanticChunk.chunk_id);

            if (!artifactChunk?.content) {
                return null;
            }

            const semanticScore = Number(semanticChunk.semanticScore);

            return {
                ...artifactChunk,
                semanticScore: Number.isFinite(semanticScore)
                    ? semanticScore
                    : artifactChunk.semanticScore || 0,
                score: Number.isFinite(semanticScore)
                    ? semanticScore
                    : artifactChunk.score || 0,
                matchedTerms: artifactChunk.matchedTerms || [],
                retrievalSource: "semantic_faiss"
            };
        })
        .filter(Boolean);
}

function hasOverlap(left = [], right = []) {
    const rightSet = new Set(right);
    return left.some((item) => rightSet.has(item));
}

function isMetadataRelatedToPrimary(chunk, primaryChunk) {
    if (!chunk || !primaryChunk) {
        return true;
    }

    if (chunk.source_id === primaryChunk.source_id) {
        return true;
    }

    if (chunk.faq_type && chunk.faq_type === primaryChunk.faq_type) {
        return true;
    }

    if (hasOverlap(chunk.tags || [], primaryChunk.tags || [])) {
        return true;
    }

    if (hasOverlap(chunk.test_types || [], primaryChunk.test_types || [])) {
        return true;
    }

    return false;
}

function applySemanticCoherenceFilter(chunks) {
    if (chunks.length <= 2) {
        return {
            chunks,
            removedChunks: []
        };
    }

    const primaryChunk = chunks[0];
    const primaryScore = Number(primaryChunk.score || primaryChunk.semanticScore || 0);
    const filteredChunks = [primaryChunk];
    const removedChunks = [];

    for (const chunk of chunks.slice(1)) {
        const score = Number(chunk.score || chunk.semanticScore || 0);
        const scoreGap = Number.isFinite(primaryScore) && Number.isFinite(score)
            ? primaryScore - score
            : 0;
        const related = isMetadataRelatedToPrimary(chunk, primaryChunk);

        if (!related && scoreGap > 0.08) {
            removedChunks.push({
                chunkId: chunk.chunk_id,
                sourceId: chunk.source_id,
                score,
                reason: "distant_metadata_and_lower_score"
            });
            continue;
        }

        filteredChunks.push(chunk);
    }

    return {
        chunks: filteredChunks,
        removedChunks
    };
}

function selectRetrieval({ lexicalResult, semanticBridgeResult, intentGroup }) {
    const semanticRetrievalEnabled = isSemanticRetrievalEnabled();
    const lexicalChunks = lexicalResult.chunks || [];
    const semanticTopChunk = summarizeSemanticTopChunk(semanticBridgeResult);
    let semanticRetrievalStatus = semanticRetrievalEnabled
        ? semanticBridgeResult?.semanticBridgeStatus || "missing"
        : "disabled";
    let selectedRetrievalMode = "lexical_fallback";
    let fallbackReason = semanticRetrievalEnabled
        ? null
        : "semantic_retrieval_disabled";
    let selectedChunks = lexicalChunks;
    let coherenceFilter = {
        applied: false,
        removedChunks: []
    };

    if (semanticRetrievalEnabled) {
        if (semanticBridgeResult?.semanticBridgeStatus !== "ok") {
            fallbackReason =
                semanticBridgeResult?.error ||
                `semantic_bridge_${semanticBridgeResult?.semanticBridgeStatus || "missing"}`;
        } else if (!semanticBridgeResult.topChunks?.length) {
            semanticRetrievalStatus = "empty";
            fallbackReason = "semantic_bridge_no_top_chunks";
        } else {
            const hydratedSemanticChunks = hydrateSemanticChunks(semanticBridgeResult);

            if (hydratedSemanticChunks.length) {
                if (
                    intentGroup === "test_advice" &&
                    hydratedSemanticChunks[0]?.section === "red_flags"
                ) {
                    fallbackReason =
                        "semantic_red_flag_top_suppressed_for_test_advice";
                    return {
                        topChunks: lexicalChunks,
                        debug: {
                            semanticRetrievalEnabled,
                            status: semanticRetrievalStatus,
                            semanticRetrievalStatus,
                            runtimeMode: selectedRetrievalMode,
                            selectedRetrievalMode,
                            semanticTopChunk,
                            coherenceFilter,
                            fallbackReason
                        }
                    };
                }

                const filteredResult = applySemanticCoherenceFilter(
                    hydratedSemanticChunks
                );
                selectedChunks = filteredResult.chunks || hydratedSemanticChunks;
                coherenceFilter = {
                    applied: true,
                    removedChunks: filteredResult.removedChunks || []
                };
                selectedRetrievalMode = "semantic_faiss";
                fallbackReason = null;
            } else {
                semanticRetrievalStatus = "unhydrated";
                fallbackReason = "semantic_chunks_not_found_in_loaded_artifact";
            }
        }
    }

    return {
        topChunks: selectedChunks,
        debug: {
            semanticRetrievalEnabled,
            status: semanticRetrievalStatus,
            semanticRetrievalStatus,
            runtimeMode: selectedRetrievalMode,
            selectedRetrievalMode,
            semanticTopChunk,
            coherenceFilter,
            fallbackReason
        }
    };
}

function applyIntentGroupPolicy(policyDecision, intentGroup) {
    if (intentGroup !== "test_advice") {
        return policyDecision;
    }

    return {
        ...policyDecision,
        primaryMode: "test_advice",
        urgencyLevel: "none",
        reason: "test_advice_intent_without_clear_red_flag"
    };
}

function shouldRunRecommendationRuntime(intentGroup) {
    return (
        intentGroup === "test_advice" &&
        isRecommendationRuntimeEnabled()
    );
}

function buildRecommendationReply(recommendationDecision, fallbackReply) {
    if (!recommendationDecision || recommendationDecision.status === "disabled") {
        return fallbackReply;
    }

    if (recommendationDecision.status === "escalate") {
        return (
            "Voi cac dau hieu ban vua nhac toi, HomeLab uu tien an toan truoc viec chon goi xet nghiem. " +
            "Neu ban co dau nguc, kho tho, ngat, lu lan hoac tinh trang xau di nhanh, hay lien he co so y te khan cap. " +
            "HomeLab khong dung goi xet nghiem de chan doan benh."
        );
    }

    if (recommendationDecision.status === "do_not_recommend") {
        return [
            "HomeLab chua de xuat goi xet nghiem trong buoc nay.",
            "HomeLab can giu goi y o muc an toan va khong dung goi xet nghiem de ket luan benh.",
            "Neu ban muon, hay mo ta muc tieu kiem tra, trieu chung hien tai va cac dau hieu can kham gap neu co."
        ].join(" ");
    }

    if (recommendationDecision.status === "ask_more") {
        const questions = (recommendationDecision.nextQuestions || [])
            .slice(0, 4)
            .map((item) => item.question)
            .filter(Boolean);

        return [
            "De tu van goi xet nghiem an toan hon, HomeLab can them vai thong tin.",
            ...questions,
            "HomeLab khong chan doan benh va se khong de xuat goi neu co dau hieu can kham khan cap."
        ].join(" ");
    }

    if (
        recommendationDecision.status === "recommend" &&
        recommendationDecision.recommendedPackage
    ) {
        const packageName =
            recommendationDecision.recommendedPackage.displayNameVi ||
            recommendationDecision.recommendedPackage.displayName ||
            "goi xet nghiem phu hop";

        return [
            `HomeLab co the goi y ${packageName} dua tren thong tin da co.`,
            "Goi y nay khong thay the tu van y te va khong dung de chan doan benh."
        ].join(" ");
    }

    return fallbackReply;
}

function attachRecommendationMeta(meta, recommendationDecision) {
    if (!recommendationDecision) {
        return meta;
    }

    return {
        ...meta,
        recommendation: recommendationDecision
    };
}

async function answerHealthQuery({ message, sessionId }) {
    try {
        const retrievalResult = retrieveTopChunks({
            message,
            topK: 3
        });
        const semanticRetrievalEnabled = isSemanticRetrievalEnabled();
        const semanticBridgeResult = await runSemanticBridge({
            message,
            topK: 3,
            force: semanticRetrievalEnabled
        });
        const intentGroup = getIntentGroup(message);
        const selectedRetrieval = selectRetrieval({
            lexicalResult: retrievalResult,
            semanticBridgeResult,
            intentGroup
        });
        const topChunks = selectedRetrieval.topChunks;
        const policyDecision = applyIntentGroupPolicy(choosePolicyMode({
            message,
            retrievedChunks: topChunks
        }), intentGroup);
        const groundedReply = composeGroundedAnswer({
            policyDecision,
            topChunks
        });
        const recommendationDecision = shouldRunRecommendationRuntime(intentGroup)
            ? runRecommendationRuntime({
                message,
                intentGroup
            })
            : null;
        const reply = buildRecommendationReply(
            recommendationDecision,
            groundedReply
        );

        if (!topChunks.length) {
            return createChatResult({
                sessionId,
                userMessage: message,
                flow: FLOWS.HEALTH_RAG,
                action: ACTIONS.ANSWER_HEALTH_QUERY,
                reply,
                booking: null,
                meta: attachRecommendationMeta({
                    answeredBy: "rag.service",
                    retrievalMode: "artifact_json_top3_versioned",
                    found: false,
                    grounded: false,
                    primaryMode: policyDecision.primaryMode,
                    urgencyLevel: policyDecision.urgencyLevel,
                    overlapFlag: policyDecision.overlapFlag,
                    reason: policyDecision.reason,
                    policyVersion: policyDecision.policyVersion,
                    retrieverVersion: retrievalResult.retrieverVersion,
                    intentGroup,
                    selectedRetrievalMode:
                        selectedRetrieval.debug.selectedRetrievalMode,
                    requestedRetrieverVersion:
                        retrievalResult.requestedRetrieverVersion || null,
                    loadedRetrieverVersion:
                        retrievalResult.loadedRetrieverVersion ||
                        retrievalResult.retrieverVersion ||
                        null,
                    fallbackUsed: Boolean(retrievalResult.fallbackUsed),
                    fallbackReason: retrievalResult.fallbackReason || null,
                    modelName: retrievalResult.modelName,
                    debug: {
                        legacyLexicalRuntimeMode:
                            retrievalResult.runtimeMode || null,
                        intentGroup,
                        semanticRetrieval: selectedRetrieval.debug,
                        queryExpansions: retrievalResult.queryExpansions || [],
                        queryRewriteRules: retrievalResult.queryRewriteRules || [],
                        topicIntent: retrievalResult.topicIntent || null,
                        rewrittenQuery: retrievalResult.rewrittenQuery || retrievalResult.normalizedQuery,
                        semanticBridge: semanticBridgeResult
                    },
                    topChunks: []
                }, recommendationDecision)
            });
        }

        const primaryChunk = topChunks[0];
        const citations = topChunks.map((chunk) => ({
            chunkId: chunk.chunk_id,
            sourceId: chunk.source_id,
            sourceName: chunk.source_name,
            sourceUrl: chunk.source_url || null,
            title: chunk.title
        }));

        return createChatResult({
            sessionId,
            userMessage: message,
            flow: FLOWS.HEALTH_RAG,
            action: ACTIONS.ANSWER_HEALTH_QUERY,
            reply,
            booking: null,
            meta: attachRecommendationMeta({
                answeredBy: "rag.service",
                retrievalMode: "artifact_json_top3_versioned",
                found: true,
                grounded: true,
                primaryMode: policyDecision.primaryMode,
                urgencyLevel: policyDecision.urgencyLevel,
                overlapFlag: policyDecision.overlapFlag,
                reason: policyDecision.reason,
                policyVersion: policyDecision.policyVersion,
                retrieverVersion: retrievalResult.retrieverVersion,
                intentGroup,
                selectedRetrievalMode:
                    selectedRetrieval.debug.selectedRetrievalMode,
                requestedRetrieverVersion:
                    retrievalResult.requestedRetrieverVersion || null,
                loadedRetrieverVersion:
                    retrievalResult.loadedRetrieverVersion ||
                    retrievalResult.retrieverVersion ||
                    null,
                fallbackUsed: Boolean(retrievalResult.fallbackUsed),
                fallbackReason: retrievalResult.fallbackReason || null,
                modelName: retrievalResult.modelName,
                debug: {
                    legacyLexicalRuntimeMode:
                        retrievalResult.runtimeMode || null,
                    intentGroup,
                    semanticRetrieval: selectedRetrieval.debug,
                    queryExpansions: retrievalResult.queryExpansions || [],
                    queryRewriteRules: retrievalResult.queryRewriteRules || [],
                    topicIntent: retrievalResult.topicIntent || null,
                    rewrittenQuery: retrievalResult.rewrittenQuery || retrievalResult.normalizedQuery,
                    semanticBridge: semanticBridgeResult
                },
                topChunks: topChunks.map((chunk) => ({
                    chunkId: chunk.chunk_id,
                    title: chunk.title,
                    sourceId: chunk.source_id,
                    sourceName: chunk.source_name,
                    sourceUrl: chunk.source_url || null,
                    section: chunk.section,
                    faqType: chunk.faq_type,
                    riskLevel: chunk.risk_level,
                    score: chunk.score,
                    retrievalSource: chunk.retrievalSource || null,
                    matchedTerms: chunk.matchedTerms
                })),
                citations,
                knowledgeItem: {
                    id: primaryChunk.kb_id || primaryChunk.chunk_id || null,
                    title: primaryChunk.title || null,
                    source: primaryChunk.source_url
                        ? `${primaryChunk.source_name} - ${primaryChunk.source_url}`
                        : primaryChunk.source_name || primaryChunk.source_id || null,
                    tags: Array.isArray(primaryChunk.tags) ? primaryChunk.tags : [],
                    test_types: Array.isArray(primaryChunk.test_types)
                        ? primaryChunk.test_types
                        : []
                }
            }, recommendationDecision)
        });
    } catch (error) {
        console.error("RAG service error:", error);

        return createChatResult({
            sessionId,
            userMessage: message,
            flow: FLOWS.HEALTH_RAG,
            action: ACTIONS.ANSWER_HEALTH_QUERY,
            reply:
                "Hệ thống chưa đọc được health_rag artifact hiện tại để trả lời câu hỏi này. Bạn thử lại sau khi kiểm tra artifact trong ai_lab.",
            booking: null,
            meta: {
                answeredBy: "rag.service",
                retrievalMode: "artifact_json_top3_versioned",
                found: false,
                grounded: false,
                error: error.message,
                intentGroup: getIntentGroup(message),
                selectedRetrievalMode: "lexical_fallback",
                debug: {
                    legacyLexicalRuntimeMode: null,
                    intentGroup: getIntentGroup(message),
                    semanticRetrieval: {
                        semanticRetrievalEnabled: isSemanticRetrievalEnabled(),
                        status: "error",
                        semanticRetrievalStatus: "error",
                        runtimeMode: "lexical_fallback",
                        selectedRetrievalMode: "lexical_fallback",
                        semanticTopChunk: null,
                        fallbackReason: error.message
                    },
                    queryExpansions: [],
                    queryRewriteRules: [],
                    topicIntent: null,
                    rewrittenQuery: null
                }
            }
        });
    }
}

module.exports = {
    answerHealthQuery
};
