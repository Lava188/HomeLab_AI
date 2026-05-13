#!/usr/bin/env python
from __future__ import annotations

import contextlib
import csv
import io
import json
import sys
import time
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
ARTIFACT_DIR = ROOT / "ai_lab" / "artifacts" / "retriever_v1_4"
EVAL_PATH = ROOT / "ai_lab" / "datasets" / "eval" / "retriever_v1_4_batch4a_vi_eval_v2.jsonl"
REPORT_PATH = ROOT / "ai_lab" / "reports" / "retriever_v1_4_oracle_candidate_coverage_report.json"
DETAILS_PATH = ROOT / "ai_lab" / "reports" / "retriever_v1_4_oracle_candidate_coverage_details.csv"
TOP_K = 20

VI_ALIAS_HINTS = {
    "cbc": ["thiếu máu", "công thức máu", "cbc", "bạch cầu", "hồng cầu", "tiểu cầu"],
    "glucose": ["đường huyết", "đường máu", "tiểu đường", "hba1c", "glucose"],
    "lipid": ["mỡ máu", "cholesterol", "triglyceride", "lipid"],
    "liver": ["gan", "men gan", "alt", "ast", "bilirubin"],
    "kidney": ["thận", "creatinine", "creatinin", "egfr"],
    "urine": ["nước tiểu", "protein niệu", "albumin niệu", "uti"],
    "thyroid": ["tuyến giáp", "tsh", "t3", "t4"],
    "general": ["xét nghiệm tổng quát", "khám sức khỏe", "xét nghiệm máu"],
}


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


def as_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item) for item in value if str(item).strip()]
    if value:
        return [str(value)]
    return []


def normalize(value: Any) -> str:
    return str(value or "").lower().replace("-", "_").replace(" ", "_").strip("_")


def topic_matches(actual: str, expected_topics: list[str]) -> bool:
    actual_norm = normalize(actual)
    for expected in expected_topics:
        expected_norm = normalize(expected)
        if not expected_norm:
            continue
        if actual_norm == expected_norm or actual_norm in expected_norm or expected_norm in actual_norm:
            return True
    return False


def expected_topics(row: dict[str, Any]) -> list[str]:
    topics = []
    topics.extend(as_list(row.get("expected_topic")))
    topics.extend(as_list(row.get("acceptable_topics")))
    deduped = []
    for topic in topics:
        if topic not in deduped:
            deduped.append(topic)
    return deduped


def hit_at(topics: list[str], expected: list[str], k: int) -> bool:
    return any(topic_matches(topic, expected) for topic in topics[:k])


def likely_alias_gap(row: dict[str, Any], oracle_hit_20: bool) -> bool:
    if oracle_hit_20:
        return False
    query = str(row.get("query") or "").lower()
    expected = " ".join(expected_topics(row)).lower()
    for family, aliases in VI_ALIAS_HINTS.items():
        if family in expected and any(alias in query for alias in aliases):
            return True
    return False


def unique_join(values: list[str]) -> str:
    deduped = []
    for value in values:
        if value not in deduped:
            deduped.append(value)
    return ";".join(deduped)


def write_details(rows: list[dict[str, Any]]) -> None:
    headers = [
        "query_id",
        "query",
        "expected_topic",
        "acceptable_topics",
        "top_1_topics",
        "top_3_topics",
        "top_5_topics",
        "top_10_topics",
        "top_20_topics",
        "oracle_hit_1",
        "oracle_hit_3",
        "oracle_hit_5",
        "oracle_hit_10",
        "oracle_hit_20",
        "failure_bucket",
        "notes",
    ]
    with DETAILS_PATH.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers)
        writer.writeheader()
        for row in rows:
            writer.writerow({header: row.get(header, "") for header in headers})


def mean_bool(values: list[bool]) -> float:
    return round(sum(1 for value in values if value) / max(1, len(values)), 4)


