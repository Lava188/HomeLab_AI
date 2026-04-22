const { loadArtifacts } = require("./artifact-loader.service");
const { normalizeText } = require("../../utils/text.util");

const STOPWORDS = new Set([
    "toi",
    "em",
    "anh",
    "chi",
    "minh",
    "bi",
    "la",
    "thi",
    "nen",
    "lam",
    "gi",
    "sao",
    "co",
    "khong",
    "nay",
    "kia",
    "vua",
    "dang",
    "hay",
    "roi",
    "rat",
    "hoi",
    "moi",
    "ngay",
    "hom",
    "duoc",
    "can"
]);

const SOURCE_HINTS = [
    {
        sourceId: "blood_tests",
        keywords: [
            "xet nghiem",
            "xet nghiem mau",
            "nhin an",
            "duong huyet",
            "mo mau",
            "cholesterol",
            "ket qua",
            "chi so"
        ]
    },
    {
        sourceId: "chest_pain",
        keywords: [
            "dau nguc",
            "tuc nguc",
            "lan ra tay",
            "lan ra ham",
            "va mo hoi",
            "buon non"
        ]
    },
    {
        sourceId: "shortness_of_breath",
        keywords: [
            "kho tho",
            "tho doc",
            "tim moi",
            "tim tai",
            "khong noi duoc",
            "ho ra mau"
        ]
    },
    {
        sourceId: "nice_sepsis_overview",
        keywords: [
            "nhiem trung",
            "sepsis",
            "rat met",
            "rat khong on",
            "xau di nhanh",
            "lu lan",
            "ban khong mat mau"
        ]
    },
    {
        sourceId: "nhs_stomach_ache",
        keywords: [
            "dau bung",
            "bung dau",
            "dau bung keo dai",
            "dau bung du doi",
            "non ra mau",
            "phan den"
        ]
    },
    {
        sourceId: "nhs_headaches",
        keywords: [
            "dau dau",
            "nhuc dau",
            "dau dau keo dai",
            "dau dau du doi",
            "co cung",
            "noi kho",
            "yeu liet"
        ]
    },
    {
        sourceId: "nhs_fainting_adults",
        keywords: [
            "ngat",
            "xiu",
            "ngat xiu",
            "choang roi ngat",
            "ngat tai dien"
        ]
    },
    {
        sourceId: "nhs_anaphylaxis",
        keywords: [
            "phan ve",
            "di ung nang",
            "sung moi",
            "sung luoi",
            "but tiem adrenaline"
        ]
    }
];

const TOPIC_SOURCE_GROUPS = {
    blood_tests: ["blood_tests"],
    chest_pain: ["chest_pain"],
    shortness_of_breath: ["shortness_of_breath"],
    sepsis: ["nice_sepsis_overview"],
    stomach_ache: ["nhs_stomach_ache"],
    headache: ["nhs_headaches"],
    fainting: ["nhs_fainting_adults"],
    anaphylaxis: ["nhs_anaphylaxis"]
};

const QUERY_SYNONYM_RULES = [
    {
        pattern: /\bnhuc dau\b|\bdau nua dau\b|\bdau dau am i\b/g,
        expansions: ["dau dau", "headache"]
    },
    {
        pattern: /\bdau bung am i\b|\bdau da day\b|\bqu?n bung\b/g,
        expansions: ["dau bung", "stomach ache", "abdominal pain"]
    },
    {
        pattern: /\bxiu\b|\bte nga roi tinh lai\b|\bchoang roi nga\b/g,
        expansions: ["ngat", "fainting", "syncope"]
    },
    {
        pattern: /\bdi ung nang\b|\bso phan ve\b|\bsoc phan ve\b/g,
        expansions: ["phan ve", "anaphylaxis", "sung moi", "kho tho"]
    },
    {
        pattern: /\btho khong ra hoi\b|\btho gap\b|\bngop tho\b/g,
        expansions: ["kho tho", "tho doc", "shortness of breath"]
    },
    {
        pattern: /\bdau tuc nguc\b|\be nguc\b/g,
        expansions: ["dau nguc", "chest pain"]
    }
];

