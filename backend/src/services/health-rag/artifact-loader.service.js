const fs = require("fs");
const path = require("path");

const AI_LAB_ARTIFACTS_ROOT = path.join(
    __dirname,
    "../../../../ai_lab/artifacts"
);
const DEFAULT_HEALTH_RAG_VERSION = process.env.HOMELAB_HEALTH_RAG_VERSION || "v1_2";

const artifactCache = new Map();

function readJsonFile(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function getArtifactBasePath() {
    const artifactDir =
        process.env.HEALTH_RAG_ARTIFACT_DIR || "retriever_v1_2";

    return path.join(__dirname, "../../../../ai_lab/artifacts", artifactDir);
}

function resolveArtifactLayout(version) {
    const artifactBasePath = path.join(
        AI_LAB_ARTIFACTS_ROOT,
        `retriever_${version}`
    );
    const manifestPath = path.join(artifactBasePath, "retriever_manifest.json");

    if (!fs.existsSync(manifestPath)) {
        throw new Error(
            `health_rag manifest not found for version '${version}' under: ${artifactBasePath}`
        );
    }

    const manifest = readJsonFile(manifestPath);
    const chunksPath = path.join(
        artifactBasePath,
        manifest.kb_file || `kb_chunks_${version}.json`
    );
    const metadataPath = path.join(
        artifactBasePath,
        manifest.metadata_file || "chunk_metadata.json"
    );

    if (!fs.existsSync(chunksPath)) {
        throw new Error(
            `health_rag chunk file not found for version '${version}' under: ${chunksPath}`
        );
    }

    return {
        version,
        artifactBasePath,
        manifest,
        chunksPath,
        metadataPath
    };
}

function loadArtifacts(options = {}) {
    const version = options.version || DEFAULT_HEALTH_RAG_VERSION;

    if (artifactCache.has(version)) {
        return artifactCache.get(version);
    }

    const {
        artifactBasePath,
        manifest,
        chunksPath,
        metadataPath
    } = resolveArtifactLayout(version);

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

    const loadedArtifacts = {
        basePath: artifactBasePath,
        requestedVersion: version,
        manifest,
        chunks,
        metadataByChunkId
    };

    artifactCache.set(version, loadedArtifacts);
    return loadedArtifacts;
}

module.exports = {
    loadArtifacts
};
