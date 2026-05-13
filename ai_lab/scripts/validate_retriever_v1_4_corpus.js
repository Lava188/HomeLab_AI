#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const CORPUS_PATH = path.join(
    ROOT,
    "ai_lab/artifacts/retriever_v1_4/kb_v1_4_corpus.jsonl"
);
const MANIFEST_PATH = path.join(
    ROOT,
    "ai_lab/artifacts/retriever_v1_4/kb_v1_4_corpus_manifest.json"
);
const REVIEWED_PATHS = {
    revise: path.join(ROOT, "ai_lab/kb_reviewed/kb_v1_4_batch4a_revise_items.jsonl"),
    rejected: path.join(
        ROOT,
        "ai_lab/kb_reviewed/kb_v1_4_batch4a_rejected_items.jsonl"
    ),
    pending: path.join(ROOT, "ai_lab/kb_reviewed/kb_v1_4_batch4a_pending_items.jsonl")
};

const EXPECTED_COUNT = 55;
const MIN_CONTENT_CHARS = 300;
const ALLOWED_DOMAINS = new Set(["medlineplus.gov", "nhs.uk", "niddk.nih.gov"]);
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
    let rows = [];

    if (!fs.existsSync(CORPUS_PATH)) {
        errors.push("Corpus JSONL file does not exist.");
    } else {
        rows = readJsonl(CORPUS_PATH);
    }

    if (rows.length !== EXPECTED_COUNT) {
        errors.push(`Expected ${EXPECTED_COUNT} corpus items, got ${rows.length}.`);
    }

    const reviseIds = reviewedItemIds(REVIEWED_PATHS.revise);
    const rejectedIds = reviewedItemIds(REVIEWED_PATHS.rejected);
    const pendingIds = reviewedItemIds(REVIEWED_PATHS.pending);
    const kbIds = new Set();
    const domainCounts = {};
    const topicCounts = {};
    const intendedUseCounts = {};
    const medicalScopeCounts = {};

    for (const item of rows) {
        const id = item.kb_id || "<missing kb_id>";

        if (!item.kb_id) {
            errors.push("Corpus item missing kb_id.");
        } else if (kbIds.has(item.kb_id)) {
            errors.push(`Duplicate kb_id "${item.kb_id}".`);
        } else {
            kbIds.add(item.kb_id);
        }

        for (const field of ["content", "source_url", "final_url", "provenance"]) {
            if (item[field] === undefined || item[field] === null || item[field] === "") {
                errors.push(`${id}: missing ${field}.`);
            }
        }

        if (!String(item.content || "").trim()) {
            errors.push(`${id}: content is empty.`);
        } else if (item.content.length < MIN_CONTENT_CHARS) {
            errors.push(
                `${id}: content is shorter than ${MIN_CONTENT_CHARS} characters.`
            );
        }

        if (item.runtime_promoted !== false) {
            errors.push(`${id}: runtime_promoted must be false.`);
        }

        if (!ALLOWED_DOMAINS.has(item.domain)) {
            errors.push(`${id}: domain "${item.domain}" is not in allowlist.`);
        }

        const marker = hasDisallowedMarker(item);
        if (marker) {
            errors.push(`${id}: disallowed marker ${marker} found.`);
        }

        const candidateItemId = item.provenance?.candidate_item_id;
        if (!candidateItemId) {
            errors.push(`${id}: provenance.candidate_item_id is missing.`);
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

        increment(domainCounts, item.domain);
        increment(topicCounts, item.topic);
        increment(intendedUseCounts, item.intended_use);
        increment(medicalScopeCounts, item.medical_scope);
    }

    if (!fs.existsSync(MANIFEST_PATH)) {
        errors.push("Corpus manifest does not exist.");
    } else {
        const manifest = readJson(MANIFEST_PATH);
        if (manifest.total_corpus_items !== rows.length) {
            errors.push("Manifest total_corpus_items does not match corpus row count.");
        }
        if (manifest.runtime_promoted !== false) {
            errors.push("Manifest runtime_promoted must be false.");
        }
        if (manifest.embeddings_built !== false || manifest.faiss_built !== false) {
            errors.push("Manifest must show embeddings_built=false and faiss_built=false.");
        }
    }

    const summary = {
        total: rows.length,
        valid_count: errors.length === 0 ? rows.length : 0,
        warning_count: warnings.length,
        error_count: errors.length,
        domain_counts: domainCounts,
        topic_counts: topicCounts,
        intended_use_counts: intendedUseCounts,
        medical_scope_counts: medicalScopeCounts,
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
