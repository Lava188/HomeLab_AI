const fs = require("fs");
const path = require("path");

const { FLOWS, ACTIONS } = require("../constants/chat.constants");
const { createChatResult } = require("../utils/chat-response.util");
const { normalizeText } = require("../utils/text.util");

const KNOWLEDGE_FILE_PATH = path.join(
    __dirname,
    "../../../ai_lab/datasets/knowledge_items.json"
);

let knowledgeCache = null;

function safeArray(value) {
    if (Array.isArray(value)) return value;
    if (typeof value === "string" && value.trim()) return [value];
    return [];
}

function safeText(value) {
    return String(value || "").trim();
}

function loadKnowledgeItems() {
    if (knowledgeCache) {
        return knowledgeCache;
    }

    if (!fs.existsSync(KNOWLEDGE_FILE_PATH)) {
        throw new Error(`Knowledge file not found at: ${KNOWLEDGE_FILE_PATH}`);
    }

    const rawText = fs.readFileSync(KNOWLEDGE_FILE_PATH, "utf-8");
    const parsedData = JSON.parse(rawText);

    let items = [];

    if (Array.isArray(parsedData)) {
        items = parsedData;
    } else if (Array.isArray(parsedData.items)) {
        items = parsedData.items;
    } else {
        throw new Error(
            "knowledge_items.json must be an array or an object with an 'items' array"
        );
    }

    knowledgeCache = items;
    return knowledgeCache;
}

function buildSearchableText(item) {
    const title = safeText(item.title);
    const content = safeText(item.content);
    const tags = safeArray(item.tags).join(" ");
    const testTypes = safeArray(item.test_types).join(" ");
    const keywords = safeArray(item.keywords).join(" ");

    return normalizeText(`${title} ${content} ${tags} ${testTypes} ${keywords}`);
}

function extractQueryTokens(message) {
    const normalized = normalizeText(message);

    return normalized
        .split(/[^a-z0-9]+/i)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2);
}

function scoreItem(item, queryTokens, normalizedMessage) {
    const searchableText = buildSearchableText(item);
    let score = 0;
    const matchedTokens = [];

    for (const token of queryTokens) {
        if (searchableText.includes(token)) {
            score += 2;
            matchedTokens.push(token);
        }
    }

    const title = normalizeText(item.title);
    const tags = safeArray(item.tags).map(normalizeText);
    const testTypes = safeArray(item.test_types).map(normalizeText);

    for (const token of queryTokens) {
        if (title.includes(token)) {
            score += 2;
        }

        if (tags.some((tag) => tag.includes(token))) {
            score += 3;
        }

        if (testTypes.some((testType) => testType.includes(token))) {
            score += 3;
        }
    }

    if (normalizedMessage.includes("nhin an") && searchableText.includes("nhin an")) {
        score += 4;
    }

    if (normalizedMessage.includes("xet nghiem") && searchableText.includes("xet nghiem")) {
        score += 2;
    }

    return {
        score,
        matchedTokens: [...new Set(matchedTokens)]
    };
}

function retrieveTopKnowledgeItem(message) {
    const knowledgeItems = loadKnowledgeItems();
    const queryTokens = extractQueryTokens(message);
    const normalizedMessage = normalizeText(message);

    let bestItem = null;
    let bestScore = 0;
    let bestMatchedTokens = [];

    for (const item of knowledgeItems) {
        const result = scoreItem(item, queryTokens, normalizedMessage);

        if (result.score > bestScore) {
            bestScore = result.score;
            bestItem = item;
            bestMatchedTokens = result.matchedTokens;
        }
    }

    return {
        item: bestItem,
        score: bestScore,
        matchedTokens: bestMatchedTokens
    };
}

function buildGroundedReply(item) {
    const title = safeText(item.title);
    const content = safeText(item.content);
    const source = safeText(item.source);

    let reply = "";

    if (title) {
        reply += `${title}: `;
    }

    reply += content || "Mình đã tìm thấy thông tin liên quan trong knowledge base.";
    reply +=
        " Lưu ý: HomeLab chỉ hỗ trợ tư vấn sức khỏe cơ bản và không thay thế chẩn đoán của bác sĩ.";

    if (source) {
        reply += ` Nguồn tham khảo: ${source}.`;
    }

    return reply.trim();
}

async function answerHealthQuery({ message, sessionId }) {
    try {
        const retrievalResult = retrieveTopKnowledgeItem(message);

        if (!retrievalResult.item || retrievalResult.score <= 0) {
            return createChatResult({
                sessionId,
                userMessage: message,
                flow: FLOWS.HEALTH_RAG,
                action: ACTIONS.ANSWER_HEALTH_QUERY,
                reply:
                    "Mình chưa tìm thấy thông tin phù hợp trong knowledge base hiện tại. Bạn có thể diễn đạt rõ hơn, ví dụ tên xét nghiệm, triệu chứng hoặc câu hỏi chuẩn bị trước xét nghiệm.",
                booking: null,
                meta: {
                    answeredBy: "rag.service",
                    retrievalMode: "fake_rag_keyword_matching_v1",
                    found: false,
                    score: retrievalResult.score,
                    matchedTokens: retrievalResult.matchedTokens
                }
            });
        }

        return createChatResult({
            sessionId,
            userMessage: message,
            flow: FLOWS.HEALTH_RAG,
            action: ACTIONS.ANSWER_HEALTH_QUERY,
            reply: buildGroundedReply(retrievalResult.item),
            booking: null,
            meta: {
                answeredBy: "rag.service",
                retrievalMode: "fake_rag_keyword_matching_v1",
                found: true,
                score: retrievalResult.score,
                matchedTokens: retrievalResult.matchedTokens,
                knowledgeItem: {
                    id: retrievalResult.item.id || null,
                    title: retrievalResult.item.title || null,
                    source: retrievalResult.item.source || null,
                    tags: safeArray(retrievalResult.item.tags),
                    test_types: safeArray(retrievalResult.item.test_types)
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
                "Hiện tại hệ thống chưa đọc được knowledge base để trả lời câu hỏi này. Bạn hãy kiểm tra lại file knowledge_items.json hoặc thử lại sau.",
            booking: null,
            meta: {
                answeredBy: "rag.service",
                retrievalMode: "fake_rag_keyword_matching_v1",
                found: false,
                error: error.message
            }
        });
    }
}

module.exports = {
    answerHealthQuery
};