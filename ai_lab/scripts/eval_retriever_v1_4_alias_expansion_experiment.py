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
BASELINE_REPORT_PATH = ROOT / "ai_lab" / "reports" / "retriever_v1_4_offline_eval_report_v2.json"
RERANK14_REPORT_PATH = ROOT / "ai_lab" / "reports" / "retriever_v1_4_rerank_eval_report.json"
TOPIC_RERANK15_REPORT_PATH = ROOT / "ai_lab" / "reports" / "retriever_v1_4_topic_rerank_eval_report.json"
REPORT_PATH = ROOT / "ai_lab" / "reports" / "retriever_v1_4_alias_expansion_eval_report.json"
DETAILS_PATH = ROOT / "ai_lab" / "reports" / "retriever_v1_4_alias_expansion_eval_details.csv"

TOP_K = 20
OUT_K = 20

ALIAS_MAP = {
    "cbc": {
        "aliases": ["thiếu máu", "công thức máu", "cbc", "hồng cầu", "bạch cầu", "tiểu cầu", "nhiễm trùng"],
        "expansion": "complete blood count CBC anemia red blood cells white blood cells platelets hemoglobin infection",
    },
    "glucose": {
        "aliases": ["đường huyết", "đường máu", "tiểu đường", "đái tháo đường", "hba1c", "glucose"],
        "expansion": "blood glucose fasting glucose HbA1c diabetes screening blood sugar",
    },
    "lipid": {
        "aliases": ["mỡ máu", "cholesterol", "triglyceride", "lipid"],
        "expansion": "lipid panel cholesterol triglycerides HDL LDL cardiovascular risk",
    },
    "liver": {
        "aliases": ["gan", "men gan", "alt", "ast", "bilirubin"],
        "expansion": "liver function tests ALT AST bilirubin liver enzymes comprehensive metabolic panel",
    },
    "kidney": {
        "aliases": ["thận", "creatinine", "creatinin", "egfr", "chức năng thận"],
        "expansion": "kidney function creatinine eGFR GFR renal panel kidney tests",
    },
    "urine": {
        "aliases": ["nước tiểu", "albumin niệu", "protein niệu", "uti", "tiểu buốt"],
        "expansion": "urinalysis urine albumin protein urine UTI microalbumin creatinine ratio",
    },
    "thyroid": {
        "aliases": ["tuyến giáp", "tsh", "t3", "t4"],
        "expansion": "thyroid tests TSH T4 T3 thyroid stimulating hormone thyroxine",
    },
    "general_blood": {
        "aliases": ["xét nghiệm tổng quát", "khám sức khỏe", "xét nghiệm máu", "tổng quát", "lấy máu"],
        "expansion": "blood tests routine blood testing general health checkup lab tests preparation",
    },
}


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


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


def expansion_for(query: str) -> tuple[str, list[str]]:
    q = query.lower()
    groups = [name for name, spec in ALIAS_MAP.items() if any(alias in q for alias in spec["aliases"])]
    expansions = [ALIAS_MAP[name]["expansion"] for name in groups]
    if not expansions:
        return query, []
    return f"{query} {' '.join(expansions)}", groups


def search(model: Any, index: Any, config: dict[str, Any], chunks: list[dict[str, Any]], query: str, k: int = TOP_K) -> list[dict[str, Any]]:
    with contextlib.redirect_stdout(io.StringIO()):
        emb = model.encode(
            [config.get("query_prefix", "query: ") + query],
            convert_to_numpy=True,
            normalize_embeddings=bool(config.get("normalized", True)),
            show_progress_bar=False,
        ).astype("float32")
    scores, indices = index.search(emb, k)
    results = []
    for rank, (score, idx) in enumerate(zip(scores[0], indices[0]), 1):
        if idx < 0:
            continue
        item = dict(chunks[int(idx)])
        item["_rank"] = rank
        item["_score"] = float(score)
        results.append(item)
    return results


def rrf_fuse(original: list[dict[str, Any]], expanded: list[dict[str, Any]], k: int = 60) -> list[dict[str, Any]]:
    by_id: dict[str, dict[str, Any]] = {}
    scores: dict[str, float] = {}
    for result_set in [original, expanded]:
        for rank, item in enumerate(result_set, 1):
            key = str(item.get("chunk_id") or item.get("kb_id"))
            by_id.setdefault(key, item)
            scores[key] = scores.get(key, 0.0) + 1.0 / (k + rank)
    fused = []
    for key, item in by_id.items():
        row = dict(item)
        row["_score"] = scores[key]
        fused.append(row)
    return sorted(fused, key=lambda item: item["_score"], reverse=True)[:OUT_K]


