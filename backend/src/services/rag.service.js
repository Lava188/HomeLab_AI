const { FLOWS, ACTIONS } = require("../constants/chat.constants");
const { createChatResult } = require("../utils/chat-response.util");
const { retrieveTopChunks } = require("./health-rag/retriever.service");
const { choosePolicyMode } = require("./health-rag/policy.service");
const { composeGroundedAnswer } = require("./health-rag/answer.service");

async function answerHealthQuery({ message, sessionId }) {
    try {
        const retrievalResult = retrieveTopChunks({
            message,
            topK: 3
        });
        const topChunks = retrievalResult.chunks || [];
        const policyDecision = choosePolicyMode({
            message,
            retrievedChunks: topChunks
        });
        const reply = composeGroundedAnswer({
            policyDecision,
            topChunks
        });

        if (!topChunks.length) {
            return createChatResult({
                sessionId,
                userMessage: message,
                flow: FLOWS.HEALTH_RAG,
                action: ACTIONS.ANSWER_HEALTH_QUERY,
                reply,
                booking: null,
                meta: {
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
                    modelName: retrievalResult.modelName,
                    debug: {
                        runtimeMode: retrievalResult.runtimeMode || null,
                        queryExpansions: retrievalResult.queryExpansions || [],
                        queryRewriteRules: retrievalResult.queryRewriteRules || [],
                        topicIntent: retrievalResult.topicIntent || null,
                        rewrittenQuery: retrievalResult.rewrittenQuery || retrievalResult.normalizedQuery
                    },
                    topChunks: []
                }
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
            meta: {
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
                modelName: retrievalResult.modelName,
                debug: {
                    runtimeMode: retrievalResult.runtimeMode || null,
                    queryExpansions: retrievalResult.queryExpansions || [],
                    queryRewriteRules: retrievalResult.queryRewriteRules || [],
                    topicIntent: retrievalResult.topicIntent || null,
                    rewrittenQuery: retrievalResult.rewrittenQuery || retrievalResult.normalizedQuery
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
            }
        });
    } catch (error) {
        console.error("RAG service error:", error);

        return createChatResult({
            sessionId,
            userMessage: message,
            flow: FLOWS.HEALTH_RAG,
            action: ACTIONS.ANSWER_HEALTH_QUERY,
            reply:
                "He thong chua doc duoc health_rag artifact hien tai de tra loi cau hoi nay. Ban thu lai sau khi kiem tra artifact trong ai_lab.",
            booking: null,
            meta: {
                answeredBy: "rag.service",
                retrievalMode: "artifact_json_top3_versioned",
                found: false,
                grounded: false,
                error: error.message,
                debug: {
                    runtimeMode: null,
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
