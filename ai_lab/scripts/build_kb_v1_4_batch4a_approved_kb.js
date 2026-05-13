#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const VERSION = "v1.4-batch4a";
const BATCH = "kb_v1_4_batch4a";
const APPROVED_INPUT_PATH = path.join(
    ROOT,
    "ai_lab/kb_reviewed/kb_v1_4_batch4a_approved_items.jsonl"
);
const OUTPUT_PATH = path.join(
    ROOT,
    "ai_lab/datasets/kb_v1_4_batch4a_approved_items.jsonl"
);
const REPORT_PATH = path.join(
    ROOT,
    "ai_lab/datasets/kb_v1_4_batch4a_approved_report.json"
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

function normalizeContent(text) {
    return String(text || "")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n[ \t]+/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function increment(counts, key) {
    const normalizedKey = String(key || "unknown");
    counts[normalizedKey] = (counts[normalizedKey] || 0) + 1;
}

function answerModeHint(item) {
    if (item.intended_use === "result_boundary") {
        return "explain_general_meaning_without_diagnosis";
    }
    if (item.intended_use === "preparation_guidance") {
        return "explain_preparation_and_advise_following_clinician_or_lab_instructions";
    }
    if (item.intended_use === "screening_context") {
        return "explain_screening_context_and_need_for_individualized_clinical_decision";
    }
    return "general_patient_education";
}

function validateApprovedInput(item, errors) {
    const id = item.item_id || "<missing item_id>";
    const required = [
        "item_id",
        "source_id",
        "topic",
        "domain",
        "title",
        "candidate_text",
        "url",
        "final_url",
        "provenance"
    ];

    for (const field of required) {
        if (item[field] === undefined || item[field] === null || item[field] === "") {
            errors.push(`${id}: approved item missing ${field}.`);
        }
    }

    if (item.review_status !== "approved_for_kb_build") {
        errors.push(`${id}: review_status is not approved_for_kb_build.`);
    }

    if (item.runtime_promoted !== false) {
        errors.push(`${id}: runtime_promoted must be false.`);
    }

    if (!normalizeContent(item.candidate_text)) {
        errors.push(`${id}: candidate_text is empty after trim.`);
    }
}

function buildKbItem(item, index) {
    return {
        kb_id: `kb_v1_4_4a_${String(index + 1).padStart(3, "0")}`,
        batch: BATCH,
        source_id: item.source_id,
        topic: item.topic,
        domain: item.domain,
        title: item.section_heading || item.title,
        content: normalizeContent(item.candidate_text),
        intended_use: item.intended_use,
        medical_scope: item.medical_scope || null,
        answer_mode_hint: answerModeHint(item),
        safety_boundary: item.safety_notes || null,
        source_title: item.title,
        source_url: item.url,
        final_url: item.final_url,
        provenance: {
            ...item.provenance,
            candidate_item_id: item.item_id,
            human_review: item.human_review || null,
            approved_kb_build: {
                script: "ai_lab/scripts/build_kb_v1_4_batch4a_approved_kb.js",
                built_at: new Date().toISOString(),
                input_path:
                    "ai_lab/kb_reviewed/kb_v1_4_batch4a_approved_items.jsonl",
                output_path:
                    "ai_lab/datasets/kb_v1_4_batch4a_approved_items.jsonl",
                runtime_promoted: false
            }
        },
        review_status: "approved_for_kb_build",
        runtime_promoted: false,
        version: VERSION
    };
}

function buildReport(items, kbItems) {
    const domainCounts = {};
    const topicCounts = {};
    const intendedUseCounts = {};
    const medicalScopeCounts = {};

    for (const item of kbItems) {
        increment(domainCounts, item.domain);
        increment(topicCounts, item.topic);
        increment(intendedUseCounts, item.intended_use);
        increment(medicalScopeCounts, item.medical_scope);
    }

    return {
        report_name: "kb_v1_4_batch4a_approved_report",
        generated_at: new Date().toISOString(),
        input_path: "ai_lab/kb_reviewed/kb_v1_4_batch4a_approved_items.jsonl",
        output_path: "ai_lab/datasets/kb_v1_4_batch4a_approved_items.jsonl",
        total_input_approved_items: items.length,
        total_output_kb_items: kbItems.length,
        version: VERSION,
        runtime_promoted: false,
        domain_counts: domainCounts,
        topic_counts: topicCounts,
        intended_use_counts: intendedUseCounts,
        medical_scope_counts: medicalScopeCounts
    };
}

function main() {
    const errors = [];
    const approvedItems = readJsonl(APPROVED_INPUT_PATH);
    approvedItems.forEach((item) => validateApprovedInput(item, errors));

    if (errors.length > 0) {
        console.error(JSON.stringify({ error_count: errors.length, errors }, null, 2));
        process.exitCode = 1;
        return;
    }

    const kbItems = approvedItems.map(buildKbItem);
    const report = buildReport(approvedItems, kbItems);

    fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
    fs.writeFileSync(
        OUTPUT_PATH,
        kbItems.map((item) => JSON.stringify(item)).join("\n") + "\n",
        "utf8"
    );
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + "\n", "utf8");

    console.log(
        JSON.stringify(
            {
                total_output_kb_items: kbItems.length,
                version: VERSION,
                runtime_promoted: false,
                domain_counts: report.domain_counts,
                intended_use_counts: report.intended_use_counts
            },
            null,
            2
        )
    );
}

try {
    main();
} catch (error) {
    console.error(error);
    process.exitCode = 1;
}
