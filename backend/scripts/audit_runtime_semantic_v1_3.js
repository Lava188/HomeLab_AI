const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "../.env") });

const { routeMessage } = require("../src/services/router.service");
const { retrieveTopChunks } = require("../src/services/health-rag/retriever.service");
const { loadArtifacts } = require("../src/services/health-rag/artifact-loader.service");

const queries = [
    "nhiễm trùng nặng rất mệt xấu đi nhanh",
    "nhiễm trùng nặng rất mệt xấu đi nhanh sepsis",
    "sốt cao rét run người lả đi",
    "đau ngực vã mồ hôi khó thở",
    "tôi muốn xét nghiệm tổng quát"
];

function getArtifactPresence(loadedArtifacts) {
    const manifest = loadedArtifacts.manifest || {};
    const basePath = loadedArtifacts.basePath;
    const embeddingsPath = manifest.embeddings_file
        ? path.join(basePath, manifest.embeddings_file)
        : null;
    const faissPath = manifest.faiss_index_file
        ? path.join(basePath, manifest.faiss_index_file)
        : null;

    return {
        basePath,
        manifestEmbeddingFile: manifest.embeddings_file || null,
        manifestFaissIndexFile: manifest.faiss_index_file || null,
        embeddingConfigIndexType: loadedArtifacts.embeddingConfig?.index_type || null,
        embeddingsFileExists: embeddingsPath ? fs.existsSync(embeddingsPath) : false,
        embeddingsFileExtension: embeddingsPath ? path.extname(embeddingsPath) : null,
        faissIndexExists: faissPath ? fs.existsSync(faissPath) : false,
        loadedEmbeddingVectorCount: Object.keys(
            loadedArtifacts.embeddingsByChunkId || {}
        ).length,
        runtimeVocabSize: loadedArtifacts.runtimeCache?.vocabIndex?.size || 0
    };
}

function summarizeChunk(chunk) {
    return {
        chunkId: chunk.chunk_id,
        kbId: chunk.kb_id || null,
        sourceId: chunk.source_id,
        title: chunk.title,
        section: chunk.section,
        faqType: chunk.faq_type,
        lexicalScore: chunk.lexicalScore ?? null,
        semanticScore: chunk.semanticScore ?? null,
        finalScore: chunk.score ?? null,
        matchedTerms: chunk.matchedTerms || []
    };
}

async function auditQuery(query, index) {
    const sessionId = `audit_runtime_semantic_v1_3_${index + 1}`;
    const routed = await routeMessage({ message: query, sessionId });
    const retrieval = retrieveTopChunks({ message: query, topK: 3 });

    return {
        query,
        route: {
            flow: routed.flow,
            action: routed.action,
            primaryMode: routed.meta?.primaryMode || null,
            reason: routed.meta?.reason || null,
            routerClassifierMode:
                routed.meta?.routing?.classifierMode || null,
            routerTopScore:
                routed.meta?.routing?.lowConfidenceGuard?.topScore ?? null,
            routerNextScore:
                routed.meta?.routing?.lowConfidenceGuard?.nextScore ?? null,
            customerTestSafetyGate:
                routed.meta?.routing?.customerTestSafetyGate ?? null
        },
        retrieval: {
            runtimeMode: retrieval.runtimeMode,
            retrieverVersion: retrieval.retrieverVersion,
            requestedRetrieverVersion: retrieval.requestedRetrieverVersion,
            loadedRetrieverVersion: retrieval.loadedRetrieverVersion,
            fallbackUsed: retrieval.fallbackUsed,
            fallbackReason: retrieval.fallbackReason,
            modelName: retrieval.modelName,
            normalizedQuery: retrieval.normalizedQuery,
            rewrittenQuery: retrieval.rewrittenQuery,
            queryExpansions: retrieval.queryExpansions,
            queryRewriteRules: retrieval.queryRewriteRules,
            topicIntent: retrieval.topicIntent,
            topChunks: (retrieval.chunks || []).map(summarizeChunk)
        }
    };
}

async function main() {
    const loadedArtifacts = loadArtifacts();
    const results = [];

    for (let index = 0; index < queries.length; index += 1) {
        results.push(await auditQuery(queries[index], index));
    }

    const report = {
        generatedAt: new Date().toISOString(),
        env: {
            HOMELAB_RETRIEVER_VERSION:
                process.env.HOMELAB_RETRIEVER_VERSION || null,
            HOMELAB_RETRIEVER_FALLBACK_VERSION:
                process.env.HOMELAB_RETRIEVER_FALLBACK_VERSION || null,
            HEALTH_RAG_ARTIFACT_DIR:
                process.env.HEALTH_RAG_ARTIFACT_DIR || null
        },
        artifactPresence: getArtifactPresence(loadedArtifacts),
        queries: results
    };

    console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
