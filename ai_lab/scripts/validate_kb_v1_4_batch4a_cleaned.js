#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const BATCH = "kb_v1_4_batch4a";
const NORMALIZED_PATH = path.join(
    ROOT,
    "ai_lab/normalized/kb_v1_4_batch4a_normalized.jsonl"
);
const CLEANED_PATH = path.join(
    ROOT,
    "ai_lab/normalized/kb_v1_4_batch4a_cleaned.jsonl"
);
const MIN_CLEANED_CHARS = 800;
const STRONG_REDUCTION_RATIO = 0.6;
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

function validateEqual(errors, sourceId, fieldName, actual, expected) {
    if (actual !== expected) {
        errors.push(
            `${sourceId}: ${fieldName} must be "${expected}", got "${actual}".`
        );
    }
}

function containsDisallowedMarker(value) {
    const text = JSON.stringify(value || "");
    return DISALLOWED_MARKERS.find((pattern) => pattern.test(text)) || null;
}

function main() {
    const warnings = [];
    const errors = [];

    const normalizedRows = readJsonl(NORMALIZED_PATH).filter(
        (record) => record.batch === BATCH
    );
    let cleanedRows = [];

    if (!fs.existsSync(CLEANED_PATH)) {
        errors.push("Cleaned file does not exist.");
    } else {
        cleanedRows = readJsonl(CLEANED_PATH);
    }

    if (cleanedRows.length !== 26) {
        errors.push(`Expected 26 cleaned records, got ${cleanedRows.length}.`);
    }

    const normalizedById = new Map(
        normalizedRows.map((record) => [record.source_id, record])
    );
    const cleanedById = new Map();

    for (const record of cleanedRows) {
        if (!record.source_id) {
            errors.push("Cleaned record is missing source_id.");
            continue;
        }
        if (cleanedById.has(record.source_id)) {
            errors.push(`Duplicate cleaned source_id "${record.source_id}".`);
        } else {
            cleanedById.set(record.source_id, record);
        }
    }

    for (const original of normalizedRows) {
        const cleaned = cleanedById.get(original.source_id);
        if (!cleaned) {
            errors.push(`Missing cleaned record for ${original.source_id}.`);
            continue;
        }

        validateEqual(errors, original.source_id, "batch", cleaned.batch, BATCH);
        validateEqual(errors, original.source_id, "topic", cleaned.topic, original.topic);
        validateEqual(errors, original.source_id, "domain", cleaned.domain, original.domain);
        validateEqual(errors, original.source_id, "url", cleaned.url, original.url);
        validateEqual(
            errors,
            original.source_id,
            "final_url",
            cleaned.final_url,
            original.final_url
        );
        validateEqual(errors, original.source_id, "title", cleaned.title, original.title);
        validateEqual(
            errors,
            original.source_id,
            "source_sha256",
            cleaned.source_sha256,
            original.source_sha256
        );
        validateEqual(
            errors,
            original.source_id,
            "review_status",
            cleaned.review_status,
            "needs_human_review"
        );

        if (cleaned.runtime_promoted !== false) {
            errors.push(`${original.source_id}: runtime_promoted must be false.`);
        }

        if (!cleaned.cleaned_text || !String(cleaned.cleaned_text).trim()) {
            errors.push(`${original.source_id}: cleaned_text is empty.`);
        } else if (cleaned.cleaned_text.length < MIN_CLEANED_CHARS) {
            errors.push(
                `${original.source_id}: cleaned_text is shorter than ${MIN_CLEANED_CHARS} characters.`
            );
        }

        const originalCharCount = String(original.extracted_text || "").length;
        const cleanedCharCount = String(cleaned.cleaned_text || "").length;
        const expectedRemoved = originalCharCount - cleanedCharCount;

        validateEqual(
            errors,
            original.source_id,
            "original_char_count",
            cleaned.original_char_count,
            originalCharCount
        );
        validateEqual(
            errors,
            original.source_id,
            "cleaned_char_count",
            cleaned.cleaned_char_count,
            cleanedCharCount
        );
        validateEqual(
            errors,
            original.source_id,
            "removed_char_count",
            cleaned.removed_char_count,
            Math.max(0, expectedRemoved)
        );

        if (cleanedCharCount > originalCharCount) {
            errors.push(
                `${original.source_id}: cleaned_text is longer than original extracted_text.`
            );
        }

        if (!cleaned.provenance || typeof cleaned.provenance !== "object") {
            errors.push(`${original.source_id}: provenance is missing.`);
        } else {
            validateEqual(
                errors,
                original.source_id,
                "provenance.registry.source_id",
                cleaned.provenance.registry?.source_id,
                original.source_id
            );
            validateEqual(
                errors,
                original.source_id,
                "provenance.raw_manifest.sha256",
                cleaned.provenance.raw_manifest?.sha256,
                original.provenance?.raw_manifest?.sha256
            );
            validateEqual(
                errors,
                original.source_id,
                "provenance.source_meta.sha256",
                cleaned.provenance.source_meta?.sha256,
                original.provenance?.source_meta?.sha256
            );
        }

        if (!Array.isArray(cleaned.cleaning_actions)) {
            errors.push(`${original.source_id}: cleaning_actions must be an array.`);
        }

        const marker = containsDisallowedMarker(cleaned);
        if (marker) {
            errors.push(
                `${original.source_id}: disallowed marker ${marker} found in cleaned record.`
            );
        }

        const reductionRatio =
            originalCharCount > 0 ? (originalCharCount - cleanedCharCount) / originalCharCount : 0;
        if (reductionRatio > STRONG_REDUCTION_RATIO) {
            warnings.push(
                `${original.source_id}: cleaned_text reduced by ${(
                    reductionRatio * 100
                ).toFixed(1)}%; review manually.`
            );
        }
    }

    for (const cleaned of cleanedRows) {
        if (!normalizedById.has(cleaned.source_id)) {
            errors.push(`Cleaned source_id "${cleaned.source_id}" is not in normalized input.`);
        }
    }

    const summary = {
        total: cleanedRows.length,
        valid_count: errors.length === 0 ? cleanedRows.length : 0,
        warning_count: warnings.length,
        error_count: errors.length,
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
