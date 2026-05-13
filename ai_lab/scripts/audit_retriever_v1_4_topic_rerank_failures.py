#!/usr/bin/env python
from __future__ import annotations

import csv
import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
DETAILS_PATH = ROOT / "ai_lab" / "reports" / "retriever_v1_4_topic_rerank_eval_details.csv"
REPORT_PATH = ROOT / "ai_lab" / "reports" / "retriever_v1_4_topic_rerank_eval_report.json"
EVAL_PATH = ROOT / "ai_lab" / "datasets" / "eval" / "retriever_v1_4_batch4a_vi_eval_v2.jsonl"
OUT_REPORT_PATH = ROOT / "ai_lab" / "reports" / "retriever_v1_4_topic_rerank_failure_audit_report.json"
OUT_EXAMPLES_PATH = ROOT / "ai_lab" / "reports" / "retriever_v1_4_topic_rerank_failure_audit_examples.csv"

RESULT_BOUNDARY_TOPICS = {"result_interpretation", "test_result_explainer", "medical_result_explanation_boundary", "results"}
URGENT_TOPICS = {"red_flag_general", "red_flag_signs", "emergency_warning", "urgent_advice", "safety_boundary"}


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def bool_value(value: Any) -> bool:
    return str(value).lower() == "true"


def split(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item) for item in value]
    return [part for part in str(value or "").split(";") if part]


def classify(row: dict[str, str], eval_row: dict[str, Any]) -> str:
    top3 = set(split(row.get("top_5_topics"))[:3])
    expected = set(split(eval_row.get("acceptable_topics")) or [str(eval_row.get("expected_topic") or "")])
    domains_ok = bool(set(split(row.get("top_5_domains"))[:3]) & set(split(eval_row.get("acceptable_domains"))))
    category = str(row.get("category") or "")
    if eval_row.get("label_alignment") is None or not expected:
        return "eval_label_still_ambiguous"
    if top3 & RESULT_BOUNDARY_TOPICS and category not in {"booking_separation"}:
        return "result_boundary_overdominates"
    if domains_ok and not (top3 & expected):
        return "acceptable_broad_domain_but_wrong_topic"
    if top3 & URGENT_TOPICS and category != "urgent_override":
        return "topic_drift_to_related_lab"
    return "other"


def write_examples(rows: list[dict[str, Any]]) -> None:
    headers = [
        "id", "query", "category", "expected_topic", "top_1_kb_id", "top_1_topic",
        "top_1_domain", "top_1_score", "top_5_kb_ids", "top_5_topics", "top_5_domains",
        "failure_reason",
    ]
    with OUT_EXAMPLES_PATH.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers)
        writer.writeheader()
        for row in rows:
            writer.writerow({header: row.get(header, "") for header in headers})


def main() -> None:
    eval_rows = {str(row.get("id")): row for row in load_jsonl(EVAL_PATH)}
    details = read_csv(DETAILS_PATH)
    report = load_json(REPORT_PATH)
    failed = [row for row in details if not bool_value(row.get("hit_at_3"))]
    reason_counts: Counter[str] = Counter()
    category_counts: Counter[str] = Counter()
    confused: Counter[str] = Counter()
    enriched = []
    for row in failed:
        eval_row = eval_rows.get(str(row.get("id")), {})
        reason = classify(row, eval_row)
        reason_counts[reason] += 1
        category_counts[row.get("category") or "missing"] += 1
        confused[f"{eval_row.get('expected_topic') or row.get('expected_topic')} -> {row.get('top_1_topic')}"] += 1
        item = dict(row)
        item["failure_reason"] = reason
        enriched.append(item)

    examples = sorted(enriched, key=lambda row: (-reason_counts[row["failure_reason"]], row.get("id") or ""))[:10]
    write_examples(examples)
    summary = {
        "total_eval_rows": report.get("topic_rerank", {}).get("count", len(details)),
        "hit_at_1": report.get("topic_rerank", {}).get("hit_at_1"),
        "hit_at_3": report.get("topic_rerank", {}).get("hit_at_3"),
        "hit_at_5": report.get("topic_rerank", {}).get("hit_at_5"),
        "failed_at_3_count": len(failed),
        "reason_counts": dict(reason_counts),
        "top_failed_categories": dict(category_counts.most_common(10)),
        "top_confused_topic_pairs": dict(confused.most_common(15)),
        "result_boundary_overdominates_count": reason_counts.get("result_boundary_overdominates", 0),
        "acceptable_broad_domain_but_wrong_topic_count": reason_counts.get("acceptable_broad_domain_but_wrong_topic", 0),
    }
    output = {
        "report_name": "retriever_v1_4_topic_rerank_failure_audit_report",
        "summary": summary,
        "important_examples": examples,
        "examples_csv": "ai_lab/reports/retriever_v1_4_topic_rerank_failure_audit_examples.csv",
        "all_failed_at_3": enriched,
    }
    OUT_REPORT_PATH.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"error_count": 1, "errors": [str(exc)]}, ensure_ascii=False, indent=2))
        sys.exit(1)
