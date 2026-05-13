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
const NORMALIZED_PATH = path.join(
    ROOT,
    "ai_lab/normalized/kb_v1_4_batch4a_normalized.jsonl"
);
const REPORT_PATH = path.join(
    ROOT,
    "ai_lab/normalized/kb_v1_4_batch4a_extraction_report.json"
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

function writeJsonl(filePath, rows) {
    fs.writeFileSync(
        filePath,
        rows.map((row) => JSON.stringify(row)).join("\n") + "\n",
        "utf8"
    );
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function repoPathToAbsolute(repoPath) {
    return path.join(ROOT, repoPath.replace(/\//g, path.sep));
}

function sha256Buffer(buffer) {
    return crypto.createHash("sha256").update(buffer).digest("hex");
}

function decodeHtmlEntities(value) {
    const namedEntities = {
        amp: "&",
        lt: "<",
        gt: ">",
        quot: "\"",
        apos: "'",
        nbsp: " ",
        ndash: "-",
        mdash: "-",
        hellip: "...",
        rsquo: "'",
        lsquo: "'",
        rdquo: "\"",
        ldquo: "\""
    };

    return String(value || "").replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity) => {
        if (entity[0] === "#") {
            const isHex = entity[1]?.toLowerCase() === "x";
            const codePoint = Number.parseInt(
                isHex ? entity.slice(2) : entity.slice(1),
                isHex ? 16 : 10
            );
            if (Number.isFinite(codePoint)) {
                try {
                    return String.fromCodePoint(codePoint);
                } catch (error) {
                    return match;
                }
            }
            return match;
        }

        return Object.prototype.hasOwnProperty.call(namedEntities, entity)
            ? namedEntities[entity]
            : match;
    });
}

function normalizeWhitespace(value) {
    return String(value || "")
        .replace(/\r/g, "\n")
        .replace(/[ \t\f\v]+/g, " ")
        .replace(/\n[ \t]+/g, "\n")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function stripNoise(html) {
    return String(html || "")
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
        .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
        .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
        .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ")
        .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, " ")
        .replace(/<nav\b[\s\S]*?<\/nav>/gi, " ")
        .replace(/<footer\b[\s\S]*?<\/footer>/gi, " ")
        .replace(/<header\b[\s\S]*?<\/header>/gi, " ")
        .replace(/<aside\b[\s\S]*?<\/aside>/gi, " ")
        .replace(/<form\b[\s\S]*?<\/form>/gi, " ")
        .replace(/<button\b[\s\S]*?<\/button>/gi, " ");
}

function extractTagBlocks(html, tagName) {
    const blocks = [];
    const pattern = new RegExp(`<${tagName}\\b[^>]*>[\\s\\S]*?<\\/${tagName}>`, "gi");
    let match = null;

    while ((match = pattern.exec(html))) {
        blocks.push(match[0]);
    }

    return blocks;
}

function extractAttributeBlocks(html) {
    const patterns = [
        /<div\b[^>]*(?:id|class)=["'][^"']*(?:main|content|article|page-content|main-content)[^"']*["'][^>]*>[\s\S]*?<\/div>/gi,
        /<section\b[^>]*(?:id|class)=["'][^"']*(?:main|content|article|page-content|main-content)[^"']*["'][^>]*>[\s\S]*?<\/section>/gi,
        /<div\b[^>]*role=["']main["'][^>]*>[\s\S]*?<\/div>/gi
    ];
    const blocks = [];

    for (const pattern of patterns) {
        let match = null;
        while ((match = pattern.exec(html))) {
            blocks.push(match[0]);
        }
    }

    return blocks;
}

function htmlToText(html) {
    const withLineBreaks = String(html || "")
        .replace(/<(h[1-6]|p|li|br|tr|div|section|article)\b[^>]*>/gi, "\n")
        .replace(/<\/(h[1-6]|p|li|tr|div|section|article)>/gi, "\n")
        .replace(/<[^>]+>/g, " ");

    return normalizeWhitespace(decodeHtmlEntities(withLineBreaks));
}

function extractHeadings(html) {
    const headings = [];
    const pattern = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
    let match = null;

    while ((match = pattern.exec(html))) {
        const text = htmlToText(match[2]);
        if (text) {
            headings.push({
                level: Number(match[1]),
                text
            });
        }
    }

    return headings;
}

function chooseMainHtml(cleanHtml) {
    const candidates = [
        ...extractTagBlocks(cleanHtml, "main"),
        ...extractTagBlocks(cleanHtml, "article"),
        ...extractAttributeBlocks(cleanHtml)
    ]
        .map((html) => ({
            html,
            text: htmlToText(html)
        }))
        .filter((candidate) => candidate.text.length >= 500)
        .sort((left, right) => right.text.length - left.text.length);

    if (candidates.length > 0) {
        return {
            html: candidates[0].html,
            usedFallback: false,
            candidateCount: candidates.length
        };
    }

    const bodyMatch = cleanHtml.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
    return {
        html: bodyMatch ? bodyMatch[1] : cleanHtml,
        usedFallback: true,
        candidateCount: 0
    };
}

function extractNormalized(source, manifest, meta) {
    const rawPath = repoPathToAbsolute(manifest.local_path);
    const rawBuffer = fs.readFileSync(rawPath);
    const rawHtml = rawBuffer.toString("utf8");
    const actualSha256 = sha256Buffer(rawBuffer);
    const cleanHtml = stripNoise(rawHtml);
    const chosen = chooseMainHtml(cleanHtml);
    const extractedText = htmlToText(chosen.html);
    const headings = extractHeadings(chosen.html);
    const notes = [];

    if (chosen.usedFallback) {
        notes.push("main_content_not_found_used_body_fallback");
    }

    if (extractedText.length < 1000) {
        notes.push("extracted_text_shorter_than_1000_chars");
    }

    if (actualSha256 !== meta.sha256 || actualSha256 !== manifest.sha256) {
        notes.push("source_sha256_mismatch_detected_during_extraction");
    }

    return {
        source_id: source.source_id,
        batch: BATCH,
        topic: source.topic,
        domain: source.allowed_domain,
        url: source.url,
        final_url: meta.final_url || manifest.final_url,
        title: source.title,
        extracted_text: extractedText,
        headings,
        source_sha256: actualSha256,
        content_length_bytes: rawBuffer.length,
        extraction_status: extractedText ? "ok" : "empty",
        review_status: "needs_human_review",
        runtime_promoted: false,
        provenance: {
            registry: {
                source_id: source.source_id,
                title: source.title,
                url: source.url,
                source_family: source.source_family,
                topic: source.topic,
                allowed_domain: source.allowed_domain,
                priority: source.priority,
                ingest_order: source.ingest_order,
                intended_use: source.intended_use,
                safety_boundary: source.safety_boundary,
                review_status: source.review_status,
                runtime_promoted: source.runtime_promoted,
                notes: source.notes || ""
            },
            raw_manifest: {
                local_path: manifest.local_path,
                captured_at: manifest.captured_at,
                review_status: manifest.review_status,
                runtime_promoted: manifest.runtime_promoted,
                batch: manifest.batch,
                status_code: manifest.status_code,
                content_type: manifest.content_type,
                content_length_bytes: manifest.content_length_bytes,
                sha256: manifest.sha256,
                final_url: manifest.final_url
            },
            source_meta: {
                captured_at: meta.captured_at,
                review_status: meta.review_status,
                runtime_promoted: meta.runtime_promoted,
                batch: meta.batch,
                status_code: meta.status_code,
                content_type: meta.content_type,
                content_length_bytes: meta.content_length_bytes,
                sha256: meta.sha256,
                final_url: meta.final_url
            },
            extraction: {
                script: "ai_lab/scripts/extract_kb_v1_4_batch4a_normalized.js",
                extracted_at: new Date().toISOString(),
                main_content_candidate_count: chosen.candidateCount,
                used_body_fallback: chosen.usedFallback
            }
        },
        notes
    };
}

function main() {
    const registryRows = readJsonl(REGISTRY_PATH);
    const manifestRows = readJsonl(RAW_MANIFEST_PATH);
    const manifestById = new Map(
        manifestRows
            .filter((row) => row.batch === BATCH)
            .map((row) => [row.source_id, row])
    );
    const normalizedRows = [];
    const errors = [];
    const warnings = [];

    for (const source of registryRows) {
        const manifest = manifestById.get(source.source_id);
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
        const record = extractNormalized(source, manifest, meta);
        normalizedRows.push(record);

        if (record.notes.length > 0) {
            warnings.push({
                source_id: source.source_id,
                notes: record.notes
            });
        }
    }

    fs.mkdirSync(path.dirname(NORMALIZED_PATH), { recursive: true });
    writeJsonl(NORMALIZED_PATH, normalizedRows);

    const report = {
        batch: BATCH,
        source_count: registryRows.length,
        normalized_count: normalizedRows.length,
        error_count: errors.length,
        warning_count: warnings.length,
        output_path: path.relative(ROOT, NORMALIZED_PATH).replace(/\\/g, "/"),
        generated_at: new Date().toISOString(),
        warnings,
        errors
    };
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + "\n", "utf8");

    console.log(JSON.stringify(report, null, 2));

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
