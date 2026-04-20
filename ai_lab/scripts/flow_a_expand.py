#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import html
import json
import os
import re
import sys
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


VERSION = "v1_2"
RETRIEVER_VERSION = "retriever_v1_2"
UTC_NOW = datetime.now(timezone.utc).replace(microsecond=0).isoformat()

BASELINE_SOURCE_IDS = {
    "blood_tests",
    "chest_pain",
    "shortness_of_breath",
    "cdc_dpdx_blood_collection",
    "cdc_specimen_packing_and_shipping",
    "nice_sepsis_overview",
    "nice_sepsis_guideline",
    "who_infectious_shipping_guidance",
}

NEW_SOURCE_DEFAULTS = {
    "medlineplus_blood_culture_test": {
        "source_name": "MedlinePlus",
        "section_target": ["test_explainers"],
        "priority": "medium",
        "review_required": False,
        "use_in_v1": False,
        "source_group": "patient_facing_secondary",
    },
    "medlineplus_blood_testing_overview": {
        "source_name": "MedlinePlus",
        "section_target": ["test_explainers", "pre_test_guides"],
        "priority": "medium",
        "review_required": True,
        "use_in_v1": False,
        "source_group": "duplicate_or_review_needed",
        "duplicate_of": "blood_tests",
        "exclude_reason": "General blood testing overview overlaps the existing NHS blood tests baseline and is held out to avoid duplicate ingestion.",
    },
    "medlineplus_bmp_test": {
        "source_name": "MedlinePlus",
        "section_target": ["test_explainers"],
        "priority": "medium",
        "review_required": False,
        "use_in_v1": False,
        "source_group": "patient_facing_secondary",
    },
    "medlineplus_cbc_test": {
        "source_name": "MedlinePlus",
        "section_target": ["test_explainers"],
        "priority": "high",
        "review_required": False,
        "use_in_v1": False,
        "source_group": "patient_facing_secondary",
    },
    "medlineplus_crp_test": {
        "source_name": "MedlinePlus",
        "section_target": ["test_explainers"],
        "priority": "high",
        "review_required": False,
        "use_in_v1": False,
        "source_group": "patient_facing_secondary",
    },
    "medlineplus_ddimer_test": {
        "source_name": "MedlinePlus",
        "section_target": ["test_explainers"],
        "priority": "high",
        "review_required": True,
        "use_in_v1": False,
        "source_group": "patient_facing_secondary",
    },
    "medlineplus_pulse_oximetry_test": {
        "source_name": "MedlinePlus",
        "section_target": ["test_explainers"],
        "priority": "medium",
        "review_required": False,
        "use_in_v1": False,
        "source_group": "patient_facing_secondary",
    },
    "medlineplus_troponin_test": {
        "source_name": "MedlinePlus",
        "section_target": ["test_explainers"],
        "priority": "high",
        "review_required": True,
        "use_in_v1": False,
        "source_group": "patient_facing_secondary",
    },
    "nhs_anaphylaxis": {
        "source_name": "NHS",
        "section_target": ["red_flags"],
        "priority": "high",
        "review_required": True,
        "use_in_v1": False,
        "source_group": "patient_facing_primary",
    },
    "nhs_blood_tests": {
        "source_name": "NHS",
        "section_target": ["test_explainers", "pre_test_guides"],
        "priority": "high",
        "review_required": True,
        "use_in_v1": False,
        "source_group": "duplicate_or_review_needed",
        "duplicate_of": "blood_tests",
        "exclude_reason": "Exact NHS blood tests duplicate of the already-registered baseline source.",
    },
    "nhs_fainting_adults": {
        "source_name": "NHS",
        "section_target": ["red_flags"],
        "priority": "high",
        "review_required": True,
        "use_in_v1": False,
        "source_group": "patient_facing_primary",
    },
    "nhs_headaches": {
        "source_name": "NHS",
        "section_target": ["red_flags"],
        "priority": "medium",
        "review_required": True,
        "use_in_v1": False,
        "source_group": "patient_facing_primary",
    },
    "nhs_stomach_ache": {
        "source_name": "NHS",
        "section_target": ["red_flags"],
        "priority": "medium",
        "review_required": True,
        "use_in_v1": False,
        "source_group": "patient_facing_primary",
    },
    "nhs_stroke_symptoms": {
        "source_name": "NHS",
        "section_target": ["red_flags"],
        "priority": "high",
        "review_required": True,
        "use_in_v1": False,
        "source_group": "patient_facing_primary",
    },
}

EXCLUDED_FROM_PATIENT_KB = {
    "nhs_blood_tests",
    "medlineplus_blood_testing_overview",
}

HOLDOUT_SOURCE_IDS = {
    "nhs_blood_tests",
    "medlineplus_blood_testing_overview",
}

TOPIC_BY_SOURCE = {
    "medlineplus_blood_culture_test": "blood_culture",
    "medlineplus_blood_testing_overview": "blood_testing_overview",
    "medlineplus_bmp_test": "basic_metabolic_panel",
    "medlineplus_cbc_test": "complete_blood_count",
    "medlineplus_crp_test": "c_reactive_protein",
    "medlineplus_ddimer_test": "d_dimer",
    "medlineplus_pulse_oximetry_test": "pulse_oximetry",
    "medlineplus_troponin_test": "troponin",
    "nhs_anaphylaxis": "anaphylaxis",
    "nhs_blood_tests": "blood_tests",
    "nhs_fainting_adults": "fainting",
    "nhs_headaches": "headaches",
    "nhs_stomach_ache": "stomach_ache",
    "nhs_stroke_symptoms": "stroke",
}


@dataclass
class Paths:
    repo_root: Path
    ai_lab_root: Path
    raw_dir: Path
    extracted_dir: Path
    normalized_dir: Path
    reports_dir: Path
    review_dir: Path
    datasets_dir: Path
    eval_dir: Path
    artifacts_dir: Path
    raw_manifest_path: Path
    extract_manifest_path: Path
    normalized_docs_path: Path
    versioned_docs_path: Path
    audit_note_path: Path
    extraction_qc_path: Path
    candidate_csv_path: Path
    review_report_path: Path
    review_report_md_path: Path
    curated_blocks_path: Path
    medical_kb_baseline_path: Path
    medical_kb_versioned_path: Path
    kb_diff_report_path: Path
    chunk_stats_path: Path
    eval_set_baseline_path: Path
    eval_set_versioned_path: Path
    retrieval_eval_path: Path
    retrieval_eval_summary_path: Path
    grounded_sim_path: Path
    grounded_sim_summary_path: Path
    final_report_path: Path
    retriever_version_dir: Path


def find_ai_lab_root(start: Path) -> Path:
    current = start.resolve()
    for candidate in [current] + list(current.parents):
        if candidate.name == "ai_lab":
            return candidate
        maybe = candidate / "ai_lab"
        if maybe.exists() and maybe.is_dir():
            return maybe
    raise RuntimeError("Could not find ai_lab root from current workspace.")


