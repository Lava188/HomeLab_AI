#!/usr/bin/env python
from __future__ import annotations

import contextlib
import csv
import io
import json
import argparse
import sys
import time
from collections import defaultdict
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
ARTIFACT_DIR = ROOT / "ai_lab" / "artifacts" / "retriever_v1_4"
EVAL_PATH_CANDIDATES = [
    ROOT / "ai_lab" / "datasets" / "eval" / "retriever_v1_4_batch4a_vi_eval.jsonl",
    ROOT / "ai_lab" / "evals" / "retriever_v1_4_batch4a_vi_eval.jsonl",
]
REPORTS_DIR = ROOT / "ai_lab" / "reports"
TOP_K = 5


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


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Offline eval for HomeLab retriever v1_4.")
    parser.add_argument("--eval", default=None, help="Path to eval JSONL file.")
    parser.add_argument("--suffix", default="", help="Optional output suffix, e.g. v2.")
    return parser.parse_args()


def report_paths(suffix: str) -> tuple[Path, Path, str]:
    clean_suffix = str(suffix or "").strip().strip("_")
    suffix_part = f"_{clean_suffix}" if clean_suffix else ""
    report_json = REPORTS_DIR / f"retriever_v1_4_offline_eval_report{suffix_part}.json"
    details_csv = REPORTS_DIR / f"retriever_v1_4_offline_eval_details{suffix_part}.csv"
    details_repo_path = f"ai_lab/reports/retriever_v1_4_offline_eval_details{suffix_part}.csv"
    return report_json, details_csv, details_repo_path


def find_eval_path(explicit_path: str | None = None) -> Path:
    if explicit_path:
        path = Path(explicit_path)
        if not path.is_absolute():
            path = ROOT / path
        if path.exists():
            return path
        raise FileNotFoundError(f"Eval file not found: {path}")

    for path in EVAL_PATH_CANDIDATES:
        if path.exists():
            return path
    raise FileNotFoundError(
        "Missing eval file. Checked: "
        + ", ".join(path.relative_to(ROOT).as_posix() for path in EVAL_PATH_CANDIDATES)
    )


def normalize_label(value: Any) -> str:
    return (
        str(value or "")
        .lower()
        .replace("-", "_")
        .replace("/", "_")
        .replace(" ", "_")
        .strip("_")
    )


def label_tokens(value: Any) -> set[str]:
    return {token for token in normalize_label(value).split("_") if len(token) > 2}


def topic_matches(actual: str | None, expected_values: list[str]) -> bool:
    actual_norm = normalize_label(actual)
    actual_tokens = label_tokens(actual)
    if not actual_norm:
        return False

    for expected in expected_values:
        expected_norm = normalize_label(expected)
        if not expected_norm:
            continue
        if actual_norm == expected_norm or actual_norm in expected_norm or expected_norm in actual_norm:
            return True
        expected_tokens = label_tokens(expected_norm)
        if expected_tokens:
            overlap = len(actual_tokens & expected_tokens) / max(1, len(expected_tokens))
            if overlap >= 0.5:
                return True
    return False


def as_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item) for item in value if str(item).strip()]
    if isinstance(value, str) and value.strip():
        return [value.strip()]
    return []


def expected_topics(row: dict[str, Any]) -> list[str]:
    values: list[str] = []
    values.extend(as_list(row.get("expected_topic")))
    values.extend(as_list(row.get("expected_retrieval_topic")))
    values.extend(as_list(row.get("expected_top_k_topic")))
    values.extend(as_list(row.get("acceptable_topics")))
    return values


def expected_domains(row: dict[str, Any]) -> list[str]:
    values = as_list(row.get("expected_domain"))
    values.extend(as_list(row.get("acceptable_domains")))
    return [value.replace("https://", "").replace("http://", "").replace("www.", "").strip("/") for value in values]


def expected_ids(row: dict[str, Any]) -> tuple[set[str], set[str]]:
    kb_ids = set(as_list(row.get("expected_kb_id")))
    kb_ids.update(as_list(row.get("expected_kb_ids")))
    kb_ids.update(as_list(row.get("acceptable_kb_ids")))
    chunk_ids = set(as_list(row.get("expected_chunk_id")))
    chunk_ids.update(as_list(row.get("expected_chunk_ids")))
    chunk_ids.update(as_list(row.get("acceptable_chunk_ids")))
    return kb_ids, chunk_ids


def keyword_values(row: dict[str, Any]) -> list[str]:
    values = as_list(row.get("must_include_keywords"))
    values.extend(as_list(row.get("expected_keywords")))
    return values


def chunk_is_relevant(chunk: dict[str, Any], row: dict[str, Any]) -> bool:
    expected_kb_ids, expected_chunk_ids = expected_ids(row)
    if expected_kb_ids and str(chunk.get("kb_id")) in expected_kb_ids:
        return True
    if expected_chunk_ids and str(chunk.get("chunk_id")) in expected_chunk_ids:
        return True
    topics = expected_topics(row)
    if topics and topic_matches(str(chunk.get("topic") or ""), topics):
        return True
    return False


