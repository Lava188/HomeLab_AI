#!/usr/bin/env python
from __future__ import annotations

import csv
import json
import argparse
import sys
from collections import Counter
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_EVAL_PATH = ROOT / "ai_lab" / "datasets" / "eval" / "retriever_v1_4_batch4a_vi_eval_v2.jsonl"

RESULT_BOUNDARY_TOPICS = {"result_interpretation", "test_result_explainer", "medical_result_explanation_boundary", "results"}


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Audit expanded-topic rerank failures.")
    parser.add_argument("--eval", default=str(DEFAULT_EVAL_PATH), help="Eval JSONL path.")
    parser.add_argument("--suffix", default="", help="Optional report suffix, e.g. heldout_v3.")
    return parser.parse_args()


def resolve_path(value: str) -> Path:
    path = Path(value)
    return path if path.is_absolute() else ROOT / path


def report_paths(suffix: str) -> tuple[Path, Path, Path, Path]:
    clean = str(suffix or "").strip().strip("_")
    suffix_part = f"_{clean}" if clean else ""
    reports = ROOT / "ai_lab" / "reports"
    return (
        reports / f"retriever_v1_4_expanded_topic_rerank_eval_details{suffix_part}.csv",
        reports / f"retriever_v1_4_expanded_topic_rerank_eval_report{suffix_part}.json",
        reports / f"retriever_v1_4_expanded_topic_rerank_failure_audit_report{suffix_part}.json",
        reports / f"retriever_v1_4_expanded_topic_rerank_failure_audit_examples{suffix_part}.csv",
    )


def truth(value: Any) -> bool:
    return str(value).lower() == "true"


def split(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item) for item in value]
    return [part for part in str(value or "").split(";") if part]


def classify(row: dict[str, str], eval_row: dict[str, Any]) -> str:
    top3 = set(split(row.get("top_5_topics"))[:3])
    expected = set(split(eval_row.get("acceptable_topics")) or [str(eval_row.get("expected_topic") or "")])
    if not expected:
        return "eval_label_still_ambiguous"
    if not truth(row.get("hit_at_20")):
        if row.get("detected_profiles"):
            return "alias_gap_remaining"
        return "topic_missing_from_candidates"
    if top3 & RESULT_BOUNDARY_TOPICS:
        return "result_boundary_overdominates"
    if not (top3 & expected):
        return "acceptable_broad_domain_but_wrong_topic"
    return "other"


def write_examples(rows: list[dict[str, Any]], out_examples_path: Path) -> None:
    headers = [
        "id", "category", "query", "expected_topic", "acceptable_topics", "detected_profiles",
        "top_1_kb_id", "top_1_topic", "top_1_domain", "top_5_topics", "top_20_topics",
        "failure_reason",
    ]
    with out_examples_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers)
        writer.writeheader()
        for row in rows:
            writer.writerow({header: row.get(header, "") for header in headers})


def main() -> None:
    args = parse_args()
    eval_path = resolve_path(args.eval)
    details_path, report_path, out_report_path, out_examples_path = report_paths(args.suffix)
    details = read_csv(details_path)
    report = load_json(report_path)
    eval_by_id = {str(row.get("id")): row for row in load_jsonl(eval_path)}
    failed = [row for row in details if not truth(row.get("hit_at_3"))]
    reason_counts: Counter[str] = Counter()
    category_counts: Counter[str] = Counter()
    confused: Counter[str] = Counter()
    enriched = []
    for row in failed:
        eval_row = eval_by_id.get(str(row.get("id")), {})
        reason = classify(row, eval_row)
        reason_counts[reason] += 1
        category_counts[row.get("category") or "missing"] += 1
        confused[f"{eval_row.get('expected_topic') or row.get('expected_topic')} -> {row.get('top_1_topic')}"] += 1
        item = dict(row)
        item["failure_reason"] = reason
        enriched.append(item)
    examples = sorted(enriched, key=lambda row: (-reason_counts[row["failure_reason"]], row.get("id") or ""))[:10]
    write_examples(examples, out_examples_path)
    summary = {
        "total_eval_rows": report.get("expanded_topic_rerank_4a18", {}).get("count", len(details)),
        "hit_at_1": report.get("expanded_topic_rerank_4a18", {}).get("hit_at_1"),
        "hit_at_3": report.get("expanded_topic_rerank_4a18", {}).get("hit_at_3"),
        "hit_at_5": report.get("expanded_topic_rerank_4a18", {}).get("hit_at_5"),
        "hit_at_20": report.get("expanded_topic_rerank_4a18", {}).get("hit_at_20"),
        "failed_at_3_count": len(failed),
        "reason_counts": dict(reason_counts),
        "top_failed_categories": dict(category_counts.most_common(10)),
        "top_confused_topic_pairs": dict(confused.most_common(15)),
        "warning_count": 0,
        "error_count": 0,
    }
    out_report_path.write_text(
        json.dumps(
            {
                "report_name": "retriever_v1_4_expanded_topic_rerank_failure_audit_report",
                "summary": summary,
                "important_examples": examples,
                "examples_csv": out_examples_path.relative_to(ROOT).as_posix(),
                "all_failed_at_3": enriched,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"error_count": 1, "errors": [str(exc)]}, ensure_ascii=False, indent=2))
        sys.exit(1)