const COMBINATION_REWRITE_RULES = [
    {
        id: "seafood_breathing_allergy",
        any: ["hai san", "tom", "cua", "oc", "do bien"],
        requiresAnyAlso: ["kho tho", "ngop tho", "tho gap", "tho khong ra hoi", "tho doc", "sung moi", "sung luoi"],
        expansions: [
            "phan ve",
            "anaphylaxis",
            "di ung nang",
            "sung moi",
            "sung luoi",
            "kho tho"
        ],
        forceTopic: "anaphylaxis"
    },
    {
        id: "allergy_swelling_breathing",
        all: ["di ung"],
        any: ["kho tho", "ngop tho", "sung moi", "sung luoi", "tho doc"],
        expansions: [
            "phan ve",
            "anaphylaxis",
            "di ung nang",
            "sung moi",
            "sung luoi"
        ],
        forceTopic: "anaphylaxis"
    },
    {
        id: "rash_breathing_reaction",
        any: ["noi me day", "phat ban", "ngua khap nguoi"],
        requiresAnyAlso: ["kho tho", "ngop tho", "sung moi", "sung luoi", "choang", "ngat"],
        expansions: [
            "phan ve",
            "anaphylaxis",
            "di ung nang",
            "kho tho"
        ],
        forceTopic: "anaphylaxis"
    },
    {
        id: "food_reaction_breathing",
        any: ["sau khi an", "an xong", "vua an xong", "an tom xong", "an cua xong"],
        requiresAnyAlso: ["kho tho", "ngop tho", "sung moi", "sung luoi", "noi me day"],
        expansions: [
            "phan ve",
            "anaphylaxis",
            "di ung nang"
        ],
        forceTopic: "anaphylaxis"
    }
];

const TOPIC_QUERY_EXPANSIONS = {
    stomach_ache: ["dau bung", "stomach ache", "abdominal pain"],
    headache: ["dau dau", "headache"],
    fainting: ["ngat", "fainting", "syncope"],
    anaphylaxis: ["phan ve", "anaphylaxis", "di ung nang"],
    blood_tests: ["xet nghiem", "blood test"],
    chest_pain: ["dau nguc", "chest pain"],
    shortness_of_breath: ["kho tho", "shortness of breath"],
    sepsis: ["nhiem trung", "sepsis"]
};

function vectorTokenize(text) {
    return String(text || "").toLowerCase().match(/[a-z0-9_]+/g) || [];
}

