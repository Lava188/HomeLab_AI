#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const NORMALIZED_PATH = path.join(
    ROOT,
    "ai_lab/normalized/kb_v1_4_batch4a_normalized.jsonl"
);
const REPORT_JSON_PATH = path.join(
    ROOT,
    "ai_lab/reports/kb_v1_4_batch4a_normalized_qa_report.json"
);
const REVIEW_CSV_PATH = path.join(
    ROOT,
    "ai_lab/reports/kb_v1_4_batch4a_normalized_qa_review.csv"
);

const MIN_TEXT_CHARS = 1000;
const TOO_BROAD_CHARS = 30000;
const PREVIEW_CHARS = 360;

const NOISE_PATTERNS = [
    /\bcookie\b/i,
    /\bprivacy\b/i,
    /\bsubscribe\b/i,
    /\bsign in\b/i,
    /\blog in\b/i,
    /\bmenu\b/i,
    /\bshare\b/i,
    /\bfacebook\b/i,
    /\btwitter\b/i,
    /\binstagram\b/i,
    /\byoutube\b/i,
    /\bprint\b/i,
    /\breferences\b/i,
    /\bavailable from:\b/i,
    /\bpage last reviewed\b/i,
    /\bnext review due\b/i,
    /\bcontact us\b/i
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

function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
}

