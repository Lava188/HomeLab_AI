#!/usr/bin/env python
from __future__ import annotations

import csv
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
DETAILS_CSV_PATH = ROOT / "ai_lab" / "reports" / "retriever_v1_4_offline_eval_details.csv"
EVAL_REPORT_PATH = ROOT / "ai_lab" / "reports" / "retriever_v1_4_offline_eval_report.json"
CHUNKS_PATH = ROOT / "ai_lab" / "artifacts" / "retriever_v1_4" / "kb_chunks_v1_4.json"
METADATA_PATH = ROOT / "ai_lab" / "artifacts" / "retriever_v1_4" / "chunk_metadata.json"
EVAL_PATH_CANDIDATES = [
    ROOT / "ai_lab" / "datasets" / "eval" / "retriever_v1_4_batch4a_vi_eval.jsonl",
    ROOT / "ai_lab" / "evals" / "retriever_v1_4_batch4a_vi_eval.jsonl",
]
REPORT_JSON_PATH = ROOT / "ai_lab" / "reports" / "retriever_v1_4_eval_failure_audit_report.json"
EXAMPLES_CSV_PATH = ROOT / "ai_lab" / "reports" / "retriever_v1_4_eval_failure_audit_examples.csv"


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError as exc:
            raise ValueError(f"{path}:{line_number}: invalid JSON: {exc}") from exc
    return rows


def find_eval_path() -> Path:
    for path in EVAL_PATH_CANDIDATES:
        if path.exists():
            return path
    raise FileNotFoundError(
        "Missing eval file. Checked: "
        + ", ".join(path.relative_to(ROOT).as_posix() for path in EVAL_PATH_CANDIDATES)
    )


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def bool_value(value: Any) -> bool:
    return str(value).strip().lower() == "true"


def normalize(value: Any) -> str:
    return (
        str(value or "")
        .lower()
        .replace("-", "_")
        .replace("/", "_")
        .replace(" ", "_")
        .strip("_")
    )


def tokens(value: Any) -> set[str]:
    return {token for token in normalize(value).split("_") if len(token) > 2}


def topic_match_score(expected: str, corpus_topic: str) -> float:
    expected_norm = normalize(expected)
    corpus_norm = normalize(corpus_topic)
    if not expected_norm or not corpus_norm:
        return 0.0
    if expected_norm == corpus_norm:
        return 1.0
    if expected_norm in corpus_norm or corpus_norm in expected_norm:
        return 0.85
    expected_tokens = tokens(expected_norm)
    corpus_tokens = tokens(corpus_norm)
    if not expected_tokens or not corpus_tokens:
        return 0.0
    return len(expected_tokens & corpus_tokens) / max(1, len(expected_tokens))


def expected_topics(row: dict[str, Any]) -> list[str]:
    values = []
    for field in ["expected_topic", "expected_retrieval_topic", "expected_top_k_topic"]:
        value = row.get(field)
        if isinstance(value, list):
            values.extend(str(item) for item in value if str(item).strip())
        elif value:
            values.append(str(value))
    acceptable = row.get("acceptable_topics")
    if isinstance(acceptable, list):
        values.extend(str(item) for item in acceptable if str(item).strip())
    elif acceptable:
        values.append(str(acceptable))
    return values


def best_topic_score(expected_values: list[str], corpus_topics: set[str]) -> tuple[float, str | None]:
    best_score = 0.0
    best_topic: str | None = None
    for expected in expected_values:
        for corpus_topic in corpus_topics:
            score = topic_match_score(expected, corpus_topic)
            if score > best_score:
                best_score = score
                best_topic = corpus_topic
    return best_score, best_topic


def split_semicolon(value: str | None) -> list[str]:
    return [part for part in str(value or "").split(";") if part]


