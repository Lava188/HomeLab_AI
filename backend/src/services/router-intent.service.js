const { FLOWS, ACTIONS } = require("../constants/chat.constants");
const { normalizeText } = require("../utils/text.util");

const ROUTER_STOPWORDS = new Set([
    "toi",
    "em",
    "anh",
    "chi",
    "minh",
    "la",
    "thi",
    "va",
    "hay",
    "voi",
    "cho",
    "nhe",
    "oi",
    "ah",
    "a",
    "giup",
    "can",
    "muon"
]);

const ROUTER_SYNONYM_RULES = [
    {
        pattern: /\bbook\b|\bbooking\b/g,
        expansions: ["dat lich"]
    },
    {
        pattern: /\breschedule\b|\bdoi hen\b|\bchuyen hen\b/g,
        expansions: ["doi lich"]
    },
    {
        pattern: /\bcancel\b|\bhuy hen\b/g,
        expansions: ["huy lich"]
    },
    {
        pattern: /\bnhuc dau\b|\bdau nua dau\b/g,
        expansions: ["dau dau"]
    },
    {
        pattern: /\bdau da day\b|\bdau bung am i\b/g,
        expansions: ["dau bung"]
    },
    {
        pattern: /\bxiu\b|\bchoang roi nga\b/g,
        expansions: ["ngat"]
    },
    {
        pattern: /\bngop tho\b|\btho khong ra hoi\b|\btho gap\b/g,
        expansions: ["kho tho"]
    },
    {
        pattern: /\bdi ung nang\b|\bsoc phan ve\b/g,
        expansions: ["phan ve"]
    }
];

const INTENT_DEFINITIONS = [
    {
        flow: FLOWS.BOOKING,
        keywords: [
            "dat lich",
            "lay mau tai nha",
            "xet nghiem tai nha",
            "dang ky lich",
            "hen lay mau"
        ],
        exemplars: [
            "toi muon dat lich xet nghiem",
            "dat lich lay mau tai nha",
            "giup toi book lich lay mau"
        ]
    },
    {
        flow: FLOWS.RESCHEDULE,
        keywords: [
            "doi lich",
            "doi ngay",
            "doi gio",
            "chuyen lich",
            "hen lai"
        ],
        exemplars: [
            "toi muon doi lich hen",
            "giup toi doi ngay lay mau",
            "toi can chuyen lich da dat"
        ]
    },
    {
        flow: FLOWS.CANCEL,
        keywords: [
            "huy lich",
            "khong dat nua",
            "xac nhan huy",
            "bo lich"
        ],
        exemplars: [
            "toi muon huy lich",
            "giup toi huy hen lay mau",
            "toi khong dat nua"
        ]
    },
    {
        flow: FLOWS.HEALTH_RAG,
        keywords: [
            "xet nghiem",
            "nhin an",
            "duong huyet",
            "mo mau",
            "chi so",
            "suc khoe",
            "trieu chung",
            "tu van",
            "mau",
            "nuoc tieu",
            "dau nguc",
            "kho tho",
            "nhiem trung",
            "sepsis",
            "dau bung",
            "dau dau",
            "ngat",
            "phan ve",
            "di ung",
            "sung moi",
            "sung luoi",
            "ngop tho",
            "co cung",
            "yeu liet",
            "non ra mau",
            "phan den"
        ],
        exemplars: [
            "xet nghiem mo mau co can nhin an khong",
            "toi bi dau bung 2 ngay nay",
            "em nhuc dau may ngay nay",
            "toi bi ngat lap lai",
            "toi nghi bi phan ve",
            "toi kho tho sau khi an hai san"
        ]
    }
];

let classifierCache = null;

const HIGH_RISK_SHORT_QUERY_SIGNALS = [
    "dau nguc",
    "kho tho",
    "ngat",
    "phan ve",
    "sung moi",
    "sung luoi",
    "non ra mau",
    "phan den",
    "co cung",
    "yeu liet",
    "noi kho",
    "ho ra mau"
];

function tokenize(text) {
    return normalizeText(text)
        .split(/[^a-z0-9]+/i)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2 && !ROUTER_STOPWORDS.has(token));
}

