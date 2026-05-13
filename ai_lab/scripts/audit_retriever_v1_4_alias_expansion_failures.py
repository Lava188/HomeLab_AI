#!/usr/bin/env python
from __future__ import annotations

import csv
import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
DETAILS_PATH = ROOT / "ai_lab" / "reports" / "retriever_v1_4_alias_expansion_eval_details.csv"
REPORT_PATH = ROOT / "ai_lab" / "reports" / "retriever_v1_4_alias_expansion_eval_report.json"
OUT_REPORT_PATH = ROOT / "ai_lab" / "reports" / "retriever_v1_4_alias_expansion_failure_audit_report.json"
OUT_EXAMPLES_PATH = ROOT / "ai_lab" / "reports" / "retriever_v1_4_alias_expansion_failure_audit_examples.csv"


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def truth(value: Any) -> bool:
    return str(value).lower() == "true"


def classify(row: dict[str, str], prefix: str) -> str:
    if truth(row.get(f"{prefix}_hit_3")):
        if row.get("alias_groups"):
            return "alias_expansion_helped"
        return "candidate_present_but_rerank_failed"
    if not truth(row.get(f"{prefix}_hit_20")):
        if row.get("alias_groups"):
            return "alias_expansion_not_helped"
        return "candidate_missing_top20"
    return "candidate_present_but_rerank_failed"


def write_examples(rows: list[dict[str, Any]]) -> None:
    headers = [
        "id", "category", "query", "expected_topic", "acceptable_topics", "alias_groups",
        "fusion_hit_3", "fusion_hit_20", "failure_bucket", "fusion_top_5_topics", "fusion_top_20_topics",
    ]
    with OUT_EXAMPLES_PATH.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers)
        writer.writeheader()
        for row in rows:
            writer.writerow({header: row.get(header, "") for header in headers})


def main() -> None:
    details = read_csv(DETAILS_PATH)
    report = load_json(REPORT_PATH)
    fusion_reason_counts: Counter[str] = Counter()
    expanded_reason_counts: Counter[str] = Counter()
    category_counts: Counter[str] = Counter()
    audited = []
    for row in details:
        fusion_bucket = classify(row, "fusion")
        expanded_bucket = classify(row, "expanded")
        fusion_reason_counts[fusion_bucket] += 1
        expanded_reason_counts[expanded_bucket] += 1
        if not truth(row.get("fusion_hit_3")):
            category_counts[row.get("category") or "missing"] += 1
            enriched = dict(row)
            enriched["failure_bucket"] = fusion_bucket
            audited.append(enriched)

    examples = sorted(audited, key=lambda row: (-category_counts[row.get("category") or "missing"], row.get("id") or ""))[:15]
    write_examples(examples)
    summary = {
        "total": len(details),
        "strategy_primary": "multi_query_fusion",
        "fusion_metrics": report.get("multi_query_fusion", {}),
        "expanded_query_single_search_metrics": report.get("expanded_query_single_search", {}),
        "fusion_reason_counts": dict(fusion_reason_counts),
        "expanded_reason_counts": dict(expanded_reason_counts),
        "fusion_failed_at_3_count": sum(not truth(row.get("fusion_hit_3")) for row in details),
        "fusion_candidate_missing_top20_count": sum(not truth(row.get("fusion_hit_20")) for row in details),
        "fusion_candidate_present_but_missed_top3_count": sum(truth(row.get("fusion_hit_20")) and not truth(row.get("fusion_hit_3")) for row in details),
        "top_failed_categories": dict(category_counts.most_common(10)),
        "warning_count": 0,
        "error_count": 0,
    }
    OUT_REPORT_PATH.write_text(
        json.dumps(
            {
                "report_name": "retriever_v1_4_alias_expansion_failure_audit_report",
                "summary": summary,
                "examples_csv": "ai_lab/reports/retriever_v1_4_alias_expansion_failure_audit_examples.csv",
                "failed_examples": examples,
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
