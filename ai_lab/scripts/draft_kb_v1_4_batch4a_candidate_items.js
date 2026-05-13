#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const BATCH = "kb_v1_4_batch4a";
const CLEANED_PATH = path.join(
    ROOT,
    "ai_lab/normalized/kb_v1_4_batch4a_cleaned.jsonl"
);
const CANDIDATE_PATH = path.join(
    ROOT,
    "ai_lab/kb_candidates/kb_v1_4_batch4a_candidate_items.jsonl"
);
const REPORT_PATH = path.join(
    ROOT,
    "ai_lab/kb_candidates/kb_v1_4_batch4a_candidate_report.json"
);

const TARGET_MIN_CHARS = 800;
const TARGET_MAX_CHARS = 2500;
const HARD_MIN_CHARS = 300;
const RELATED_LINK_NOISE_PATTERNS = [
    /\bClinicalTrials\.gov\b/i,
    /\bJournal Articles\b/i,
    /\bReferences and abstracts from MEDLINE\/PubMed\b/i,
    /\bArticle:\s+/i,
    /\bFind an Expert\b/i,
    /\bPatient Handouts\b/i,
    /\bVideos and Tutorials\b/i
];

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

function slugify(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 80);
}

function countWords(text) {
    return String(text || "").trim().split(/\s+/).filter(Boolean).length;
}

function isLikelyHeading(text, index) {
    const value = String(text || "").trim();
    if (!value || value.length > 120) {
        return false;
    }
    if (index === 0) {
        return true;
    }
    if (value.endsWith("?")) {
        return true;
    }
    if (/[.!:]$/.test(value)) {
        return false;
    }
    if (!/^[A-Z0-9]/.test(value)) {
        return false;
    }
    if (countWords(value) > 12) {
        return false;
    }
    return true;
}

function getParagraphsWithSpans(text) {
    const paragraphs = [];
    const pattern = /\S[\s\S]*?(?=\n{2,}\S|$)/g;
    let match;

    while ((match = pattern.exec(text)) !== null) {
        const raw = match[0];
        const trimmedStart = raw.search(/\S/);
        const trimmedEnd = raw.search(/\s*$/);
        const start = match.index + (trimmedStart >= 0 ? trimmedStart : 0);
        const end = match.index + (trimmedEnd >= 0 ? trimmedEnd : raw.length);
        const paragraphText = text.slice(start, end).trim();
        if (paragraphText) {
            paragraphs.push({ text: paragraphText, start, end });
        }
    }

    return paragraphs;
}

function buildSections(record) {
    const text = String(record.cleaned_text || "");
    const paragraphs = getParagraphsWithSpans(text);
    const sections = [];
    let current = null;

    paragraphs.forEach((paragraph, index) => {
        if (isLikelyHeading(paragraph.text, index)) {
            if (current) {
                sections.push(current);
            }
            current = {
                heading: paragraph.text,
                paragraphs: [paragraph]
            };
            return;
        }

        if (!current) {
            current = {
                heading: record.title || "Untitled section",
                paragraphs: [paragraph]
            };
            return;
        }

        current.paragraphs.push(paragraph);
    });

    if (current) {
        sections.push(current);
    }

    return sections.filter((section) => section.paragraphs.length > 0);
}

function sectionLength(section) {
    const first = section.paragraphs[0];
    const last = section.paragraphs[section.paragraphs.length - 1];
    return Math.max(0, last.end - first.start);
}

function mergeSmallSections(sections) {
    const merged = [];
    let buffer = null;

    for (const section of sections) {
        if (!buffer) {
            buffer = {
                heading: section.heading,
                paragraphs: [...section.paragraphs]
            };
        } else if (sectionLength(buffer) < TARGET_MIN_CHARS) {
            buffer.paragraphs.push(...section.paragraphs);
        } else {
            merged.push(buffer);
            buffer = {
                heading: section.heading,
                paragraphs: [...section.paragraphs]
            };
        }
    }

    if (buffer) {
        if (sectionLength(buffer) < HARD_MIN_CHARS && merged.length > 0) {
            merged[merged.length - 1].paragraphs.push(...buffer.paragraphs);
        } else {
            merged.push(buffer);
        }
    }

    return merged;
}