function rewriteForRouting(message) {
    const normalizedMessage = normalizeText(message);
    const additions = new Set();

    for (const rule of ROUTER_SYNONYM_RULES) {
        if (rule.pattern.test(normalizedMessage)) {
            for (const expansion of rule.expansions) {
                additions.add(expansion);
            }
        }

        rule.pattern.lastIndex = 0;
    }

    return {
        normalizedMessage,
        expandedMessage: [normalizedMessage, ...additions].join(" ").trim(),
        expansions: [...additions]
    };
}

function buildClassifierCache() {
    if (classifierCache) {
        return classifierCache;
    }

    const documents = INTENT_DEFINITIONS.map((definition) => ({
        flow: definition.flow,
        text: [...definition.keywords, ...definition.exemplars].join(" ")
    }));

    const vocab = new Set();
    const docFrequencies = new Map();
    const tokenizedDocs = documents.map((document) => {
        const tokens = tokenize(document.text);
        const uniqueTokens = new Set(tokens);

        for (const token of uniqueTokens) {
            vocab.add(token);
            docFrequencies.set(token, (docFrequencies.get(token) || 0) + 1);
        }

        return {
            flow: document.flow,
            tokens
        };
    });

    const vocabIndex = new Map([...vocab].sort().map((token, index) => [token, index]));
    const totalDocs = documents.length;
    const idfByToken = new Map();

    for (const [token, df] of docFrequencies.entries()) {
        idfByToken.set(token, Math.log((1 + totalDocs) / (1 + df)) + 1);
    }

    const prototypeVectors = tokenizedDocs.map((document) => ({
        flow: document.flow,
        vector: vectorizeTokens(document.tokens, vocabIndex, idfByToken)
    }));

    classifierCache = {
        vocabIndex,
        idfByToken,
        prototypeVectors
    };

    return classifierCache;
}

function vectorizeTokens(tokens, vocabIndex, idfByToken) {
    const vector = new Array(vocabIndex.size).fill(0);
    const counts = new Map();
    const total = tokens.length || 1;

    for (const token of tokens) {
        counts.set(token, (counts.get(token) || 0) + 1);
    }

    for (const [token, count] of counts.entries()) {
        const index = vocabIndex.get(token);

        if (index === undefined) {
            continue;
        }

        const tf = count / total;
        const idf = idfByToken.get(token) || 1;
        vector[index] = tf * idf;
    }

    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));

    if (!norm) {
        return vector;
    }

    return vector.map((value) => value / norm);
}

function dotProduct(left, right) {
    let sum = 0;
    const length = Math.min(left.length, right.length);

    for (let index = 0; index < length; index += 1) {
        sum += left[index] * right[index];
    }

    return sum;
}

function getShortRiskClarifyingReply(expandedMessage) {
    if (
        expandedMessage.includes("phan ve") ||
        expandedMessage.includes("sung moi") ||
        expandedMessage.includes("sung luoi")
    ) {
        return (
            "Mình cần bạn nói rõ thêm mức độ khẩn cấp. Bạn có đang bị khó thở, sưng môi hoặc sưng lưỡi, " +
            "chóng mặt nhiều, hay ngất sau dị ứng không? Nếu có, bạn nên gọi cấp cứu ngay thay vì tự theo dõi."
        );
    }

    if (expandedMessage.includes("kho tho")) {
        return (
            "Bạn có thể mô tả rõ hơn khó thở đang ở mức nào không: có nói được thành câu không, " +
            "có tím môi, đau ngực, hoặc nặng lên nhanh không? Nếu có các dấu hiệu này, bạn nên đi cấp cứu ngay."
        );
    }

    if (expandedMessage.includes("dau nguc")) {
        return (
            "Bạn mô tả rõ thêm giúp mình: đau ngực có lan ra tay, hàm hoặc lưng không, có khó thở, vã mồ hôi, " +
            "buồn nôn hoặc choáng không? Nếu có, bạn nên đi cấp cứu ngay."
        );
    }

    if (expandedMessage.includes("ngat")) {
        return (
            "Bạn nói rõ thêm giúp mình: bạn chỉ choáng hay đã ngất hẳn, có đau ngực, khó thở, chấn thương đầu, " +
            "hoặc khó hồi tỉnh không? Nếu có, bạn nên đi cấp cứu ngay."
        );
    }

    return (
        "Bạn mô tả rõ hơn giúp mình dấu hiệu đang làm bạn lo, thời gian xuất hiện, và có kèm khó thở, đau ngực, " +
        "ngất, nôn ra máu hoặc dấu hiệu nặng lên nhanh không. Nếu có các dấu hiệu này, bạn nên đi cấp cứu ngay."
    );
}

