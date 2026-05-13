#!/usr/bin/env node

const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");

const DEFAULT_REGISTRY_PATH = path.join(
    __dirname,
    "../raw/kb_v1_4_batch4a_source_registry.jsonl"
);

const REQUIRED_FIELDS = [
    "source_id",
    "title",
    "url",
    "source_family",
    "topic",
    "allowed_domain",
    "priority",
    "intended_use",
    "safety_boundary",
    "review_status",
    "runtime_promoted",
    "notes"
];

const ALLOWED_DOMAINS = [
    "medlineplus.gov",
    "niddk.nih.gov",
    "nhs.uk",
    "nice.org.uk",
    "cdc.gov",
    "who.int"
];

const DISALLOWED_SOURCE_MARKERS = [
    "mock",
    "simulated",
    "demo"
];

function parseArgs(argv) {
    const args = {
        registryPath: DEFAULT_REGISTRY_PATH,
        checkOnline: false
    };

    for (let index = 2; index < argv.length; index += 1) {
        const arg = argv[index];

        if (arg === "--check-online") {
            args.checkOnline = true;
            continue;
        }

        if (arg === "--registry") {
            args.registryPath = path.resolve(argv[index + 1] || "");
            index += 1;
            continue;
        }

        throw new Error(`Unknown argument: ${arg}`);
    }

    return args;
}

function getRegistrableAllowedDomain(hostname) {
    const normalized = String(hostname || "").toLowerCase();
    return ALLOWED_DOMAINS.find(
        (domain) => normalized === domain || normalized.endsWith(`.${domain}`)
    ) || null;
}

function readJsonl(registryPath) {
    const text = fs.readFileSync(registryPath, "utf8");
    const rows = [];
    const errors = [];

    text.split(/\r?\n/).forEach((line, index) => {
        const lineNumber = index + 1;
        if (!line.trim()) {
            return;
        }

        try {
            rows.push({
                lineNumber,
                item: JSON.parse(line)
            });
        } catch (error) {
            errors.push(`Line ${lineNumber}: invalid JSON: ${error.message}`);
        }
    });

    return {
        rows,
        errors
    };
}

function validateRows(rows) {
    const errors = [];
    const warnings = [];
    const sourceIds = new Map();
    const urls = new Map();
    const domains = new Set();
    const topics = new Set();

    for (const { lineNumber, item } of rows) {
        for (const field of REQUIRED_FIELDS) {
            if (!(field in item)) {
                errors.push(`Line ${lineNumber}: missing required field "${field}".`);
            } else if (
                field !== "runtime_promoted" &&
                String(item[field] ?? "").trim() === ""
            ) {
                errors.push(`Line ${lineNumber}: empty required field "${field}".`);
            }
        }

        if (sourceIds.has(item.source_id)) {
            errors.push(
                `Line ${lineNumber}: duplicate source_id "${item.source_id}" also seen on line ${sourceIds.get(item.source_id)}.`
            );
        } else {
            sourceIds.set(item.source_id, lineNumber);
        }

        if (urls.has(item.url)) {
            errors.push(
                `Line ${lineNumber}: duplicate url "${item.url}" also seen on line ${urls.get(item.url)}.`
            );
        } else {
            urls.set(item.url, lineNumber);
        }

        let parsedUrl = null;
        try {
            parsedUrl = new URL(item.url);
        } catch (error) {
            errors.push(`Line ${lineNumber}: invalid url "${item.url}".`);
        }

        if (parsedUrl) {
            const allowedDomain = getRegistrableAllowedDomain(parsedUrl.hostname);
            if (!allowedDomain) {
                errors.push(
                    `Line ${lineNumber}: domain "${parsedUrl.hostname}" is not in the allowlist.`
                );
            } else {
                domains.add(allowedDomain);
            }

            if (item.allowed_domain !== allowedDomain) {
                errors.push(
                    `Line ${lineNumber}: allowed_domain "${item.allowed_domain}" does not match url domain "${allowedDomain}".`
                );
            }
        }

        if (item.review_status !== "planned") {
            errors.push(
                `Line ${lineNumber}: review_status must be "planned", got "${item.review_status}".`
            );
        }

        if (item.runtime_promoted !== false) {
            errors.push(
                `Line ${lineNumber}: runtime_promoted must be false.`
            );
        }

        const searchableText = REQUIRED_FIELDS
            .map((field) => String(item[field] ?? ""))
            .join(" ")
            .toLowerCase();
        for (const marker of DISALLOWED_SOURCE_MARKERS) {
            if (searchableText.includes(marker)) {
                errors.push(
                    `Line ${lineNumber}: disallowed source marker "${marker}" found.`
                );
            }
        }

        if (item.topic) {
            topics.add(item.topic);
        }

        if (!Number.isFinite(Number(item.ingest_order))) {
            warnings.push(
                `Line ${lineNumber}: ingest_order is absent or not numeric.`
            );
        }
    }

    return {
        errors,
        warnings,
        summary: {
            sourceCount: rows.length,
            domainCount: domains.size,
            topicCount: topics.size,
            domains: [...domains].sort(),
            topics: [...topics].sort()
        }
    };
}

function requestHead(url) {
    return new Promise((resolve) => {
        const parsedUrl = new URL(url);
        const client = parsedUrl.protocol === "http:" ? http : https;
        const request = client.request(
            parsedUrl,
            {
                method: "HEAD",
                timeout: 10000,
                headers: {
                    "User-Agent": "HomeLabSourceValidator/1.0"
                }
            },
            (response) => {
                response.resume();
                resolve({
                    url,
                    statusCode: response.statusCode || 0
                });
            }
        );

        request.on("timeout", () => {
            request.destroy(new Error("timeout"));
        });
        request.on("error", (error) => {
            resolve({
                url,
                error: error.message
            });
        });
        request.end();
    });
}

async function checkOnline(rows) {
    const results = [];
    for (const { item } of rows) {
        results.push(await requestHead(item.url));
    }
    return results;
}

async function main() {
    const args = parseArgs(process.argv);
    const registryPath = path.resolve(args.registryPath);
    const { rows, errors: parseErrors } = readJsonl(registryPath);
    const validation = validateRows(rows);
    const errors = [...parseErrors, ...validation.errors];

    console.log(
        JSON.stringify(
            {
                registryPath,
                total: validation.summary.sourceCount,
                domainCount: validation.summary.domainCount,
                topicCount: validation.summary.topicCount,
                domains: validation.summary.domains,
                topics: validation.summary.topics,
                warnings: validation.warnings,
                errors
            },
            null,
            2
        )
    );

    if (args.checkOnline && errors.length === 0) {
        const onlineResults = await checkOnline(rows);
        const badResults = onlineResults.filter((result) => {
            if (result.error) {
                return true;
            }
            return result.statusCode < 200 || result.statusCode >= 400;
        });

        console.log(
            JSON.stringify(
                {
                    onlineChecked: onlineResults.length,
                    onlineFailures: badResults
                },
                null,
                2
            )
        );

        if (badResults.length > 0) {
            process.exitCode = 1;
            return;
        }
    }

    if (errors.length > 0) {
        process.exitCode = 1;
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
