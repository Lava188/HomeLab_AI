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
const REVIEWED_DIR = path.join(ROOT, "ai_lab/kb_reviewed");
const APPROVED_PATH = path.join(
    REVIEWED_DIR,
    "kb_v1_4_batch4a_approved_items.jsonl"
);
const REVISE_PATH = path.join(
    REVIEWED_DIR,
    "kb_v1_4_batch4a_revise_items.jsonl"
);
const REJECTED_PATH = path.join(
    REVIEWED_DIR,
    "kb_v1_4_batch4a_rejected_items.jsonl"
);
const PENDING_PATH = path.join(
    REVIEWED_DIR,
    "kb_v1_4_batch4a_pending_items.jsonl"
);
const REPORT_PATH = path.join(
    REVIEWED_DIR,
    "kb_v1_4_batch4a_review_report.json"
);

const VALID_DECISIONS = new Set(["", "approve", "revise", "reject"]);

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

function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let inQuotes = false;

    for (let index = 0; index < text.length; index += 1) {
        const char = text[index];
        const next = text[index + 1];

        if (char === '"') {
            if (inQuotes && next === '"') {
                cell += '"';
                index += 1;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (char === "," && !inQuotes) {
            row.push(cell);
            cell = "";
            continue;
        }

        if ((char === "\n" || char === "\r") && !inQuotes) {
            if (char === "\r" && next === "\n") {
                index += 1;
            }
            row.push(cell);
            if (row.some((value) => value !== "")) {
                rows.push(row);
            }
            row = [];
            cell = "";
            continue;
        }

        cell += char;
    }

    if (cell || row.length > 0) {
        row.push(cell);
        if (row.some((value) => value !== "")) {
            rows.push(row);
        }
    }

    if (inQuotes) {
        throw new Error("CSV parse error: unclosed quoted field.");
    }

    return rows;
}

function readReviewCsv(filePath) {
    const rows = parseCsv(fs.readFileSync(filePath, "utf8"));
    if (rows.length === 0) {
        throw new Error("Review CSV is empty.");
    }

    const headers = rows[0].map((header, index) =>
        index === 0 ? String(header).replace(/^\uFEFF/, "") : header
    );
    const requiredHeaders = ["item_id", "review_decision", "reviewer_notes"];
    for (const header of requiredHeaders) {
        if (!headers.includes(header)) {
            throw new Error(`Review CSV is missing required header "${header}".`);
        }
    }

    return rows.slice(1).map((row, index) => {
        const record = {};
        headers.forEach((header, headerIndex) => {
            record[header] = row[headerIndex] ?? "";
        });
        record.__line = index + 2;
        return record;
    });
}

function validateCandidate(candidate, errors) {
    const itemId = candidate.item_id || "<missing item_id>";
    const required = [
        "item_id",
        "source_id",
        "topic",
        "domain",
        "url",
        "final_url",
        "title",
        "candidate_text",
        "provenance"
    ];

    for (const field of required) {
        if (
            candidate[field] === undefined ||
            candidate[field] === null ||
            candidate[field] === ""
        ) {
            errors.push(`${itemId}: candidate item missing ${field}.`);
        }
    }

    if (!String(candidate.candidate_text || "").trim()) {
        errors.push(`${itemId}: candidate_text is empty.`);
    }

    if (candidate.runtime_promoted !== false) {
        errors.push(`${itemId}: runtime_promoted must be false.`);
    }

    const provenance = candidate.provenance || {};
    const provenanceRequired = ["source_id", "url", "final_url", "title", "topic", "domain"];
    for (const field of provenanceRequired) {
        if (!provenance[field]) {
            errors.push(`${itemId}: provenance missing ${field}.`);
        }
    }
}

function withReviewDecision(candidate, reviewRow, reviewStatus, decision) {
    return {
        ...candidate,
        review_status: reviewStatus,
        runtime_promoted: false,
        human_review: {
            review_decision: decision || "pending",
            reviewer_notes: reviewRow.reviewer_notes || "",
            review_csv_path: "ai_lab/reports/kb_v1_4_batch4a_candidate_review.csv",
            applied_at: new Date().toISOString(),
            applied_by_script:
                "ai_lab/scripts/apply_kb_v1_4_batch4a_review_decisions.js"
        }
    };
}

function writeJsonl(filePath, rows) {
    fs.writeFileSync(
        filePath,
        rows.length > 0 ? rows.map((row) => JSON.stringify(row)).join("\n") + "\n" : "",
        "utf8"
    );
}

function main() {
    const errors = [];
    const candidates = readJsonl(CANDIDATE_PATH);
    const candidateById = new Map();

    for (const candidate of candidates) {
        validateCandidate(candidate, errors);
        if (candidate.item_id) {
            if (candidateById.has(candidate.item_id)) {
                errors.push(`Duplicate candidate item_id "${candidate.item_id}".`);
            } else {
                candidateById.set(candidate.item_id, candidate);
            }
        }
    }

    const reviewRows = readReviewCsv(REVIEW_CSV_PATH);
    const reviewById = new Map();

    for (const row of reviewRows) {
        const itemId = String(row.item_id || "").trim();
        const decision = String(row.review_decision || "").trim().toLowerCase();

        if (!itemId) {
            errors.push(`CSV line ${row.__line}: item_id is empty.`);
            continue;
        }

        if (!candidateById.has(itemId)) {
            errors.push(`CSV line ${row.__line}: item_id "${itemId}" does not exist.`);
        }

        if (!VALID_DECISIONS.has(decision)) {
            errors.push(
                `CSV line ${row.__line}: review_decision "${row.review_decision}" is invalid.`
            );
        }

        if (reviewById.has(itemId)) {
            errors.push(`CSV line ${row.__line}: duplicate review row for "${itemId}".`);
        } else {
            reviewById.set(itemId, {
                ...row,
                item_id: itemId,
                review_decision: decision
            });
        }
    }

    if (errors.length > 0) {
        console.error(JSON.stringify({ error_count: errors.length, errors }, null, 2));
        process.exitCode = 1;
        return;
    }

    const approved = [];
    const revise = [];
    const rejected = [];
    const pending = [];

    for (const candidate of candidates) {
        const reviewRow =
            reviewById.get(candidate.item_id) || {
                item_id: candidate.item_id,
                review_decision: "",
                reviewer_notes: ""
            };
        const decision = reviewRow.review_decision;

        if (decision === "approve") {
            approved.push(
                withReviewDecision(
                    candidate,
                    reviewRow,
                    "approved_for_kb_build",
                    decision
                )
            );
        } else if (decision === "revise") {
            revise.push(withReviewDecision(candidate, reviewRow, "needs_revision", decision));
        } else if (decision === "reject") {
            rejected.push(withReviewDecision(candidate, reviewRow, "rejected", decision));
        } else {
            pending.push(withReviewDecision(candidate, reviewRow, "candidate_needs_review", ""));
        }
    }

    const summary = {
        total_candidates: candidates.length,
        approved: approved.length,
        revise: revise.length,
        reject: rejected.length,
        pending: pending.length,
        runtime_promoted_count: [
            ...approved,
            ...revise,
            ...rejected,
            ...pending
        ].filter((item) => item.runtime_promoted !== false).length,
        generated_at: new Date().toISOString(),
        inputs: {
            candidate_items:
                "ai_lab/kb_candidates/kb_v1_4_batch4a_candidate_items.jsonl",
            review_csv: "ai_lab/reports/kb_v1_4_batch4a_candidate_review.csv"
        },
        outputs: {
            approved_items: "ai_lab/kb_reviewed/kb_v1_4_batch4a_approved_items.jsonl",
            revise_items: "ai_lab/kb_reviewed/kb_v1_4_batch4a_revise_items.jsonl",
            rejected_items: "ai_lab/kb_reviewed/kb_v1_4_batch4a_rejected_items.jsonl",
            pending_items: "ai_lab/kb_reviewed/kb_v1_4_batch4a_pending_items.jsonl"
        }
    };

    fs.mkdirSync(REVIEWED_DIR, { recursive: true });
    writeJsonl(APPROVED_PATH, approved);
    writeJsonl(REVISE_PATH, revise);
    writeJsonl(REJECTED_PATH, rejected);
    writeJsonl(PENDING_PATH, pending);
    fs.writeFileSync(REPORT_PATH, JSON.stringify(summary, null, 2) + "\n", "utf8");

    console.log(JSON.stringify(summary, null, 2));
}

try {
    main();
} catch (error) {
    console.error(error);
    process.exitCode = 1;
}
