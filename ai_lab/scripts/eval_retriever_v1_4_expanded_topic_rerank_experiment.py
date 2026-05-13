#!/usr/bin/env python
from __future__ import annotations

import contextlib
import csv
import io
import json
import argparse
import sys
import time
from pathlib import Path
from typing import Any

import numpy as np


ROOT = Path(__file__).resolve().parents[2]
ARTIFACT_DIR = ROOT / "ai_lab" / "artifacts" / "retriever_v1_4"
DEFAULT_EVAL_PATH = ROOT / "ai_lab" / "datasets" / "eval" / "retriever_v1_4_batch4a_vi_eval_v2.jsonl"
BASELINE_REPORT_PATH = ROOT / "ai_lab" / "reports" / "retriever_v1_4_offline_eval_report_v2.json"
TOPIC_RERANK_REPORT_PATH = ROOT / "ai_lab" / "reports" / "retriever_v1_4_topic_rerank_eval_report.json"
TOPIC_RERANK_DETAILS_PATH = ROOT / "ai_lab" / "reports" / "retriever_v1_4_topic_rerank_eval_details.csv"
ALIAS_REPORT_PATH = ROOT / "ai_lab" / "reports" / "retriever_v1_4_alias_expansion_eval_report.json"
ALIAS_DETAILS_PATH = ROOT / "ai_lab" / "reports" / "retriever_v1_4_alias_expansion_eval_details.csv"
REPORT_PATH = ROOT / "ai_lab" / "reports" / "retriever_v1_4_expanded_topic_rerank_eval_report.json"
DETAILS_PATH = ROOT / "ai_lab" / "reports" / "retriever_v1_4_expanded_topic_rerank_eval_details.csv"

TOP_K_RETRIEVE = 20
TOP_K_OUTPUT = 20

RESULT_BOUNDARY_TOPICS = {"result_interpretation", "test_result_explainer", "medical_result_explanation_boundary", "results"}
URGENT_TOPICS = {"red_flag_general", "red_flag_signs", "emergency_warning", "urgent_advice", "safety_boundary"}
RESULT_QUERY_TERMS = ["kết quả", "chỉ số", "cao", "thấp", "bất thường", "đọc", "giải thích", "có chắc", "chắc là"]
URGENT_QUERY_TERMS = ["đau ngực", "khó thở", "vã mồ hôi", "ngất", "lú lẫn", "môi tím", "lả", "xấu đi nhanh", "lan ra tay", "cấp cứu", "nói không ra câu"]

TOPIC_PROFILES = [
    {"name": "lipid", "aliases": ["mỡ máu", "cholesterol", "triglyceride", "triglycerides", "lipid"], "chunk_terms": ["lipid", "cholesterol", "triglyceride"], "exact_terms": ["cholesterol", "triglyceride", "triglycerides", "lipid"], "expansion": "lipid panel cholesterol triglycerides HDL LDL cardiovascular risk"},
    {"name": "glucose_hba1c", "aliases": ["đường huyết", "đường máu", "glucose", "hba1c", "tiểu đường", "đái tháo đường"], "chunk_terms": ["glucose", "hba1c", "diabetes"], "exact_terms": ["glucose", "hba1c"], "expansion": "blood glucose fasting glucose HbA1c diabetes screening blood sugar"},
    {"name": "liver", "aliases": ["gan", "men gan", "alt", "ast", "bilirubin"], "chunk_terms": ["liver", "alt", "ast", "bilirubin", "cmp"], "exact_terms": ["alt", "ast", "bilirubin"], "expansion": "liver function tests ALT AST bilirubin liver enzymes comprehensive metabolic panel"},
    {"name": "kidney", "aliases": ["thận", "creatinine", "creatinin", "egfr", "chức năng thận"], "chunk_terms": ["kidney", "creatinine", "egfr", "gfr", "albumin"], "exact_terms": ["creatinine", "creatinin", "egfr", "gfr"], "expansion": "kidney function creatinine eGFR GFR renal panel kidney tests"},
    {"name": "urinalysis", "aliases": ["nước tiểu", "xét nghiệm nước tiểu", "tiểu buốt", "uti", "protein niệu", "albumin niệu", "protein"], "chunk_terms": ["urinalysis", "urine", "protein", "uti", "albumin"], "exact_terms": ["urinalysis", "urine", "protein"], "expansion": "urinalysis urine albumin protein urine UTI microalbumin creatinine ratio"},
    {"name": "thyroid", "aliases": ["tuyến giáp", "tsh", "t3", "t4"], "chunk_terms": ["thyroid", "tsh", "t3", "t4"], "exact_terms": ["tsh", "t3", "t4"], "expansion": "thyroid tests TSH T4 T3 thyroid stimulating hormone thyroxine"},
    {"name": "cbc", "aliases": ["công thức máu", "cbc", "hồng cầu", "bạch cầu", "tiểu cầu", "thiếu máu", "nhiễm trùng"], "chunk_terms": ["cbc", "anemia", "infection", "blood_count", "complete blood count", "blood culture", "crp"], "exact_terms": ["cbc", "wbc", "rbc", "platelet", "hemoglobin"], "expansion": "complete blood count CBC anemia red blood cells white blood cells platelets hemoglobin infection CRP blood culture"},
    {"name": "preparation", "aliases": ["nhịn ăn", "chuẩn bị xét nghiệm", "trước khi xét nghiệm", "sợ kim"], "chunk_terms": ["preparation", "prepare", "fasting", "lab_preparation"], "exact_terms": ["fasting", "prepare"], "expansion": "lab test preparation fasting before blood test needle anxiety"},
    {"name": "general_labs", "aliases": ["xét nghiệm tổng quát", "khám sức khỏe", "xét nghiệm máu", "tổng quát", "lấy máu"], "chunk_terms": ["general_lab", "blood_tests", "routine_blood", "test_meaning", "general_info"], "exact_terms": ["blood test", "blood tests"], "expansion": "blood tests routine blood testing general health checkup lab tests preparation"},
]


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Offline expanded-query + topic rerank eval for retriever v1_4.")
    parser.add_argument("--eval", default=str(DEFAULT_EVAL_PATH), help="Eval JSONL path.")
    parser.add_argument("--suffix", default="", help="Optional output suffix, e.g. heldout_v3.")
    return parser.parse_args()


