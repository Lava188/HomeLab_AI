#!/usr/bin/env python
from __future__ import annotations

import contextlib
import csv
import io
import json
import math
import sys
import time
from collections import defaultdict
from pathlib import Path
from typing import Any

import numpy as np


ROOT = Path(__file__).resolve().parents[2]
ARTIFACT_DIR = ROOT / "ai_lab" / "artifacts" / "retriever_v1_4"
EVAL_PATH = ROOT / "ai_lab" / "datasets" / "eval" / "retriever_v1_4_batch4a_vi_eval_v2.jsonl"
BASELINE_REPORT_PATH = ROOT / "ai_lab" / "reports" / "retriever_v1_4_offline_eval_report_v2.json"
REPORT_PATH = ROOT / "ai_lab" / "reports" / "retriever_v1_4_rerank_eval_report.json"
DETAILS_PATH = ROOT / "ai_lab" / "reports" / "retriever_v1_4_rerank_eval_details.csv"
TOP_K_RETRIEVE = 20
TOP_K_OUTPUT = 5

RESULT_BOUNDARY_TOPICS = {"result_interpretation", "test_result_explainer", "medical_result_explanation_boundary", "results"}
URGENT_TOPICS = {"red_flag_general", "red_flag_signs", "emergency_warning", "urgent_advice", "safety_boundary"}
RESULT_QUERY_TERMS = ["kết quả", "chỉ số", "cao", "thấp", "bất thường", "đọc giúp", "giải thích", "có chắc", "chắc là"]
URGENT_QUERY_TERMS = ["đau ngực", "khó thở", "vã mồ hôi", "ngất", "lú lẫn", "môi tím", "lả", "xấu đi nhanh", "lan ra tay", "cấp cứu"]

ALIAS_GROUPS = [
    {
        "name": "cbc",
        "aliases": ["thiếu máu", "công thức máu", "cbc", "bạch cầu", "hồng cầu", "tiểu cầu"],
        "topic_terms": ["cbc", "anemia", "infection", "blood_count", "complete blood count"],
    },
    {
        "name": "glucose",
        "aliases": ["đường huyết", "đường máu", "tiểu đường", "hba1c", "khát nước", "tiểu nhiều"],
        "topic_terms": ["glucose", "hba1c", "diabetes"],
    },
    {
        "name": "lipid",
        "aliases": ["mỡ máu", "cholesterol", "triglyceride", "tim mạch"],
        "topic_terms": ["lipid", "cholesterol", "triglycerides"],
    },
    {
        "name": "liver",
        "aliases": ["men gan", "gan", "alt", "ast", "bilirubin", "vàng da"],
        "topic_terms": ["liver", "alt", "ast", "bilirubin", "cmp"],
    },
    {
        "name": "kidney_urine",
        "aliases": ["thận", "creatinine", "egfr", "nước tiểu", "albumin niệu", "protein niệu", "protein"],
        "topic_terms": ["kidney", "creatinine", "egfr", "gfr", "urine", "urinalysis", "albumin"],
    },
    {
        "name": "thyroid",
        "aliases": ["tuyến giáp", "tsh", "t4", "t3", "lạnh người", "rụng tóc"],
        "topic_terms": ["thyroid", "tsh", "t4", "t3"],
    },
    {
        "name": "general_labs",
        "aliases": ["xét nghiệm tổng quát", "khám sức khỏe", "xét nghiệm máu", "tổng quát", "lấy máu"],
        "topic_terms": ["general_lab", "blood_tests", "routine_blood", "test_meaning", "general_info"],
    },
]


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            rows.append(json.loads(line))
    return rows


def normalize(value: Any) -> str:
    return str(value or "").lower()


def as_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item) for item in value if str(item).strip()]
    if value:
        return [str(value)]
    return []


def expected_topics(row: dict[str, Any]) -> list[str]:
    values = []
    values.extend(as_list(row.get("expected_topic")))
    values.extend(as_list(row.get("acceptable_topics")))
    return values


def topic_matches(actual: str, expected: list[str]) -> bool:
    actual_norm = normalize(actual).replace("-", "_").replace(" ", "_")
    for value in expected:
        expected_norm = normalize(value).replace("-", "_").replace(" ", "_")
        if actual_norm == expected_norm or actual_norm in expected_norm or expected_norm in actual_norm:
            return True
    return False


def relevant(chunk: dict[str, Any], row: dict[str, Any]) -> bool:
    expected_kb_ids = set(as_list(row.get("expected_kb_id")) + as_list(row.get("acceptable_kb_ids")))
    expected_chunk_ids = set(as_list(row.get("expected_chunk_id")) + as_list(row.get("acceptable_chunk_ids")))
    if expected_kb_ids and str(chunk.get("kb_id")) in expected_kb_ids:
        return True
    if expected_chunk_ids and str(chunk.get("chunk_id")) in expected_chunk_ids:
        return True
    return topic_matches(str(chunk.get("topic") or ""), expected_topics(row))


