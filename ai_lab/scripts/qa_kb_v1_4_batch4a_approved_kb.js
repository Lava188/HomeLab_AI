#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const DATASET_PATH = path.join(
    ROOT,
    "ai_lab/datasets/kb_v1_4_batch4a_approved_items.jsonl"
);
const REPORT_PATH = path.join(
    ROOT,
    "ai_lab/reports/kb_v1_4_batch4a_approved_qa_report.json"
);
const REVIEW_CSV_PATH = path.join(
    ROOT,
    "ai_lab/reports/kb_v1_4_batch4a_approved_qa_review.csv"
);

const MIN_CONTENT_CHARS = 300;
const MAX_CONTENT_CHARS = 3500;
const DUPLICATE_SIMILARITY_THRESHOLD = 0.92;
const DISALLOWED_MARKERS = [/\bmock\b/i, /\bsimulated\b/i, /\bdemo\b/i];
const NOISE_PATTERNS = [
    /\bRelated\b/i,
    /\bReferences\b/i,
    /\bPage last reviewed\b/i,
    /\bNext review due\b/i,
    /\bShare\b/i,
    /\bFacebook\b/i,
    /\bTwitter\b/i,
    /\bEmail\b/i
];

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
    const key = String(value || "missing");
    counts[key] = (counts[key] || 0) + 1;
}