def metrics(details: list[dict[str, Any]], prefix: str) -> dict[str, Any]:
    return {
        "count": len(details),
        "hit_at_1": mean([row[f"{prefix}_hit_1"] for row in details]),
        "hit_at_3": mean([row[f"{prefix}_hit_3"] for row in details]),
        "hit_at_5": mean([row[f"{prefix}_hit_5"] for row in details]),
        "hit_at_10": mean([row[f"{prefix}_hit_10"] for row in details]),
        "hit_at_20": mean([row[f"{prefix}_hit_20"] for row in details]),
        "mrr_at_5": mean([row[f"{prefix}_mrr_5"] for row in details]),
        "topic_missing_top20_count": sum(not row[f"{prefix}_hit_20"] for row in details),
        "topic_present_top20_but_missed_top3_count": sum(row[f"{prefix}_hit_20"] and not row[f"{prefix}_hit_3"] for row in details),
        "likely_alias_gap_remaining_count": sum((not row[f"{prefix}_hit_20"]) and bool(row["alias_groups"]) for row in details),
    }


def summarize_result(results: list[dict[str, Any]], row: dict[str, Any], prefix: str) -> dict[str, Any]:
    return {
        f"{prefix}_hit_1": any(relevant(c, row) for c in results[:1]),
        f"{prefix}_hit_3": any(relevant(c, row) for c in results[:3]),
        f"{prefix}_hit_5": any(relevant(c, row) for c in results[:5]),
        f"{prefix}_hit_10": any(relevant(c, row) for c in results[:10]),
        f"{prefix}_hit_20": any(relevant(c, row) for c in results[:20]),
        f"{prefix}_mrr_5": round(rr_at_5(results, row), 4),
        f"{prefix}_top_5_topics": ";".join(str(c.get("topic") or "") for c in results[:5]),
        f"{prefix}_top_20_topics": ";".join(str(c.get("topic") or "") for c in results[:20]),
    }


def delta(new: dict[str, Any], old: dict[str, Any]) -> dict[str, Any]:
    keys = ["hit_at_1", "hit_at_3", "hit_at_5", "hit_at_10", "hit_at_20", "mrr_at_5"]
    return {key: round(float(new[key]) - float(old[key]), 4) for key in keys if key in old and key in new}


def main() -> None:
    started = time.perf_counter()
    with contextlib.redirect_stdout(io.StringIO()):
        import faiss  # type: ignore
        from sentence_transformers import SentenceTransformer  # type: ignore

    config = load_json(ARTIFACT_DIR / "embedding_config.json")
    chunks = load_json(ARTIFACT_DIR / "kb_chunks_v1_4.json")
    index = faiss.read_index(str(ARTIFACT_DIR / "faiss.index"))
    eval_rows = load_jsonl(EVAL_PATH)
    with contextlib.redirect_stdout(io.StringIO()):
        model = SentenceTransformer(config["model_name"])

    details = []
    for row in eval_rows:
        query = str(row.get("query") or "")
        expanded_query, groups = expansion_for(query)
        original = search(model, index, config, chunks, query)
        expanded = search(model, index, config, chunks, expanded_query)
        fused = rrf_fuse(original, expanded)
        details.append({
            "id": row.get("id"),
            "category": row.get("category", ""),
            "query": query,
            "expected_topic": row.get("expected_topic", ""),
            "acceptable_topics": ";".join(expected_topics(row)),
            "alias_groups": ";".join(groups),
            **summarize_result(expanded, row, "expanded"),
            **summarize_result(fused, row, "fusion"),
        })

    expanded_metrics = metrics(details, "expanded")
    fusion_metrics = metrics(details, "fusion")
    baseline = load_json(BASELINE_REPORT_PATH).get("summary", {}) if BASELINE_REPORT_PATH.exists() else {}
    rerank14 = load_json(RERANK14_REPORT_PATH).get("rerank", {}) if RERANK14_REPORT_PATH.exists() else {}
    topic15 = load_json(TOPIC_RERANK15_REPORT_PATH).get("topic_rerank", {}) if TOPIC_RERANK15_REPORT_PATH.exists() else {}
    interpretation = {
        "candidate_generation_improved": fusion_metrics["hit_at_20"] > float(baseline.get("hit_at_5", 0)),
        "note": "If hit_at_20 improves, alias expansion is helping candidate generation; if not, inspect corpus/topic metadata/eval labels.",
    }
    report = {
        "report_name": "retriever_v1_4_alias_expansion_eval_report",
        "mode": "offline_alias_expansion_experiment_only",
        "baseline_v2": baseline,
        "rerank_4a14": rerank14,
        "topic_rerank_4a15": topic15,
        "expanded_query_single_search": expanded_metrics,
        "multi_query_fusion": fusion_metrics,
        "delta_expanded_vs_baseline_v2": delta(expanded_metrics, baseline),
        "delta_fusion_vs_baseline_v2": delta(fusion_metrics, baseline),
        "delta_fusion_vs_topic_rerank_4a15": delta(fusion_metrics, topic15),
        "warning_count": 0,
        "error_count": 0,
        "interpretation": interpretation,
        "latency_ms": round((time.perf_counter() - started) * 1000, 2),
    }
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    headers = list(details[0].keys()) if details else []
    with DETAILS_PATH.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers)
        writer.writeheader()
        writer.writerows(details)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"error_count": 1, "errors": [str(exc)]}, ensure_ascii=False, indent=2))
        sys.exit(1)
