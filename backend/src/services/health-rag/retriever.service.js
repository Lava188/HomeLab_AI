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
    },
    {
        sourceId: "medlineplus_blood_culture_test",
        keywords: ["cay mau", "vi khuan trong mau", "nam trong mau", "nhiem trung"]
    },
    {
        sourceId: "medlineplus_bmp_test",
        keywords: ["bmp", "dien giai", "duong huyet", "chuc nang than"]
    },
    {
        sourceId: "medlineplus_cbc_test",
        keywords: ["cbc", "cong thuc mau", "hong cau", "bach cau", "tieu cau"]
    },
    {
        sourceId: "medlineplus_crp_test",
        keywords: ["crp", "viem", "protein phan ung c", "dap ung dieu tri"]
    },
    {
        sourceId: "medlineplus_ddimer_test",
        keywords: ["d-dimer", "huyet khoi", "thuyen tac phoi", "cuc mau dong"]
    },
    {
        sourceId: "medlineplus_pulse_oximetry_test",
        keywords: ["spo2", "pulse ox", "pulse oximetry", "oxy mau", "tim tai"]
    },
    {
        sourceId: "medlineplus_troponin_test",
        keywords: ["troponin", "ton thuong co tim", "xet nghiem tim", "dien tim"]
    },
    {
        sourceId: "nhs_headaches",
        keywords: ["dau dau", "co cung", "noi kho", "yeu liet", "co giat"]
    },
    {
        sourceId: "nhs_stomach_ache",
        keywords: ["dau bung", "phan den", "non ra mau", "dau bung du doi"]
    },
    {
        sourceId: "nhs_fainting_adults",
        keywords: ["ngat", "choang vang", "tim dap bat thuong", "chan thuong dau"]
    },
    {
        sourceId: "nhs_anaphylaxis",
        keywords: ["phan ve", "di ung nang", "sung moi", "sung luoi", "adrenaline"]
    },
    {
        sourceId: "nhs_stroke_symptoms",
        keywords: ["dot quy", "fast", "meo mieng", "noi kho", "yeu tay chan"]
    }
];

const TEST_QUERY_HINTS = [
    "xet nghiem",
    "troponin",
    "d-dimer",
    "spo2",
    "pulse ox",
    "bmp",
    "cbc",
    "crp",
    "cay mau"
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

    if (
        chunk.section === "test_explainers" &&
        TEST_QUERY_HINTS.some((keyword) => normalizedMessage.includes(keyword))
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