function normalizeForSimilarity(text) {
    return String(text || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function tokenSet(text) {
    return new Set(normalizeForSimilarity(text).split(" ").filter((token) => token.length > 2));
}

function jaccard(a, b) {
    if (a.size === 0 || b.size === 0) {
        return 0;
    }
    let intersection = 0;
    for (const token of a) {
        if (b.has(token)) {
            intersection += 1;
        }
    }
    return intersection / (a.size + b.size - intersection);
}

function findNoiseMarkers(text) {
    return NOISE_PATTERNS.filter((pattern) => pattern.test(text)).map((pattern) =>
        pattern.source.replace(/\\b/g, "").replace(/\\/g, "")
    );
}

function hasDisallowedMarker(text) {
    return DISALLOWED_MARKERS.find((pattern) => pattern.test(String(text || ""))) || null;
}

function csvCell(value) {
    if (Array.isArray(value)) {
        return `"${value.join("; ").replace(/"/g, '""')}"`;
    }
    return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function preview(text, limit = 500) {
    return String(text || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function writeReviewCsv(rows) {
    const headers = [
        "kb_id",
        "source_id",
        "domain",
        "topic",
        "title",
        "intended_use",
        "medical_scope",
        "char_count",
        "warning_flags",
        "error_flags",
        "suspected_noise_markers",
        "duplicate_like_kb_ids",
        "content_preview_500",
        "reviewer_notes"
    ];
    const lines = [
        headers.join(","),
        ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(","))
    ];
    fs.writeFileSync(REVIEW_CSV_PATH, lines.join("\n") + "\n", "utf8");
}

function main() {
    const warnings = [];
    const errors = [];
    const rows = readJsonl(DATASET_PATH);
    const kbIds = new Set();
    const domainCounts = {};
    const topicCounts = {};
    const intendedUseCounts = {};
    const medicalScopeCounts = {};
    const sourceTopicCounts = {};
    const reviewRows = [];

    const tokenSets = rows.map((item) => ({
        kb_id: item.kb_id,
        source_id: item.source_id,
        topic: item.topic,
        tokens: tokenSet(item.content)
    }));
    const duplicateLikeById = new Map();

    for (let i = 0; i < tokenSets.length; i += 1) {
        for (let j = i + 1; j < tokenSets.length; j += 1) {
            const similarity = jaccard(tokenSets[i].tokens, tokenSets[j].tokens);
            if (similarity >= DUPLICATE_SIMILARITY_THRESHOLD) {
                const left = tokenSets[i].kb_id;
                const right = tokenSets[j].kb_id;
                if (!duplicateLikeById.has(left)) {
                    duplicateLikeById.set(left, []);
                }
                if (!duplicateLikeById.has(right)) {
                    duplicateLikeById.set(right, []);
                }
                duplicateLikeById.get(left).push({ kb_id: right, similarity });
                duplicateLikeById.get(right).push({ kb_id: left, similarity });
            }
        }
    }

    for (const item of rows) {
        const itemErrors = [];
        const itemWarnings = [];
        const id = item.kb_id || "<missing kb_id>";
        const content = String(item.content || "");
        const charCount = content.length;

        if (!item.kb_id) {
            itemErrors.push("missing_kb_id");
        } else if (kbIds.has(item.kb_id)) {
            itemErrors.push("duplicate_kb_id");
        } else {
            kbIds.add(item.kb_id);
        }

        if (!item.source_id) {
            itemErrors.push("missing_source_id");
        }
        if (!item.source_url) {
            itemErrors.push("missing_source_url");
        }
        if (!item.final_url) {
            itemErrors.push("missing_final_url");
        }
        if (!item.provenance || typeof item.provenance !== "object") {
            itemErrors.push("missing_provenance");
        }
        if (!content.trim()) {
            itemErrors.push("empty_content");
        }
        if (charCount < MIN_CONTENT_CHARS) {
            itemWarnings.push("too_short");
        }
        if (charCount > MAX_CONTENT_CHARS) {
            itemWarnings.push("too_long");
        }
        if (!item.intended_use) {
            itemWarnings.push("missing_intended_use");
        }
        if (!item.medical_scope) {
            itemWarnings.push("missing_medical_scope");
        }

        const disallowed = hasDisallowedMarker(content);
        if (disallowed) {
            itemErrors.push(`disallowed_marker:${disallowed}`);
        }

        const noiseMarkers = findNoiseMarkers(content);
        if (noiseMarkers.length > 0) {
            itemWarnings.push("suspected_navigation_or_reference_noise");
        }

        const duplicateMatches = duplicateLikeById.get(item.kb_id) || [];
        if (duplicateMatches.length > 0) {
            itemWarnings.push("duplicate_like_content");
        }

        const sourceTopicKey = `${item.source_id}::${item.topic}`;
        increment(sourceTopicCounts, sourceTopicKey);
        increment(domainCounts, item.domain);
        increment(topicCounts, item.topic);
        increment(intendedUseCounts, item.intended_use);
        increment(medicalScopeCounts, item.medical_scope);

        for (const warning of itemWarnings) {
            warnings.push(`${id}: ${warning}`);
        }
        for (const error of itemErrors) {
            errors.push(`${id}: ${error}`);
        }

        reviewRows.push({
            kb_id: item.kb_id,
            source_id: item.source_id,
            domain: item.domain,
            topic: item.topic,
            title: item.title,
            intended_use: item.intended_use,
            medical_scope: item.medical_scope,
            char_count: charCount,
            warning_flags: itemWarnings,
            error_flags: itemErrors,
            suspected_noise_markers: [...new Set(noiseMarkers)],
            duplicate_like_kb_ids: duplicateMatches.map(
                (match) => `${match.kb_id}:${match.similarity.toFixed(3)}`
            ),
            content_preview_500: preview(content),
            reviewer_notes: ""
        });
    }

    for (const [sourceTopicKey, count] of Object.entries(sourceTopicCounts)) {
        if (count > 6) {
            warnings.push(
                `${sourceTopicKey}: source/topic has ${count} approved items; review for repetitive coverage.`
            );
        }
    }

    const duplicateLikeCount = reviewRows.filter((row) =>
        row.warning_flags.includes("duplicate_like_content")
    ).length;
    const suspectedNoiseCount = reviewRows.filter((row) =>
        row.warning_flags.includes("suspected_navigation_or_reference_noise")
    ).length;
    const tooShortCount = reviewRows.filter((row) =>
        row.warning_flags.includes("too_short")
    ).length;
    const tooLongCount = reviewRows.filter((row) =>
        row.warning_flags.includes("too_long")
    ).length;
    const missingProvenanceCount = reviewRows.filter((row) =>
        row.error_flags.includes("missing_provenance")
    ).length;

    const summary = {
        total: rows.length,
        warning_count: warnings.length,
        error_count: errors.length,
        duplicate_like_count: duplicateLikeCount,
        suspected_noise_count: suspectedNoiseCount,
        too_short_count: tooShortCount,
        too_long_count: tooLongCount,
        missing_provenance_count: missingProvenanceCount,
        domain_counts: domainCounts,
        topic_counts: topicCounts,
        intended_use_counts: intendedUseCounts,
        medical_scope_counts: medicalScopeCounts
    };

    const report = {
        report_name: "kb_v1_4_batch4a_approved_qa_report",
        generated_at: new Date().toISOString(),
        dataset_path: "ai_lab/datasets/kb_v1_4_batch4a_approved_items.jsonl",
        review_csv_path: "ai_lab/reports/kb_v1_4_batch4a_approved_qa_review.csv",
        summary,
        warnings,
        errors,
        items: reviewRows
    };

    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + "\n", "utf8");
    writeReviewCsv(reviewRows);

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