def main() -> None:
    started = time.perf_counter()
    warnings: list[str] = []
    errors: list[str] = []

    with contextlib.redirect_stdout(io.StringIO()):
        import faiss  # type: ignore
        from sentence_transformers import SentenceTransformer  # type: ignore

    config = load_json(ARTIFACT_DIR / "embedding_config.json")
    chunks = load_json(ARTIFACT_DIR / "kb_chunks_v1_4.json")
    _metadata = load_json(ARTIFACT_DIR / "chunk_metadata.json")
    index = faiss.read_index(str(ARTIFACT_DIR / "faiss.index"))
    eval_rows = load_jsonl(EVAL_PATH)

    with contextlib.redirect_stdout(io.StringIO()):
        model = SentenceTransformer(config["model_name"])

    details = []
    for row in eval_rows:
        expected = expected_topics(row)
        if not expected or row.get("label_alignment") is None:
            warnings.append(f"{row.get('id')}: ambiguous or missing eval labels")

        with contextlib.redirect_stdout(io.StringIO()):
            query_embedding = model.encode(
                [config.get("query_prefix", "query: ") + str(row.get("query") or "")],
                convert_to_numpy=True,
                normalize_embeddings=bool(config.get("normalized", True)),
                show_progress_bar=False,
            ).astype("float32")
        _scores, indices = index.search(query_embedding, TOP_K)
        top_topics = []
        for idx in indices[0]:
            if idx >= 0:
                top_topics.append(str(chunks[int(idx)].get("topic") or ""))

        oracle_1 = hit_at(top_topics, expected, 1)
        oracle_3 = hit_at(top_topics, expected, 3)
        oracle_5 = hit_at(top_topics, expected, 5)
        oracle_10 = hit_at(top_topics, expected, 10)
        oracle_20 = hit_at(top_topics, expected, 20)

        if not expected or row.get("label_alignment") is None:
            bucket = "eval_label_ambiguous"
            notes = "Eval row lacks aligned labels strong enough for oracle interpretation."
        elif oracle_20 and not oracle_3:
            bucket = "candidate_present_but_rerank_failed"
            notes = "Expected topic appears in semantic top20 but not top3; reranking/candidate ordering is the likely bottleneck."
        elif not oracle_20:
            bucket = "candidate_missing_top20"
            notes = "Expected topic is absent from semantic top20; candidate generation, query embedding, or alias coverage is the likely bottleneck."
            if likely_alias_gap(row, oracle_20):
                notes += " Query contains Vietnamese alias tied to expected topic."
        else:
            bucket = "candidate_present_top3"
            notes = "Expected topic already appears in semantic top3."

        details.append(
            {
                "query_id": row.get("id"),
                "query": row.get("query"),
                "expected_topic": row.get("expected_topic", ""),
                "acceptable_topics": ";".join(expected),
                "top_1_topics": unique_join(top_topics[:1]),
                "top_3_topics": unique_join(top_topics[:3]),
                "top_5_topics": unique_join(top_topics[:5]),
                "top_10_topics": unique_join(top_topics[:10]),
                "top_20_topics": unique_join(top_topics[:20]),
                "oracle_hit_1": oracle_1,
                "oracle_hit_3": oracle_3,
                "oracle_hit_5": oracle_5,
                "oracle_hit_10": oracle_10,
                "oracle_hit_20": oracle_20,
                "failure_bucket": bucket,
                "notes": notes,
            }
        )

    topic_present_top20_but_missed_top3_count = sum(
        row["oracle_hit_20"] and not row["oracle_hit_3"] for row in details
    )
    topic_missing_top20_count = sum(not row["oracle_hit_20"] for row in details)
    eval_label_ambiguous_count = sum(row["failure_bucket"] == "eval_label_ambiguous" for row in details)
    likely_alias_gap_count = sum(
        row["failure_bucket"] == "candidate_missing_top20"
        and "Vietnamese alias" in row["notes"]
        for row in details
    )

    summary = {
        "total": len(details),
        "oracle_hit_at_1": mean_bool([row["oracle_hit_1"] for row in details]),
        "oracle_hit_at_3": mean_bool([row["oracle_hit_3"] for row in details]),
        "oracle_hit_at_5": mean_bool([row["oracle_hit_5"] for row in details]),
        "oracle_hit_at_10": mean_bool([row["oracle_hit_10"] for row in details]),
        "oracle_hit_at_20": mean_bool([row["oracle_hit_20"] for row in details]),
        "topic_present_top20_but_missed_top3_count": topic_present_top20_but_missed_top3_count,
        "topic_missing_top20_count": topic_missing_top20_count,
        "eval_label_ambiguous_count": eval_label_ambiguous_count,
        "likely_alias_gap_count": likely_alias_gap_count,
        "warning_count": len(warnings),
        "error_count": len(errors),
        "latency_ms": round((time.perf_counter() - started) * 1000, 2),
    }

    report = {
        "report_name": "retriever_v1_4_oracle_candidate_coverage_report",
        "summary": summary,
        "inputs": {
            "eval_v2": "ai_lab/datasets/eval/retriever_v1_4_batch4a_vi_eval_v2.jsonl",
            "artifact_dir": "ai_lab/artifacts/retriever_v1_4",
        },
        "warnings": warnings,
        "errors": errors,
    }
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write_details(details)
    print(json.dumps(summary, ensure_ascii=False, indent=2))

    if errors:
        sys.exit(1)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"error_count": 1, "errors": [str(exc)]}, ensure_ascii=False, indent=2))
        sys.exit(1)