def resolve_path(value: str) -> Path:
    path = Path(value)
    return path if path.is_absolute() else ROOT / path


def output_paths(suffix: str) -> tuple[Path, Path]:
    clean = str(suffix or "").strip().strip("_")
    suffix_part = f"_{clean}" if clean else ""
    return (
        ROOT / "ai_lab" / "reports" / f"retriever_v1_4_expanded_topic_rerank_eval_report{suffix_part}.json",
        ROOT / "ai_lab" / "reports" / f"retriever_v1_4_expanded_topic_rerank_eval_details{suffix_part}.csv",
    )


def as_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item) for item in value if str(item).strip()]
    if value:
        return [str(value)]
    return []


def normalize(value: Any) -> str:
    return str(value or "").lower().replace("-", "_").replace(" ", "_").strip("_")


def expected_topics(row: dict[str, Any]) -> list[str]:
    out = []
    for item in as_list(row.get("expected_topic")) + as_list(row.get("acceptable_topics")):
        if item not in out:
            out.append(item)
    return out


def topic_match(topic: str, expected: list[str]) -> bool:
    actual = normalize(topic)
    return any(actual == normalize(exp) or actual in normalize(exp) or normalize(exp) in actual for exp in expected)


def relevant(chunk: dict[str, Any], row: dict[str, Any]) -> bool:
    return topic_match(str(chunk.get("topic") or ""), expected_topics(row))


def rr_at_5(chunks: list[dict[str, Any]], row: dict[str, Any]) -> float:
    for i, chunk in enumerate(chunks[:5], 1):
        if relevant(chunk, row):
            return 1.0 / i
    return 0.0


def mean(values: list[float | bool]) -> float:
    return round(sum(float(v) for v in values) / max(1, len(values)), 4)


def detected_profiles(query: str) -> set[str]:
    text = query.lower()
    return {p["name"] for p in TOPIC_PROFILES if any(alias in text for alias in p["aliases"])}


def expanded_query(query: str) -> tuple[str, list[str]]:
    profiles = [p for p in TOPIC_PROFILES if p["name"] in detected_profiles(query)]
    if not profiles:
        return query, []
    return f"{query} {' '.join(p['expansion'] for p in profiles)}", [p["name"] for p in profiles]


def haystack(chunk: dict[str, Any]) -> str:
    return " ".join(str(chunk.get(f) or "") for f in ["topic", "title", "medical_scope", "intended_use", "content", "chunk_text"]).lower()


def chunk_profile_match(chunk: dict[str, Any], profile_name: str) -> tuple[bool, int]:
    profile = next((p for p in TOPIC_PROFILES if p["name"] == profile_name), None)
    if not profile:
        return False, 0
    text = haystack(chunk)
    hits = sum(1 for term in profile["chunk_terms"] if term in text)
    exact_hits = sum(1 for term in profile["exact_terms"] if term in text)
    return hits > 0, hits + exact_hits