function isAmbiguousUrgentQuery(expandedMessage, tokenCount) {
    const asksUrgentDisposition =
        expandedMessage.includes("di vien") ||
        expandedMessage.includes("cap cuu") ||
        expandedMessage.includes("khan cap") ||
        expandedMessage.includes("theo doi");
    const vagueSymptomReference =
        expandedMessage.includes("trieu chung") ||
        expandedMessage.includes("dau hieu") ||
        expandedMessage.includes("tinh trang") ||
        expandedMessage.includes("khong on");
    const hasConcreteHighRiskSignal = HIGH_RISK_SHORT_QUERY_SIGNALS.some((signal) =>
        expandedMessage.includes(signal)
    );

    return (
        tokenCount <= 12 &&
        asksUrgentDisposition &&
        vagueSymptomReference &&
        !hasConcreteHighRiskSignal
    );
}

function getAmbiguousUrgentClarifyingReply() {
    return (
        "Mình chưa đủ thông tin để kết luận bạn cần đi viện ngay hay có thể theo dõi. " +
        "Bạn hãy mô tả triệu chứng chính, thời điểm bắt đầu, mức độ nặng lên và có kèm khó thở, đau ngực, ngất, lú lẫn, môi tím, nôn ra máu, phân đen hoặc tình trạng xấu đi nhanh không. " +
        "Nếu có các dấu hiệu đó, bạn nên liên hệ cấp cứu hoặc cơ sở y tế khẩn cấp thay vì tự theo dõi."
    );
}

function isCustomerTestSafetyQuery(expandedMessage) {
    const testIntent =
        expandedMessage.includes("xet nghiem") ||
        expandedMessage.includes("chi so") ||
        expandedMessage.includes("goi xet nghiem");
    const infectionConcern =
        expandedMessage.includes("nhiem trung") ||
        expandedMessage.includes("sepsis") ||
        expandedMessage.includes("viem");

    return testIntent && infectionConcern;
}

