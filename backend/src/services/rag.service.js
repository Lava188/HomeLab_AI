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
const {
    composeRecommendationAnswer
} = require("./recommendation/recommendation-answer.service");

function isSemanticRetrievalEnabled() {
    return String(process.env.HOMELAB_SEMANTIC_RETRIEVAL_ENABLED || "")
        .trim()
        .toLowerCase() === "true";
}

function isSemanticRetrieverV14Requested() {
    return String(process.env.HOMELAB_SEMANTIC_RETRIEVER_VERSION || "")
        .trim()
        .toLowerCase() === "v1_4";
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

function isV14ControlledSemanticResult(semanticBridgeResult) {
    return (
        semanticBridgeResult?.retrieverVersion === "v1_4" ||
        semanticBridgeResult?.retrievalStrategy ===
            "expanded_query_topic_aware_rerank" ||
        isSemanticRetrieverV14Requested()
    );
}

function normalizeBridgeChunkForRuntime(chunk) {
    const semanticScore = Number(chunk.semanticScore);
    const rerankScore = Number(chunk.rerankScore);
    const score = Number.isFinite(rerankScore)
        ? rerankScore
        : Number.isFinite(semanticScore)
            ? semanticScore
            : 0;
    const sourceUrl = chunk.source_url || chunk.final_url || null;
    const sourceName =
        chunk.source_name ||
        chunk.sourceName ||
        chunk.domain ||
        chunk.source_id ||
        null;

    return {
        ...chunk,
        chunk_id: chunk.chunk_id || chunk.id || chunk.kb_id || null,
        kb_id: chunk.kb_id || chunk.id || chunk.chunk_id || null,
        source_id: chunk.source_id || chunk.domain || chunk.source_url || null,
        source_name: sourceName,
        source_url: sourceUrl,
        final_url: chunk.final_url || sourceUrl,
        content:
            chunk.content ||
            chunk.chunk_text ||
            chunk.contentPreview ||
            chunk.title ||
            "",
        semanticScore: Number.isFinite(semanticScore) ? semanticScore : score,
        rerankScore: Number.isFinite(rerankScore) ? rerankScore : score,
        score,
        matchedTerms: chunk.matchedTerms || [],
        tags: Array.isArray(chunk.tags) ? chunk.tags : [],
        test_types: Array.isArray(chunk.test_types) ? chunk.test_types : [],
        retrievalSource: "semantic_faiss",
        provenance: chunk.provenance || null
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

const LAB_TEST_EXPLANATION_TERMS = [
    "hba1c",
    "glucose",
    "duong huyet",
    "duong mau",
    "tieu duong",
    "dai thao duong",
    "alt",
    "ast",
    "men gan",
    "chuc nang gan",
    "bilirubin",
    "tsh",
    "t4",
    "t3",
    "tuyen giap",
    "cholesterol",
    "triglyceride",
    "triglycerides",
    "mo mau",
    "creatinine",
    "creatinin",
    "egfr",
    "gfr",
    "chuc nang than",
    "kidney function",
    "loc cau than",
    "muc loc cau than",
    "albumin nieu",
    "protein nieu",
    "nuoc tieu",
    "cbc",
    "cong thuc mau",
    "hong cau",
    "bach cau",
    "tieu cau"
];

const LAB_TEST_EXPLANATION_QUESTION_SIGNALS = [
    "la gi",
    "nhu the nao",
    "the nao",
    "khac nhau the nao",
    "khac gi",
    "dung de kiem tra gi",
    "dung kiem tra gi",
    "kiem tra gi",
    "de lam gi",
    "kiem tra duoc gi",
    "co can",
    "can khong",
    "can chuan bi gi",
    "phai khong",
    "noi len dieu gi",
    "noi len gi",
    "lay mau hay nuoc tieu",
    "lay mau khong",
    "nhin an khong",
    "y nghia",
    "doc giup",
    "giai thich",
    "chi so",
    "ket qua"
];

function isLabTestExplanationQuery(normalizedMessage) {
    const hasLabTerm = includesAny(
        normalizedMessage,
        LAB_TEST_EXPLANATION_TERMS
    );
    const hasExplanationQuestion = includesAny(
        normalizedMessage,
        LAB_TEST_EXPLANATION_QUESTION_SIGNALS
    );
    const hasTestWord = normalizedMessage.includes("xet nghiem");

    return hasLabTerm && (hasExplanationQuestion || hasTestWord);
}

const MEDICAL_REVIEW_BOUNDARY_SIGNALS = [
    "bi benh gi",
    "co benh gi",
    "mac benh gi",
    "chac bi",
    "co phai bi",
    "ket luan benh",
    "chan doan",
    "bat thuong"
];

function isMedicalReviewBoundaryQuery(normalizedMessage) {
    return includesAny(normalizedMessage, MEDICAL_REVIEW_BOUNDARY_SIGNALS);
}

function isLabTestExplanationAnswerQuery(message) {
    const normalizedMessage = normalizeText(message);

    return (
        isLabTestExplanationQuery(normalizedMessage) &&
        !isMedicalReviewBoundaryQuery(normalizedMessage)
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
        "kiem tra chuc nang than",
        "xet nghiem chuc nang than",
        "chuc nang than",
        "creatinine",
        "egfr",
        "loc cau than",
        "muc loc cau than",
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

    if (isLabTestExplanationQuery(normalizedMessage)) {
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

    const artifactOptions = semanticBridgeResult?.retrieverVersion
        ? { version: semanticBridgeResult.retrieverVersion }
        : {};
    const { chunks } = loadArtifacts(artifactOptions);
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
        } else if (isV14ControlledSemanticResult(semanticBridgeResult)) {
            const semanticChunks = semanticBridgeResult.topChunks.map(
                normalizeBridgeChunkForRuntime
            );

            if (
                intentGroup === "test_advice" &&
                semanticChunks[0]?.section === "red_flags"
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
                        fallbackReason,
                        fallbackUsed: true,
                        retrieverVersion:
                            semanticBridgeResult.retrieverVersion || null,
                        retrievalStrategy:
                            semanticBridgeResult.retrievalStrategy || null,
                        artifactDir: semanticBridgeResult.artifactDir || null,
                        candidateTopK:
                            semanticBridgeResult.candidateTopK || null,
                        finalTopK: semanticBridgeResult.finalTopK || null,
                        queryExpansionApplied:
                            semanticBridgeResult.queryExpansionApplied === true,
                        detectedAliasGroups:
                            semanticBridgeResult.detectedAliasGroups || [],
                        queryExpansionTerms:
                            semanticBridgeResult.queryExpansionTerms || [],
                        expandedQuery:
                            semanticBridgeResult.expandedQuery || null,
                        runtimePromoted:
                            semanticBridgeResult.runtimePromoted === true,
                        runtimeDefaultChanged:
                            semanticBridgeResult.runtimeDefaultChanged === true
                    }
                };
            }

            selectedChunks = semanticChunks;
            selectedRetrievalMode = "semantic_faiss";
            fallbackReason = null;
            coherenceFilter = {
                applied: false,
                removedChunks: [],
                reason: "v1_4_bridge_results_preserved_without_artifact_hydration"
            };
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
            fallbackReason,
            fallbackUsed: Boolean(fallbackReason),
            retrieverVersion: semanticBridgeResult?.retrieverVersion || null,
            retrievalStrategy: semanticBridgeResult?.retrievalStrategy || null,
            artifactDir: semanticBridgeResult?.artifactDir || null,
            candidateTopK: semanticBridgeResult?.candidateTopK || null,
            finalTopK: semanticBridgeResult?.finalTopK || null,
            queryExpansionApplied:
                semanticBridgeResult?.queryExpansionApplied === true,
            detectedAliasGroups:
                semanticBridgeResult?.detectedAliasGroups || [],
            queryExpansionTerms:
                semanticBridgeResult?.queryExpansionTerms || [],
            expandedQuery: semanticBridgeResult?.expandedQuery || null,
            runtimePromoted: semanticBridgeResult?.runtimePromoted === true,
            runtimeDefaultChanged:
                semanticBridgeResult?.runtimeDefaultChanged === true
        }
    };
}

function buildRetrievalMeta({
    retrievalResult,
    selectedRetrieval,
    semanticBridgeResult
}) {
    const semanticDebug = selectedRetrieval.debug || {};
    const selectedSemantic =
        semanticDebug.selectedRetrievalMode === "semantic_faiss" &&
        semanticBridgeResult?.semanticBridgeStatus === "ok";

    return {
        retrieverVersion: selectedSemantic
            ? semanticBridgeResult.retrieverVersion || retrievalResult.retrieverVersion
            : retrievalResult.retrieverVersion,
        retrievalStrategy: selectedSemantic
            ? semanticBridgeResult.retrievalStrategy || null
            : null,
        artifactDir: selectedSemantic
            ? semanticBridgeResult.artifactDir || null
            : null,
        candidateTopK: selectedSemantic
            ? semanticBridgeResult.candidateTopK || null
            : null,
        finalTopK: selectedSemantic
            ? semanticBridgeResult.finalTopK || null
            : null,
        queryExpansionApplied: selectedSemantic
            ? semanticBridgeResult.queryExpansionApplied === true
            : false,
        detectedAliasGroups: selectedSemantic
            ? semanticBridgeResult.detectedAliasGroups || []
            : [],
        queryExpansionTerms: selectedSemantic
            ? semanticBridgeResult.queryExpansionTerms || []
            : [],
        expandedQuery: selectedSemantic
            ? semanticBridgeResult.expandedQuery || null
            : null,
        semanticBridgeStatus:
            semanticBridgeResult?.semanticBridgeStatus || "missing",
        runtimePromoted: selectedSemantic
            ? semanticBridgeResult.runtimePromoted === true
            : false,
        runtimeDefaultChanged: selectedSemantic
            ? semanticBridgeResult.runtimeDefaultChanged === true
            : false,
        fallbackUsed: selectedSemantic
            ? false
            : Boolean(
                retrievalResult.fallbackUsed ||
                    semanticDebug.fallbackReason ||
                    semanticBridgeResult?.fallbackUsed
            ),
        fallbackReason: selectedSemantic
            ? null
            : semanticDebug.fallbackReason ||
                semanticBridgeResult?.fallbackReason ||
                retrievalResult.fallbackReason ||
                null,
        modelName: selectedSemantic
            ? semanticBridgeResult.modelName || retrievalResult.modelName
            : retrievalResult.modelName,
        requestedRetrieverVersion:
            retrievalResult.requestedRetrieverVersion || null,
        loadedRetrieverVersion: selectedSemantic
            ? semanticBridgeResult.retrieverVersion || null
            : retrievalResult.loadedRetrieverVersion ||
                retrievalResult.retrieverVersion ||
                null
    };
}

function applyIntentGroupPolicy(policyDecision, intentGroup, message) {
    if (intentGroup === "urgent_health") {
        return {
            ...policyDecision,
            primaryMode: "emergency_or_urgent",
            urgencyLevel: "emergency",
            reason: "urgent_health_business_intent"
        };
    }

    if (isLabTestExplanationAnswerQuery(message)) {
        return {
            ...policyDecision,
            primaryMode: "lab_explanation",
            urgencyLevel: "none",
            reason: "lab_test_explanation_query"
        };
    }

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

function shouldSkipRecommendationForAnswer({ message, intentGroup, policyDecision }) {
    return (
        intentGroup === "test_advice" &&
        policyDecision?.primaryMode === "lab_explanation" &&
        isLabTestExplanationAnswerQuery(message)
    );
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

function applyRecommendationSourceContract(meta, recommendationDecision) {
    if (!recommendationDecision) {
        return meta;
    }

    if (recommendationDecision.decisionType === "medical_review_boundary") {
        return keepSourcesById(meta, ["medlineplus_cbc_test"]);
    }

    return {
        ...meta,
        topChunks: [],
        citations: [],
        knowledgeItem: null,
        recommendationSourceContract: {
            mode: "recommendation_answer_no_visible_rag_source",
            reason: "recommendation_answer_not_grounded_to_current_rag_top_chunk"
        }
    };
}

function keepSourcesById(meta, allowedSourceIds) {
    const allowed = new Set(allowedSourceIds);
    const topChunks = (meta.topChunks || []).filter((chunk) =>
        allowed.has(chunk.sourceId)
    );
    const citations = (meta.citations || []).filter((citation) =>
        allowed.has(citation.sourceId)
    );
    const primaryChunk = topChunks[0] || null;

    return {
        ...meta,
        topChunks,
        citations,
        knowledgeItem: primaryChunk
            ? {
                id: primaryChunk.chunkId || null,
                title: primaryChunk.title || null,
                source: primaryChunk.sourceUrl
                    ? `${primaryChunk.sourceName} - ${primaryChunk.sourceUrl}`
                    : primaryChunk.sourceName || primaryChunk.sourceId || null,
                tags: [],
                test_types: []
            }
            : null,
        recommendationSourceContract: {
            mode: primaryChunk
                ? "recommendation_answer_filtered_rag_source"
                : "recommendation_answer_no_visible_rag_source",
            allowedSourceIds
        }
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
        const retrievalMeta = buildRetrievalMeta({
            retrievalResult,
            selectedRetrieval,
            semanticBridgeResult
        });
        const topChunks = selectedRetrieval.topChunks;
        const policyDecision = applyIntentGroupPolicy(choosePolicyMode({
            message,
            retrievedChunks: topChunks
        }), intentGroup, message);
        const groundedReply = composeGroundedAnswer({
            message,
            policyDecision,
            topChunks
        });
        const skipRecommendation = shouldSkipRecommendationForAnswer({
            message,
            intentGroup,
            policyDecision
        });
        const recommendationDecision =
            !skipRecommendation && shouldRunRecommendationRuntime(intentGroup)
            ? runRecommendationRuntime({
                message,
                intentGroup
            })
            : null;
        const reply = composeRecommendationAnswer(
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
                meta: applyRecommendationSourceContract(attachRecommendationMeta({
                    answeredBy: "rag.service",
                    retrievalMode: "artifact_json_top3_versioned",
                    found: false,
                    grounded: false,
                    primaryMode: policyDecision.primaryMode,
                    urgencyLevel: policyDecision.urgencyLevel,
                    overlapFlag: policyDecision.overlapFlag,
                    reason: policyDecision.reason,
                    policyVersion: policyDecision.policyVersion,
                    retrieverVersion: retrievalMeta.retrieverVersion,
                    retrievalStrategy: retrievalMeta.retrievalStrategy,
                    artifactDir: retrievalMeta.artifactDir,
                    candidateTopK: retrievalMeta.candidateTopK,
                    finalTopK: retrievalMeta.finalTopK,
                    queryExpansionApplied:
                        retrievalMeta.queryExpansionApplied,
                    detectedAliasGroups: retrievalMeta.detectedAliasGroups,
                    queryExpansionTerms: retrievalMeta.queryExpansionTerms,
                    expandedQuery: retrievalMeta.expandedQuery,
                    semanticBridgeStatus:
                        retrievalMeta.semanticBridgeStatus,
                    runtimePromoted: retrievalMeta.runtimePromoted,
                    runtimeDefaultChanged:
                        retrievalMeta.runtimeDefaultChanged,
                    intentGroup,
                    selectedRetrievalMode:
                        selectedRetrieval.debug.selectedRetrievalMode,
                    requestedRetrieverVersion:
                        retrievalMeta.requestedRetrieverVersion,
                    loadedRetrieverVersion:
                        retrievalMeta.loadedRetrieverVersion,
                    fallbackUsed: retrievalMeta.fallbackUsed,
                    fallbackReason: retrievalMeta.fallbackReason,
                    modelName: retrievalMeta.modelName,
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
                }, recommendationDecision), recommendationDecision)
            });
        }

        const primaryChunk = topChunks[0];
        const citations = topChunks.map((chunk) => ({
            chunkId: chunk.chunk_id,
            sourceId: chunk.source_id,
            sourceName: chunk.source_name,
            sourceUrl: chunk.source_url || null,
            finalUrl: chunk.final_url || chunk.source_url || null,
            title: chunk.title
        }));

        return createChatResult({
            sessionId,
            userMessage: message,
            flow: FLOWS.HEALTH_RAG,
            action: ACTIONS.ANSWER_HEALTH_QUERY,
            reply,
            booking: null,
            meta: applyRecommendationSourceContract(attachRecommendationMeta({
                answeredBy: "rag.service",
                retrievalMode: "artifact_json_top3_versioned",
                found: true,
                grounded: true,
                primaryMode: policyDecision.primaryMode,
                urgencyLevel: policyDecision.urgencyLevel,
                overlapFlag: policyDecision.overlapFlag,
                reason: policyDecision.reason,
                policyVersion: policyDecision.policyVersion,
                retrieverVersion: retrievalMeta.retrieverVersion,
                retrievalStrategy: retrievalMeta.retrievalStrategy,
                artifactDir: retrievalMeta.artifactDir,
                candidateTopK: retrievalMeta.candidateTopK,
                finalTopK: retrievalMeta.finalTopK,
                queryExpansionApplied: retrievalMeta.queryExpansionApplied,
                detectedAliasGroups: retrievalMeta.detectedAliasGroups,
                queryExpansionTerms: retrievalMeta.queryExpansionTerms,
                expandedQuery: retrievalMeta.expandedQuery,
                semanticBridgeStatus: retrievalMeta.semanticBridgeStatus,
                runtimePromoted: retrievalMeta.runtimePromoted,
                runtimeDefaultChanged: retrievalMeta.runtimeDefaultChanged,
                intentGroup,
                selectedRetrievalMode:
                    selectedRetrieval.debug.selectedRetrievalMode,
                requestedRetrieverVersion:
                    retrievalMeta.requestedRetrieverVersion,
                loadedRetrieverVersion:
                    retrievalMeta.loadedRetrieverVersion,
                fallbackUsed: retrievalMeta.fallbackUsed,
                fallbackReason: retrievalMeta.fallbackReason,
                modelName: retrievalMeta.modelName,
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
                    finalUrl: chunk.final_url || chunk.source_url || null,
                    section: chunk.section,
                    faqType: chunk.faq_type,
                    riskLevel: chunk.risk_level,
                    score: chunk.score,
                    semanticScore: chunk.semanticScore,
                    rerankScore: chunk.rerankScore,
                    rankBeforeRerank: chunk.rankBeforeRerank,
                    rankAfterRerank: chunk.rankAfterRerank,
                    topic: chunk.topic || null,
                    domain: chunk.domain || null,
                    medicalScope: chunk.medical_scope || null,
                    intendedUse: chunk.intended_use || null,
                    provenance: chunk.provenance || null,
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
            }, recommendationDecision), recommendationDecision)
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