function countWords(text) {
    const matches = normalizeText(text).match(/\b[\w'-]+\b/g);
    return matches ? matches.length : 0;
}

function previewStart(text) {
    return normalizeText(text).slice(0, PREVIEW_CHARS);
}

function previewMid(text) {
    const normalized = normalizeText(text);
    if (normalized.length <= PREVIEW_CHARS) {
        return normalized;
    }

    const start = Math.max(0, Math.floor(normalized.length / 2 - PREVIEW_CHARS / 2));
    return normalized.slice(start, start + PREVIEW_CHARS);
}

function previewEnd(text) {
    const normalized = normalizeText(text);
    return normalized.slice(Math.max(0, normalized.length - PREVIEW_CHARS));
}

function findNoiseMarkers(text) {
    const markers = [];
    for (const pattern of NOISE_PATTERNS) {
        if (pattern.test(text)) {
            markers.push(pattern.source.replace(/\\b/g, "").replace(/\\/g, ""));
        }
    }
    return [...new Set(markers)];
}

function looksDuplicateLikeTitle(record) {
    const title = normalizeText(record.title).toLowerCase();
    const text = normalizeText(record.extracted_text).toLowerCase();
    if (!title || !text) {
        return false;
    }

    const firstWords = text.split(/\s+/).slice(0, 20).join(" ");
    const titleOccurrences = text.split(title).length - 1;
    return firstWords.includes(title) || titleOccurrences >= 3;
}

function buildReviewerNote({
    suspectedTooShort,
    suspectedTooBroad,
    suspectedNoise,
    usedBodyFallback,
    suspectedDuplicateLikeTitle
}) {
    const notes = [];

    if (suspectedTooShort) {
        notes.push("Needs extraction fix: text is empty or shorter than threshold.");
    }
    if (suspectedTooBroad) {
        notes.push("Review for overly broad capture; text exceeds 30000 characters.");
    }
    if (suspectedNoise) {
        notes.push("Review suspected navigation/footer/reference/social/cookie noise.");
    }
    if (usedBodyFallback) {
        notes.push("Extractor used body fallback; manually verify main content boundaries.");
    }
    if (suspectedDuplicateLikeTitle) {
        notes.push("Title-like repetition detected; check duplicate header/title text.");
    }

    return notes.join(" ") || "Manual medical/provenance review required before KB drafting.";
}

function toCsvCell(value) {
    if (Array.isArray(value)) {
        return `"${value.join("; ").replace(/"/g, '""')}"`;
    }

    return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function writeCsv(filePath, rows) {
    const headers = [
        "source_id",
        "topic",
        "domain",
        "title",
        "url",
        "final_url",
        "char_count",
        "word_count",
        "heading_count",
        "extraction_status",
        "review_status",
        "runtime_promoted",
        "used_body_fallback",
        "main_content_candidate_count",
        "text_preview_start",
        "text_preview_mid",
        "text_preview_end",
        "suspected_noise_markers",
        "suspected_navigation_or_footer_noise",
        "suspected_too_short",
        "suspected_too_broad",
        "suspected_duplicate_like_title",
        "qa_status",
        "reviewer_note"
    ];
    const lines = [
        headers.join(","),
        ...rows.map((row) => headers.map((header) => toCsvCell(row[header])).join(","))
    ];
    fs.writeFileSync(filePath, lines.join("\n") + "\n", "utf8");
}

function qaRecord(record) {
    const extractedText = String(record.extracted_text || "");
    const charCount = extractedText.length;
    const wordCount = countWords(extractedText);
    const headingCount = Array.isArray(record.headings) ? record.headings.length : 0;
    const usedBodyFallback = Boolean(
        record.provenance?.extraction?.used_body_fallback
    );
    const mainContentCandidateCount =
        record.provenance?.extraction?.main_content_candidate_count ?? null;
    const suspectedNoiseMarkers = findNoiseMarkers(extractedText);
    const suspectedNavigationOrFooterNoise = suspectedNoiseMarkers.length > 0;
    const suspectedTooShort = !extractedText.trim() || charCount < MIN_TEXT_CHARS;
    const suspectedTooBroad = charCount > TOO_BROAD_CHARS;
    const suspectedDuplicateLikeTitle = looksDuplicateLikeTitle(record);
    const qaStatus = suspectedTooShort ? "needs_fix" : "needs_manual_review";

    return {
        source_id: record.source_id,
        topic: record.topic,
        domain: record.domain,
        title: record.title,
        url: record.url,
        final_url: record.final_url,
        char_count: charCount,
        word_count: wordCount,
        heading_count: headingCount,
        extraction_status: record.extraction_status,
        review_status: record.review_status,
        runtime_promoted: record.runtime_promoted,
        used_body_fallback: usedBodyFallback,
        main_content_candidate_count: mainContentCandidateCount,
        text_preview_start: previewStart(extractedText),
        text_preview_mid: previewMid(extractedText),
        text_preview_end: previewEnd(extractedText),
        suspected_noise_markers: suspectedNoiseMarkers,
        suspected_navigation_or_footer_noise: suspectedNavigationOrFooterNoise,
        suspected_too_short: suspectedTooShort,
        suspected_too_broad: suspectedTooBroad,
        suspected_duplicate_like_title: suspectedDuplicateLikeTitle,
        qa_status: qaStatus,
        reviewer_note: buildReviewerNote({
            suspectedTooShort,
            suspectedTooBroad,
            suspectedNoise: suspectedNavigationOrFooterNoise,
            usedBodyFallback,
            suspectedDuplicateLikeTitle
        })
    };
}

function summarize(rows) {
    return {
        total: rows.length,
        needs_manual_review: rows.filter((row) => row.qa_status === "needs_manual_review").length,
        needs_fix: rows.filter((row) => row.qa_status === "needs_fix").length,
        body_fallback_count: rows.filter((row) => row.used_body_fallback).length,
        suspected_noise_count: rows.filter((row) => row.suspected_navigation_or_footer_noise).length,
        suspected_too_broad_count: rows.filter((row) => row.suspected_too_broad).length,
        suspected_too_short_count: rows.filter((row) => row.suspected_too_short).length
    };
}

function main() {
    const normalizedRows = readJsonl(NORMALIZED_PATH);
    const qaRows = normalizedRows.map(qaRecord);
    const summary = summarize(qaRows);
    const report = {
        report_name: "kb_v1_4_batch4a_normalized_qa_report",
        generated_at: new Date().toISOString(),
        normalized_path: "ai_lab/normalized/kb_v1_4_batch4a_normalized.jsonl",
        review_csv_path: "ai_lab/reports/kb_v1_4_batch4a_normalized_qa_review.csv",
        records: qaRows,
        summary
    };

    fs.mkdirSync(path.dirname(REPORT_JSON_PATH), { recursive: true });
    fs.writeFileSync(REPORT_JSON_PATH, JSON.stringify(report, null, 2) + "\n", "utf8");
    writeCsv(REVIEW_CSV_PATH, qaRows);

    console.log(JSON.stringify(summary, null, 2));
}

try {
    main();
} catch (error) {
    console.error(error);
    process.exitCode = 1;
}
