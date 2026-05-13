#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const VERSION = "v1.4-batch4a";
const EXPECTED_COUNT = 55;
const KB_PATH = path.join(
    ROOT,
    "ai_lab/datasets/kb_v1_4_batch4a_approved_items.jsonl"
);
const REPORT_PATH = path.join(
    ROOT,
    "ai_lab/datasets/kb_v1_4_batch4a_approved_report.json"
);
const REVIEWED_PATHS = {
    revise: path.join(ROOT, "ai_lab/kb_reviewed/kb_v1_4_batch4a_revise_items.jsonl"),
    rejected: path.join(
        ROOT,
        "ai_lab/kb_reviewed/kb_v1_4_batch4a_rejected_items.jsonl"
    ),
    pending: path.join(ROOT, "ai_lab/kb_reviewed/kb_v1_4_batch4a_pending_items.jsonl")
};

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

function increment(counts, key) {
    const normalizedKey = String(key || "unknown");
    counts[normalizedKey] = (counts[normalizedKey] || 0) + 1;
}

function containsDisallowedMarker(text) {
    return DISALLOWED_MARKERS.find((pattern) => pattern.test(String(text || ""))) || null;
}

function reviewedItemIds(filePath) {
    if (!fs.existsSync(filePath)) {
        return new Set();
    }
    return new Set(readJsonl(filePath).map((item) => item.item_id).filter(Boolean));
}

function main() {
    const warnings = [];
    const errors = [];
    let rows = [];

    if (!fs.existsSync(KB_PATH)) {
        errors.push("Approved KB JSONL file does not exist.");
    } else {
        rows = readJsonl(KB_PATH);
    }

    if (rows.length !== EXPECTED_COUNT) {
        errors.push(`Expected ${EXPECTED_COUNT} approved KB items, got ${rows.length}.`);
    }

    const seenKbIds = new Set();
    const leakedIds = {
        revise: reviewedItemIds(REVIEWED_PATHS.revise),
        rejected: reviewedItemIds(REVIEWED_PATHS.rejected),
        pending: reviewedItemIds(REVIEWED_PATHS.pending)
    };
    const domainCounts = {};
    const topicCounts = {};
    const intendedUseCounts = {};

    for (const item of rows) {
        const id = item.kb_id || "<missing kb_id>";

        if (!item.kb_id) {
            errors.push("KB item missing kb_id.");
        } else if (seenKbIds.has(item.kb_id)) {
            errors.push(`Duplicate kb_id "${item.kb_id}".`);
        } else {
            seenKbIds.add(item.kb_id);
        }

        if (!item.source_id) {
            errors.push(`${id}: source_id is empty.`);
        }

        if (!item.content || !String(item.content).trim()) {
            errors.push(`${id}: content is empty.`);
        }

        const marker = containsDisallowedMarker(item.content);
        if (marker) {
            errors.push(`${id}: disallowed marker ${marker} found in content.`);
        }

        if (item.review_status !== "approved_for_kb_build") {
            errors.push(`${id}: review_status must be approved_for_kb_build.`);
        }

        if (item.runtime_promoted !== false) {
            errors.push(`${id}: runtime_promoted must be false.`);
        }

        if (item.version !== VERSION) {
            errors.push(`${id}: version must be ${VERSION}.`);
        }

        if (!item.provenance || typeof item.provenance !== "object") {
            errors.push(`${id}: provenance is missing.`);
        }

        if (!item.source_url) {
            errors.push(`${id}: source_url is missing.`);
        }

        if (!item.final_url) {
            errors.push(`${id}: final_url is missing.`);
        }

        const candidateItemId = item.provenance?.candidate_item_id;
        if (candidateItemId) {
            for (const [bucket, ids] of Object.entries(leakedIds)) {
                if (ids.has(candidateItemId)) {
                    errors.push(`${id}: candidate_item_id leaked from ${bucket} items.`);
                }
            }
        } else {
            errors.push(`${id}: provenance.candidate_item_id is missing.`);
        }

        increment(domainCounts, item.domain);
        increment(topicCounts, item.topic);
        increment(intendedUseCounts, item.intended_use);
    }

    if (!fs.existsSync(REPORT_PATH)) {
        errors.push("Approved report JSON file does not exist.");
    } else {
        const report = readJson(REPORT_PATH);
        if (report.total_output_kb_items !== rows.length) {
            errors.push("Report total_output_kb_items does not match JSONL row count.");
        }
        if (!report.domain_counts || !report.topic_counts || !report.intended_use_counts) {
            errors.push("Report must include count by domain/topic/intended_use.");
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
