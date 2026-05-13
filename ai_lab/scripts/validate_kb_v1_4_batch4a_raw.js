#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "../..");
const BATCH = "kb_v1_4_batch4a";
const REGISTRY_PATH = path.join(
    ROOT,
    "ai_lab/raw/kb_v1_4_batch4a_source_registry.jsonl"
);
const RAW_MANIFEST_PATH = path.join(ROOT, "ai_lab/raw/raw_manifest.jsonl");
const MIN_RAW_FILE_BYTES = 1024;

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

function repoPathToAbsolute(repoPath) {
    return path.join(ROOT, repoPath.replace(/\//g, path.sep));
}

function readJson(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (error) {
        throw new Error(`${filePath}: invalid JSON: ${error.message}`);
    }
}

function sha256File(filePath) {
    return crypto
        .createHash("sha256")
        .update(fs.readFileSync(filePath))
        .digest("hex");
}

function isAllowedDomain(url, allowedDomain) {
    let hostname = "";
    try {
        hostname = new URL(url).hostname.toLowerCase();
    } catch (error) {
        return false;
    }

    const normalizedAllowedDomain = String(allowedDomain || "").toLowerCase();
    return (
        hostname === normalizedAllowedDomain ||
        hostname.endsWith(`.${normalizedAllowedDomain}`)
    );
}

function expectedLocalPath(sourceId) {
    return `ai_lab/raw/${BATCH}/${sourceId}/source.html`;
}

function requireEqual(errors, sourceId, fieldName, actual, expected, scope) {
    if (actual !== expected) {
        errors.push(
            `${sourceId}: ${scope}.${fieldName} must be "${expected}", got "${actual}".`
        );
    }
}

function main() {
    const registryRows = readJsonl(REGISTRY_PATH);
    const manifestRows = readJsonl(RAW_MANIFEST_PATH);
    const errors = [];
    const warnings = [];
    const sourceIdLines = new Map();

    manifestRows.forEach((row, index) => {
        const lineNumber = index + 1;
        if (!row.source_id) {
            errors.push(`Manifest line ${lineNumber}: missing source_id.`);
            return;
        }

        if (sourceIdLines.has(row.source_id)) {
            errors.push(
                `Manifest line ${lineNumber}: duplicate source_id "${row.source_id}" also seen on line ${sourceIdLines.get(row.source_id)}.`
            );
        } else {
            sourceIdLines.set(row.source_id, lineNumber);
        }
    });

    const manifestById = new Map(
        manifestRows.map((row) => [row.source_id, row])
    );

    for (const source of registryRows) {
        const row = manifestById.get(source.source_id);
        const expectedPath = expectedLocalPath(source.source_id);

        if (!row) {
            errors.push(
                `Missing raw_manifest entry for source_id "${source.source_id}".`
            );
            continue;
        }

        if (row.batch !== BATCH) {
            errors.push(
                `${source.source_id}: batch must be "${BATCH}", got "${row.batch}".`
            );
        }

        if (row.review_status !== "raw_captured") {
            errors.push(
                `${source.source_id}: review_status must be "raw_captured", got "${row.review_status}".`
            );
        }

        if (row.runtime_promoted !== false) {
            errors.push(`${source.source_id}: runtime_promoted must be false.`);
        }

        requireEqual(
            errors,
            source.source_id,
            "url",
            row.url,
            source.url,
            "manifest"
        );
        requireEqual(
            errors,
            source.source_id,
            "topic",
            row.topic,
            source.topic,
            "manifest"
        );
        requireEqual(
            errors,
            source.source_id,
            "allowed_domain",
            row.allowed_domain,
            source.allowed_domain,
            "manifest"
        );

        if (row.local_path !== expectedPath) {
            errors.push(
                `${source.source_id}: local_path must be "${expectedPath}", got "${row.local_path}".`
            );
        }

        if (!row.captured_at) {
            errors.push(`${source.source_id}: missing captured_at.`);
        }

        const absolutePath = repoPathToAbsolute(expectedPath);
        if (!fs.existsSync(absolutePath)) {
            errors.push(`${source.source_id}: raw file does not exist.`);
            continue;
        }

        const stat = fs.statSync(absolutePath);
        if (!stat.isFile()) {
            errors.push(`${source.source_id}: raw path is not a file.`);
        } else if (stat.size <= 0) {
            errors.push(`${source.source_id}: raw file is empty.`);
        } else if (stat.size < MIN_RAW_FILE_BYTES) {
            errors.push(
                `${source.source_id}: raw file is smaller than ${MIN_RAW_FILE_BYTES} bytes.`
            );
        }

        const metaPath = path.join(path.dirname(absolutePath), "source_meta.json");
        if (!fs.existsSync(metaPath)) {
            errors.push(`${source.source_id}: source_meta.json is missing.`);
            continue;
        }

        const actualSha256 = sha256File(absolutePath);
        const actualContentLength = stat.size;
        if (!row.sha256) {
            errors.push(`${source.source_id}: manifest.sha256 is missing.`);
        } else if (row.sha256 !== actualSha256) {
            errors.push(`${source.source_id}: manifest.sha256 does not match raw file.`);
        }

        if (row.content_length_bytes !== actualContentLength) {
            errors.push(
                `${source.source_id}: manifest.content_length_bytes must be ${actualContentLength}, got "${row.content_length_bytes}".`
            );
        }

        if (!row.status_code) {
            errors.push(`${source.source_id}: manifest.status_code is missing.`);
        }

        if (!row.content_type) {
            warnings.push(`${source.source_id}: manifest.content_type is missing.`);
        }

        if (!row.final_url) {
            errors.push(`${source.source_id}: manifest.final_url is missing.`);
        } else if (!isAllowedDomain(row.final_url, source.allowed_domain)) {
            errors.push(
                `${source.source_id}: manifest.final_url "${row.final_url}" is outside allowed domain "${source.allowed_domain}".`
            );
        }

        const meta = readJson(metaPath);
        requireEqual(
            errors,
            source.source_id,
            "source_id",
            meta.source_id,
            source.source_id,
            "meta"
        );
        requireEqual(errors, source.source_id, "url", meta.url, source.url, "meta");
        requireEqual(
            errors,
            source.source_id,
            "topic",
            meta.topic,
            source.topic,
            "meta"
        );
        requireEqual(errors, source.source_id, "batch", meta.batch, BATCH, "meta");
        requireEqual(
            errors,
            source.source_id,
            "review_status",
            meta.review_status,
            "raw_captured",
            "meta"
        );

        if (meta.runtime_promoted !== false) {
            errors.push(`${source.source_id}: meta.runtime_promoted must be false.`);
        }

        if (!meta.final_url) {
            errors.push(`${source.source_id}: meta.final_url is missing.`);
        } else if (!isAllowedDomain(meta.final_url, source.allowed_domain)) {
            errors.push(
                `${source.source_id}: meta.final_url "${meta.final_url}" is outside allowed domain "${source.allowed_domain}".`
            );
        }

        requireEqual(
            errors,
            source.source_id,
            "final_url",
            meta.final_url,
            row.final_url,
            "meta"
        );
        requireEqual(
            errors,
            source.source_id,
            "status_code",
            meta.status_code,
            row.status_code,
            "meta"
        );
        requireEqual(
            errors,
            source.source_id,
            "content_type",
            meta.content_type,
            row.content_type,
            "meta"
        );
        requireEqual(
            errors,
            source.source_id,
            "content_length_bytes",
            meta.content_length_bytes,
            row.content_length_bytes,
            "meta"
        );
        requireEqual(
            errors,
            source.source_id,
            "sha256",
            meta.sha256,
            row.sha256,
            "meta"
        );

        if (meta.sha256 !== actualSha256) {
            errors.push(`${source.source_id}: meta.sha256 does not match raw file.`);
        }
    }

    const batchManifestRows = manifestRows.filter((row) => row.batch === BATCH);
    const domains = new Set(batchManifestRows.map((row) => row.allowed_domain));
    const topics = new Set(batchManifestRows.map((row) => row.topic));

    console.log(
        JSON.stringify(
            {
                registry_count: registryRows.length,
                manifest_line_count: manifestRows.length,
                batch_manifest_count: batchManifestRows.length,
                domain_count: domains.size,
                topic_count: topics.size,
                domains: [...domains].sort(),
                warnings,
                errors
            },
            null,
            2
        )
    );

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
