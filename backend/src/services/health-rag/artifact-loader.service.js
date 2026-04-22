const fs = require("fs");
const path = require("path");

let artifactCache = null;

function readJsonFile(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function getArtifactBasePath() {
    const artifactDir =
        process.env.HEALTH_RAG_ARTIFACT_DIR || "retriever_v1_2";

    return path.join(__dirname, "../../../../ai_lab/artifacts", artifactDir);
}

function loadArtifacts() {
    if (artifactCache) {
        return artifactCache;
    }

    const artifactBasePath = getArtifactBasePath();
    const manifestPath = path.join(artifactBasePath, "retriever_manifest.json");

    if (!fs.existsSync(manifestPath)) {
        throw new Error(
            `health_rag manifest not found under: ${artifactBasePath}`
        );
    }

    const manifest = readJsonFile(manifestPath);
    const chunksPath = path.join(artifactBasePath, manifest.kb_file);
    const metadataPath = path.join(
        artifactBasePath,
        manifest.metadata_file || "chunk_metadata.json"
    );
    const embeddingsPath = manifest.embeddings_file
        ? path.join(artifactBasePath, manifest.embeddings_file)
        : null;
    const embeddingConfigPath = manifest.embedding_config_file
        ? path.join(artifactBasePath, manifest.embedding_config_file)
        : null;

    if (!fs.existsSync(chunksPath)) {
        throw new Error(
            `health_rag KB chunks not found under: ${artifactBasePath}`
        );
    }

    const chunks = readJsonFile(chunksPath);
    const metadata = fs.existsSync(metadataPath) ? readJsonFile(metadataPath) : [];
    const embeddings =
        embeddingsPath && fs.existsSync(embeddingsPath)
            ? readJsonFile(embeddingsPath)
            : [];
    const embeddingConfig =
        embeddingConfigPath && fs.existsSync(embeddingConfigPath)
            ? readJsonFile(embeddingConfigPath)
            : null;

    const metadataByChunkId = metadata.reduce((accumulator, item) => {
        accumulator[item.chunk_id] = item;
        return accumulator;
    }, {});
    const embeddingsByChunkId = embeddings.reduce((accumulator, item) => {
        accumulator[item.chunk_id] = item.vector;
        return accumulator;
    }, {});
    const vocabIndex = buildVocabIndex(chunks);

    artifactCache = {
        basePath: artifactBasePath,
        manifest,
        chunks,
        metadataByChunkId,
        embeddingsByChunkId,
        embeddingConfig,
        runtimeCache: {
            vocabIndex
        }
    };

    return artifactCache;
}

function vectorTokenize(text) {
    return String(text || "").toLowerCase().match(/[a-z0-9_]+/g) || [];
}

function buildVocabIndex(chunks) {
    const vocab = new Set();

    for (const chunk of chunks) {
        for (const token of vectorTokenize(chunk.chunk_text)) {
            vocab.add(token);
        }
    }

    return new Map([...vocab].sort().map((token, index) => [token, index]));
}

module.exports = {
    loadArtifacts
};
