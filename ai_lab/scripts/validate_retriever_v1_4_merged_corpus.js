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
const MERGED_CORPUS_PATH = path.join(
    ROOT,
    "ai_lab/artifacts/retriever_v1_4/kb_v1_4_merged_corpus.jsonl"
);
const MERGED_MANIFEST_PATH = path.join(
    ROOT,
    "ai_lab/artifacts/retriever_v1_4/kb_v1_4_merged_corpus_manifest.json"
);
const REVIEWED_PATHS = {
    revise: path.join(ROOT, "ai_lab/kb_reviewed/kb_v1_4_batch4a_revise_items.jsonl"),
    rejected: path.join(
        ROOT,
        "ai_lab/kb_reviewed/kb_v1_4_batch4a_rejected_items.jsonl"
    ),
    pending: path.join(ROOT, "ai_lab/kb_reviewed/kb_v1_4_batch4a_pending_items.jsonl")
};

const EXPECTED_BATCH4A_COUNT = 55;
const MIN_CONTENT_CHARS = 100;
const DISALLOWED_MARKERS = [/\bmock\b/i, /\bsimulated\b/i, /\bdemo\b/i];

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

function increment(counts, value) {
    const key = String(value || "unknown");
    counts[key] = (counts[key] || 0) + 1;
}

function reviewedItemIds(filePath) {
    if (!fs.existsSync(filePath)) {
        return new Set();
    }
    return new Set(readJsonl(filePath).map((item) => item.item_id).filter(Boolean));
}

function hasDisallowedMarker(value) {
    const text = JSON.stringify(value || "");
    return DISALLOWED_MARKERS.find((pattern) => pattern.test(text)) || null;
}

