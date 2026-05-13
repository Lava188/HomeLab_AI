#!/usr/bin/env node

const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "../..");
const BATCH = "kb_v1_4_batch4a";
const REGISTRY_PATH = path.join(
    ROOT,
    "ai_lab/raw/kb_v1_4_batch4a_source_registry.jsonl"
);
const RAW_ROOT = path.join(ROOT, "ai_lab/raw", BATCH);
const RAW_MANIFEST_PATH = path.join(ROOT, "ai_lab/raw/raw_manifest.jsonl");

function toRepoPath(absolutePath) {
    return path.relative(ROOT, absolutePath).replace(/\\/g, "/");
}

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

function writeJsonl(filePath, rows) {
    fs.writeFileSync(
        filePath,
        rows.map((row) => JSON.stringify(row)).join("\n") + "\n",
        "utf8"
    );
}

function sha256Buffer(buffer) {
    return crypto.createHash("sha256").update(buffer).digest("hex");
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

function requestGet(url, redirectCount = 0) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const client = parsedUrl.protocol === "http:" ? http : https;
        const request = client.get(
            parsedUrl,
            {
                timeout: 30000,
                headers: {
                    "User-Agent": "HomeLabBatch4ASourceFetcher/1.0",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
                }
            },
            (response) => {
                const statusCode = response.statusCode || 0;
                const location = response.headers.location;

                if (
                    [301, 302, 303, 307, 308].includes(statusCode) &&
                    location &&
                    redirectCount < 5
                ) {
                    response.resume();
                    const nextUrl = new URL(location, parsedUrl).toString();
                    requestGet(nextUrl, redirectCount + 1).then(resolve, reject);
                    return;
                }

                const chunks = [];
                response.on("data", (chunk) => chunks.push(chunk));
                response.on("end", () => {
                    const body = Buffer.concat(chunks);
                    if (statusCode < 200 || statusCode >= 400) {
                        reject(
                            new Error(
                                `HTTP ${statusCode} while fetching ${url}`
                            )
                        );
                        return;
                    }

                    resolve({
                        finalUrl: parsedUrl.toString(),
                        statusCode,
                        headers: response.headers,
                        body
                    });
                });
            }
        );

        request.on("timeout", () => {
            request.destroy(new Error(`Timeout while fetching ${url}`));
        });
        request.on("error", reject);
    });
}

function buildManifestRow(source, localPath, capturedAt, fetchResult) {
    const contentType = fetchResult.headers["content-type"] || null;

    return {
        source_id: source.source_id,
        title: source.title,
        url: source.url,
        source_url: source.url,
        allowed_domain: source.allowed_domain,
        source_family: source.source_family,
        source_name: source.source_family,
        topic: source.topic,
        priority: source.priority,
        ingest_order: source.ingest_order,
        local_path: localPath,
        doc_type: "html",
        language: "en",
        section_target: [source.topic],
        captured_at: capturedAt,
        review_status: "raw_captured",
        runtime_promoted: false,
        batch: BATCH,
        status: "raw_captured",
        source_group: "patient_facing_batch4a",
        notes: source.notes || "",
        status_code: fetchResult.statusCode,
        fetch_status_code: fetchResult.statusCode,
        content_type: contentType,
        content_length_bytes: fetchResult.body.length,
        sha256: sha256Buffer(fetchResult.body),
        final_url: fetchResult.finalUrl
    };
}

function upsertRawManifest(newRows) {
    const existingRows = fs.existsSync(RAW_MANIFEST_PATH)
        ? readJsonl(RAW_MANIFEST_PATH)
        : [];
    const newById = new Map(newRows.map((row) => [row.source_id, row]));
    const mergedRows = [];
    const seen = new Set();

    for (const row of existingRows) {
        if (newById.has(row.source_id)) {
            mergedRows.push(newById.get(row.source_id));
            seen.add(row.source_id);
        } else {
            mergedRows.push(row);
        }
    }

    for (const row of newRows) {
        if (!seen.has(row.source_id)) {
            mergedRows.push(row);
        }
    }

    writeJsonl(RAW_MANIFEST_PATH, mergedRows);
    return mergedRows.length;
}

async function main() {
    const registry = readJsonl(REGISTRY_PATH);
    const plannedSources = registry.filter(
        (source) =>
            source.review_status === "planned" &&
            source.runtime_promoted === false
    );
    const successes = [];
    const failures = [];
    const manifestRows = [];

    fs.mkdirSync(RAW_ROOT, { recursive: true });

    for (const source of plannedSources) {
        const sourceDir = path.join(RAW_ROOT, source.source_id);
        const htmlPath = path.join(sourceDir, "source.html");
        const metaPath = path.join(sourceDir, "source_meta.json");
        fs.mkdirSync(sourceDir, { recursive: true });

        try {
            const fetchResult = await requestGet(source.url);
            if (!isAllowedDomain(fetchResult.finalUrl, source.allowed_domain)) {
                throw new Error(
                    `Final URL ${fetchResult.finalUrl} is outside allowed domain ${source.allowed_domain}`
                );
            }

            const capturedAt = new Date().toISOString();
            const sha256 = sha256Buffer(fetchResult.body);
            const contentType = fetchResult.headers["content-type"] || null;
            fs.writeFileSync(htmlPath, fetchResult.body);
            fs.writeFileSync(
                metaPath,
                JSON.stringify(
                    {
                        source_id: source.source_id,
                        title: source.title,
                        url: source.url,
                        final_url: fetchResult.finalUrl,
                        source_family: source.source_family,
                        allowed_domain: source.allowed_domain,
                        topic: source.topic,
                        batch: BATCH,
                        captured_at: capturedAt,
                        review_status: "raw_captured",
                        runtime_promoted: false,
                        status_code: fetchResult.statusCode,
                        content_type: contentType,
                        content_length_bytes: fetchResult.body.length,
                        sha256
                    },
                    null,
                    2
                ) + "\n",
                "utf8"
            );

            manifestRows.push(
                buildManifestRow(
                    source,
                    toRepoPath(htmlPath),
                    capturedAt,
                    fetchResult
                )
            );
            successes.push({
                source_id: source.source_id,
                bytes: fetchResult.body.length,
                statusCode: fetchResult.statusCode
            });
        } catch (error) {
            failures.push({
                source_id: source.source_id,
                url: source.url,
                error: error.message
            });
        }
    }

    const manifestLineCount = upsertRawManifest(manifestRows);
    console.log(
        JSON.stringify(
            {
                registry_count: registry.length,
                planned_count: plannedSources.length,
                captured_count: successes.length,
                failed_count: failures.length,
                manifest_line_count: manifestLineCount,
                successes,
                failures
            },
            null,
            2
        )
    );

    if (failures.length > 0) {
        process.exitCode = 1;
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