def rr_at_5(chunks: list[dict[str, Any]], row: dict[str, Any]) -> float:
    for index, chunk in enumerate(chunks[:5], start=1):
        if relevant(chunk, row):
            return 1.0 / index
    return 0.0


def mean(values: list[float | bool]) -> float:
    return round(sum(float(value) for value in values) / max(1, len(values)), 4)


def query_alias_groups(query: str) -> set[str]:
    text = normalize(query)
    groups = set()
    for group in ALIAS_GROUPS:
        if any(alias in text for alias in group["aliases"]):
            groups.add(group["name"])
    return groups


def chunk_matches_alias_group(chunk: dict[str, Any], group_name: str) -> bool:
    group = next((item for item in ALIAS_GROUPS if item["name"] == group_name), None)
    if not group:
        return False
    haystack = normalize(
        " ".join(
            str(chunk.get(field) or "")
            for field in ["topic", "title", "content", "chunk_text", "medical_scope", "intended_use"]
        )
    )
    return any(term in haystack for term in group["topic_terms"] + group["aliases"])


def rerank_score(query: str, chunk: dict[str, Any], semantic_score: float) -> tuple[float, dict[str, Any]]:
    topic = str(chunk.get("topic") or "")
    query_text = normalize(query)
    alias_groups = query_alias_groups(query)
    result_query = any(term in query_text for term in RESULT_QUERY_TERMS)
    urgent_query = any(term in query_text for term in URGENT_QUERY_TERMS)
    alias_boost = sum(0.07 for group in alias_groups if chunk_matches_alias_group(chunk, group))
    title_topic_text = normalize(f"{chunk.get('topic')} {chunk.get('title')} {chunk.get('medical_scope')}")
    exact_query_term_boost = 0.0
    for group in ALIAS_GROUPS:
        if any(alias in query_text for alias in group["aliases"]) and any(term in title_topic_text for term in group["topic_terms"]):
            exact_query_term_boost += 0.03
    boundary_penalty = 0.0
    if topic in RESULT_BOUNDARY_TOPICS and not result_query:
        boundary_penalty = -0.11
    if topic in RESULT_BOUNDARY_TOPICS and result_query:
        boundary_penalty = 0.04
    urgent_adjustment = 0.0
    if topic in URGENT_TOPICS and urgent_query:
        urgent_adjustment = 0.08
    elif topic in URGENT_TOPICS and not urgent_query:
        urgent_adjustment = -0.08
    final_score = semantic_score + alias_boost + exact_query_term_boost + boundary_penalty + urgent_adjustment
    return final_score, {
        "alias_groups": sorted(alias_groups),
        "alias_boost": round(alias_boost, 4),
        "term_boost": round(exact_query_term_boost, 4),
        "boundary_adjustment": round(boundary_penalty, 4),
        "urgent_adjustment": round(urgent_adjustment, 4),
    }


def summarize(details: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "count": len(details),
        "hit_at_1": mean([row["hit_at_1"] for row in details]),
        "hit_at_3": mean([row["hit_at_3"] for row in details]),
        "hit_at_5": mean([row["hit_at_5"] for row in details]),
        "mrr_at_5": mean([row["mrr_at_5"] for row in details]),
    }


def write_csv(details: list[dict[str, Any]]) -> None:
    headers = [
        "id", "category", "query", "expected_topic", "hit_at_1", "hit_at_3", "hit_at_5", "mrr_at_5",
        "top_1_kb_id", "top_1_chunk_id", "top_1_topic", "top_1_domain", "top_1_score", "top_1_semantic_score",
        "top_5_kb_ids", "top_5_topics", "top_5_domains", "rerank_debug",
    ]
    with DETAILS_PATH.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers)
        writer.writeheader()
        for row in details:
            writer.writerow({header: row.get(header, "") for header in headers})


