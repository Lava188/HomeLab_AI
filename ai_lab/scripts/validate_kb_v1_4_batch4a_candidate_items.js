#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const BATCH = "kb_v1_4_batch4a";
const CLEANED_PATH = path.join(
    ROOT,
    "ai_lab/normalized/kb_v1_4_batch4a_cleaned.jsonl"
);
const CANDIDATE_PATH = path.join(
    ROOT,
    "ai_lab/kb_candidates/kb_v1_4_batch4a_candidate_items.jsonl"
);

const MIN_CANDIDATE_CHARS = 300;
const LONG_CANDIDATE_CHARS = 3500;
const DISALLOWED_MARKERS = [/\bmock\b/i, /\bsimulated\b/i, /\bdemo\b/i];
const FOOTER_NOISE_PATTERNS = [
    /\bpage last reviewed\b/i,
    /\bnext review due\b/i,
    /\breferences\b/i,
    /\bavailable from:\b/i,
    /\bshare this page\b/i,
    /\bfollow us\b/i,
    /\bfacebook\b/i,
    /\btwitter\b/i,
    /\blinkedin\b/i,
    /\bcookie\b/i
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

function validateEqual(errors, itemId, fieldName, actual, expected) {
    if (actual !== expected) {
        errors.push(`${itemId}: ${fieldName} must be "${expected}", got "${actual}".`);
    }
}

function containsDisallowedMarker(value) {
    const text = JSON.stringify(value || "");
    return DISALLOWED_MARKERS.find((pattern) => pattern.test(text)) || null;
}

function findFooterNoise(text) {
    return FOOTER_NOISE_PATTERNS.filter((pattern) => pattern.test(text)).map((pattern) =>
        pattern.source.replace(/\\b/g, "").replace(/\\/g, "")
    );
}

function hasRequiredProvenance(candidate) {
    const provenance = candidate.provenance || {};
    return (
        provenance.source_id &&
        provenance.url &&
        provenance.final_url &&
        provenance.title &&
        provenance.topic &&
        provenance.domain
    );
}

function main() {
    const warnings = [];
    const errors = [];
    const cleanedRows = readJsonl(CLEANED_PATH).filter(
        (record) => record.batch === BATCH
    );
    const cleanedById = new Map(
        cleanedRows.map((record) => [record.source_id, record])
    );
    let candidates = [];

    if (!fs.existsSync(CANDIDATE_PATH)) {
        errors.push("Candidate file does not exist.");
    } else {
        candidates = readJsonl(CANDIDATE_PATH);
    }

    if (candidates.length < 26) {
        errors.push(`Expected at least 26 candidate items, got ${candidates.length}.`);
    }

    const seenItemIds = new Set();
    const candidateCountBySource = new Map();

    for (const candidate of candidates) {
        const itemId = candidate.item_id || "<missing item_id>";
        if (!candidate.item_id) {
            errors.push("Candidate item is missing item_id.");
        } else if (seenItemIds.has(candidate.item_id)) {
            errors.push(`Duplicate item_id "${candidate.item_id}".`);
        } else {
            seenItemIds.add(candidate.item_id);
        }

        validateEqual(errors, itemId, "batch", candidate.batch, BATCH);

        const source = cleanedById.get(candidate.source_id);
        if (!source) {
            errors.push(`${itemId}: source_id "${candidate.source_id}" not found in cleaned input.`);
            continue;
        }

        candidateCountBySource.set(
            candidate.source_id,
            (candidateCountBySource.get(candidate.source_id) || 0) + 1
        );

        validateEqual(errors, itemId, "topic", candidate.topic, source.topic);
        validateEqual(errors, itemId, "domain", candidate.domain, source.domain);
        validateEqual(errors, itemId, "url", candidate.url, source.url);
        validateEqual(errors, itemId, "final_url", candidate.final_url, source.final_url);
        validateEqual(errors, itemId, "title", candidate.title, source.title);
        validateEqual(
            errors,
            itemId,
            "review_status",
            candidate.review_status,
            "candidate_needs_review"
        );

        if (candidate.runtime_promoted !== false) {
            errors.push(`${itemId}: runtime_promoted must be false.`);
        }

        if (!candidate.candidate_text || !String(candidate.candidate_text).trim()) {
            errors.push(`${itemId}: candidate_text is empty.`);
        } else if (candidate.candidate_text.length < MIN_CANDIDATE_CHARS) {
            errors.push(
                `${itemId}: candidate_text is shorter than ${MIN_CANDIDATE_CHARS} characters.`
            );
        }

        if (candidate.candidate_text.length > source.cleaned_text.length) {
            errors.push(`${itemId}: candidate_text is longer than cleaned_text for source.`);
        }

        if (candidate.char_count !== String(candidate.candidate_text || "").length) {
            errors.push(`${itemId}: char_count does not match candidate_text length.`);
        }

        if (
            !Number.isInteger(candidate.source_text_span_start) ||
            !Number.isInteger(candidate.source_text_span_end) ||
            candidate.source_text_span_start < 0 ||
            candidate.source_text_span_end <= candidate.source_text_span_start ||
            candidate.source_text_span_end > source.cleaned_text.length
        ) {
            errors.push(`${itemId}: invalid source text span.`);
        } else {
            const spanText = source.cleaned_text
                .slice(candidate.source_text_span_start, candidate.source_text_span_end)
                .trim();
            if (spanText !== String(candidate.candidate_text || "").trim()) {
                errors.push(`${itemId}: candidate_text does not match cleaned source span.`);
            }
        }

        if (!hasRequiredProvenance(candidate)) {
            errors.push(`${itemId}: provenance is missing required source fields.`);
        } else {
            validateEqual(
                errors,
                itemId,
                "provenance.source_id",
                candidate.provenance.source_id,
                source.source_id
            );
            validateEqual(
                errors,
                itemId,
                "provenance.url",
                candidate.provenance.url,
                source.url
            );
            validateEqual(
                errors,
                itemId,
                "provenance.final_url",
                candidate.provenance.final_url,
                source.final_url
            );
            validateEqual(
                errors,
                itemId,
                "provenance.title",
                candidate.provenance.title,
                source.title
            );
            validateEqual(
                errors,
                itemId,
                "provenance.topic",
                candidate.provenance.topic,
                source.topic
            );
            validateEqual(
                errors,
                itemId,
                "provenance.domain",
                candidate.provenance.domain,
                source.domain
            );
        }

        const marker = containsDisallowedMarker(candidate);
        if (marker) {
            errors.push(`${itemId}: disallowed marker ${marker} found in candidate item.`);
        }

        if (candidate.candidate_text.length > LONG_CANDIDATE_CHARS) {
            warnings.push(`${itemId}: candidate_text is longer than ${LONG_CANDIDATE_CHARS} characters.`);
        }

        const noiseMarkers = findFooterNoise(candidate.candidate_text);
        if (noiseMarkers.length > 0) {
            warnings.push(
                `${itemId}: possible footer/navigation/reference noise markers: ${[
                    ...new Set(noiseMarkers)
                ].join(", ")}.`
            );
        }
    }

    for (const source of cleanedRows) {
        if (!candidateCountBySource.has(source.source_id)) {
            warnings.push(`${source.source_id}: source produced no candidate items.`);
        }
    }

    const summary = {
        total: candidates.length,
        valid_count: errors.length === 0 ? candidates.length : 0,
        warning_count: warnings.length,
        error_count: errors.length,
        sources_without_candidates: cleanedRows
            .filter((source) => !candidateCountBySource.has(source.source_id))
            .map((source) => source.source_id),
        long_item_ids: candidates
            .filter((candidate) => candidate.candidate_text?.length > LONG_CANDIDATE_CHARS)
            .map((candidate) => candidate.item_id),
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