def rerank_score(original_query: str, chunk: dict[str, Any], semantic_score: float) -> tuple[float, dict[str, Any]]:
    topic = str(chunk.get("topic") or "")
    query_text = original_query.lower()
    profiles = detected_profiles(original_query)
    result_query = any(term in query_text for term in RESULT_QUERY_TERMS)
    urgent_query = any(term in query_text for term in URGENT_QUERY_TERMS)
    profile_boost = 0.0
    matched = []
    for profile in profiles:
        ok, strength = chunk_profile_match(chunk, profile)
        if ok:
            matched.append(profile)
            profile_boost += min(0.18, 0.08 + 0.03 * strength)
    exact_boost = 0.0
    for profile in TOPIC_PROFILES:
        query_exact = [term for term in profile["exact_terms"] if term in query_text]
        if query_exact:
            ok, strength = chunk_profile_match(chunk, profile["name"])
            if ok:
                exact_boost += min(0.14, 0.05 * len(query_exact) + 0.02 * strength)
    boundary = 0.0
    if topic in RESULT_BOUNDARY_TOPICS and not result_query:
        boundary = -0.16
    elif topic in RESULT_BOUNDARY_TOPICS and result_query:
        boundary = 0.06
    urgent = 0.0
    if topic in URGENT_TOPICS and urgent_query:
        urgent = 0.1
    elif topic in URGENT_TOPICS and not urgent_query:
        urgent = -0.1
    generic = 0.0
    if profiles and topic in {"test_meaning", "test_use", "general_info", "preparation"} and "preparation" not in profiles and "general_labs" not in profiles:
        generic = -0.06
    final = semantic_score + profile_boost + exact_boost + boundary + urgent + generic
    return final, {
        "profiles": sorted(profiles),
        "matched_profiles": sorted(matched),
        "profile_boost": round(profile_boost, 4),
        "exact_boost": round(exact_boost, 4),
        "boundary": round(boundary, 4),
        "urgent": round(urgent, 4),
        "generic": round(generic, 4),
    }


def search(model: Any, index: Any, config: dict[str, Any], chunks: list[dict[str, Any]], query: str) -> list[dict[str, Any]]:
    with contextlib.redirect_stdout(io.StringIO()):
        emb = model.encode(
            [config.get("query_prefix", "query: ") + query],
            convert_to_numpy=True,
            normalize_embeddings=bool(config.get("normalized", True)),
            show_progress_bar=False,
        ).astype("float32")
    scores, indices = index.search(emb, TOP_K_RETRIEVE)
    out = []
    for score, idx in zip(scores[0], indices[0]):
        if idx < 0:
            continue
        chunk = dict(chunks[int(idx)])
        chunk["_semantic_score"] = float(score)
        out.append(chunk)
    return out


def summarize(details: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "count": len(details),
        "hit_at_1": mean([d["hit_at_1"] for d in details]),
        "hit_at_3": mean([d["hit_at_3"] for d in details]),
        "hit_at_5": mean([d["hit_at_5"] for d in details]),
        "hit_at_10": mean([d["hit_at_10"] for d in details]),
        "hit_at_20": mean([d["hit_at_20"] for d in details]),
        "mrr_at_5": mean([d["mrr_at_5"] for d in details]),
        "topic_missing_top20_count": sum(not d["hit_at_20"] for d in details),
        "topic_present_top20_but_missed_top3_count": sum(d["hit_at_20"] and not d["hit_at_3"] for d in details),
    }


def read_details(path: Path, hit_field: str = "hit_at_3") -> dict[str, bool]:
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return {row["id"]: str(row.get(hit_field, "")).lower() == "true" for row in csv.DictReader(handle)}


def compare(details: list[dict[str, Any]], previous: dict[str, bool]) -> dict[str, int | None]:
    if not previous:
        return {"improved": None, "unchanged": None, "regressed": None}
    improved = unchanged = regressed = 0
    for row in details:
        old = previous.get(str(row["id"]), False)
        new = bool(row["hit_at_3"])
        if new and not old:
            improved += 1
        elif new == old:
            unchanged += 1
        else:
            regressed += 1
    return {"improved": improved, "unchanged": unchanged, "regressed": regressed}


def delta(new: dict[str, Any], old: dict[str, Any]) -> dict[str, Any]:
    return {k: round(float(new[k]) - float(old[k]), 4) for k in ["hit_at_1", "hit_at_3", "hit_at_5", "mrr_at_5"] if k in new and k in old}