def reciprocal_rank(top_chunks: list[dict[str, Any]], row: dict[str, Any]) -> float:
    for index, chunk in enumerate(top_chunks[:TOP_K], start=1):
        if chunk_is_relevant(chunk, row):
            return 1.0 / index
    return 0.0


def any_relevant(top_chunks: list[dict[str, Any]], row: dict[str, Any], k: int) -> bool:
    return any(chunk_is_relevant(chunk, row) for chunk in top_chunks[:k])


def domain_match_at(top_chunks: list[dict[str, Any]], row: dict[str, Any], k: int) -> bool | None:
    domains = expected_domains(row)
    if not domains:
        return None
    normalized_domains = {normalize_label(domain) for domain in domains}
    return any(normalize_label(chunk.get("domain")) in normalized_domains for chunk in top_chunks[:k])


def topic_match_at(top_chunks: list[dict[str, Any]], row: dict[str, Any], k: int) -> bool | None:
    topics = expected_topics(row)
    if not topics:
        return None
    return any(topic_matches(str(chunk.get("topic") or ""), topics) for chunk in top_chunks[:k])


def keyword_coverage_at(top_chunks: list[dict[str, Any]], row: dict[str, Any], k: int) -> float | None:
    keywords = keyword_values(row)
    if not keywords:
        return None
    joined = " ".join(str(chunk.get("content") or "") for chunk in top_chunks[:k]).lower()
    hits = sum(1 for keyword in keywords if str(keyword).lower() in joined)
    return hits / max(1, len(keywords))


def mean_or_none(values: list[float | bool | None]) -> float | None:
    numeric = [float(value) for value in values if value is not None]
    if not numeric:
        return None
    return round(sum(numeric) / len(numeric), 4)


def summarize(rows: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "count": len(rows),
        "hit_at_1": mean_or_none([row["hit_at_1"] for row in rows]),
        "hit_at_3": mean_or_none([row["hit_at_3"] for row in rows]),
        "hit_at_5": mean_or_none([row["hit_at_5"] for row in rows]),
        "mrr_at_5": mean_or_none([row["mrr_at_5"] for row in rows]),
        "expected_topic_match_at_1": mean_or_none(
            [row["expected_topic_match_at_1"] for row in rows]
        ),
        "expected_topic_match_at_3": mean_or_none(
            [row["expected_topic_match_at_3"] for row in rows]
        ),
        "expected_domain_match_at_3": mean_or_none(
            [row["expected_domain_match_at_3"] for row in rows]
        ),
        "keyword_coverage_at_3": mean_or_none([row["keyword_coverage_at_3"] for row in rows]),
    }


def write_details_csv(rows: list[dict[str, Any]], details_csv_path: Path) -> None:
    headers = [
        "id",
        "group",
        "split",
        "category",
        "query",
        "expected_topic",
        "expected_retrieval_topic",
        "expected_domain",
        "hit_at_1",
        "hit_at_3",
        "hit_at_5",
        "mrr_at_5",
        "expected_topic_match_at_1",
        "expected_topic_match_at_3",
        "expected_domain_match_at_3",
        "keyword_coverage_at_3",
        "top_1_kb_id",
        "top_1_chunk_id",
        "top_1_topic",
        "top_1_domain",
        "top_1_score",
        "top_5_kb_ids",
        "top_5_topics",
        "top_5_domains",
        "warning",
    ]
    with details_csv_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers)
        writer.writeheader()
        for row in rows:
            writer.writerow({header: row.get(header, "") for header in headers})