def category_metrics(rows: list[dict[str, str]]) -> dict[str, dict[str, Any]]:
    grouped: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in rows:
        for field in ["group", "split", "category"]:
            key = row.get(field) or ""
            if key:
                grouped[f"{field}:{key}"].append(row)

    metrics: dict[str, dict[str, Any]] = {}
    for key, group_rows in grouped.items():
        metrics[key] = {
            "count": len(group_rows),
            "hit_at_1_pass": sum(bool_value(row.get("hit_at_1")) for row in group_rows),
            "hit_at_3_pass": sum(bool_value(row.get("hit_at_3")) for row in group_rows),
            "hit_at_5_pass": sum(bool_value(row.get("hit_at_5")) for row in group_rows),
            "hit_at_1_rate": round(
                sum(bool_value(row.get("hit_at_1")) for row in group_rows) / len(group_rows), 4
            ),
            "hit_at_3_rate": round(
                sum(bool_value(row.get("hit_at_3")) for row in group_rows) / len(group_rows), 4
            ),
            "hit_at_5_rate": round(
                sum(bool_value(row.get("hit_at_5")) for row in group_rows) / len(group_rows), 4
            ),
        }
    return metrics


def failure_reason(row: dict[str, str], eval_by_id: dict[str, dict[str, Any]], corpus_topics: set[str]) -> str:
    eval_row = eval_by_id.get(row.get("id", ""), {})
    expected = expected_topics(eval_row) or [
        row.get("expected_topic", ""),
        row.get("expected_retrieval_topic", ""),
    ]
    expected = [value for value in expected if value]
    score, _ = best_topic_score(expected, corpus_topics)
    top_topics = split_semicolon(row.get("top_5_topics"))
    top_1_topic = row.get("top_1_topic", "")

    if expected and score < 0.35:
        return "expected_topic_missing_from_corpus"
    if expected and score >= 0.35 and not bool_value(row.get("hit_at_5")):
        if any(topic in {"red_flag_general", "test_result_explainer", "result_interpretation"} for topic in top_topics):
            return "top_results_topic_drift"
        return "expected_topic_exists_but_not_retrieved"
    if top_1_topic in {"red_flag_general", "test_result_explainer", "result_interpretation"}:
        return "top_results_topic_drift"
    if any(ord(char) > 127 for char in row.get("query", "")):
        return "possible_query_language_gap"
    return "possible_eval_label_mismatch"


def choose_examples(failed_rows: list[dict[str, str]], limit: int = 20) -> list[dict[str, str]]:
    category_counts = Counter(row.get("category", "") for row in failed_rows)
    reason_counts = Counter(row.get("failure_reason", "") for row in failed_rows)
    scored = sorted(
        failed_rows,
        key=lambda row: (
            -category_counts[row.get("category", "")],
            -reason_counts[row.get("failure_reason", "")],
            row.get("id", ""),
        ),
    )
    selected: list[dict[str, str]] = []
    seen_categories: set[str] = set()
    for row in scored:
        category = row.get("category", "")
        if category and category not in seen_categories:
            selected.append(row)
            seen_categories.add(category)
        if len(selected) >= limit:
            return selected
    for row in scored:
        if row not in selected:
            selected.append(row)
        if len(selected) >= limit:
            return selected
    return selected


def write_examples_csv(rows: list[dict[str, str]]) -> None:
    headers = [
        "id",
        "query",
        "group",
        "category",
        "expected_topic",
        "expected_retrieval_topic",
        "expected_domain",
        "top_1_kb_id",
        "top_1_topic",
        "top_1_domain",
        "top_1_score",
        "top_5_kb_ids",
        "top_5_topics",
        "top_5_domains",
        "failure_reason",
    ]
    with EXAMPLES_CSV_PATH.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers)
        writer.writeheader()
        for row in rows:
            writer.writerow({header: row.get(header, "") for header in headers})


