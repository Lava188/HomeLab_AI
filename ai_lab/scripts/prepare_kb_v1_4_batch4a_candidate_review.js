#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const CANDIDATE_PATH = path.join(
    ROOT,
    "ai_lab/kb_candidates/kb_v1_4_batch4a_candidate_items.jsonl"
);
const REVIEW_CSV_PATH = path.join(
    ROOT,
    "ai_lab/reports/kb_v1_4_batch4a_candidate_review.csv"
);
const SUMMARY_PATH = path.join(
    ROOT,
    "ai_lab/reports/kb_v1_4_batch4a_candidate_review_summary.json"
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

function increment(counts, value) {
    const key = String(value || "unknown");
    counts[key] = (counts[key] || 0) + 1;
}

function previewText(text, limit = 800) {
    return String(text || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function csvCell(value) {
    return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function validateItem(item, errors) {
    const id = item.item_id || "<missing item_id>";
    const required = [
        "item_id",
        "source_id",
        "candidate_text",
        "provenance",
        "url",
        "final_url"
    ];

    for (const field of required) {
        if (item[field] === undefined || item[field] === null || item[field] === "") {
            errors.push(`${id}: missing required field ${field}.`);
        }
    }

    if (!String(item.candidate_text || "").trim()) {
        errors.push(`${id}: candidate_text is empty.`);
    }

    if (item.runtime_promoted !== false) {
        errors.push(`${id}: runtime_promoted must be false.`);
    }

    if (item.review_status !== "candidate_needs_review") {
        errors.push(
            `${id}: review_status must be "candidate_needs_review", got "${item.review_status}".`
        );
    }

    if (!item.provenance?.url || !item.provenance?.final_url) {
        errors.push(`${id}: provenance must include url and final_url.`);
    }
}

function writeCsv(items) {
    const headers = [
        "item_id",
        "source_id",
        "domain",
        "topic",
        "title",
        "section_heading",
        "intended_use",
        "medical_scope",
        "char_count",
        "source_url",
        "text_preview_800",
        "review_decision",
        "reviewer_notes"
    ];

    const lines = [
        headers.join(","),
        ...items.map((item) =>
            [
                item.item_id,
                item.source_id,
                item.domain,
                item.topic,
                item.title,
                item.section_heading,
                item.intended_use,
                item.medical_scope,
                item.char_count,
                item.url,
                previewText(item.candidate_text),
                "",
                ""
            ]
                .map(csvCell)
                .join(",")
        )
    ];

    fs.writeFileSync(REVIEW_CSV_PATH, lines.join("\n") + "\n", "utf8");
}

function buildSummary(items) {
    const domainCounts = {};
    const intendedUseCounts = {};
    const medicalScopeCounts = {};
    const reviewStatusCounts = {};
    const sourceIds = new Set();
    let runtimePromotedCount = 0;

    for (const item of items) {
        sourceIds.add(item.source_id);
        increment(domainCounts, item.domain);
        increment(intendedUseCounts, item.intended_use);
        increment(medicalScopeCounts, item.medical_scope);
        increment(reviewStatusCounts, item.review_status);
        if (item.runtime_promoted !== false) {
            runtimePromotedCount += 1;
        }
    }

    return {
        total_candidates: items.length,
        source_count: sourceIds.size,
        domain_counts: domainCounts,
        intended_use_counts: intendedUseCounts,
        medical_scope_counts: medicalScopeCounts,
        runtime_promoted_count: runtimePromotedCount,
        review_status_counts: reviewStatusCounts,
        generated_at: new Date().toISOString()
    };
}

function main() {
    const errors = [];
    const items = readJsonl(CANDIDATE_PATH);

    for (const item of items) {
        validateItem(item, errors);
    }

    if (errors.length > 0) {
        console.error(
            JSON.stringify(
                {
                    error_count: errors.length,
                    errors
                },
                null,
                2
            )
        );
        process.exitCode = 1;
        return;
    }

    const summary = buildSummary(items);

    fs.mkdirSync(path.dirname(REVIEW_CSV_PATH), { recursive: true });
    writeCsv(items);
    fs.writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2) + "\n", "utf8");

    console.log(JSON.stringify(summary, null, 2));
}

try {
    main();
} catch (error) {
    console.error(error);
    process.exitCode = 1;
}
