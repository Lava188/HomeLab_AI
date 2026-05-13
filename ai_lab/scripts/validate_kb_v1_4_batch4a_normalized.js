#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const BATCH = "kb_v1_4_batch4a";
const REGISTRY_PATH = path.join(
    ROOT,
    "ai_lab/raw/kb_v1_4_batch4a_source_registry.jsonl"
);
const RAW_MANIFEST_PATH = path.join(ROOT, "ai_lab/raw/raw_manifest.jsonl");
const NORMALIZED_PATH = path.join(
    ROOT,
    "ai_lab/normalized/kb_v1_4_batch4a_normalized.jsonl"
);
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

function repoPathToAbsolute(repoPath) {
    return path.join(ROOT, repoPath.replace(/\//g, path.sep));
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
    const registryRows = readJsonl(REGISTRY_PATH);
    const rawManifestRows = readJsonl(RAW_MANIFEST_PATH).filter(
        (row) => row.batch === BATCH
    );
    const rawManifestById = new Map(
        rawManifestRows.map((row) => [row.source_id, row])
    );
    let normalizedRows = [];

    if (!fs.existsSync(NORMALIZED_PATH)) {
        errors.push("Normalized file does not exist.");
    } else {
        normalizedRows = readJsonl(NORMALIZED_PATH);
    }

    if (normalizedRows.length !== 26) {
        errors.push(`Expected 26 normalized records, got ${normalizedRows.length}.`);
    }

    const normalizedById = new Map();
    for (const record of normalizedRows) {
        if (normalizedById.has(record.source_id)) {
            errors.push(`Duplicate normalized source_id "${record.source_id}".`);
        } else {
            normalizedById.set(record.source_id, record);
        }
    }

    for (const source of registryRows) {
        const record = normalizedById.get(source.source_id);
        const manifest = rawManifestById.get(source.source_id);

        if (!record) {
            errors.push(`Missing normalized record for ${source.source_id}.`);
            continue;
        }

        if (!manifest) {
            errors.push(`Missing raw manifest row for ${source.source_id}.`);
            continue;
        }

        const metaPath = path.join(
            path.dirname(repoPathToAbsolute(manifest.local_path)),
            "source_meta.json"
        );
        if (!fs.existsSync(metaPath)) {
            errors.push(`Missing source_meta.json for ${source.source_id}.`);
            continue;
        }
        const meta = readJson(metaPath);

        validateEqual(errors, source.source_id, "batch", record.batch, BATCH);
        validateEqual(errors, source.source_id, "url", record.url, source.url);
        validateEqual(
            errors,
            source.source_id,
            "final_url",
            record.final_url,
            meta.final_url
        );
        validateEqual(
            errors,
            source.source_id,
            "domain",
            record.domain,
            source.allowed_domain
        );
        validateEqual(errors, source.source_id, "topic", record.topic, source.topic);
        validateEqual(
            errors,
            source.source_id,
            "source_sha256",
            record.source_sha256,
            meta.sha256
        );
        validateEqual(
            errors,
            source.source_id,
            "source_sha256",
            record.source_sha256,
            manifest.sha256
        );
        validateEqual(
            errors,
            source.source_id,
            "content_length_bytes",
            record.content_length_bytes,
            meta.content_length_bytes
        );
        validateEqual(
            errors,
            source.source_id,
            "content_length_bytes",
            record.content_length_bytes,
            manifest.content_length_bytes
        );

        if (record.review_status !== "needs_human_review") {
            errors.push(
                `${source.source_id}: review_status must be "needs_human_review".`
            );
        }

        if (record.runtime_promoted !== false) {
            errors.push(`${source.source_id}: runtime_promoted must be false.`);
        }

        if (!record.extracted_text || !String(record.extracted_text).trim()) {
            errors.push(`${source.source_id}: extracted_text is empty.`);
        } else if (record.extracted_text.length < 1000) {
            errors.push(
                `${source.source_id}: extracted_text is shorter than 1000 characters.`
            );
        }

        if (!Array.isArray(record.headings)) {
            warnings.push(`${source.source_id}: headings is not an array.`);
        }

        if (record.extraction_status !== "ok") {
            errors.push(`${source.source_id}: extraction_status is not "ok".`);
        }

        const markerInText = containsDisallowedMarker(record.extracted_text);
        if (markerInText) {
            errors.push(
                `${source.source_id}: disallowed marker ${markerInText} found in extracted_text.`
            );
        }

        const metadataToCheck = {
            source_id: record.source_id,
            batch: record.batch,
            topic: record.topic,
            domain: record.domain,
            url: record.url,
            final_url: record.final_url,
            title: record.title,
            review_status: record.review_status,
            runtime_promoted: record.runtime_promoted,
            provenance: record.provenance,
            notes: record.notes
        };
        const markerInMetadata = containsDisallowedMarker(metadataToCheck);
        if (markerInMetadata) {
            errors.push(
                `${source.source_id}: disallowed marker ${markerInMetadata} found in metadata.`
            );
        }

        const provenance = record.provenance || {};
        validateEqual(
            errors,
            source.source_id,
            "provenance.registry.source_id",
            provenance.registry?.source_id,
            source.source_id
        );
        validateEqual(
            errors,
            source.source_id,
            "provenance.raw_manifest.sha256",
            provenance.raw_manifest?.sha256,
            manifest.sha256
        );
        validateEqual(
            errors,
            source.source_id,
            "provenance.source_meta.sha256",
            provenance.source_meta?.sha256,
            meta.sha256
        );
    }

    const summary = {
        total: normalizedRows.length,
        valid_count: errors.length === 0 ? normalizedRows.length : 0,
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
