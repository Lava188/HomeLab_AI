#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const V1_3_CHUNKS_PATH = path.join(
    ROOT,
    "ai_lab/artifacts/retriever_v1_3/kb_chunks_v1_3.json"
);
const BATCH4A_CORPUS_PATH = path.join(
    ROOT,
    "ai_lab/artifacts/retriever_v1_4/kb_v1_4_corpus.jsonl"
);
const OUTPUT_DIR = path.join(ROOT, "ai_lab/artifacts/retriever_v1_4");
const MERGED_CORPUS_PATH = path.join(OUTPUT_DIR, "kb_v1_4_merged_corpus.jsonl");
const MERGED_MANIFEST_PATH = path.join(
    OUTPUT_DIR,
    "kb_v1_4_merged_corpus_manifest.json"
);

function readJsonl(filePath) {
    return fs
        .readFileSync(filePath, "utf8")
        .split(/\r?\n/)
        .filter((line) => line.trim())
        .map((line, index) => {
            try {
                return JSON.parse(line);
            } catch (error) {
                throw new Error(
                    `${filePath}:${index + 1}: invalid JSON: ${error.message}`
                );
            }
        });
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function domainFromUrl(url) {
    try {
        return new URL(url).hostname.replace(/^www\./, "");
    } catch {
        return "";
    }
}

function increment(counts, value) {
    const key = String(value || "unknown");
    counts[key] = (counts[key] || 0) + 1;
}

function legacyTopic(chunk) {
    if (chunk.faq_type) {
        return chunk.faq_type;
    }
    if (chunk.section) {
        return chunk.section;
    }
    if (Array.isArray(chunk.tags) && chunk.tags.length > 0) {
        return chunk.tags.join("/");
    }
    return "legacy_v1_3";
}

function normalizeLegacyChunk(chunk) {
    const sourceUrl = chunk.source_url || "";
    const domain = domainFromUrl(sourceUrl);
    return {
        record_type: "legacy_retriever_v1_3_chunk",
        merged_id: `v1_3:${chunk.chunk_id || chunk.kb_id}`,
        chunk_id: chunk.chunk_id,
        kb_id: chunk.kb_id,
        source_id: chunk.source_id,
        title: chunk.title,
        content: chunk.content || chunk.chunk_text || "",
        chunk_text: chunk.chunk_text,
        domain,
        source_url: sourceUrl,
        final_url: sourceUrl,
        topic: legacyTopic(chunk),
        intended_use: chunk.faq_type || chunk.section || "legacy_retrieval",
        medical_scope:
            Array.isArray(chunk.tags) && chunk.tags.length > 0
                ? chunk.tags.join(", ")
                : chunk.section || "legacy_v1_3",
        version: "v1.3",
        provenance: {
            corpus_source: "ai_lab/artifacts/retriever_v1_3/kb_chunks_v1_3.json",
            retriever_version: "v1_3",
            original_chunk_id: chunk.chunk_id,
            original_kb_id: chunk.kb_id,
            source_id: chunk.source_id,
            source_name: chunk.source_name,
            source_url: sourceUrl,
            final_url: sourceUrl,
            original_record: chunk
        },
        runtime_promoted: false
    };
}

function normalizeBatch4aItem(item) {
    return {
        record_type: "kb_v1_4_batch4a_approved_item",
        merged_id: `batch4a:${item.kb_id}`,
        kb_id: item.kb_id,
        source_id: item.source_id,
        title: item.title,
        content: item.content,
        domain: item.domain,
        source_url: item.source_url,
        final_url: item.final_url,
        topic: item.topic,
        intended_use: item.intended_use,
        medical_scope: item.medical_scope,
        version: item.version,
        provenance: item.provenance,
        runtime_promoted: false
    };
}

function main() {
    const legacyChunks = readJson(V1_3_CHUNKS_PATH);
    const batch4aItems = readJsonl(BATCH4A_CORPUS_PATH);
    const mergedRows = [
        ...legacyChunks.map(normalizeLegacyChunk),
        ...batch4aItems.map(normalizeBatch4aItem)
    ];
    const domainCounts = {};
    const recordTypeCounts = {};

    for (const row of mergedRows) {
        increment(domainCounts, row.domain);
        increment(recordTypeCounts, row.record_type);
    }

    const manifest = {
        manifest_name: "kb_v1_4_merged_corpus_manifest",
        generated_at: new Date().toISOString(),
        mode: "offline_controlled_only",
        source_legacy_v1_3_chunks:
            "ai_lab/artifacts/retriever_v1_3/kb_chunks_v1_3.json",
        source_batch4a_corpus:
            "ai_lab/artifacts/retriever_v1_4/kb_v1_4_corpus.jsonl",
        merged_corpus_path:
            "ai_lab/artifacts/retriever_v1_4/kb_v1_4_merged_corpus.jsonl",
        legacy_v1_3_count: legacyChunks.length,
        batch4a_added_count: batch4aItems.length,
        total_merged_count: mergedRows.length,
        embeddings_built: false,
        faiss_built: false,
        runtime_default_changed: false,
        runtime_promoted: false,
        domain_counts: domainCounts,
        record_type_counts: recordTypeCounts
    };

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(
        MERGED_CORPUS_PATH,
        mergedRows.map((row) => JSON.stringify(row)).join("\n") + "\n",
        "utf8"
    );
    fs.writeFileSync(
        MERGED_MANIFEST_PATH,
        JSON.stringify(manifest, null, 2) + "\n",
        "utf8"
    );

    console.log(
        JSON.stringify(
            {
                legacy_v1_3_count: legacyChunks.length,
                batch4a_added_count: batch4aItems.length,
                total_merged_count: mergedRows.length,
                embeddings_built: false,
                faiss_built: false,
                runtime_default_changed: false
            },
            null,
            2
        )
    );
}

try {
    main();
} catch (error) {
    console.error(error);
    process.exitCode = 1;
}