def main() -> None:
    eval_path = find_eval_path()
    details = read_csv(DETAILS_CSV_PATH)
    eval_report = load_json(EVAL_REPORT_PATH)
    chunks = load_json(CHUNKS_PATH)
    metadata = load_json(METADATA_PATH)
    eval_rows = load_jsonl(eval_path)
    eval_by_id = {str(row.get("id")): row for row in eval_rows}

    corpus_topics = {str(chunk.get("topic") or "") for chunk in chunks if chunk.get("topic")}
    metadata_topics = {str(item.get("topic") or "") for item in metadata if item.get("topic")}
    all_corpus_topics = corpus_topics | metadata_topics
    expected_topic_counter = Counter()
    for row in eval_rows:
        for topic in expected_topics(row):
            expected_topic_counter[topic] += 1

    corpus_topic_counter = Counter(str(chunk.get("topic") or "missing") for chunk in chunks)
    top_1_topic_counter = Counter(row.get("top_1_topic") or "missing" for row in details)
    hit_at_1_pass = sum(bool_value(row.get("hit_at_1")) for row in details)
    hit_at_3_pass = sum(bool_value(row.get("hit_at_3")) for row in details)
    hit_at_5_pass = sum(bool_value(row.get("hit_at_5")) for row in details)

    expected_topic_gaps = []
    for topic, count in expected_topic_counter.items():
        score, best_topic = best_topic_score([topic], all_corpus_topics)
        if score < 0.35:
            expected_topic_gaps.append(
                {
                    "expected_topic": topic,
                    "count": count,
                    "best_corpus_topic": best_topic,
                    "best_match_score": round(score, 4),
                }
            )

    failed_rows = []
    for row in details:
        if bool_value(row.get("hit_at_5")):
            continue
        enriched = dict(row)
        enriched["failure_reason"] = failure_reason(row, eval_by_id, all_corpus_topics)
        failed_rows.append(enriched)

    failure_reason_counts = Counter(row["failure_reason"] for row in failed_rows)
    example_rows = choose_examples(failed_rows, 20)
    write_examples_csv(example_rows)

    summary = {
        "total_eval_rows": len(details),
        "hit_at_1": {
            "pass": hit_at_1_pass,
            "fail": len(details) - hit_at_1_pass,
            "rate": round(hit_at_1_pass / max(1, len(details)), 4),
        },
        "hit_at_3": {
            "pass": hit_at_3_pass,
            "fail": len(details) - hit_at_3_pass,
            "rate": round(hit_at_3_pass / max(1, len(details)), 4),
        },
        "hit_at_5": {
            "pass": hit_at_5_pass,
            "fail": len(details) - hit_at_5_pass,
            "rate": round(hit_at_5_pass / max(1, len(details)), 4),
        },
        "failed_rows_analyzed": len(failed_rows),
        "failure_reason_counts": dict(failure_reason_counts),
        "expected_topic_gap_count": len(expected_topic_gaps),
        "corpus_topic_count": len(all_corpus_topics),
    }

    report = {
        "report_name": "retriever_v1_4_eval_failure_audit_report",
        "inputs": {
            "details_csv": "ai_lab/reports/retriever_v1_4_offline_eval_details.csv",
            "eval_report": "ai_lab/reports/retriever_v1_4_offline_eval_report.json",
            "chunks": "ai_lab/artifacts/retriever_v1_4/kb_chunks_v1_4.json",
            "metadata": "ai_lab/artifacts/retriever_v1_4/chunk_metadata.json",
            "eval_file": eval_path.relative_to(ROOT).as_posix(),
        },
        "eval_summary": eval_report.get("summary", {}),
        "summary": summary,
        "metrics_by_group_split_category": category_metrics(details),
        "expected_topic_distribution": dict(expected_topic_counter),
        "corpus_topic_distribution": dict(corpus_topic_counter),
        "expected_topic_gaps": expected_topic_gaps,
        "top_1_topic_distribution": dict(top_1_topic_counter),
        "failed_rows": failed_rows,
        "selected_examples_csv": "ai_lab/reports/retriever_v1_4_eval_failure_audit_examples.csv",
    }

    REPORT_JSON_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"error_count": 1, "errors": [str(exc)]}, ensure_ascii=False, indent=2))
        sys.exit(1)
