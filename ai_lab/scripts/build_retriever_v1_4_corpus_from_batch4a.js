#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const INPUT_PATH = path.join(
    ROOT,
    "ai_lab/datasets/kb_v1_4_batch4a_approved_items.jsonl"
);
const OUTPUT_DIR = path.join(ROOT, "ai_lab/artifacts/retriever_v1_4");
const CORPUS_PATH = path.join(OUTPUT_DIR, "kb_v1_4_corpus.jsonl");
const MANIFEST_PATH = path.join(OUTPUT_DIR, "kb_v1_4_corpus_manifest.json");
const VERSION = "v1.4-batch4a";

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

function increment(counts, value) {
    const key = String(value || "unknown");
    counts[key] = (counts[key] || 0) + 1;
}

function toCorpusRecord(item) {
    return {
        kb_id: item.kb_id,
        source_id: item.source_id,
        title: item.title,
        content: item.content,
        domain: item.domain,
        source_url: item.source_url,
        final_url: item.final_url,
        topic: item.topic,
        intended_use: item.intended_use,
        medical_scope: item.medical_scope,
        version: item.version,
        provenance: item.provenance,
        runtime_promoted: false
    };
}

function main() {
    const approvedItems = readJsonl(INPUT_PATH);
    const eligibleItems = approvedItems.filter(
        (item) =>
            item.review_status === "approved_for_kb_build" &&
            item.runtime_promoted === false
    );
    const corpus = eligibleItems.map(toCorpusRecord);
    const domainCounts = {};
    const topicCounts = {};
    const intendedUseCounts = {};
    const medicalScopeCounts = {};

    for (const item of corpus) {
        increment(domainCounts, item.domain);
        increment(topicCounts, item.topic);
        increment(intendedUseCounts, item.intended_use);
        increment(medicalScopeCounts, item.medical_scope);
    }

    const manifest = {
        manifest_name: "kb_v1_4_corpus_manifest",
        generated_at: new Date().toISOString(),
        mode: "offline_controlled_only",
        source_dataset: "ai_lab/datasets/kb_v1_4_batch4a_approved_items.jsonl",
        corpus_path: "ai_lab/artifacts/retriever_v1_4/kb_v1_4_corpus.jsonl",
        version: VERSION,
        total_input_items: approvedItems.length,
        total_corpus_items: corpus.length,
        eligibility_filter: {
            review_status: "approved_for_kb_build",
            runtime_promoted: false
        },
        runtime_promoted: false,
        embeddings_built: false,
        faiss_built: false,
        runtime_default_changed: false,
        domain_counts: domainCounts,
        topic_counts: topicCounts,
        intended_use_counts: intendedUseCounts,
        medical_scope_counts: medicalScopeCounts
    };

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(
        CORPUS_PATH,
        corpus.map((item) => JSON.stringify(item)).join("\n") + "\n",
        "utf8"
    );
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n", "utf8");

    console.log(
        JSON.stringify(
            {
                total_input_items: approvedItems.length,
                total_corpus_items: corpus.length,
                runtime_promoted: false,
                embeddings_built: false,
                faiss_built: false,
                domain_counts: domainCounts
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
