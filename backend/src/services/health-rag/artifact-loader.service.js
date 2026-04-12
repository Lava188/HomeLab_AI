const fs = require("fs");
const path = require("path");

const ARTIFACT_BASE_PATH = path.join(
    __dirname,
    "../../../../ai_lab/artifacts/retriever_v1"
);

let artifactCache = null;

function readJsonFile(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function loadArtifacts() {
    if (artifactCache) {
        return artifactCache;
    }

    const manifestPath = path.join(ARTIFACT_BASE_PATH, "retriever_manifest.json");
    const chunksPath = path.join(ARTIFACT_BASE_PATH, "kb_chunks_v1.json");
    const metadataPath = path.join(ARTIFACT_BASE_PATH, "chunk_metadata.json");

    if (!fs.existsSync(manifestPath) || !fs.existsSync(chunksPath)) {
        throw new Error(
            `health_rag artifacts not found under: ${ARTIFACT_BASE_PATH}`
        );
    }

    const manifest = readJsonFile(manifestPath);
    const chunks = readJsonFile(chunksPath);
    const metadata = fs.existsSync(metadataPath) ? readJsonFile(metadataPath) : [];

    const metadataByChunkId = metadata.reduce((accumulator, item) => {
        accumulator[item.chunk_id] = item;
        return accumulator;
    }, {});

    artifactCache = {
        basePath: ARTIFACT_BASE_PATH,
        manifest,
        chunks,
        metadataByChunkId
    };

    return artifactCache;
}

module.exports = {
    loadArtifacts
};