function splitLongSection(section) {
    const chunks = [];
    let buffer = [];

    function flush() {
        if (buffer.length > 0) {
            chunks.push({
                heading: section.heading,
                paragraphs: buffer
            });
            buffer = [];
        }
    }

    for (const paragraph of section.paragraphs) {
        const bufferLength =
            buffer.length > 0 ? paragraph.end - buffer[0].start : paragraph.text.length;
        if (buffer.length > 0 && bufferLength > TARGET_MAX_CHARS) {
            flush();
        }
        buffer.push(paragraph);
    }
    flush();

    return chunks;
}

function buildChunkCandidates(record) {
    const cleanedText = String(record.cleaned_text || "");
    const sections = mergeSmallSections(buildSections(record));
    const splitSections = sections.flatMap((section) =>
        sectionLength(section) > TARGET_MAX_CHARS ? splitLongSection(section) : [section]
    );

    return splitSections
        .map((section) => {
            const first = section.paragraphs[0];
            const last = section.paragraphs[section.paragraphs.length - 1];
            const candidateText = cleanedText.slice(first.start, last.end).trim();
            return {
                section_heading: section.heading,
                candidate_text: candidateText,
                source_text_span_start: first.start,
                source_text_span_end: last.end
            };
        })
        .filter((candidate) => candidate.candidate_text.length >= HARD_MIN_CHARS)
        .filter((candidate) => !isRelatedLinkNoiseCandidate(candidate));
}

function isRelatedLinkNoiseCandidate(candidate) {
    const text = `${candidate.section_heading}\n${candidate.candidate_text}`;
    const markerCount = RELATED_LINK_NOISE_PATTERNS.filter((pattern) =>
        pattern.test(text)
    ).length;
    return markerCount >= 2;
}

function classifyIntendedUse(record, text) {
    const topic = `${record.topic} ${record.title} ${text}`.toLowerCase();
    if (/understand|result|reference range|diagnos/.test(topic)) {
        return "result_boundary";
    }
    if (/prepare|fast|before your test|need to do/.test(topic)) {
        return "preparation_guidance";
    }
    if (/screen|risk|check for|diabetes|cholesterol|thyroid|kidney/.test(topic)) {
        return "screening_context";
    }
    if (/symptom|symptoms|why.*done|when.*need/.test(topic)) {
        return "symptom_to_test_context";
    }
    if (/blood test|laboratory|lab test|panel|count/.test(topic)) {
        return "general_lab_education";
    }
    return "test_explanation";
}

function medicalScope(record) {
    const topic = String(record.topic || "").toLowerCase();
    if (/cbc|blood_count|anemia|infection|crp|culture/.test(topic)) {
        return "CBC / anemia / infection";
    }
    if (/glucose|hba1c|diabetes/.test(topic)) {
        return "glucose / HbA1c / diabetes screening";
    }
    if (/lipid|cholesterol|triglyceride/.test(topic)) {
        return "lipid / cholesterol / triglycerides";
    }
    if (/liver|alt|ast|bilirubin/.test(topic)) {
        return "liver function";
    }
    if (/kidney|creatinine|egfr|gfr/.test(topic)) {
        return "kidney function / creatinine / eGFR";
    }
    if (/urinalysis|urine|albumin/.test(topic)) {
        return "urinalysis / urine albumin";
    }
    if (/thyroid|tsh|t4|t3/.test(topic)) {
        return "thyroid testing";
    }
    if (/result|boundary/.test(topic)) {
        return "medical result interpretation boundary";
    }
    return "general blood tests";
}

function safetyNotes(record, intendedUse) {
    const boundary = record.provenance?.registry?.safety_boundary;
    if (boundary) {
        return boundary;
    }
    if (intendedUse === "result_boundary") {
        return "Draft item for result interpretation support only; do not diagnose from lab results alone.";
    }
    return "Draft source-backed education item; requires human review before any runtime use.";
}

