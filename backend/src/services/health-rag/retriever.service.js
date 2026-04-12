const { loadArtifacts } = require("./artifact-loader.service");
const { normalizeText } = require("../../utils/text.util");

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
    }
];

function toArray(value) {
    return Array.isArray(value) ? value : [];
}

function tokenize(text) {
    return normalizeText(text)
        .split(/[^a-z0-9]+/i)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2);
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

function scoreChunk(chunk, normalizedMessage, queryTokens) {
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

    if (
        chunk.section === "red_flags" &&
        ["dau nguc", "kho tho", "nhiem trung", "tim moi", "lu lan"].some((keyword) =>
            normalizedMessage.includes(keyword)
        )
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

    return {
        score,
        matchedTerms: [...matchedTerms]
    };
}

function retrieveTopChunks({ message, topK = 3 }) {
    const { chunks, manifest } = loadArtifacts();
    const normalizedMessage = normalizeText(message);
    const queryTokens = tokenize(message);

    const rankedChunks = chunks
        .map((chunk) => {
            const result = scoreChunk(chunk, normalizedMessage, queryTokens);

            return {
                ...chunk,
                score: result.score,
                matchedTerms: result.matchedTerms
            };
        })
        .filter((chunk) => chunk.score > 0)
        .sort((left, right) => right.score - left.score)
        .slice(0, topK);

    return {
        query: message,
        normalizedQuery: normalizedMessage,
        topK,
        retrieverVersion: manifest.retriever_version || "v1",
        modelName: manifest.model_name || null,
        chunks: rankedChunks
    };
}

module.exports = {
    retrieveTopChunks
};