function detectFlow(message) {
    const rewritten = rewriteForRouting(message);
    const { vocabIndex, idfByToken, prototypeVectors } = buildClassifierCache();
    const queryTokens = tokenize(rewritten.expandedMessage);
    const queryVector = vectorizeTokens(queryTokens, vocabIndex, idfByToken);

    const scoredIntents = prototypeVectors
        .map((prototype) => {
            const definition = INTENT_DEFINITIONS.find(
                (item) => item.flow === prototype.flow
            );
            const keywordHits = (definition?.keywords || []).filter((keyword) =>
                rewritten.expandedMessage.includes(keyword)
            );
            const similarity = dotProduct(queryVector, prototype.vector);
            const score = similarity + keywordHits.length * 0.08;

            return {
                flow: prototype.flow,
                similarity: Number(similarity.toFixed(4)),
                keywordHits,
                score: Number(score.toFixed(4))
            };
        })
        .sort((left, right) => right.score - left.score);

    const topIntent = scoredIntents[0] || null;
    const nextIntent = scoredIntents[1] || null;
    const tokenCount = queryTokens.length;
    const hasHighRiskSignal = HIGH_RISK_SHORT_QUERY_SIGNALS.some((signal) =>
        rewritten.expandedMessage.includes(signal)
    );
    const isTooGenericHealthAsk =
        rewritten.expandedMessage.includes("tu van suc khoe") ||
        rewritten.expandedMessage.includes("hoi ve suc khoe") ||
        rewritten.expandedMessage.includes("tu van mot chut");
    const ambiguousUrgentQuery = isAmbiguousUrgentQuery(
        rewritten.expandedMessage,
        tokenCount
    );
    const customerTestSafetyQuery = isCustomerTestSafetyQuery(
        rewritten.expandedMessage
    );

    if (ambiguousUrgentQuery) {
        return {
            flow: FLOWS.FALLBACK,
            action: ACTIONS.FALLBACK_RESPONSE,
            reply: getAmbiguousUrgentClarifyingReply(),
            routerDebug: {
                normalizedMessage: rewritten.normalizedMessage,
                expandedMessage: rewritten.expandedMessage,
                expansions: rewritten.expansions,
                classifierMode: "tfidf_prototype_intent_router",
                customerTestSafetyGate: customerTestSafetyQuery,
                lowConfidenceGuard: {
                    triggered: true,
                    tokenCount,
                    topScore: topIntent.score,
                    nextScore: nextIntent?.score || null,
                    reason: "ambiguous_urgent_query_needs_clarification"
                },
                scoredIntents
            }
        };
    }

    if (
        topIntent &&
        topIntent.flow === FLOWS.HEALTH_RAG &&
        tokenCount <= 4 &&
        hasHighRiskSignal
    ) {
        return {
            flow: FLOWS.FALLBACK,
            action: ACTIONS.FALLBACK_RESPONSE,
            reply: getShortRiskClarifyingReply(rewritten.expandedMessage),
            routerDebug: {
                normalizedMessage: rewritten.normalizedMessage,
                expandedMessage: rewritten.expandedMessage,
                expansions: rewritten.expansions,
                classifierMode: "tfidf_prototype_intent_router",
                customerTestSafetyGate: customerTestSafetyQuery,
                lowConfidenceGuard: {
                    triggered: true,
                    tokenCount,
                    topScore: topIntent.score,
                    nextScore: nextIntent?.score || null,
                    reason: "short_high_risk_query"
                },
                scoredIntents
            }
        };
    }

    if (
        topIntent &&
        topIntent.flow === FLOWS.HEALTH_RAG &&
        (tokenCount <= 3 ||
            isTooGenericHealthAsk ||
            topIntent.score < 0.28 ||
            (nextIntent && topIntent.score - nextIntent.score < 0.08))
    ) {
        return {
            flow: FLOWS.FALLBACK,
            action: ACTIONS.FALLBACK_RESPONSE,
            reply:
                "Mình có thể hỗ trợ tốt hơn nếu bạn nói rõ hơn bạn đang hỏi về triệu chứng nào, tên xét nghiệm nào, hoặc dấu hiệu nào đang làm bạn lo. Ví dụ: đau bụng 2 ngày, nhức đầu kéo dài, khó thở sau ăn hải sản, hay xét nghiệm mỡ máu có cần nhịn ăn không.",
            routerDebug: {
                normalizedMessage: rewritten.normalizedMessage,
                expandedMessage: rewritten.expandedMessage,
                expansions: rewritten.expansions,
                classifierMode: "tfidf_prototype_intent_router",
                customerTestSafetyGate: customerTestSafetyQuery,
                lowConfidenceGuard: {
                    triggered: true,
                    tokenCount,
                    topScore: topIntent.score,
                    nextScore: nextIntent?.score || null,
                    reason: isTooGenericHealthAsk
                        ? "generic_health_request"
                        : tokenCount <= 3
                            ? "too_short"
                            : topIntent.score < 0.28
                                ? "low_top_score"
                                : "small_score_margin"
                },
                scoredIntents
            }
        };
    }

    if (
        topIntent &&
        topIntent.score >= 0.18 &&
        (!nextIntent || topIntent.score - nextIntent.score >= 0.04)
    ) {
        return {
            flow: topIntent.flow,
            routerDebug: {
                normalizedMessage: rewritten.normalizedMessage,
                expandedMessage: rewritten.expandedMessage,
                expansions: rewritten.expansions,
                classifierMode: "tfidf_prototype_intent_router",
                customerTestSafetyGate: customerTestSafetyQuery,
                lowConfidenceGuard: {
                    triggered: false,
                    tokenCount,
                    topScore: topIntent.score,
                    nextScore: nextIntent?.score || null,
                    reason: null
                },
                scoredIntents
            }
        };
    }

    return {
        flow: FLOWS.FALLBACK,
        action: ACTIONS.FALLBACK_RESPONSE,
        reply:
            "Xin lỗi, hiện tại mình chưa hiểu rõ yêu cầu của bạn. Bạn có thể hỏi về tư vấn sức khỏe cơ bản, đặt lịch xét nghiệm tại nhà, đổi lịch hoặc hủy lịch.",
        routerDebug: {
            normalizedMessage: rewritten.normalizedMessage,
            expandedMessage: rewritten.expandedMessage,
            expansions: rewritten.expansions,
            classifierMode: "tfidf_prototype_intent_router",
            customerTestSafetyGate: customerTestSafetyQuery,
            lowConfidenceGuard: {
                triggered: true,
                tokenCount,
                topScore: topIntent?.score || null,
                nextScore: nextIntent?.score || null,
                reason: "no_clear_intent"
            },
            scoredIntents
        }
    };
}

module.exports = {
    detectFlow
};
