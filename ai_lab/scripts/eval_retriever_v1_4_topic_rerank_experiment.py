#!/usr/bin/env python
from __future__ import annotations

import contextlib
import csv
import io
import json
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
RERANK14_REPORT_PATH = ROOT / "ai_lab" / "reports" / "retriever_v1_4_rerank_eval_report.json"
RERANK14_DETAILS_PATH = ROOT / "ai_lab" / "reports" / "retriever_v1_4_rerank_eval_details.csv"
BASELINE_DETAILS_PATH = ROOT / "ai_lab" / "reports" / "retriever_v1_4_offline_eval_details_v2.csv"
REPORT_PATH = ROOT / "ai_lab" / "reports" / "retriever_v1_4_topic_rerank_eval_report.json"
DETAILS_PATH = ROOT / "ai_lab" / "reports" / "retriever_v1_4_topic_rerank_eval_details.csv"

TOP_K_RETRIEVE = 20
TOP_K_OUTPUT = 5

RESULT_BOUNDARY_TOPICS = {"result_interpretation", "test_result_explainer", "medical_result_explanation_boundary", "results"}
URGENT_TOPICS = {"red_flag_general", "red_flag_signs", "emergency_warning", "urgent_advice", "safety_boundary"}
RESULT_QUERY_TERMS = ["kết quả", "chỉ số", "cao", "thấp", "bất thường", "đọc", "giải thích", "có chắc", "chắc là"]
URGENT_QUERY_TERMS = ["đau ngực", "khó thở", "vã mồ hôi", "ngất", "lú lẫn", "môi tím", "lả", "xấu đi nhanh", "lan ra tay", "cấp cứu", "nói không ra câu"]

TOPIC_PROFILES = [
    {
        "name": "lipid",
        "aliases": ["mỡ máu", "cholesterol", "triglyceride", "triglycerides", "lipid"],
        "chunk_terms": ["lipid", "cholesterol", "triglyceride"],
        "exact_terms": ["cholesterol", "triglyceride", "triglycerides", "lipid"],
    },
    {
        "name": "glucose_hba1c",
        "aliases": ["đường huyết", "đường máu", "glucose", "hba1c", "tiểu đường", "đái tháo đường"],
        "chunk_terms": ["glucose", "hba1c", "diabetes"],
        "exact_terms": ["glucose", "hba1c"],
    },
    {
        "name": "liver",
        "aliases": ["gan", "men gan", "alt", "ast", "bilirubin"],
        "chunk_terms": ["liver", "alt", "ast", "bilirubin", "cmp"],
        "exact_terms": ["alt", "ast", "bilirubin"],
    },
    {
        "name": "kidney",
        "aliases": ["thận", "creatinine", "creatinin", "egfr", "albumin niệu", "nước tiểu albumin"],
        "chunk_terms": ["kidney", "creatinine", "egfr", "gfr", "albumin"],
        "exact_terms": ["creatinine", "creatinin", "egfr", "gfr"],
    },
    {
        "name": "urinalysis",
        "aliases": ["nước tiểu", "xét nghiệm nước tiểu", "tiểu buốt", "uti", "protein niệu", "protein"],
        "chunk_terms": ["urinalysis", "urine", "protein", "uti"],
        "exact_terms": ["urinalysis", "urine", "protein"],
    },
    {
        "name": "thyroid",
        "aliases": ["tuyến giáp", "tsh", "t3", "t4"],
        "chunk_terms": ["thyroid", "tsh", "t3", "t4"],
        "exact_terms": ["tsh", "t3", "t4"],
    },
    {
        "name": "cbc",
        "aliases": ["công thức máu", "cbc", "hồng cầu", "bạch cầu", "tiểu cầu", "thiếu máu", "nhiễm trùng"],
        "chunk_terms": ["cbc", "anemia", "infection", "blood_count", "complete blood count", "blood culture", "crp"],
        "exact_terms": ["cbc", "wbc", "rbc", "platelet", "hemoglobin"],
    },
    {
        "name": "blood_culture",
        "aliases": ["cấy máu", "nhiễm khuẩn", "nhiễm trùng máu", "sốt cao", "rét run"],
        "chunk_terms": ["blood_culture", "blood culture", "infection", "crp", "inflammation"],
        "exact_terms": ["blood culture", "crp"],
    },
    {
        "name": "preparation",
        "aliases": ["nhịn ăn", "chuẩn bị xét nghiệm", "trước khi xét nghiệm", "sợ kim"],
        "chunk_terms": ["preparation", "prepare", "fasting", "lab_preparation"],
        "exact_terms": ["fasting", "prepare"],
    },
    {
        "name": "general_labs",
        "aliases": ["xét nghiệm tổng quát", "khám sức khỏe", "xét nghiệm máu", "tổng quát", "lấy máu"],
        "chunk_terms": ["general_lab", "blood_tests", "routine_blood", "test_meaning", "general_info"],
        "exact_terms": ["blood test", "blood tests"],
    },
]


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


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
    return topic_matches(str(chunk.get("topic") or ""), expected_topics(row))


def rr_at_5(chunks: list[dict[str, Any]], row: dict[str, Any]) -> float:
    for index, chunk in enumerate(chunks[:5], start=1):
        if relevant(chunk, row):
            return 1.0 / index
    return 0.0


def mean(values: list[float | bool]) -> float:
    return round(sum(float(value) for value in values) / max(1, len(values)), 4)


def detect_profiles(query: str) -> set[str]:
    text = normalize(query)
    profiles = set()
    for profile in TOPIC_PROFILES:
        if any(alias in text for alias in profile["aliases"]):
            profiles.add(profile["name"])
    return profiles