function vectorizeQuery(text, vocabIndex) {
    const vector = new Array(vocabIndex.size).fill(0);
    const tokens = vectorTokenize(text);
    const total = tokens.length || 1;
    const counts = new Map();

    for (const token of tokens) {
        counts.set(token, (counts.get(token) || 0) + 1);
    }

    for (const [token, count] of counts.entries()) {
        const index = vocabIndex.get(token);

        if (index !== undefined) {
            vector[index] = count / total;
        }
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

function rewriteQuery(message, normalizedMessage) {
    const additions = new Set();
    const activatedRules = [];
    let forcedTopic = null;

    for (const rule of QUERY_SYNONYM_RULES) {
        if (rule.pattern.test(normalizedMessage)) {
            for (const expansion of rule.expansions) {
                additions.add(expansion);
            }
        }

        rule.pattern.lastIndex = 0;
    }

    for (const rule of COMBINATION_REWRITE_RULES) {
        const allMatched =
            !rule.all || rule.all.every((term) => normalizedMessage.includes(term));
        const anyMatched =
            !rule.any || rule.any.some((term) => normalizedMessage.includes(term));
        const requiresAnyAlsoMatched =
            !rule.requiresAnyAlso ||
            rule.requiresAnyAlso.some((term) => normalizedMessage.includes(term));

        if (allMatched && anyMatched && requiresAnyAlsoMatched) {
            for (const expansion of rule.expansions) {
                additions.add(expansion);
            }

            if (rule.forceTopic) {
                forcedTopic = rule.forceTopic;
            }

            activatedRules.push(rule.id);
        }
    }

    return {
        normalizedMessage,
        expandedMessage: [normalizedMessage, ...additions].join(" ").trim(),
        expansions: [...additions],
        forcedTopic,
        activatedRules
    };
}

function toArray(value) {
    return Array.isArray(value) ? value : [];
}

function tokenize(text) {
    return normalizeText(text)
        .split(/[^a-z0-9]+/i)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2 && !STOPWORDS.has(token));
}

function buildSearchDocument(chunk) {
    return {
        normalizedTitle: normalizeText(chunk.title),
        normalizedContent: normalizeText(chunk.content),
        normalizedKeywords: toArray(chunk.keywords).map(normalizeText),
        normalizedTags: toArray(chunk.tags).map(normalizeText),
        normalizedTestTypes: toArray(chunk.test_types).map(normalizeText)
    };
}

function detectTopicIntent(normalizedMessage) {
    const topicSignals = {
        blood_tests: ["xet nghiem", "nhin an", "duong huyet", "mo mau", "ket qua"],
        chest_pain: ["dau nguc", "tuc nguc", "lan ra tay", "lan ra ham"],
        shortness_of_breath: ["kho tho", "tho doc", "tim moi", "tim tai"],
        sepsis: ["nhiem trung", "sepsis", "xau di nhanh", "lu lan", "ban khong mat mau"],
        stomach_ache: ["dau bung", "bung dau", "non ra mau", "phan den"],
        headache: ["dau dau", "nhuc dau", "co cung", "noi kho", "yeu liet"],
        fainting: ["ngat", "xiu", "choang"],
        anaphylaxis: ["phan ve", "di ung nang", "sung moi", "sung luoi", "adrenaline"]
    };

    let bestTopic = null;
    let bestScore = 0;

    for (const [topic, signals] of Object.entries(topicSignals)) {
        const score = signals.filter((signal) => normalizedMessage.includes(signal)).length;

        if (score > bestScore) {
            bestTopic = topic;
            bestScore = score;
        }
    }

    return {
        topic: bestTopic,
        score: bestScore
    };
}

function scoreChunk(chunk, normalizedMessage, queryTokens, topicIntent) {
    const searchDocument = buildSearchDocument(chunk);
    const matchedTerms = new Set();
    let score = 0;

    for (const token of queryTokens) {
        if (searchDocument.normalizedTitle.includes(token)) {
            score += 8;
            matchedTerms.add(token);
        }

        if (searchDocument.normalizedKeywords.some((keyword) => keyword.includes(token))) {
            score += 6;
            matchedTerms.add(token);
        }

        if (searchDocument.normalizedTags.some((tag) => tag.includes(token))) {
            score += 5;
            matchedTerms.add(token);
        }

        if (
            searchDocument.normalizedTestTypes.some((testType) =>
                testType.includes(token)
            )
        ) {
            score += 5;
            matchedTerms.add(token);
        }

        if (searchDocument.normalizedContent.includes(token)) {
            score += 2;
            matchedTerms.add(token);
        }
    }

    for (const sourceHint of SOURCE_HINTS) {
        if (sourceHint.sourceId !== chunk.source_id) {
            continue;
        }

        for (const keyword of sourceHint.keywords) {
            if (normalizedMessage.includes(keyword)) {
                score += 9;
                matchedTerms.add(keyword);
            }
        }
    }

    // Prefer source-specific matches for expanded KB topics over generic token overlap.
    if (
        [
            "nhs_stomach_ache",
            "nhs_headaches",
            "nhs_fainting_adults",
            "nhs_anaphylaxis"
        ].includes(chunk.source_id)
    ) {
        const sourceHint = SOURCE_HINTS.find((item) => item.sourceId === chunk.source_id);

        if (sourceHint) {
            const matchedHintCount = sourceHint.keywords.filter((keyword) =>
                normalizedMessage.includes(keyword)
            ).length;

            if (matchedHintCount > 0) {
                score += matchedHintCount * 12;
            }
        }
    }

    if (
        chunk.section === "red_flags" &&
        [
            "dau nguc",
            "kho tho",
            "nhiem trung",
            "tim moi",
            "lu lan",
            "dau bung",
            "dau dau",
            "ngat",
            "phan ve"
        ].some((keyword) => normalizedMessage.includes(keyword))
    ) {
        score += 4;
    }

    if (
        chunk.source_id === "blood_tests" &&
        ["xet nghiem", "nhin an", "duong huyet", "mo mau", "ket qua"].some((keyword) =>
            normalizedMessage.includes(keyword)
        )
    ) {
        score += 4;
    }

    if (
        chunk.source_id === "nhs_stomach_ache" &&
        ["dau bung", "bung dau", "phan den", "non ra mau"].some((keyword) =>
            normalizedMessage.includes(keyword)
        )
    ) {
        score += 8;
    }

    if (
        chunk.source_id === "nhs_headaches" &&
        ["dau dau", "nhuc dau", "co cung", "noi kho", "yeu liet"].some((keyword) =>
            normalizedMessage.includes(keyword)
        )
    ) {
        score += 8;
    }

    if (
        chunk.source_id === "nhs_fainting_adults" &&
        ["ngat", "xiu", "choang"].some((keyword) =>
            normalizedMessage.includes(keyword)
        )
    ) {
        score += 8;
    }

    if (
        chunk.source_id === "nhs_anaphylaxis" &&
        ["phan ve", "di ung nang", "sung moi", "sung luoi"].some((keyword) =>
            normalizedMessage.includes(keyword)
        )
    ) {
        score += 10;
    }

    if (topicIntent.topic && topicIntent.score > 0) {
        const preferredSources = TOPIC_SOURCE_GROUPS[topicIntent.topic] || [];

        if (preferredSources.includes(chunk.source_id)) {
            score += 18;
        } else if (
            topicIntent.topic !== "blood_tests" &&
            chunk.source_id === "blood_tests"
        ) {
            score -= 18;
        } else if (
            ["stomach_ache", "headache", "fainting", "anaphylaxis"].includes(
                topicIntent.topic
            ) &&
            ["chest_pain", "shortness_of_breath", "nice_sepsis_overview"].includes(
                chunk.source_id
            )
        ) {
            score -= 10;
        }
    }

    return {
        lexicalScore: score,
        matchedTerms: [...matchedTerms]
    };
}

function applyCoherenceFilter(rankedChunks, topicIntent, topK) {
    if (!rankedChunks.length) {
        return rankedChunks;
    }

    const primary = rankedChunks[0];
    const secondary = rankedChunks[1] || null;
    const preferredSources = topicIntent.topic
        ? TOPIC_SOURCE_GROUPS[topicIntent.topic] || []
        : [];
    const firstTwoPreferred =
        rankedChunks.length >= 2 &&
        preferredSources.length > 0 &&
        preferredSources.includes(primary.source_id) &&
        secondary &&
        preferredSources.includes(secondary.source_id);

    const filtered = rankedChunks.filter((chunk, index) => {
        if (index < 2) {
            return true;
        }

        if (firstTwoPreferred) {
            const sharedMatchedTerms = chunk.matchedTerms.filter((term) =>
                primary.matchedTerms.includes(term)
            );

            return (
                chunk.hybridScore >= (secondary?.hybridScore || primary.hybridScore) * 0.9 &&
                sharedMatchedTerms.length >= 2
            );
        }

        if (preferredSources.includes(chunk.source_id)) {
            return true;
        }

        if (chunk.source_id === primary.source_id) {
            return true;
        }

        if (chunk.hybridScore >= primary.hybridScore * 0.72) {
            return true;
        }

        const sharedMatchedTerms = chunk.matchedTerms.filter((term) =>
            primary.matchedTerms.includes(term)
        );

        return sharedMatchedTerms.length >= 2;
    });

    return filtered.slice(0, topK);
}

function retrieveTopChunks({ message, topK = 3 }) {
    const {
        chunks,
        manifest,
        embeddingsByChunkId,
        embeddingConfig,
        runtimeCache
    } = loadArtifacts();
    const normalizedMessage = normalizeText(message);
    const rewrittenQuery = rewriteQuery(message, normalizedMessage);
    let topicIntent = detectTopicIntent(rewrittenQuery.expandedMessage);
    if (rewrittenQuery.forcedTopic) {
        topicIntent = {
            topic: rewrittenQuery.forcedTopic,
            score: Math.max(topicIntent.score, 3)
        };
    }
    const topicExpansions = topicIntent.topic
        ? TOPIC_QUERY_EXPANSIONS[topicIntent.topic] || []
        : [];
    const expandedQueryText = [
        rewrittenQuery.expandedMessage,
        ...topicExpansions
    ].join(" ").trim();
    const queryTokens = tokenize(expandedQueryText);
    topicIntent = detectTopicIntent(expandedQueryText);
    if (rewrittenQuery.forcedTopic) {
        topicIntent = {
            topic: rewrittenQuery.forcedTopic,
            score: Math.max(topicIntent.score, 3)
        };
    }
    const queryVector = vectorizeQuery(expandedQueryText, runtimeCache.vocabIndex);

    const scoredChunks = chunks
        .map((chunk) => {
            const result = scoreChunk(
                chunk,
                expandedQueryText,
                queryTokens,
                topicIntent
            );
            const chunkVector = embeddingsByChunkId[chunk.chunk_id];
            const semanticScore = Array.isArray(chunkVector)
                ? dotProduct(queryVector, chunkVector)
                : 0;

            return {
                ...chunk,
                lexicalScore: result.lexicalScore,
                semanticScore,
                matchedTerms: result.matchedTerms
            };
        })
        .filter((chunk) => chunk.lexicalScore > 0 || chunk.semanticScore > 0);

    const maxLexicalScore = scoredChunks.reduce(
        (maxScore, chunk) => Math.max(maxScore, chunk.lexicalScore || 0),
        0
    );

    const hybridRanked = scoredChunks
        .map((chunk) => {
            const lexicalNorm =
                maxLexicalScore > 0 ? chunk.lexicalScore / maxLexicalScore : 0;
            const semanticNorm = Math.max(0, chunk.semanticScore || 0);
            const hybridScore = lexicalNorm * 0.55 + semanticNorm * 0.45;

            return {
                ...chunk,
                score: hybridScore,
                hybridScore
            };
        })
        .sort((left, right) => right.hybridScore - left.hybridScore);

    let rankedChunks = hybridRanked.slice(0, topK);

    if (topicIntent.topic) {
        const preferredSources = TOPIC_SOURCE_GROUPS[topicIntent.topic] || [];
        const preferredChunks = hybridRanked.filter((chunk) =>
            preferredSources.includes(chunk.source_id)
        );

        if (preferredChunks.length >= 2) {
            const fallbackChunks = hybridRanked.filter(
                (chunk) => !preferredSources.includes(chunk.source_id)
            );

            rankedChunks = [...preferredChunks.slice(0, topK), ...fallbackChunks]
                .slice(0, topK);
        }
    }

    rankedChunks = applyCoherenceFilter(rankedChunks, topicIntent, topK);

    return {
        query: message,
        normalizedQuery: normalizedMessage,
        rewrittenQuery: expandedQueryText,
        queryExpansions: rewrittenQuery.expansions,
        queryRewriteRules: rewrittenQuery.activatedRules,
        topicIntent,
        topK,
        retrieverVersion: manifest.retriever_version || "v1",
        modelName:
            manifest.model_name === "lexical_tfidf_fallback"
                ? "hybrid_lexical_tfidf_runtime"
                : manifest.model_name || null,
        runtimeMode:
            embeddingConfig && embeddingConfig.index_type === "python_dot_product"
                ? "hybrid_lexical_plus_vector"
                : "lexical_only",
        chunks: rankedChunks
    };
}

module.exports = {
    retrieveTopChunks
};