def main() -> None:
    started = time.perf_counter()
    with contextlib.redirect_stdout(io.StringIO()):
        import faiss  # type: ignore
        from sentence_transformers import SentenceTransformer  # type: ignore

    config = load_json(ARTIFACT_DIR / "embedding_config.json")
    chunks = load_json(ARTIFACT_DIR / "kb_chunks_v1_4.json")
    metadata = load_json(ARTIFACT_DIR / "chunk_metadata.json")
    embeddings = np.load(ARTIFACT_DIR / "chunk_embeddings.npy")
    index = faiss.read_index(str(ARTIFACT_DIR / "faiss.index"))
    eval_rows = load_jsonl(EVAL_PATH)
    metadata_by_chunk_id = {item.get("chunk_id"): item for item in metadata if item.get("chunk_id")}

    with contextlib.redirect_stdout(io.StringIO()):
        model = SentenceTransformer(config["model_name"])

    details = []
    for row in eval_rows:
        query = str(row.get("query") or "")
        with contextlib.redirect_stdout(io.StringIO()):
            query_embedding = model.encode(
                [config.get("query_prefix", "query: ") + query],
                convert_to_numpy=True,
                normalize_embeddings=bool(config.get("normalized", True)),
                show_progress_bar=False,
            ).astype("float32")
        scores, indices = index.search(query_embedding, TOP_K_RETRIEVE)
        candidates = []
        for score, idx in zip(scores[0], indices[0]):
            if idx < 0:
                continue
            chunk = dict(chunks[int(idx)])
            meta = metadata_by_chunk_id.get(chunk.get("chunk_id"), {})
            chunk["topic"] = chunk.get("topic") or meta.get("topic")
            chunk["domain"] = chunk.get("domain") or meta.get("domain")
            final_score, debug = rerank_score(query, chunk, float(score))
            chunk["_semantic_score"] = float(score)
            chunk["_rerank_score"] = final_score
            chunk["_rerank_debug"] = debug
            candidates.append(chunk)
        reranked = sorted(candidates, key=lambda item: item["_rerank_score"], reverse=True)[:TOP_K_OUTPUT]
        top1 = reranked[0] if reranked else {}
        details.append({
            "id": row.get("id"),
            "category": row.get("category", ""),
            "query": query,
            "expected_topic": row.get("expected_topic", ""),
            "hit_at_1": any(relevant(chunk, row) for chunk in reranked[:1]),
            "hit_at_3": any(relevant(chunk, row) for chunk in reranked[:3]),
            "hit_at_5": any(relevant(chunk, row) for chunk in reranked[:5]),
            "mrr_at_5": round(rr_at_5(reranked, row), 4),
            "top_1_kb_id": top1.get("kb_id", ""),
            "top_1_chunk_id": top1.get("chunk_id", ""),
            "top_1_topic": top1.get("topic", ""),
            "top_1_domain": top1.get("domain", ""),
            "top_1_score": "" if not top1 else round(float(top1.get("_rerank_score", 0)), 6),
            "top_1_semantic_score": "" if not top1 else round(float(top1.get("_semantic_score", 0)), 6),
            "top_5_kb_ids": ";".join(str(chunk.get("kb_id") or "") for chunk in reranked),
            "top_5_topics": ";".join(str(chunk.get("topic") or "") for chunk in reranked),
            "top_5_domains": ";".join(str(chunk.get("domain") or "") for chunk in reranked),
            "rerank_debug": json.dumps(top1.get("_rerank_debug", {}), ensure_ascii=False),
        })

    rerank_summary = summarize(details)
    baseline_summary = {}
    if BASELINE_REPORT_PATH.exists():
        baseline_summary = load_json(BASELINE_REPORT_PATH).get("summary", {})
    deltas = {}
    for key in ["hit_at_1", "hit_at_3", "hit_at_5", "mrr_at_5"]:
        if key in baseline_summary:
            deltas[key] = round(rerank_summary[key] - float(baseline_summary[key]), 4)

    baseline_details_path = ROOT / "ai_lab" / "reports" / "retriever_v1_4_offline_eval_details_v2.csv"
    comparison = {"improved": None, "unchanged": None, "regressed": None}
    if baseline_details_path.exists():
        with baseline_details_path.open("r", encoding="utf-8-sig", newline="") as handle:
            baseline_by_id = {row["id"]: row for row in csv.DictReader(handle)}
        improved = unchanged = regressed = 0
        for row in details:
            base_hit3 = str(baseline_by_id.get(str(row["id"]), {}).get("hit_at_3", "")).lower() == "true"
            new_hit3 = bool(row["hit_at_3"])
            if new_hit3 and not base_hit3:
                improved += 1
            elif new_hit3 == base_hit3:
                unchanged += 1
            else:
                regressed += 1
        comparison = {"improved": improved, "unchanged": unchanged, "regressed": regressed}

    report = {
        "report_name": "retriever_v1_4_rerank_eval_report",
        "mode": "offline_rerank_experiment_only",
        "baseline_v2": baseline_summary,
        "rerank": rerank_summary,
        "delta": deltas,
        "case_comparison_hit_at_3": comparison,
        "warning_count": 0,
        "error_count": 0,
        "artifact_dir": "ai_lab/artifacts/retriever_v1_4",
        "eval_path": "ai_lab/datasets/eval/retriever_v1_4_batch4a_vi_eval_v2.jsonl",
        "top_k_retrieve": TOP_K_RETRIEVE,
        "top_k_output": TOP_K_OUTPUT,
        "latency_ms": round((time.perf_counter() - started) * 1000, 2),
        "embeddings_shape": list(embeddings.shape),
    }
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write_csv(details)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