def build_paths() -> Paths:
    ai_lab_root = find_ai_lab_root(Path.cwd())
    repo_root = ai_lab_root.parent
    raw_dir = ai_lab_root / "raw"
    extracted_dir = ai_lab_root / "extracted"
    normalized_dir = ai_lab_root / "normalized"
    reports_dir = ai_lab_root / "reports"
    review_dir = ai_lab_root / "review"
    datasets_dir = ai_lab_root / "datasets"
    eval_dir = datasets_dir / "eval"
    artifacts_dir = ai_lab_root / "artifacts"
    retriever_version_dir = artifacts_dir / RETRIEVER_VERSION
    for directory in [
        extracted_dir,
        normalized_dir,
        reports_dir,
        review_dir,
        datasets_dir,
        eval_dir,
        retriever_version_dir,
    ]:
        directory.mkdir(parents=True, exist_ok=True)
    return Paths(
        repo_root=repo_root,
        ai_lab_root=ai_lab_root,
        raw_dir=raw_dir,
        extracted_dir=extracted_dir,
        normalized_dir=normalized_dir,
        reports_dir=reports_dir,
        review_dir=review_dir,
        datasets_dir=datasets_dir,
        eval_dir=eval_dir,
        artifacts_dir=artifacts_dir,
        raw_manifest_path=raw_dir / "raw_manifest.jsonl",
        extract_manifest_path=extracted_dir / "extract_manifest.jsonl",
        normalized_docs_path=normalized_dir / "docs.jsonl",
        versioned_docs_path=normalized_dir / f"docs_{VERSION}.jsonl",
        audit_note_path=reports_dir / f"flow_a_audit_{VERSION}.md",
        extraction_qc_path=reports_dir / f"extraction_qc_{VERSION}.csv",
        candidate_csv_path=reports_dir / f"kb_candidate_blocks_{VERSION}.csv",
        review_report_path=reports_dir / f"kb_review_report_{VERSION}.csv",
        review_report_md_path=reports_dir / f"kb_review_report_{VERSION}.md",
        curated_blocks_path=review_dir / f"approved_chunk_{VERSION}.jsonl",
        medical_kb_baseline_path=datasets_dir / "medical_kb_v1.json",
        medical_kb_versioned_path=datasets_dir / f"medical_kb_{VERSION}.json",
        kb_diff_report_path=reports_dir / f"kb_diff_{VERSION}.md",
        chunk_stats_path=reports_dir / f"kb_chunk_stats_{VERSION}.csv",
        eval_set_baseline_path=eval_dir / "health_rag_eval_v1_1.json",
        eval_set_versioned_path=eval_dir / f"health_rag_eval_{VERSION}.json",
        retrieval_eval_path=reports_dir / f"retrieval_eval_{VERSION}.csv",
        retrieval_eval_summary_path=reports_dir / f"retrieval_eval_summary_{VERSION}.md",
        grounded_sim_path=reports_dir / f"final_answer_simulation_{VERSION}.csv",
        grounded_sim_summary_path=reports_dir / f"final_answer_simulation_{VERSION}.md",
        final_report_path=reports_dir / f"flow_a_final_report_{VERSION}.md",
        retriever_version_dir=retriever_version_dir,
    )


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def write_csv(path: Path, rows: list[dict[str, Any]], fieldnames: list[str]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def slugify(value: str) -> str:
    value = value.lower().strip()
    value = re.sub(r"[^a-z0-9]+", "_", value)
    return value.strip("_")


def clean_text(text: str) -> str:
    if not text:
        return ""
    text = html.unescape(text)
    text = text.replace("\u00a0", " ")
    text = text.replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def strip_tags(html_text: str) -> str:
    html_text = re.sub(r"(?is)<(script|style|noscript|svg|header|footer|nav|form|aside).*?>.*?</\\1>", " ", html_text)
    html_text = re.sub(r"(?is)<br\\s*/?>", "\n", html_text)
    html_text = re.sub(r"(?is)</(p|div|section|article|main|h1|h2|h3|h4|h5|h6|li|tr|table|ul|ol)>", "\n", html_text)
    html_text = re.sub(r"(?is)<[^>]+>", " ", html_text)
    return clean_text(html_text)


def get_html_value(pattern: str, text: str) -> str:
    match = re.search(pattern, text, re.IGNORECASE | re.DOTALL)
    if not match:
        return ""
    return clean_text(match.group(1))


def extract_html_article(html_text: str) -> str:
    patterns = [
        r"<article[^>]*>(.*?)</article>",
        r"<main[^>]*>(.*?)</main>",
        r"<body[^>]*>(.*?)</body>",
    ]
    for pattern in patterns:
        match = re.search(pattern, html_text, re.IGNORECASE | re.DOTALL)
        if match:
            return match.group(1)
    return html_text


def extract_html_metadata(html_path: Path) -> dict[str, str]:
    text = html_path.read_text(encoding="utf-8", errors="ignore")
    title = get_html_value(r"<title[^>]*>(.*?)</title>", text)
    canonical = get_html_value(r"<link[^>]+rel=[\"'](?:[^\"']*\\s)?canonical(?:\\s[^\"']*)?[\"'][^>]+href=[\"']([^\"']+)[\"']", text)
    og_url = get_html_value(r"<meta[^>]+(?:property|name)=[\"']og:url[\"'][^>]+content=[\"']([^\"']+)[\"']", text)
    description = get_html_value(r"<meta[^>]+name=[\"']description[\"'][^>]+content=[\"']([^\"']+)[\"']", text)
    og_title = get_html_value(r"<meta[^>]+property=[\"']og:title[\"'][^>]+content=[\"']([^\"']+)[\"']", text)
    return {
        "title": title,
        "canonical": canonical,
        "og_url": og_url,
        "description": description,
        "og_title": og_title,
    }


def extract_html_text(html_path: Path) -> dict[str, str]:
    text = html_path.read_text(encoding="utf-8", errors="ignore")
    metadata = extract_html_metadata(html_path)
    article_html = extract_html_article(text)
    content = strip_tags(article_html)
    return {
        "title": metadata["title"],
        "content": content,
    }


def infer_source_name(source_id: str, metadata: dict[str, str]) -> str:
    if source_id in NEW_SOURCE_DEFAULTS:
        return NEW_SOURCE_DEFAULTS[source_id]["source_name"]
    canonical = metadata.get("canonical") or metadata.get("og_url") or ""
    if "nhs.uk" in canonical:
        return "NHS"
    if "medlineplus.gov" in canonical:
        return "MedlinePlus"
    if "nice.org.uk" in canonical:
        return "NICE"
    if "cdc.gov" in canonical:
        return "CDC"
    if "who.int" in canonical:
        return "WHO"
    return "TODO_SOURCE_NAME"


def infer_source_url(metadata: dict[str, str]) -> str:
    return metadata.get("canonical") or metadata.get("og_url") or ""


def infer_title(source_id: str, metadata: dict[str, str]) -> str:
    return metadata.get("og_title") or metadata.get("title") or source_id


def infer_doc_type(folder: Path) -> str:
    if (folder / "source.html").exists():
        return "html"
    if (folder / "source.pdf").exists():
        return "pdf"
    return "unknown"


def infer_language(_metadata: dict[str, str]) -> str:
    return "en"


def infer_section(section_target: list[str]) -> str:
    return section_target[0] if section_target else "general"


def infer_risk_level(section_target: list[str]) -> str:
    if "red_flags" in section_target:
        return "high"
    if "test_explainers" in section_target or "pre_test_guides" in section_target:
        return "medium"
    return "low"


def char_len(path: Path) -> int:
    if not path.exists():
        return 0
    return len(path.read_text(encoding="utf-8", errors="ignore"))


def line_len(text: str) -> int:
    return 0 if not text else len(text.splitlines())


def find_between(text: str, start_markers: list[str], end_markers: list[str] | None = None) -> str:
    lower = text.lower()
    starts = [(lower.find(marker.lower()), marker) for marker in start_markers]
    starts = [item for item in starts if item[0] >= 0]
    if not starts:
        return ""
    start_index, marker = min(starts, key=lambda item: item[0])
    start = start_index
    end = len(text)
    if end_markers:
        for end_marker in end_markers:
            idx = lower.find(end_marker.lower(), start_index + len(marker))
            if idx >= 0:
                end = min(end, idx)
    return clean_text(text[start:end])


def first_paragraph(text: str) -> str:
    parts = [part.strip() for part in text.split("\n\n") if part.strip()]
    return parts[0] if parts else clean_text(text)


def join_sentences(*parts: str) -> str:
    cleaned = [clean_text(part) for part in parts if clean_text(part)]
    return " ".join(cleaned)


def build_candidate_rows(normalized_docs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for doc in normalized_docs:
        blocks = [block.strip() for block in re.split(r"\n\s*\n", doc["content"]) if block.strip()]
        block_index = 0
        for block in blocks:
            if len(block) < 100:
                continue
            block_index += 1
            rows.append(
                {
                    "candidate_id": f"{doc['source_id']}_cand_{block_index:03d}",
                    "doc_id": doc["doc_id"],
                    "source_id": doc["source_id"],
                    "source_name": doc["source_name"],
                    "source_url": doc["source_url"],
                    "section": doc["section"],
                    "risk_level": doc["risk_level"],
                    "patient_facing_suitability": doc["patient_facing_suitability"],
                    "block_index": block_index,
                    "char_count": len(block),
                    "raw_block": block,
                }
            )
    return rows


def make_kb_item(
    next_id: int,
    source_id: str,
    normalized_doc: dict[str, Any],
    title: str,
    content: str,
    excerpt: str,
    tags: list[str],
    keywords: list[str],
    faq_type: str,
    safety_notes: str,
    test_types: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "id": f"kb_{VERSION}_{next_id:03d}",
        "doc_id": normalized_doc["doc_id"],
        "source_id": source_id,
        "source_name": normalized_doc["source_name"],
        "source_url": normalized_doc["source_url"],
        "section": normalized_doc["section"],
        "title": title,
        "content": content,
        "source_excerpt": excerpt[:1200],
        "language": "vi",
        "locale": "vi-VN",
        "risk_level": normalized_doc["risk_level"],
        "tags": tags,
        "keywords": keywords,
        "test_types": test_types or [],
        "faq_type": faq_type,
        "safety_notes": safety_notes,
        "review_status": "approved",
        "use_in_v1": False,
    }


def curate_source(source_id: str, normalized_doc: dict[str, Any], next_id: int) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    content = normalized_doc["content"]
    excerpt_default = first_paragraph(content)
    approved: list[dict[str, Any]] = []
    decisions: list[dict[str, Any]] = []

    def approve(
        title: str,
        body: str,
        excerpt: str,
        tags: list[str],
        keywords: list[str],
        faq_type: str,
        safety_notes: str,
        test_types: list[str] | None = None,
    ) -> None:
        nonlocal next_id
        approved.append(
            make_kb_item(
                next_id=next_id,
                source_id=source_id,
                normalized_doc=normalized_doc,
                title=title,
                content=body,
                excerpt=excerpt,
                tags=tags,
                keywords=keywords,
                faq_type=faq_type,
                safety_notes=safety_notes,
                test_types=test_types,
            )
        )
        next_id += 1

    if source_id in HOLDOUT_SOURCE_IDS:
        decisions.append(
            {
                "source_id": source_id,
                "decision": "holdout",
                "title": normalized_doc["title"],
                "reason": NEW_SOURCE_DEFAULTS[source_id].get("exclude_reason", "Held out conservatively."),
                "topic": normalized_doc["topic"],
            }
        )
        return approved, decisions

    if source_id == "nhs_anaphylaxis":
        emergency = find_between(content, ["Immediate action required:", "Call 999 if:"], ["Symptoms of anaphylaxis", "Using an adrenaline auto-injector"])
        injector = find_between(content, ["Using an adrenaline auto-injector", "If you have an adrenaline auto-injector"], ["After using an adrenaline auto-injector", "Causes of anaphylaxis"])
        approve(
            title="Phản vệ là tình huống cấp cứu cần gọi cấp cứu ngay",
            body="Nếu có dấu hiệu phản vệ như khó thở, sưng môi hoặc lưỡi, thở rít, chóng mặt nặng hoặc ngất sau dị ứng, cần gọi cấp cứu ngay. Đây là tình huống có thể diễn tiến rất nhanh và không nên tự theo dõi tại nhà.",
            excerpt=emergency or excerpt_default,
            tags=["anaphylaxis", "red_flags", "allergy"],
            keywords=["phản vệ", "khó thở", "sưng môi", "dị ứng nặng"],
            faq_type="emergency_warning",
            safety_notes="Nếu đã được kê bút tiêm adrenaline, hãy dùng theo hướng dẫn khẩn cấp và vẫn gọi cấp cứu.",
        )
        approve(
            title="Nếu đã có bút tiêm adrenaline, cần dùng đúng lúc và vẫn đi cấp cứu",
            body="Người từng được kê bút tiêm adrenaline cần biết cách sử dụng khi có dấu hiệu phản vệ. Sau khi dùng thuốc khẩn cấp, vẫn phải gọi cấp cứu hoặc đến cơ sở y tế ngay để được theo dõi tiếp.",
            excerpt=injector or excerpt_default,
            tags=["anaphylaxis", "adrenaline", "red_flags"],
            keywords=["adrenaline auto-injector", "bút tiêm adrenaline", "phản vệ"],
            faq_type="red_flag_general",
            safety_notes="Không xem việc triệu chứng giảm tạm thời là đã an toàn hoàn toàn.",
        )
    elif source_id == "nhs_fainting_adults":
        emergency = find_between(content, ["Immediate action required:", "Call 999 if:"], ["See a GP if", "Urgent advice"])
        gp = find_between(content, ["See a GP if", "Non-urgent advice:"], ["Causes of fainting", "Find out more"])
        approve(
            title="Ngất kèm đau ngực, khó thở hoặc chấn thương cần cấp cứu",
            body="Ngất có thể là dấu hiệu nguy hiểm nếu xảy ra cùng đau ngực, khó thở, tim đập bất thường, chấn thương đầu hoặc khó hồi tỉnh. Khi có các dấu hiệu này, cần gọi cấp cứu hoặc đi cấp cứu ngay.",
            excerpt=emergency or excerpt_default,
            tags=["fainting", "syncope", "red_flags"],
            keywords=["ngất", "đau ngực", "khó thở", "chấn thương đầu"],
            faq_type="emergency_warning",
            safety_notes="Không tự lái xe nếu vừa ngất hoặc còn chóng mặt.",
        )
        approve(
            title="Ngất tái diễn hoặc chưa rõ nguyên nhân nên được đánh giá y tế",
            body="Nếu bị ngất lặp lại, ngất khi gắng sức hoặc vẫn còn lo lắng sau cơn ngất, nên đi khám để tìm nguyên nhân. Ngay cả khi đã tỉnh lại, vẫn cần đánh giá nếu cơn ngất không giống các lần trước hoặc kèm triệu chứng mới.",
            excerpt=gp or excerpt_default,
            tags=["fainting", "evaluation"],
            keywords=["ngất tái diễn", "đi khám", "đánh giá nguyên nhân"],
            faq_type="urgent_advice",
            safety_notes="Không nên tự kết luận chỉ là tụt huyết áp thông thường khi còn triệu chứng kéo dài.",
        )
    elif source_id == "nhs_headaches":
        emergency = find_between(content, ["Immediate action required:", "Call 999 or go to A&E"], ["Urgent advice", "See a GP"])
        urgent = find_between(content, ["Urgent advice:", "Ask for an urgent GP appointment"], ["See a GP", "Common causes"])
        approve(
            title="Đau đầu dữ dội đột ngột hoặc kèm thần kinh khu trú cần cấp cứu",
            body="Cần đi cấp cứu ngay nếu đau đầu xuất hiện đột ngột và dữ dội, hoặc đi kèm yếu liệt, nói khó, lú lẫn, co giật, sốt cao kèm cổ cứng, hay sau chấn thương đầu. Đây là các dấu hiệu không nên tự điều trị tại nhà.",
            excerpt=emergency or excerpt_default,
            tags=["headache", "red_flags", "neurology"],
            keywords=["đau đầu dữ dội", "nói khó", "yếu liệt", "cổ cứng"],
            faq_type="emergency_warning",
            safety_notes="Không chậm trễ thăm khám nếu đau đầu khác thường rõ rệt so với trước đây.",
        )
        approve(
            title="Đau đầu kéo dài, tái diễn hoặc kèm nôn ói cần được khám sớm",
            body="Nên được đánh giá sớm nếu đau đầu kéo dài, ngày càng nặng, tái diễn thường xuyên, hoặc kèm nôn ói, thay đổi thị lực hay triệu chứng toàn thân. Việc này giúp loại trừ nguyên nhân nghiêm trọng và điều chỉnh chăm sóc phù hợp.",
            excerpt=urgent or excerpt_default,
            tags=["headache", "urgent_advice"],
            keywords=["đau đầu kéo dài", "đau đầu tái diễn", "thị lực"],
            faq_type="urgent_advice",
            safety_notes="Không lạm dụng thuốc giảm đau kéo dài mà không trao đổi với nhân viên y tế.",
        )
    elif source_id == "nhs_stomach_ache":
        emergency = find_between(content, ["Immediate action required:", "Call 999 or go to A&E"], ["Urgent advice", "See a GP"])
        urgent = find_between(content, ["Urgent advice:", "Ask for an urgent GP appointment"], ["See a GP", "Common causes"])
        approve(
            title="Đau bụng dữ dội hoặc kèm nôn ra máu, phân đen cần cấp cứu",
            body="Đau bụng dữ dội, bụng cứng, đau tăng nhanh, ngất, nôn ra máu, đi ngoài phân đen hoặc kèm đau ngực cần được cấp cứu ngay. Những dấu hiệu này có thể gợi ý tình trạng nặng và không nên tự theo dõi tại nhà.",
            excerpt=emergency or excerpt_default,
            tags=["stomach_ache", "abdominal_pain", "red_flags"],
            keywords=["đau bụng dữ dội", "nôn ra máu", "phân đen", "cấp cứu"],
            faq_type="emergency_warning",
            safety_notes="Không tự dùng thuốc giảm đau mạnh để trì hoãn đi cấp cứu khi có dấu hiệu cảnh báo.",
        )
        approve(
            title="Đau bụng kéo dài, tái diễn hoặc kèm sốt nên đi khám sớm",
            body="Nếu đau bụng kéo dài nhiều giờ, tái diễn, ngày càng nặng hoặc đi kèm sốt, nôn ói, tiêu chảy kéo dài hay sụt cân, nên được khám sớm. Đây là cách an toàn hơn là tự chẩn đoán nguyên nhân tại nhà.",
            excerpt=urgent or excerpt_default,
            tags=["stomach_ache", "urgent_advice"],
            keywords=["đau bụng kéo dài", "sốt", "nôn ói", "đi khám"],
            faq_type="urgent_advice",
            safety_notes="Nếu đau chuyển nhanh sang dữ dội hoặc có dấu hiệu mất nước, cần đi cấp cứu.",
        )
    elif source_id == "nhs_stroke_symptoms":
        fast = find_between(content, ["The main symptoms of stroke can be remembered with the word FAST", "FAST"], ["Transient ischaemic attack", "Causes of stroke"])
        tia = find_between(content, ["Transient ischaemic attack (TIA)", "mini-stroke"], ["Other symptoms", "When to get medical help"])
        approve(
            title="Dấu hiệu FAST của đột quỵ cần gọi cấp cứu ngay",
            body="Khi có méo miệng, yếu tay chân hoặc nói khó, cần nghĩ đến đột quỵ và gọi cấp cứu ngay. Thời gian can thiệp rất quan trọng, nên không chờ xem triệu chứng có tự hết hay không.",
            excerpt=fast or excerpt_default,
            tags=["stroke", "fast", "red_flags"],
            keywords=["đột quỵ", "FAST", "méo miệng", "nói khó"],
            faq_type="emergency_warning",
            safety_notes="Không tự đưa người bệnh đi xa nếu cấp cứu có thể tới nhanh hơn.",
        )
        approve(
            title="Cơn thiếu máu não thoáng qua vẫn cần xử trí khẩn",
            body="Nếu các dấu hiệu giống đột quỵ xuất hiện rồi tự hết nhanh, tình huống đó vẫn cần được đánh giá khẩn cấp vì có thể là cơn thiếu máu não thoáng qua. Đây là dấu hiệu cảnh báo nguy cơ đột quỵ thực sự trong thời gian gần.",
            excerpt=tia or excerpt_default,
            tags=["stroke", "tia", "red_flags"],
            keywords=["TIA", "mini-stroke", "triệu chứng tự hết"],
            faq_type="red_flag_general",
            safety_notes="Không xem việc triệu chứng biến mất là an toàn hoàn toàn.",
        )
    elif source_id == "medlineplus_blood_culture_test":
        approve(
            title="Cấy máu giúp tìm vi khuẩn hoặc nấm trong máu",
            body="Xét nghiệm cấy máu được dùng để kiểm tra xem trong máu có vi khuẩn hay nấm hay không. Xét nghiệm này thường được chỉ định khi bác sĩ nghi ngờ nhiễm trùng trong máu hoặc nhiễm trùng nặng cần xác định tác nhân.",
            excerpt=excerpt_default,
            tags=["blood_culture", "test_explainers", "infection"],
            keywords=["cấy máu", "vi khuẩn trong máu", "nhiễm trùng"],
            faq_type="test_meaning",
            safety_notes="Kết quả cần được bác sĩ diễn giải cùng triệu chứng và các xét nghiệm khác.",
            test_types=["blood_culture"],
        )
    elif source_id == "medlineplus_bmp_test":
        approve(
            title="BMP là xét nghiệm đánh giá các chất cơ bản trong máu",
            body="Basic Metabolic Panel (BMP) là nhóm xét nghiệm đo một số chất quan trọng trong máu như điện giải, đường huyết và chỉ số liên quan đến thận. Xét nghiệm này giúp đánh giá sức khỏe tổng quát và theo dõi nhiều tình trạng bệnh lý thường gặp.",
            excerpt=excerpt_default,
            tags=["bmp", "test_explainers"],
            keywords=["BMP", "điện giải", "đường huyết", "chức năng thận"],
            faq_type="test_meaning",
            safety_notes="Một số chỉ số trong BMP có thể bị ảnh hưởng bởi thuốc hoặc mất nước.",
            test_types=["bmp"],
        )
    elif source_id == "medlineplus_cbc_test":
        approve(
            title="CBC là công thức máu toàn bộ để kiểm tra tế bào máu",
            body="Complete Blood Count (CBC) là xét nghiệm đo số lượng và đặc điểm của hồng cầu, bạch cầu và tiểu cầu. Xét nghiệm này thường được dùng để sàng lọc sức khỏe, hỗ trợ tìm nguyên nhân thiếu máu, nhiễm trùng hoặc rối loạn tế bào máu.",
            excerpt=excerpt_default,
            tags=["cbc", "test_explainers"],
            keywords=["CBC", "công thức máu", "hồng cầu", "bạch cầu", "tiểu cầu"],
            faq_type="test_meaning",
            safety_notes="CBC không tự đưa ra chẩn đoán cuối cùng nếu thiếu bối cảnh lâm sàng.",
            test_types=["cbc"],
        )
    elif source_id == "medlineplus_crp_test":
        approve(
            title="CRP là xét nghiệm gợi ý mức độ viêm trong cơ thể",
            body="Xét nghiệm CRP đo nồng độ protein phản ứng C trong máu để hỗ trợ đánh giá tình trạng viêm. CRP có thể tăng do nhiễm trùng, chấn thương hoặc một số bệnh mạn tính nên kết quả cần được diễn giải cùng các dấu hiệu khác.",
            excerpt=excerpt_default,
            tags=["crp", "test_explainers", "inflammation"],
            keywords=["CRP", "viêm", "protein phản ứng C"],
            faq_type="test_meaning",
            safety_notes="CRP tăng không tự xác định được nguyên nhân cụ thể của viêm.",
            test_types=["crp"],
        )
    elif source_id == "medlineplus_ddimer_test":
        approve(
            title="D-dimer là xét nghiệm hỗ trợ đánh giá nguy cơ cục máu đông",
            body="Xét nghiệm D-dimer đo một mảnh protein được tạo ra khi cục máu đông tan ra. Xét nghiệm này thường được dùng để hỗ trợ loại trừ hoặc đánh giá thêm khả năng có rối loạn đông máu như huyết khối tĩnh mạch sâu hoặc thuyên tắc phổi.",
            excerpt=excerpt_default,
            tags=["d_dimer", "test_explainers", "blood_clot"],
            keywords=["D-dimer", "cục máu đông", "huyết khối", "thuyên tắc phổi"],
            faq_type="test_meaning",
            safety_notes="D-dimer tăng không có nghĩa chắc chắn đang có cục máu đông và vẫn cần bác sĩ đánh giá tiếp.",
            test_types=["d_dimer"],
        )
    elif source_id == "medlineplus_pulse_oximetry_test":
        approve(
            title="Đo SpO2 giúp ước tính mức oxy trong máu một cách nhanh chóng",
            body="Pulse oximetry là cách đo nhanh độ bão hòa oxy trong máu bằng cảm biến kẹp ở ngón tay hoặc vị trí phù hợp. Đây là xét nghiệm không đau, thường dùng để phát hiện sớm tình trạng thiếu oxy và theo dõi đáp ứng điều trị hô hấp.",
            excerpt=excerpt_default,
            tags=["pulse_oximetry", "test_explainers", "oxygen"],
            keywords=["SpO2", "pulse oximetry", "oxy máu"],
            faq_type="test_meaning",
            safety_notes="Kết quả có thể bị ảnh hưởng bởi tuần hoàn kém, sơn móng tay hoặc chuyển động.",
            test_types=["pulse_oximetry"],
        )
    elif source_id == "medlineplus_troponin_test":
        approve(
            title="Troponin là xét nghiệm quan trọng khi nghi tổn thương cơ tim",
            body="Xét nghiệm troponin đo nồng độ troponin trong máu để hỗ trợ phát hiện tổn thương cơ tim. Chỉ số này thường được dùng trong đánh giá đau ngực và nghi ngờ nhồi máu cơ tim, nhưng vẫn cần kết hợp với triệu chứng và điện tim.",
            excerpt=excerpt_default,
            tags=["troponin", "test_explainers", "cardiac"],
            keywords=["troponin", "đau ngực", "tổn thương cơ tim", "nhồi máu cơ tim"],
            faq_type="test_meaning",
            safety_notes="Không nên tự giải thích kết quả troponin khi có đau ngực hoặc khó thở đang diễn ra.",
            test_types=["troponin"],
        )

    if not approved and source_id not in HOLDOUT_SOURCE_IDS:
        decisions.append(
            {
                "source_id": source_id,
                "decision": "reject",
                "title": normalized_doc["title"],
                "reason": "No conservative curation template defined for this source yet.",
                "topic": normalized_doc["topic"],
            }
        )
    else:
        for item in approved:
            decisions.append(
                {
                    "source_id": source_id,
                    "decision": "approved",
                    "title": item["title"],
                    "reason": "Approved via conservative source-specific curation template.",
                    "topic": normalized_doc["topic"],
                }
            )

    return approved, decisions


def build_chunk_text(item: dict[str, Any]) -> str:
    parts = [
        f"Tiêu đề: {clean_text(item['title'])}",
        f"Mục: {item['section']}",
        f"Mức độ rủi ro: {item['risk_level']}",
    ]
    if item.get("keywords"):
        parts.append(f"Từ khóa: {', '.join(item['keywords'])}")
    if item.get("tags"):
        parts.append(f"Nhãn: {', '.join(item['tags'])}")
    if item.get("test_types"):
        parts.append(f"Loại xét nghiệm: {', '.join(item['test_types'])}")
    if item.get("faq_type"):
        parts.append(f"Loại FAQ: {item['faq_type']}")
    if item.get("safety_notes"):
        parts.append(f"Lưu ý an toàn: {clean_text(item['safety_notes'])}")
    parts.append(f"Nội dung: {clean_text(item['content'])}")
    return "\n".join(parts)


def tokenize(text: str) -> list[str]:
    return re.findall(r"[a-z0-9_]+", text.lower())


def build_vocab(texts: list[str]) -> list[str]:
    counter: Counter[str] = Counter()
    for text in texts:
        counter.update(tokenize(text))
    return sorted(counter)


def vectorize(text: str, vocab_index: dict[str, int]) -> list[float]:
    vector = [0.0] * len(vocab_index)
    tokens = tokenize(text)
    total = len(tokens) or 1
    counts = Counter(tokens)
    for token, count in counts.items():
        idx = vocab_index.get(token)
        if idx is not None:
            vector[idx] = count / total
    norm = sum(value * value for value in vector) ** 0.5
    if norm:
        vector = [value / norm for value in vector]
    return vector


def dot(vec_a: list[float], vec_b: list[float]) -> float:
    return sum(a * b for a, b in zip(vec_a, vec_b))


def load_baseline_eval(paths: Paths) -> list[dict[str, Any]]:
    return read_json(paths.eval_set_baseline_path)


def collect_new_eval_items(new_items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_source: dict[str, list[dict[str, Any]]] = {}
    for item in new_items:
        by_source.setdefault(item["source_id"], []).append(item)

    rows: list[dict[str, Any]] = []
    for source_id, items in sorted(by_source.items()):
        for item in items:
            rows.append(
                {
                    "query": item["title"].lower(),
                    "expected_chunk_ids": [f"{item['id']}_c1"],
                    "expected_source_id": source_id,
                    "expected_section": item["section"],
                    "acceptable_source_ids": [source_id],
                    "acceptable_sections": [item["section"]],
                }
            )
        if source_id == "nhs_stroke_symptoms":
            chunk_id = f"{items[0]['id']}_c1"
            rows.append(
                {
                    "query": "dấu hiệu fast của đột quỵ là gì",
                    "expected_chunk_ids": [chunk_id],
                    "expected_source_id": source_id,
                    "expected_section": "red_flags",
                    "acceptable_source_ids": [source_id],
                    "acceptable_sections": ["red_flags"],
                }
            )
        if source_id == "nhs_anaphylaxis":
            chunk_id = f"{items[0]['id']}_c1"
            rows.append(
                {
                    "query": "phản vệ có cần gọi cấp cứu ngay không",
                    "expected_chunk_ids": [chunk_id],
                    "expected_source_id": source_id,
                    "expected_section": "red_flags",
                    "acceptable_source_ids": [source_id],
                    "acceptable_sections": ["red_flags"],
                }
            )
    return rows


def classify_primary_mode(top1: dict[str, Any] | None, results: list[dict[str, Any]]) -> tuple[str, str]:
    if not top1:
        return "fallback", "none"
    if top1["section"] in {"test_explainers", "pre_test_guides"}:
        return "informational_test", "none"
    if top1["section"] == "red_flags":
        overlap = "mixed" if len({item["source_id"] for item in results[:3] if item["section"] == "red_flags"}) >= 2 else "single"
        urgency = "emergency" if top1.get("faq_type") == "emergency_warning" or overlap == "mixed" else "urgent"
        return "safety_response", urgency
    return "fallback", "none"


def ensure_relative(path: Path, root: Path) -> str:
    return str(path.relative_to(root)).replace(os.sep, "/")


def run_flow() -> dict[str, Any]:
    paths = build_paths()
    raw_folders = sorted([path for path in paths.raw_dir.iterdir() if path.is_dir()])
    raw_manifest = read_jsonl(paths.raw_manifest_path)
    manifest_by_source = {row["source_id"]: row for row in raw_manifest}
    baseline_source_ids = sorted(manifest_by_source)

    detected_sources: list[dict[str, Any]] = []
    missing_from_manifest: list[dict[str, Any]] = []
    duplicate_notes: list[str] = []

    for folder in raw_folders:
        doc_type = infer_doc_type(folder)
        if doc_type == "unknown":
            continue
        local_path = folder / f"source.{doc_type}"
        metadata = extract_html_metadata(local_path) if doc_type == "html" else {}
        source_id = folder.name
        source_url = infer_source_url(metadata)
        defaults = NEW_SOURCE_DEFAULTS.get(source_id, {})
        record = {
            "source_id": source_id,
            "source_name": infer_source_name(source_id, metadata),
            "source_url": source_url or "TODO_SOURCE_URL",
            "local_path": ensure_relative(local_path, paths.repo_root),
            "doc_type": doc_type,
            "language": infer_language(metadata),
            "section_target": defaults.get("section_target", ["general"]),
            "priority": defaults.get("priority", "medium"),
            "review_required": defaults.get("review_required", True),
            "use_in_v1": defaults.get("use_in_v1", False),
            "status": "ok",
            "source_group": defaults.get("source_group", "review_needed"),
            "title": infer_title(source_id, metadata),
            "duplicate_of": defaults.get("duplicate_of", ""),
            "notes": defaults.get("exclude_reason", ""),
        }
        detected_sources.append(record)
        if record["duplicate_of"]:
            duplicate_notes.append(f"{source_id} -> duplicate candidate of {record['duplicate_of']}")
        if source_id not in manifest_by_source:
            missing_from_manifest.append(record)

    updated_raw_manifest = raw_manifest + missing_from_manifest
    write_jsonl(paths.raw_manifest_path, updated_raw_manifest)

    baseline_extract_manifest = read_jsonl(paths.extract_manifest_path)
    baseline_extract_by_source = {row["source_id"]: row for row in baseline_extract_manifest}
    extraction_rows: list[dict[str, Any]] = list(baseline_extract_manifest)
    extraction_qc_rows: list[dict[str, Any]] = []
    normalized_rows: list[dict[str, Any]] = []

    for row in missing_from_manifest:
        source_id = row["source_id"]
        input_path = paths.repo_root / row["local_path"]
        status = "ok"
        title = row["title"]
        content = ""
        noise_flags: list[str] = []
        proceed_to_normalize = False
        output_path = paths.extracted_dir / f"{source_id}.txt"
        if row["doc_type"] != "html":
            status = "unsupported_doc_type"
            noise_flags.append("non_html_new_source_not_processed")
        else:
            extracted = extract_html_text(input_path)
            title = extracted["title"] or title
            content = extracted["content"]
            if len(content) < 500:
                noise_flags.append("very_short_extract")
            if "cookie" in content.lower():
                noise_flags.append("cookie_text_detected")
            if row["source_group"] == "duplicate_or_review_needed":
                noise_flags.append("duplicate_holdout")
            output_path.write_text(content + "\n", encoding="utf-8")
            proceed_to_normalize = len(content) >= 500

        extraction_entry = {
            "source_id": source_id,
            "input_file": str(input_path),
            "output_file": str(output_path) if output_path.exists() else None,
            "status": status,
            "char_count": len(content),
        }
        extraction_rows.append(extraction_entry)
        baseline_extract_by_source[source_id] = extraction_entry
        extraction_qc_rows.append(
            {
                "source_id": source_id,
                "extract_status": status,
                "output_path": ensure_relative(output_path, paths.repo_root) if output_path.exists() else "",
                "char_count": len(content),
                "line_count": line_len(content),
                "noise_flags": ";".join(noise_flags),
                "proceed_to_normalize": "yes" if proceed_to_normalize else "no",
            }
        )
        if proceed_to_normalize:
            normalized_rows.append(
                {
                    "doc_id": f"{source_id}_doc_001",
                    "source_id": source_id,
                    "source_name": row["source_name"],
                    "source_url": row["source_url"],
                    "local_path": row["local_path"],
                    "doc_type": row["doc_type"],
                    "language": row["language"],
                    "section": infer_section(row["section_target"]),
                    "section_target": row["section_target"],
                    "title": title,
                    "content": content,
                    "priority": row["priority"],
                    "review_required": row["review_required"],
                    "use_in_v1": row["use_in_v1"],
                    "risk_level": infer_risk_level(row["section_target"]),
                    "review_status": "pending",
                    "topic": TOPIC_BY_SOURCE.get(source_id, source_id),
                    "domain": "medical",
                    "patient_facing_suitability": "holdout" if source_id in HOLDOUT_SOURCE_IDS else "patient_facing",
                    "urgency_relevance": "high" if infer_risk_level(row["section_target"]) == "high" else "moderate",
                    "source_group": row["source_group"],
                    "duplicate_of": row.get("duplicate_of", ""),
                }
            )

    write_jsonl(paths.extract_manifest_path, extraction_rows)
    write_jsonl(paths.versioned_docs_path, normalized_rows)
    write_csv(
        paths.extraction_qc_path,
        extraction_qc_rows,
        [
            "source_id",
            "extract_status",
            "output_path",
            "char_count",
            "line_count",
            "noise_flags",
            "proceed_to_normalize",
        ],
    )

    candidate_rows = build_candidate_rows(normalized_rows)
    write_csv(
        paths.candidate_csv_path,
        candidate_rows,
        [
            "candidate_id",
            "doc_id",
            "source_id",
            "source_name",
            "source_url",
            "section",
            "risk_level",
            "patient_facing_suitability",
            "block_index",
            "char_count",
            "raw_block",
        ],
    )

    baseline_kb = read_json(paths.medical_kb_baseline_path)
    next_id = len(baseline_kb) + 1
    new_kb_items: list[dict[str, Any]] = []
    review_rows: list[dict[str, Any]] = []
    curated_block_rows: list[dict[str, Any]] = []

    for normalized_doc in normalized_rows:
        approved_items, decisions = curate_source(normalized_doc["source_id"], normalized_doc, next_id)
        if approved_items:
            next_id += len(approved_items)
            new_kb_items.extend(approved_items)
            for item in approved_items:
                curated_block_rows.append(item)
        review_rows.extend(decisions)

    write_jsonl(paths.curated_blocks_path, curated_block_rows)
    write_csv(paths.review_report_path, review_rows, ["source_id", "decision", "title", "reason", "topic"])

    review_summary = Counter(row["decision"] for row in review_rows)
    paths.review_report_md_path.write_text(
        "\n".join(
            [
                f"# KB Review Report {VERSION}",
                "",
                f"- Approved blocks: {review_summary.get('approved', 0)}",
                f"- Rejected blocks: {review_summary.get('reject', 0)}",
                f"- Holdout blocks: {review_summary.get('holdout', 0)}",
                f"- Duplicate blocks: {review_summary.get('duplicate', 0)}",
                "",
                "## Notes",
                *[f"- {row['source_id']}: {row['decision']} - {row['reason']}" for row in review_rows],
                "",
            ]
        ),
        encoding="utf-8",
    )

    versioned_kb = baseline_kb + new_kb_items
    write_json(paths.medical_kb_versioned_path, versioned_kb)

    baseline_counts = Counter(item["source_id"] for item in baseline_kb)
    new_counts = Counter(item["source_id"] for item in new_kb_items)
    paths.kb_diff_report_path.write_text(
        "\n".join(
            [
                f"# KB Diff {VERSION}",
                "",
                f"- Baseline items: {len(baseline_kb)}",
                f"- New approved items: {len(new_kb_items)}",
                f"- Expanded KB items: {len(versioned_kb)}",
                "",
                "## Added By Source",
                *[f"- {source_id}: +{count}" for source_id, count in sorted(new_counts.items())],
                "",
                "## Baseline Source Counts",
                *[f"- {source_id}: {count}" for source_id, count in sorted(baseline_counts.items())],
                "",
            ]
        ),
        encoding="utf-8",
    )

    kb_chunks: list[dict[str, Any]] = []
    chunk_metadata: list[dict[str, Any]] = []
    chunk_stats: list[dict[str, Any]] = []
    for item in versioned_kb:
        chunk = {
            "chunk_id": f"{item['id']}_c1",
            "kb_id": item["id"],
            "doc_id": item["doc_id"],
            "source_id": item["source_id"],
            "source_name": item["source_name"],
            "source_url": item["source_url"],
            "section": item["section"],
            "title": item["title"],
            "content": item["content"],
            "chunk_text": build_chunk_text(item),
            "risk_level": item["risk_level"],
            "tags": item.get("tags", []),
            "keywords": item.get("keywords", []),
            "test_types": item.get("test_types", []),
            "faq_type": item.get("faq_type", ""),
            "safety_notes": item.get("safety_notes", ""),
            "review_status": item.get("review_status", "pending"),
            "use_in_v1": bool(item.get("use_in_v1", False)),
            "language": item.get("language", "vi"),
            "locale": item.get("locale", "vi-VN"),
        }
        kb_chunks.append(chunk)
        chunk_metadata.append(
            {
                "chunk_id": chunk["chunk_id"],
                "kb_id": chunk["kb_id"],
                "source_id": chunk["source_id"],
                "source_name": chunk["source_name"],
                "section": chunk["section"],
                "title": chunk["title"],
                "risk_level": chunk["risk_level"],
                "faq_type": chunk["faq_type"],
                "use_in_v1": chunk["use_in_v1"],
            }
        )
        chunk_stats.append(
            {
                "chunk_id": chunk["chunk_id"],
                "source_id": chunk["source_id"],
                "section": chunk["section"],
                "risk_level": chunk["risk_level"],
                "title_len": len(chunk["title"]),
                "content_len": len(chunk["content"]),
                "chunk_text_len": len(chunk["chunk_text"]),
                "keyword_count": len(chunk["keywords"]),
                "tag_count": len(chunk["tags"]),
            }
        )

    write_json(paths.retriever_version_dir / f"kb_chunks_{VERSION}.json", kb_chunks)
    write_json(paths.retriever_version_dir / "chunk_metadata.json", chunk_metadata)
    write_csv(
        paths.chunk_stats_path,
        chunk_stats,
        [
            "chunk_id",
            "source_id",
            "section",
            "risk_level",
            "title_len",
            "content_len",
            "chunk_text_len",
            "keyword_count",
            "tag_count",
        ],
    )

    vocab = build_vocab([chunk["chunk_text"] for chunk in kb_chunks])
    vocab_index = {token: idx for idx, token in enumerate(vocab)}
    chunk_vectors = [vectorize(chunk["chunk_text"], vocab_index) for chunk in kb_chunks]
    embeddings_payload = [
        {"chunk_id": chunk["chunk_id"], "vector": vector}
        for chunk, vector in zip(kb_chunks, chunk_vectors)
    ]
    write_json(paths.retriever_version_dir / "chunk_embeddings.json", embeddings_payload)
    write_json(
        paths.retriever_version_dir / "embedding_config.json",
        {
            "model_name": "lexical_tfidf_fallback",
            "embedding_dimension": len(vocab),
            "normalized": True,
            "index_type": "python_dot_product",
            "text_field": "chunk_text",
            "passage_prefix": "",
            "query_prefix": "",
            "notes": "Dependency-light fallback used because the notebook FAISS / sentence-transformers stack is unavailable in this environment.",
        },
    )
    write_json(
        paths.retriever_version_dir / "faiss.index",
        {
            "index_type": "python_dot_product",
            "chunk_count": len(kb_chunks),
            "version": VERSION,
        },
    )
    write_json(
        paths.retriever_version_dir / "retriever_manifest.json",
        {
            "retriever_version": VERSION,
            "kb_file": f"kb_chunks_{VERSION}.json",
            "metadata_file": "chunk_metadata.json",
            "embeddings_file": "chunk_embeddings.json",
            "faiss_index_file": "faiss.index",
            "embedding_config_file": "embedding_config.json",
            "chunk_count": len(kb_chunks),
            "model_name": "lexical_tfidf_fallback",
            "top_k_default": 3,
            "build_mode": "fallback_no_external_dependencies",
        },
    )

    baseline_eval = load_baseline_eval(paths)
    new_eval_items = collect_new_eval_items(new_kb_items)
    combined_eval = baseline_eval + new_eval_items
    write_json(paths.eval_set_versioned_path, combined_eval)

    def search(query: str, top_k: int = 3) -> list[dict[str, Any]]:
        q_vector = vectorize(query, vocab_index)
        scored = []
        for chunk, vector in zip(kb_chunks, chunk_vectors):
            scored.append((dot(q_vector, vector), chunk))
        scored.sort(key=lambda item: item[0], reverse=True)
        rows = []
        for rank, (score, chunk) in enumerate(scored[:top_k], start=1):
            rows.append(
                {
                    "rank": rank,
                    "score": round(float(score), 6),
                    "chunk_id": chunk["chunk_id"],
                    "source_id": chunk["source_id"],
                    "section": chunk["section"],
                    "title": chunk["title"],
                    "faq_type": chunk.get("faq_type", ""),
                    "content": chunk["content"],
                }
            )
        return rows

    eval_rows: list[dict[str, Any]] = []
    new_eval_row_count = 0
    for sample in combined_eval:
        results = search(sample["query"], top_k=3)
        top1 = results[0] if results else None
        top3_chunk_ids = [row["chunk_id"] for row in results]
        expected_chunk_ids = set(sample["expected_chunk_ids"])
        acceptable_sources = set(sample.get("acceptable_source_ids", [sample["expected_source_id"]]))
        acceptable_sections = set(sample.get("acceptable_sections", [sample["expected_section"]]))
        hit_at_1 = int(bool(top1 and top1["chunk_id"] in expected_chunk_ids))
        hit_at_3 = int(any(chunk_id in expected_chunk_ids for chunk_id in top3_chunk_ids))
        source_at_1 = int(bool(top1 and top1["source_id"] in acceptable_sources))
        section_at_1 = int(bool(top1 and top1["section"] in acceptable_sections))
        is_new_topic = any(chunk_id.startswith(f"kb_{VERSION}_") for chunk_id in expected_chunk_ids)
        if is_new_topic:
            new_eval_row_count += 1
        eval_rows.append(
            {
                "query": sample["query"],
                "expected_chunk_ids": ",".join(sample["expected_chunk_ids"]),
                "expected_source_id": sample["expected_source_id"],
                "expected_section": sample["expected_section"],
                "top1_chunk_id": top1["chunk_id"] if top1 else "",
                "top1_source_id": top1["source_id"] if top1 else "",
                "top1_section": top1["section"] if top1 else "",
                "top1_score": top1["score"] if top1 else "",
                "top3_chunk_ids": ",".join(top3_chunk_ids),
                "hit_at_1": hit_at_1,
                "hit_at_3": hit_at_3,
                "source_at_1": source_at_1,
                "section_at_1": section_at_1,
                "topic_group": "new" if is_new_topic else "baseline",
            }
        )

    write_csv(
        paths.retrieval_eval_path,
        eval_rows,
        [
            "query",
            "expected_chunk_ids",
            "expected_source_id",
            "expected_section",
            "top1_chunk_id",
            "top1_source_id",
            "top1_section",
            "top1_score",
            "top3_chunk_ids",
            "hit_at_1",
            "hit_at_3",
            "source_at_1",
            "section_at_1",
            "topic_group",
        ],
    )
    baseline_eval_rows = [row for row in eval_rows if row["topic_group"] == "baseline"]
    new_eval_rows = [row for row in eval_rows if row["topic_group"] == "new"]

    def mean(rows: list[dict[str, Any]], key: str) -> float:
        return round(sum(float(row[key]) for row in rows) / len(rows), 4) if rows else 0.0

    retrieval_summary_lines = [
        f"# Retrieval Eval Summary {VERSION}",
        "",
        f"- Total eval rows: {len(eval_rows)}",
        f"- Baseline carry-over rows: {len(baseline_eval_rows)}",
        f"- New topic rows: {len(new_eval_rows)}",
        f"- Recall@1 overall: {mean(eval_rows, 'hit_at_1')}",
        f"- Recall@3 overall: {mean(eval_rows, 'hit_at_3')}",
        f"- Recall@1 baseline subset: {mean(baseline_eval_rows, 'hit_at_1')}",
        f"- Recall@3 baseline subset: {mean(baseline_eval_rows, 'hit_at_3')}",
        f"- Recall@1 new subset: {mean(new_eval_rows, 'hit_at_1')}",
        f"- Recall@3 new subset: {mean(new_eval_rows, 'hit_at_3')}",
        "",
        "## Notes",
        "- This run uses a lexical fallback retriever because the notebook embedding stack is unavailable in the current environment.",
        "- Metrics are comparable inside this fallback run, but not equivalent to the frozen sentence-transformers + FAISS baseline.",
        "",
    ]
    paths.retrieval_eval_summary_path.write_text("\n".join(retrieval_summary_lines), encoding="utf-8")

    sim_queries = [
        {"query": "xét nghiệm troponin dùng để làm gì", "expected_mode": "informational_test"},
        {"query": "cbc là xét nghiệm gì", "expected_mode": "informational_test"},
        {"query": "crp có ý nghĩa gì", "expected_mode": "informational_test"},
        {"query": "phản vệ có cần gọi cấp cứu ngay không", "expected_mode": "mixed_emergency"},
        {"query": "dấu hiệu fast của đột quỵ là gì", "expected_mode": "mixed_emergency"},
        {"query": "đau đầu dữ dội đột ngột có nguy hiểm không", "expected_mode": "emergency_or_urgent"},
        {"query": "đau bụng dữ dội kèm phân đen thì sao", "expected_mode": "mixed_emergency"},
        {"query": "ngất kèm đau ngực có cần cấp cứu không", "expected_mode": "mixed_emergency"},
    ]
    grounded_rows: list[dict[str, Any]] = []
    for sample in sim_queries:
        results = search(sample["query"], top_k=3)
        top1 = results[0] if results else None
        primary_mode, urgency_level = classify_primary_mode(top1, results)
        overlap_flag = "mixed" if len({item["source_id"] for item in results[:3] if item["section"] == "red_flags"}) >= 2 else "single"
        if primary_mode == "informational_test" and top1:
            answer = top1["content"]
            predicted_mode = "informational_test"
        elif primary_mode == "safety_response" and urgency_level == "emergency":
            answer = "Các dấu hiệu phù hợp với tình huống khẩn cấp. Bạn nên gọi cấp cứu hoặc đến cơ sở y tế khẩn cấp ngay thay vì tự theo dõi tại nhà."
            predicted_mode = "mixed_emergency" if overlap_flag == "mixed" else "emergency_or_urgent"
        elif primary_mode == "safety_response":
            answer = "Bạn nên được đánh giá y tế sớm và không nên tự chẩn đoán tại nhà."
            predicted_mode = "emergency_or_urgent"
        else:
            answer = "Mình chưa đủ chắc chắn để trả lời trong giới hạn dữ liệu hiện có."
            predicted_mode = "fallback"
        grounded_rows.append(
            {
                "query": sample["query"],
                "expected_mode": sample["expected_mode"],
                "predicted_mode_legacy": predicted_mode,
                "mode_match": int(predicted_mode == sample["expected_mode"]),
                "primary_mode": primary_mode,
                "urgency_level": urgency_level,
                "overlap_flag": overlap_flag,
                "top1_source": top1["source_id"] if top1 else "",
                "top1_title": top1["title"] if top1 else "",
                "top3_sources": " | ".join(row["source_id"] for row in results),
                "answer": answer,
            }
        )
    write_csv(
        paths.grounded_sim_path,
        grounded_rows,
        [
            "query",
            "expected_mode",
            "predicted_mode_legacy",
            "mode_match",
            "primary_mode",
            "urgency_level",
            "overlap_flag",
            "top1_source",
            "top1_title",
            "top3_sources",
            "answer",
        ],
    )
    paths.grounded_sim_summary_path.write_text(
        "\n".join(
            [
                f"# Grounded Simulation Summary {VERSION}",
                "",
                f"- Total queries: {len(grounded_rows)}",
                f"- Mode accuracy: {mean(grounded_rows, 'mode_match')}",
                "- Uses the same section-driven answer shape as the baseline notebooks, with conservative emergency wording for red-flag retrievals.",
                "",
            ]
        ),
        encoding="utf-8",
    )

    audit_lines = [
        f"# Flow A Audit {VERSION}",
        "",
        f"- Audit time (UTC): {UTC_NOW}",
        f"- AI root: `{ensure_relative(paths.ai_lab_root, paths.repo_root)}`",
        "- Baseline files detected:",
        "  - ai_lab/raw/raw_manifest.jsonl",
        "  - ai_lab/extracted/extract_manifest.jsonl",
        "  - ai_lab/normalized/docs.jsonl",
        "  - ai_lab/datasets/medical_kb_v1.json",
        "  - ai_lab/artifacts/retriever_v1/retriever_manifest.json",
        "  - ai_lab/datasets/eval/health_rag_eval_v1_1.json",
        "  - ai_lab/reports/final_answer_simulation_v2.csv",
        "",
        f"- Baseline manifest count before expansion: {len(raw_manifest)}",
        f"- New raw source folders detected: {len(missing_from_manifest)}",
        "",
        "## Already In raw_manifest.jsonl",
        *[f"- {source_id}" for source_id in baseline_source_ids],
        "",
        "## Newly Added To raw_manifest.jsonl",
        *[
            f"- {row['source_id']} | group={row['source_group']} | url={row['source_url']}"
            for row in missing_from_manifest
        ],
        "",
        "## Duplicate Candidates",
        *([f"- {note}" for note in duplicate_notes] if duplicate_notes else ["- none"]),
        "",
    ]
    paths.audit_note_path.write_text("\n".join(audit_lines), encoding="utf-8")

    final_lines = [
        f"# Flow A Final Report {VERSION}",
        "",
        "## Changed Files",
        "- ai_lab/raw/raw_manifest.jsonl",
        "- ai_lab/extracted/extract_manifest.jsonl",
        "",
        "## Created Files",
        f"- {ensure_relative(paths.audit_note_path, paths.repo_root)}",
        f"- {ensure_relative(paths.extraction_qc_path, paths.repo_root)}",
        f"- {ensure_relative(paths.versioned_docs_path, paths.repo_root)}",
        f"- {ensure_relative(paths.candidate_csv_path, paths.repo_root)}",
        f"- {ensure_relative(paths.review_report_path, paths.repo_root)}",
        f"- {ensure_relative(paths.review_report_md_path, paths.repo_root)}",
        f"- {ensure_relative(paths.curated_blocks_path, paths.repo_root)}",
        f"- {ensure_relative(paths.medical_kb_versioned_path, paths.repo_root)}",
        f"- {ensure_relative(paths.kb_diff_report_path, paths.repo_root)}",
        f"- {ensure_relative(paths.chunk_stats_path, paths.repo_root)}",
        f"- {ensure_relative(paths.eval_set_versioned_path, paths.repo_root)}",
        f"- {ensure_relative(paths.retrieval_eval_path, paths.repo_root)}",
        f"- {ensure_relative(paths.retrieval_eval_summary_path, paths.repo_root)}",
        f"- {ensure_relative(paths.grounded_sim_path, paths.repo_root)}",
        f"- {ensure_relative(paths.grounded_sim_summary_path, paths.repo_root)}",
        f"- {ensure_relative(paths.retriever_version_dir / f'kb_chunks_{VERSION}.json', paths.repo_root)}",
        f"- {ensure_relative(paths.retriever_version_dir / 'chunk_metadata.json', paths.repo_root)}",
        f"- {ensure_relative(paths.retriever_version_dir / 'chunk_embeddings.json', paths.repo_root)}",
        f"- {ensure_relative(paths.retriever_version_dir / 'embedding_config.json', paths.repo_root)}",
        f"- {ensure_relative(paths.retriever_version_dir / 'faiss.index', paths.repo_root)}",
        f"- {ensure_relative(paths.retriever_version_dir / 'retriever_manifest.json', paths.repo_root)}",
        "",
        "## Ingested Sources",
        *[f"- {source_id}: {count} approved KB item(s)" for source_id, count in sorted(new_counts.items())],
        "",
        "## Excluded Or Held Out",
        *[
            f"- {row['source_id']}: {row['reason']}"
            for row in review_rows
            if row["decision"] in {"holdout", "reject"}
        ],
        "",
        "## Sanity Check",
        f"- Expanded KB items: {len(versioned_kb)}",
        f"- New approved KB items: {len(new_kb_items)}",
        f"- Retriever chunk count: {len(kb_chunks)}",
        f"- Retrieval eval rows: {len(eval_rows)}",
        f"- Grounded simulation rows: {len(grounded_rows)}",
        "",
        "## Manual Review Needed",
        "- Promote the versioned retriever only after rebuilding with the true sentence-transformers + FAISS stack in an environment that has the notebook dependencies installed.",
        "- Re-check source wording for high-risk emergency content before runtime promotion.",
        "- Decide whether MedlinePlus blood testing overview should stay held out or be merged later as a secondary anchor source.",
        "",
    ]
    paths.final_report_path.write_text("\n".join(final_lines), encoding="utf-8")

    return {
        "paths": paths,
        "missing_from_manifest": missing_from_manifest,
        "new_kb_items": new_kb_items,
        "review_rows": review_rows,
        "versioned_kb_count": len(versioned_kb),
        "eval_rows": eval_rows,
        "grounded_rows": grounded_rows,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Run HomeLab Flow A KB expansion in a versioned, conservative way.")
    parser.parse_args()
    result = run_flow()
    print(json.dumps(
        {
            "version": VERSION,
            "new_manifest_entries": len(result["missing_from_manifest"]),
            "new_kb_items": len(result["new_kb_items"]),
            "versioned_kb_count": result["versioned_kb_count"],
            "eval_rows": len(result["eval_rows"]),
            "grounded_rows": len(result["grounded_rows"]),
        },
        ensure_ascii=False,
        indent=2,
    ))
    return 0


if __name__ == "__main__":
    sys.exit(main())