function main() {
    const warnings = [];
    const errors = [];
    const legacyChunks = readJson(V1_3_CHUNKS_PATH);
    const batch4aCorpus = readJsonl(BATCH4A_CORPUS_PATH);
    let mergedRows = [];

    if (!fs.existsSync(MERGED_CORPUS_PATH)) {
        errors.push("Merged corpus JSONL file does not exist.");
    } else {
        mergedRows = readJsonl(MERGED_CORPUS_PATH);
    }

    const legacyRows = mergedRows.filter(
        (row) => row.record_type === "legacy_retriever_v1_3_chunk"
    );
    const batch4aRows = mergedRows.filter(
        (row) => row.record_type === "kb_v1_4_batch4a_approved_item"
    );

    if (legacyRows.length !== legacyChunks.length) {
        errors.push(
            `Expected ${legacyChunks.length} legacy v1_3 chunks, got ${legacyRows.length}.`
        );
    }

    if (batch4aRows.length !== EXPECTED_BATCH4A_COUNT) {
        errors.push(
            `Expected ${EXPECTED_BATCH4A_COUNT} Batch 4A items, got ${batch4aRows.length}.`
        );
    }

    if (batch4aCorpus.length !== EXPECTED_BATCH4A_COUNT) {
        errors.push(
            `Source Batch 4A corpus should have ${EXPECTED_BATCH4A_COUNT} items, got ${batch4aCorpus.length}.`
        );
    }

    const mergedIds = new Set();
    const legacyChunkIds = new Set(legacyChunks.map((chunk) => chunk.chunk_id));
    const mergedLegacyChunkIds = new Set(legacyRows.map((row) => row.chunk_id));
    for (const chunkId of legacyChunkIds) {
        if (!mergedLegacyChunkIds.has(chunkId)) {
            errors.push(`Missing legacy v1_3 chunk "${chunkId}" in merged corpus.`);
        }
    }

    const oldIds = new Set(legacyRows.map((row) => row.chunk_id || row.kb_id));
    const newIds = new Set(batch4aRows.map((row) => row.kb_id));
    for (const id of newIds) {
        if (oldIds.has(id)) {
            errors.push(`Duplicate id between old and new corpus: "${id}".`);
        }
    }

    const reviseIds = reviewedItemIds(REVIEWED_PATHS.revise);
    const rejectedIds = reviewedItemIds(REVIEWED_PATHS.rejected);
    const pendingIds = reviewedItemIds(REVIEWED_PATHS.pending);
    const domainCounts = {};
    const recordTypeCounts = {};

    for (const row of mergedRows) {
        const id = row.merged_id || row.kb_id || row.chunk_id || "<missing id>";

        if (!row.merged_id) {
            errors.push(`${id}: missing merged_id.`);
        } else if (mergedIds.has(row.merged_id)) {
            errors.push(`Duplicate merged_id "${row.merged_id}".`);
        } else {
            mergedIds.add(row.merged_id);
        }

        for (const field of ["provenance", "source_url", "final_url", "domain", "topic", "content"]) {
            if (row[field] === undefined || row[field] === null || row[field] === "") {
                errors.push(`${id}: missing ${field}.`);
            }
        }

        if (!String(row.content || "").trim()) {
            errors.push(`${id}: content is empty.`);
        } else if (row.content.length < MIN_CONTENT_CHARS) {
            warnings.push(`${id}: content is shorter than ${MIN_CONTENT_CHARS} characters.`);
        }

        const marker = hasDisallowedMarker(row);
        if (marker) {
            errors.push(`${id}: disallowed marker ${marker} found.`);
        }

        if (row.record_type === "kb_v1_4_batch4a_approved_item") {
            if (row.runtime_promoted !== false) {
                errors.push(`${id}: Batch 4A runtime_promoted must be false.`);
            }
            const candidateItemId = row.provenance?.candidate_item_id;
            if (!candidateItemId) {
                errors.push(`${id}: Batch 4A provenance.candidate_item_id is missing.`);
            } else {
                if (reviseIds.has(candidateItemId)) {
                    errors.push(`${id}: item leaked from revise set.`);
                }
                if (rejectedIds.has(candidateItemId)) {
                    errors.push(`${id}: item leaked from rejected set.`);
                }
                if (pendingIds.has(candidateItemId)) {
                    errors.push(`${id}: item leaked from pending set.`);
                }
            }
        }

        increment(domainCounts, row.domain);
        increment(recordTypeCounts, row.record_type);
    }

    if (!fs.existsSync(MERGED_MANIFEST_PATH)) {
        errors.push("Merged corpus manifest does not exist.");
    } else {
        const manifest = readJson(MERGED_MANIFEST_PATH);
        if (manifest.mode !== "offline_controlled_only") {
            errors.push('Manifest mode must be "offline_controlled_only".');
        }
        if (manifest.embeddings_built !== false) {
            errors.push("Manifest embeddings_built must be false.");
        }
        if (manifest.faiss_built !== false) {
            errors.push("Manifest faiss_built must be false.");
        }
        if (manifest.runtime_default_changed !== false) {
            errors.push("Manifest runtime_default_changed must be false.");
        }
        if (manifest.legacy_v1_3_count !== legacyRows.length) {
            errors.push("Manifest legacy_v1_3_count does not match merged corpus.");
        }
        if (manifest.batch4a_added_count !== batch4aRows.length) {
            errors.push("Manifest batch4a_added_count does not match merged corpus.");
        }
        if (manifest.total_merged_count !== mergedRows.length) {
            errors.push("Manifest total_merged_count does not match merged corpus.");
        }
    }

    const summary = {
        legacy_v1_3_count: legacyRows.length,
        batch4a_added_count: batch4aRows.length,
        total_merged_count: mergedRows.length,
        valid_count: errors.length === 0 ? mergedRows.length : 0,
        warning_count: warnings.length,
        error_count: errors.length,
        domain_counts: domainCounts,
        record_type_counts: recordTypeCounts,
        warnings,
        errors
    };

    console.log(JSON.stringify(summary, null, 2));

    if (errors.length > 0) {
        process.exitCode = 1;
    }
}

try {
    main();
} catch (error) {
    console.error(error);
    process.exitCode = 1;
}