def main() -> None:
    args = parse_args()
    started = time.perf_counter()
    eval_path = find_eval_path(args.eval)
    report_json_path, details_csv_path, details_repo_path = report_paths(args.suffix)

    with contextlib.redirect_stdout(io.StringIO()):
        import faiss  # type: ignore
        from sentence_transformers import SentenceTransformer  # type: ignore

    manifest = load_json(ARTIFACT_DIR / "retriever_manifest.json")
    config = load_json(ARTIFACT_DIR / "embedding_config.json")
    chunks = load_json(ARTIFACT_DIR / manifest.get("kb_file", "kb_chunks_v1_4.json"))
    metadata = load_json(ARTIFACT_DIR / manifest.get("metadata_file", "chunk_metadata.json"))
    metadata_by_chunk_id = {
        item.get("chunk_id"): item for item in metadata if isinstance(item, dict) and item.get("chunk_id")
    }
    index = faiss.read_index(str(ARTIFACT_DIR / manifest.get("faiss_index_file", "faiss.index")))
    model_name = config.get("model_name") or manifest.get("model_name")
    query_prefix = config.get("query_prefix", "query: ")
    eval_rows = load_jsonl(eval_path)
    warnings: list[str] = []

    with contextlib.redirect_stdout(io.StringIO()):
        model = SentenceTransformer(model_name)

    details: list[dict[str, Any]] = []
    for row in eval_rows:
        query = str(row.get("query") or "").strip()
        row_warning = ""
        if not query:
            row_warning = "missing_query"
            warnings.append(f"{row.get('id', '<missing id>')}: missing query")
            top_chunks: list[dict[str, Any]] = []
        else:
            strong_labels = bool(expected_ids(row)[0] or expected_ids(row)[1] or expected_topics(row))
            if not strong_labels:
                row_warning = "missing_expected_id_or_topic"
                warnings.append(
                    f"{row.get('id', '<missing id>')}: missing expected ids/topics for relevance metrics"
                )

            with contextlib.redirect_stdout(io.StringIO()):
                query_embedding = model.encode(
                    [query_prefix + query],
                    convert_to_numpy=True,
                    normalize_embeddings=bool(config.get("normalized", True)),
                    show_progress_bar=False,
                ).astype("float32")
            scores, indices = index.search(query_embedding, TOP_K)
            top_chunks = []
            for rank, (score, idx) in enumerate(zip(scores[0], indices[0]), start=1):
                if idx < 0:
                    continue
                chunk = chunks[int(idx)]
                meta = metadata_by_chunk_id.get(chunk.get("chunk_id"), {})
                top_chunks.append(
                    {
                        **chunk,
                        "rank": rank,
                        "score": float(score),
                        "topic": chunk.get("topic") or meta.get("topic"),
                        "domain": chunk.get("domain") or meta.get("domain"),
                    }
                )

        topic_at_1 = topic_match_at(top_chunks, row, 1)
        topic_at_3 = topic_match_at(top_chunks, row, 3)
        domain_at_3 = domain_match_at(top_chunks, row, 3)
        keyword_cov_3 = keyword_coverage_at(top_chunks, row, 3)
        rr = reciprocal_rank(top_chunks, row)

        top_1 = top_chunks[0] if top_chunks else {}
        details.append(
            {
                "id": row.get("id"),
                "group": row.get("group", ""),
                "split": row.get("split", ""),
                "category": row.get("category", ""),
                "query": query,
                "expected_topic": row.get("expected_topic", ""),
                "expected_retrieval_topic": row.get("expected_retrieval_topic", ""),
                "expected_domain": row.get("expected_domain", ""),
                "hit_at_1": any_relevant(top_chunks, row, 1),
                "hit_at_3": any_relevant(top_chunks, row, 3),
                "hit_at_5": any_relevant(top_chunks, row, 5),
                "mrr_at_5": round(rr, 4),
                "expected_topic_match_at_1": topic_at_1,
                "expected_topic_match_at_3": topic_at_3,
                "expected_domain_match_at_3": domain_at_3,
                "keyword_coverage_at_3": None
                if keyword_cov_3 is None
                else round(keyword_cov_3, 4),
                "top_1_kb_id": top_1.get("kb_id", ""),
                "top_1_chunk_id": top_1.get("chunk_id", ""),
                "top_1_topic": top_1.get("topic", ""),
                "top_1_domain": top_1.get("domain", ""),
                "top_1_score": "" if not top_1 else round(float(top_1.get("score", 0)), 6),
                "top_5_kb_ids": ";".join(str(chunk.get("kb_id") or "") for chunk in top_chunks),
                "top_5_topics": ";".join(str(chunk.get("topic") or "") for chunk in top_chunks),
                "top_5_domains": ";".join(str(chunk.get("domain") or "") for chunk in top_chunks),
                "warning": row_warning,
            }
        )

    by_group: dict[str, list[dict[str, Any]]] = defaultdict(list)
    by_split: dict[str, list[dict[str, Any]]] = defaultdict(list)
    by_category: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for detail in details:
        if detail.get("group"):
            by_group[str(detail["group"])].append(detail)
        if detail.get("split"):
            by_split[str(detail["split"])].append(detail)
        if detail.get("category"):
            by_category[str(detail["category"])].append(detail)

    summary = {
        **summarize(details),
        "eval_path": eval_path.relative_to(ROOT).as_posix(),
        "artifact_dir": "ai_lab/artifacts/retriever_v1_4",
        "retriever_version": manifest.get("retriever_version"),
        "model_name": model_name,
        "top_k": TOP_K,
        "warning_count": len(warnings),
        "error_count": 0,
        "latency_ms": round((time.perf_counter() - started) * 1000, 2),
    }
    report = {
        "report_name": "retriever_v1_4_offline_eval_report",
        "summary": summary,
        "by_group": {key: summarize(value) for key, value in by_group.items()},
        "by_split": {key: summarize(value) for key, value in by_split.items()},
        "by_category": {key: summarize(value) for key, value in by_category.items()},
        "warnings": warnings,
        "details_csv_path": details_repo_path,
    }

    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    report_json_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write_details_csv(details, details_csv_path)

    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        main()
    except FileNotFoundError as exc:
        print(json.dumps({"error_count": 1, "errors": [str(exc)]}, ensure_ascii=False, indent=2))
        sys.exit(1)
