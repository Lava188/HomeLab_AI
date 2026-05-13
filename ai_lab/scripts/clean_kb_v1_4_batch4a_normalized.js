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
const REPORT_PATH = path.join(
    ROOT,
    "ai_lab/normalized/kb_v1_4_batch4a_cleaning_report.json"
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

function normalizeWhitespace(text) {
    return String(text || "")
        .replace(/\r\n/g, "\n")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n[ \t]+/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function removePattern(text, pattern, action, actions) {
    const next = text.replace(pattern, "");
    if (next !== text) {
        actions.push(action);
    }
    return next;
}

function removeLineNoise(text, actions) {
    const lineNoisePatterns = [
        /^share$/i,
        /^share this page$/i,
        /^print$/i,
        /^email$/i,
        /^facebook$/i,
        /^x \(twitter\)$/i,
        /^twitter$/i,
        /^linkedin$/i,
        /^youtube$/i,
        /^instagram$/i,
        /^follow us$/i,
        /^subscribe$/i,
        /^menu$/i,
        /^search$/i,
        /^search niddk$/i,
        /^search medlineplus$/i,
        /^on this page$/i,
        /^related pages$/i,
        /^related topics$/i,
        /^also in spanish$/i,
        /^references$/i
    ];
    let removed = 0;
    const lines = text.split("\n").filter((line) => {
        const trimmed = line.trim();
        const isNoise = lineNoisePatterns.some((pattern) => pattern.test(trimmed));
        if (isNoise) {
            removed += 1;
        }
        return !isNoise;
    });

    if (removed > 0) {
        actions.push(`removed_exact_noise_lines:${removed}`);
    }
    return lines.join("\n");
}

function cutTailSection(text, headings, action, actions) {
    const candidates = headings
        .map((heading) => {
            const index = text.search(heading);
            return index >= 0 ? index : null;
        })
        .filter((index) => index !== null)
        .sort((a, b) => a - b);

    if (candidates.length === 0) {
        return text;
    }

    const cutIndex = candidates[0];
    const head = text.slice(0, cutIndex).trim();
    const tail = text.slice(cutIndex).trim();
    const isTail = cutIndex > Math.floor(text.length * 0.35);
    const tailIsSubstantial = tail.length >= 200;

    if (head.length >= 800 && isTail && tailIsSubstantial) {
        actions.push(action);
        return head;
    }

    return text;
}

function cleanExtractedText(record) {
    const actions = [];
    let text = normalizeWhitespace(record.extracted_text);

    text = removePattern(
        text,
        /\n+Page last reviewed:[\s\S]*?(?:Next review due:[^\n]*(?:\n|$))?/gi,
        "removed_nhs_page_review_footer",
        actions
    );

    text = removePattern(
        text,
        /\n+Last reviewed:[^\n]*(?:\n|$)/gi,
        "removed_last_reviewed_line",
        actions
    );

    text = removePattern(
        text,
        /\n+Next review due:[^\n]*(?:\n|$)/gi,
        "removed_next_review_due_line",
        actions
    );

    text = removePattern(
        text,
        /\n+(?:Print|Email|Share)(?:\n+(?:Print|Email|Share|Facebook|Twitter|LinkedIn|X \(Twitter\))){1,8}\n+/gi,
        "removed_share_toolbar_block",
        actions
    );

    text = cutTailSection(
        text,
        [
            /\n+References\s*\n+/i,
            /\n+Sources\s*\n+/i,
            /\n+Related MedlinePlus Health Topics\s*\n+/i,
            /\n+Related Health Topics\s*\n+/i,
            /\n+Related Diagnostic Tests\s*\n+/i
        ],
        "removed_clear_reference_or_related_tail_section",
        actions
    );

    text = removeLineNoise(text, actions);

    text = removePattern(
        text,
        /\n+The information on this site should not be used as a substitute for professional medical care or advice\.[\s\S]*?health\./gi,
        "removed_medlineplus_sitewide_disclaimer_tail",
        actions
    );

    text = normalizeWhitespace(text);

    return {
        cleanedText: text,
        actions: actions.length > 0 ? actions : ["no_cleaning_action_needed"]
    };
}

function cleanRecord(record) {
    const { cleanedText, actions } = cleanExtractedText(record);
    const originalCharCount = String(record.extracted_text || "").length;
    const cleanedCharCount = cleanedText.length;

    return {
        source_id: record.source_id,
        batch: record.batch,
        topic: record.topic,
        domain: record.domain,
        url: record.url,
        final_url: record.final_url,
        title: record.title,
        cleaned_text: cleanedText,
        original_char_count: originalCharCount,
        cleaned_char_count: cleanedCharCount,
        removed_char_count: Math.max(0, originalCharCount - cleanedCharCount),
        cleaning_actions: actions,
        source_sha256: record.source_sha256,
        provenance: {
            ...record.provenance,
            cleaning: {
                script: "ai_lab/scripts/clean_kb_v1_4_batch4a_normalized.js",
                cleaned_at: new Date().toISOString(),
                input_path: "ai_lab/normalized/kb_v1_4_batch4a_normalized.jsonl",
                cleaning_scope:
                    "Removed only clear website chrome/footer/reference noise from extracted text."
            }
        },
        review_status: "needs_human_review",
        runtime_promoted: false
    };
}

function main() {
    const normalizedRows = readJsonl(NORMALIZED_PATH).filter(
        (record) => record.batch === BATCH
    );
    const cleanedRows = normalizedRows.map(cleanRecord);
    const warningRows = cleanedRows
        .map((record) => ({
            source_id: record.source_id,
            reduction_ratio:
                record.original_char_count > 0
                    ? record.removed_char_count / record.original_char_count
                    : 0,
            original_char_count: record.original_char_count,
            cleaned_char_count: record.cleaned_char_count
        }))
        .filter((row) => row.reduction_ratio > 0.6);

    const actionCounts = {};
    for (const record of cleanedRows) {
        for (const action of record.cleaning_actions) {
            actionCounts[action] = (actionCounts[action] || 0) + 1;
        }
    }

    const summary = {
        total: cleanedRows.length,
        cleaned_count: cleanedRows.length,
        strong_reduction_warning_count: warningRows.length,
        strong_reduction_sources: warningRows,
        action_counts: actionCounts
    };

    const report = {
        report_name: "kb_v1_4_batch4a_cleaning_report",
        generated_at: new Date().toISOString(),
        input_path: "ai_lab/normalized/kb_v1_4_batch4a_normalized.jsonl",
        output_path: "ai_lab/normalized/kb_v1_4_batch4a_cleaned.jsonl",
        summary,
        records: cleanedRows.map((record) => ({
            source_id: record.source_id,
            topic: record.topic,
            domain: record.domain,
            title: record.title,
            original_char_count: record.original_char_count,
            cleaned_char_count: record.cleaned_char_count,
            removed_char_count: record.removed_char_count,
            reduction_ratio:
                record.original_char_count > 0
                    ? Number(
                          (record.removed_char_count / record.original_char_count).toFixed(
                              4
                          )
                      )
                    : null,
            cleaning_actions: record.cleaning_actions
        }))
    };

    fs.mkdirSync(path.dirname(CLEANED_PATH), { recursive: true });
    fs.writeFileSync(
        CLEANED_PATH,
        cleanedRows.map((record) => JSON.stringify(record)).join("\n") + "\n",
        "utf8"
    );
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + "\n", "utf8");

    console.log(JSON.stringify(summary, null, 2));
}

try {
    main();
} catch (error) {
    console.error(error);
    process.exitCode = 1;
}