def main() -> None:
    args = parse_args()
    eval_path = resolve_path(args.eval)
    report_path, details_path = output_paths(args.suffix)
    started = time.perf_counter()
    with contextlib.redirect_stdout(io.StringIO()):
        import faiss  # type: ignore
        from sentence_transformers import SentenceTransformer  # type: ignore

    config = load_json(ARTIFACT_DIR / "embedding_config.json")
    chunks = load_json(ARTIFACT_DIR / "kb_chunks_v1_4.json")
    _embeddings = np.load(ARTIFACT_DIR / "chunk_embeddings.npy")
    index = faiss.read_index(str(ARTIFACT_DIR / "faiss.index"))
    eval_rows = load_jsonl(eval_path)
    with contextlib.redirect_stdout(io.StringIO()):
        model = SentenceTransformer(config["model_name"])

    details = []
    for row in eval_rows:
        query = str(row.get("query") or "")
        expanded, profiles = expanded_query(query)
        candidates = search(model, index, config, chunks, expanded)
        reranked = []
        for chunk in candidates:
            score, debug = rerank_score(query, chunk, float(chunk["_semantic_score"]))
            chunk["_rerank_score"] = score
            chunk["_debug"] = debug
            reranked.append(chunk)
        reranked = sorted(reranked, key=lambda c: c["_rerank_score"], reverse=True)[:TOP_K_OUTPUT]
        top1 = reranked[0] if reranked else {}
        details.append({
            "id": row.get("id"),
            "category": row.get("category", ""),
            "query": query,
            "expected_topic": row.get("expected_topic", ""),
            "acceptable_topics": ";".join(expected_topics(row)),
            "detected_profiles": ";".join(profiles),
            "hit_at_1": any(relevant(c, row) for c in reranked[:1]),
            "hit_at_3": any(relevant(c, row) for c in reranked[:3]),
            "hit_at_5": any(relevant(c, row) for c in reranked[:5]),
            "hit_at_10": any(relevant(c, row) for c in reranked[:10]),
            "hit_at_20": any(relevant(c, row) for c in reranked[:20]),
            "mrr_at_5": round(rr_at_5(reranked, row), 4),
            "top_1_kb_id": top1.get("kb_id", ""),
            "top_1_chunk_id": top1.get("chunk_id", ""),
            "top_1_topic": top1.get("topic", ""),
            "top_1_domain": top1.get("domain", ""),
            "top_1_score": "" if not top1 else round(float(top1.get("_rerank_score", 0)), 6),
            "top_1_semantic_score": "" if not top1 else round(float(top1.get("_semantic_score", 0)), 6),
            "top_5_kb_ids": ";".join(str(c.get("kb_id") or "") for c in reranked[:5]),
            "top_5_topics": ";".join(str(c.get("topic") or "") for c in reranked[:5]),
            "top_5_domains": ";".join(str(c.get("domain") or "") for c in reranked[:5]),
            "top_20_topics": ";".join(str(c.get("topic") or "") for c in reranked[:20]),
            "rerank_debug": json.dumps(top1.get("_debug", {}), ensure_ascii=False),
        })

    summary = summarize(details)
    baseline = load_json(BASELINE_REPORT_PATH).get("summary", {}) if BASELINE_REPORT_PATH.exists() else {}
    topic15_report = load_json(TOPIC_RERANK_REPORT_PATH) if TOPIC_RERANK_REPORT_PATH.exists() else {}
    topic15 = topic15_report.get("topic_rerank", {})
    alias17_report = load_json(ALIAS_REPORT_PATH) if ALIAS_REPORT_PATH.exists() else {}
    alias17 = alias17_report.get("expanded_query_single_search", {})
    report = {
        "report_name": "retriever_v1_4_expanded_topic_rerank_eval_report",
        "mode": "offline_expanded_query_plus_topic_rerank_experiment_only",
        "baseline_v2": baseline,
        "topic_rerank_4a15": topic15,
        "alias_expanded_single_search_4a17": alias17,
        "expanded_topic_rerank_4a18": summary,
        "delta_vs_baseline_v2": delta(summary, baseline),
        "delta_vs_topic_rerank_4a15": delta(summary, topic15),
        "delta_vs_alias_expanded_single_search_4a17": delta(summary, alias17),
        "case_comparison_hit_at_3_vs_4a17": compare(details, read_details(ALIAS_DETAILS_PATH, "expanded_hit_3")),
        "case_comparison_hit_at_3_vs_4a15": compare(details, read_details(Path(ROOT / "ai_lab/reports/retriever_v1_4_topic_rerank_eval_details.csv"))),
        "warning_count": 0,
        "error_count": 0,
        "top_k_retrieve": TOP_K_RETRIEVE,
        "top_k_output": TOP_K_OUTPUT,
        "eval_path": eval_path.relative_to(ROOT).as_posix() if eval_path.is_relative_to(ROOT) else str(eval_path),
        "latency_ms": round((time.perf_counter() - started) * 1000, 2),
    }
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    with details_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(details[0].keys()))
        writer.writeheader()
        writer.writerows(details)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"error_count": 1, "errors": [str(exc)]}, ensure_ascii=False, indent=2))
        sys.exit(1)
