const fs = require("fs");
const path = require("path");
const { normalizeText } = require("../../utils/text.util");

const AI_LAB_ARTIFACTS_ROOT = path.join(
    __dirname,
    "../../../../ai_lab/artifacts"
);

const artifactCache = new Map();
const DEFAULT_RETRIEVER_VERSION = "v1_2";

function readJsonFile(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function getRequestedRetrieverVersion(options = {}) {
    return (
        options.version ||
        process.env.HOMELAB_RETRIEVER_VERSION ||
        process.env.HOMELAB_HEALTH_RAG_VERSION ||
        DEFAULT_RETRIEVER_VERSION
    );
}

function getFallbackRetrieverVersion(options = {}) {
    return (
        options.fallbackVersion ||
        process.env.HOMELAB_RETRIEVER_FALLBACK_VERSION ||
        DEFAULT_RETRIEVER_VERSION
    );
}

function resolveArtifactBasePath(options = {}) {
    if (options.artifactDir) {
        return path.join(AI_LAB_ARTIFACTS_ROOT, options.artifactDir);
    }

    if (process.env.HEALTH_RAG_ARTIFACT_DIR) {
        return path.join(
            AI_LAB_ARTIFACTS_ROOT,
            process.env.HEALTH_RAG_ARTIFACT_DIR
        );
    }

    const version = getRequestedRetrieverVersion(options);
    return path.join(AI_LAB_ARTIFACTS_ROOT, `retriever_${version}`);
}

function resolveArtifactLayout(options = {}) {
    const artifactBasePath = resolveArtifactBasePath(options);
    const manifestPath = path.join(artifactBasePath, "retriever_manifest.json");

    if (!fs.existsSync(manifestPath)) {
        throw new Error(
            `health_rag manifest not found under: ${artifactBasePath}`
        );
    }

    const manifest = readJsonFile(manifestPath);
    const chunksPath = path.join(
        artifactBasePath,
        manifest.kb_file || "kb_chunks_v1_2.json"
    );
    const metadataPath = path.join(
        artifactBasePath,
        manifest.metadata_file || "chunk_metadata.json"
    );
    const embeddingConfigPath = path.join(
        artifactBasePath,
        manifest.embedding_config_file || "embedding_config.json"
    );
    const embeddingsPath = manifest.embeddings_file
        ? path.join(artifactBasePath, manifest.embeddings_file)
        : null;

    if (!fs.existsSync(chunksPath)) {
        throw new Error(`health_rag chunk file not found under: ${chunksPath}`);
    }

    return {
        artifactBasePath,
        manifest,
        chunksPath,
        metadataPath,
        embeddingConfigPath,
        embeddingsPath
    };
}

function resolveArtifactLayoutWithFallback(options = {}) {
    const requestedRetrieverVersion = getRequestedRetrieverVersion(options);
    const fallbackRetrieverVersion = getFallbackRetrieverVersion(options);

    try {
        const layout = resolveArtifactLayout({
            ...options,
            version: requestedRetrieverVersion
        });

        return {
            ...layout,
            requestedRetrieverVersion,
            loadedRetrieverVersion:
                layout.manifest.retriever_version || requestedRetrieverVersion,
            fallbackRetrieverVersion,
            fallbackUsed: false,
            fallbackReason: null
        };
    } catch (error) {
        if (
            options.artifactDir ||
            process.env.HEALTH_RAG_ARTIFACT_DIR ||
            !fallbackRetrieverVersion ||
            fallbackRetrieverVersion === requestedRetrieverVersion
        ) {
            throw error;
        }

        const fallbackLayout = resolveArtifactLayout({
            ...options,
            version: fallbackRetrieverVersion
        });

        return {
            ...fallbackLayout,
            requestedRetrieverVersion,
            loadedRetrieverVersion:
                fallbackLayout.manifest.retriever_version ||
                fallbackRetrieverVersion,
            fallbackRetrieverVersion,
            fallbackUsed: true,
            fallbackReason: error.message
        };
    }
}

function buildChunkText(chunk) {
    return [
        chunk.title,
        chunk.content,
        ...(Array.isArray(chunk.keywords) ? chunk.keywords : []),
        ...(Array.isArray(chunk.tags) ? chunk.tags : []),
        ...(Array.isArray(chunk.test_types) ? chunk.test_types : [])
    ]
        .filter(Boolean)
        .join(" ");
}

function buildVocabIndex(chunks) {
    const vocab = new Set();

    for (const chunk of chunks) {
        const text = normalizeText(buildChunkText(chunk));
        const tokens = text.match(/[a-z0-9_]+/g) || [];

        for (const token of tokens) {
            vocab.add(token);
        }
    }

    return new Map([...vocab].sort().map((token, index) => [token, index]));
}

function loadJsonEmbeddings(embeddingsPath, chunks) {
    if (!embeddingsPath || !fs.existsSync(embeddingsPath)) {
        return {};
    }

    if (path.extname(embeddingsPath).toLowerCase() !== ".json") {
        return {};
    }

    const embeddings = readJsonFile(embeddingsPath);

    if (Array.isArray(embeddings) && embeddings.length > 0) {
        if (Array.isArray(embeddings[0])) {
            return chunks.reduce((accumulator, chunk, index) => {
                accumulator[chunk.chunk_id] = embeddings[index] || [];
                return accumulator;
            }, {});
        }

        return embeddings.reduce((accumulator, item) => {
            if (item && item.chunk_id && Array.isArray(item.vector)) {
                accumulator[item.chunk_id] = item.vector;
            }

            return accumulator;
        }, {});
    }

    return {};
}

function loadArtifacts(options = {}) {
    const requestedRetrieverVersion = getRequestedRetrieverVersion(options);
    const fallbackRetrieverVersion = getFallbackRetrieverVersion(options);
    const cacheKey =
        options.artifactDir ||
        process.env.HEALTH_RAG_ARTIFACT_DIR ||
        `${requestedRetrieverVersion}->${fallbackRetrieverVersion}`;

    if (artifactCache.has(cacheKey)) {
        return artifactCache.get(cacheKey);
    }

    const {
        artifactBasePath,
        manifest,
        chunksPath,
        metadataPath,
        embeddingConfigPath,
        embeddingsPath,
        requestedRetrieverVersion: resolvedRequestedRetrieverVersion,
        loadedRetrieverVersion,
        fallbackRetrieverVersion: resolvedFallbackRetrieverVersion,
        fallbackUsed,
        fallbackReason
    } = resolveArtifactLayoutWithFallback(options);

    const chunks = readJsonFile(chunksPath);
    const metadata = fs.existsSync(metadataPath) ? readJsonFile(metadataPath) : [];
    const embeddingConfig = fs.existsSync(embeddingConfigPath)
        ? readJsonFile(embeddingConfigPath)
        : null;
    const metadataByChunkId = metadata.reduce((accumulator, item) => {
        accumulator[item.chunk_id] = item;
        return accumulator;
    }, {});
    const embeddingsByChunkId = loadJsonEmbeddings(embeddingsPath, chunks);
    const runtimeCache = {
        vocabIndex: buildVocabIndex(chunks)
    };

    const loadedArtifacts = {
        basePath: artifactBasePath,
        requestedVersion: manifest.retriever_version || loadedRetrieverVersion,
        requestedRetrieverVersion: resolvedRequestedRetrieverVersion,
        loadedRetrieverVersion,
        fallbackRetrieverVersion: resolvedFallbackRetrieverVersion,
        fallbackUsed,
        fallbackReason,
        manifest,
        chunks,
        metadataByChunkId,
        embeddingsByChunkId,
        embeddingConfig,
        runtimeCache
    };

    artifactCache.set(cacheKey, loadedArtifacts);
    return loadedArtifacts;
}

module.exports = {
    loadArtifacts,
    getRequestedRetrieverVersion,
    getFallbackRetrieverVersion
};