def chunk_haystack(chunk: dict[str, Any]) -> str:
    return normalize(" ".join(str(chunk.get(field) or "") for field in ["topic", "title", "medical_scope", "intended_use", "content", "chunk_text"]))


def chunk_profile_match(chunk: dict[str, Any], profile_name: str) -> tuple[bool, int]:
    profile = next((item for item in TOPIC_PROFILES if item["name"] == profile_name), None)
    if not profile:
        return False, 0
    text = chunk_haystack(chunk)
    hits = sum(1 for term in profile["chunk_terms"] if term in text)
    exact_hits = sum(1 for term in profile["exact_terms"] if term in text)
    return hits > 0, hits + exact_hits


def rerank_score(query: str, chunk: dict[str, Any], semantic_score: float) -> tuple[float, dict[str, Any]]:
    topic = str(chunk.get("topic") or "")
    query_text = normalize(query)
    profiles = detect_profiles(query)
    result_query = any(term in query_text for term in RESULT_QUERY_TERMS)
    urgent_query = any(term in query_text for term in URGENT_QUERY_TERMS)

    profile_boost = 0.0
    matched_profiles = []
    for profile in profiles:
        matched, strength = chunk_profile_match(chunk, profile)
        if matched:
            matched_profiles.append(profile)
            profile_boost += min(0.16, 0.07 + 0.025 * strength)

    exact_lab_boost = 0.0
    for profile in TOPIC_PROFILES:
        query_exact = [term for term in profile["exact_terms"] if term in query_text]
        if query_exact:
            matched, strength = chunk_profile_match(chunk, profile["name"])
            if matched:
                exact_lab_boost += min(0.12, 0.045 * len(query_exact) + 0.015 * strength)

    boundary_adjustment = 0.0
    if topic in RESULT_BOUNDARY_TOPICS and not result_query:
        boundary_adjustment = -0.15
    elif topic in RESULT_BOUNDARY_TOPICS and result_query:
        boundary_adjustment = 0.06

    urgent_adjustment = 0.0
    if topic in URGENT_TOPICS and urgent_query:
        urgent_adjustment = 0.1
    elif topic in URGENT_TOPICS and not urgent_query:
        urgent_adjustment = -0.1

    generic_penalty = 0.0
    if profiles and topic in {"test_meaning", "test_use", "general_info", "preparation"} and "preparation" not in profiles and "general_labs" not in profiles:
        generic_penalty = -0.05

    final = semantic_score + profile_boost + exact_lab_boost + boundary_adjustment + urgent_adjustment + generic_penalty
    return final, {
        "detected_profiles": sorted(profiles),
        "matched_profiles": sorted(matched_profiles),
        "profile_boost": round(profile_boost, 4),
        "exact_lab_boost": round(exact_lab_boost, 4),
        "boundary_adjustment": round(boundary_adjustment, 4),
        "urgent_adjustment": round(urgent_adjustment, 4),
        "generic_penalty": round(generic_penalty, 4),
    }


def summarize(details: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "count": len(details),
        "hit_at_1": mean([row["hit_at_1"] for row in details]),
        "hit_at_3": mean([row["hit_at_3"] for row in details]),
        "hit_at_5": mean([row["hit_at_5"] for row in details]),
        "mrr_at_5": mean([row["mrr_at_5"] for row in details]),
    }


def read_details(path: Path) -> dict[str, dict[str, str]]:
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return {row["id"]: row for row in csv.DictReader(handle)}


def compare_hit3(details: list[dict[str, Any]], previous: dict[str, dict[str, str]]) -> dict[str, int | None]:
    if not previous:
        return {"improved": None, "unchanged": None, "regressed": None}
    improved = unchanged = regressed = 0
    for row in details:
        old = str(previous.get(str(row["id"]), {}).get("hit_at_3", "")).lower() == "true"
        new = bool(row["hit_at_3"])
        if new and not old:
            improved += 1
        elif old == new:
            unchanged += 1
        else:
            regressed += 1
    return {"improved": improved, "unchanged": unchanged, "regressed": regressed}


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
    _embeddings = np.load(ARTIFACT_DIR / "chunk_embeddings.npy")
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

    topic_summary = summarize(details)
    baseline = load_json(BASELINE_REPORT_PATH).get("summary", {}) if BASELINE_REPORT_PATH.exists() else {}
    rerank14 = load_json(RERANK14_REPORT_PATH).get("rerank", {}) if RERANK14_REPORT_PATH.exists() else {}
    delta_baseline = {key: round(topic_summary[key] - float(baseline[key]), 4) for key in ["hit_at_1", "hit_at_3", "hit_at_5", "mrr_at_5"] if key in baseline}
    delta_14 = {key: round(topic_summary[key] - float(rerank14[key]), 4) for key in ["hit_at_1", "hit_at_3", "hit_at_5", "mrr_at_5"] if key in rerank14}
    report = {
        "report_name": "retriever_v1_4_topic_rerank_eval_report",
        "mode": "offline_topic_aware_rerank_experiment_only",
        "baseline_v2": baseline,
        "rerank_4a14": rerank14,
        "topic_rerank": topic_summary,
        "delta_vs_baseline_v2": delta_baseline,
        "delta_vs_rerank_4a14": delta_14,
        "case_comparison_hit_at_3_vs_baseline_v2": compare_hit3(details, read_details(BASELINE_DETAILS_PATH)),
        "case_comparison_hit_at_3_vs_rerank_4a14": compare_hit3(details, read_details(RERANK14_DETAILS_PATH)),
        "warning_count": 0,
        "error_count": 0,
        "top_k_retrieve": TOP_K_RETRIEVE,
        "top_k_output": TOP_K_OUTPUT,
        "latency_ms": round((time.perf_counter() - started) * 1000, 2),
    }
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write_csv(details)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