function makeCandidate(record, chunk, index) {
    const intendedUse = classifyIntendedUse(record, chunk.candidate_text);
    return {
        item_id: `${record.source_id}__cand_${String(index + 1).padStart(3, "0")}__${slugify(
            chunk.section_heading
        )}`,
        batch: BATCH,
        source_id: record.source_id,
        topic: record.topic,
        domain: record.domain,
        url: record.url,
        final_url: record.final_url,
        title: record.title,
        section_heading: chunk.section_heading,
        candidate_text: chunk.candidate_text,
        source_text_span_start: chunk.source_text_span_start,
        source_text_span_end: chunk.source_text_span_end,
        char_count: chunk.candidate_text.length,
        intended_use: intendedUse,
        medical_scope: medicalScope(record),
        safety_notes: safetyNotes(record, intendedUse),
        provenance: {
            source_id: record.source_id,
            batch: record.batch,
            topic: record.topic,
            domain: record.domain,
            url: record.url,
            final_url: record.final_url,
            title: record.title,
            source_sha256: record.source_sha256,
            source_text_span_start: chunk.source_text_span_start,
            source_text_span_end: chunk.source_text_span_end,
            normalized_cleaned_path:
                "ai_lab/normalized/kb_v1_4_batch4a_cleaned.jsonl",
            source_provenance: record.provenance,
            drafting: {
                script: "ai_lab/scripts/draft_kb_v1_4_batch4a_candidate_items.js",
                drafted_at: new Date().toISOString(),
                drafting_scope:
                    "Candidate chunks only; no runtime promotion, no embeddings, no package catalog changes."
            }
        },
        review_status: "candidate_needs_review",
        runtime_promoted: false
    };
}

function main() {
    const cleanedRows = readJsonl(CLEANED_PATH).filter(
        (record) => record.batch === BATCH
    );
    const candidates = [];
    const perSource = [];

    for (const record of cleanedRows) {
        const chunks = buildChunkCandidates(record);
        chunks.forEach((chunk, index) => {
            candidates.push(makeCandidate(record, chunk, index));
        });
        perSource.push({
            source_id: record.source_id,
            topic: record.topic,
            title: record.title,
            cleaned_char_count: record.cleaned_char_count,
            candidate_count: chunks.length
        });
    }

    const intendedUseCounts = {};
    const medicalScopeCounts = {};
    for (const candidate of candidates) {
        intendedUseCounts[candidate.intended_use] =
            (intendedUseCounts[candidate.intended_use] || 0) + 1;
        medicalScopeCounts[candidate.medical_scope] =
            (medicalScopeCounts[candidate.medical_scope] || 0) + 1;
    }

    const summary = {
        source_count: cleanedRows.length,
        candidate_count: candidates.length,
        sources_without_candidates: perSource
            .filter((row) => row.candidate_count === 0)
            .map((row) => row.source_id),
        long_candidate_count: candidates.filter((item) => item.char_count > 3500)
            .length,
        intended_use_counts: intendedUseCounts,
        medical_scope_counts: medicalScopeCounts
    };

    const report = {
        report_name: "kb_v1_4_batch4a_candidate_report",
        generated_at: new Date().toISOString(),
        input_path: "ai_lab/normalized/kb_v1_4_batch4a_cleaned.jsonl",
        output_path: "ai_lab/kb_candidates/kb_v1_4_batch4a_candidate_items.jsonl",
        summary,
        per_source: perSource,
        candidates: candidates.map((candidate) => ({
            item_id: candidate.item_id,
            source_id: candidate.source_id,
            topic: candidate.topic,
            section_heading: candidate.section_heading,
            char_count: candidate.char_count,
            intended_use: candidate.intended_use,
            medical_scope: candidate.medical_scope,
            source_text_span_start: candidate.source_text_span_start,
            source_text_span_end: candidate.source_text_span_end
        }))
    };

    fs.mkdirSync(path.dirname(CANDIDATE_PATH), { recursive: true });
    fs.writeFileSync(
        CANDIDATE_PATH,
        candidates.map((candidate) => JSON.stringify(candidate)).join("\n") + "\n",
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
