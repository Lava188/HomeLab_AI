#!/usr/bin/env python
from __future__ import annotations

import csv
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
REPORT_V2_PATH = ROOT / "ai_lab" / "reports" / "retriever_v1_4_offline_eval_report_v2.json"
DETAILS_V2_PATH = ROOT / "ai_lab" / "reports" / "retriever_v1_4_offline_eval_details_v2.csv"
EVAL_V2_PATH = ROOT / "ai_lab" / "datasets" / "eval" / "retriever_v1_4_batch4a_vi_eval_v2.jsonl"
CHUNKS_PATH = ROOT / "ai_lab" / "artifacts" / "retriever_v1_4" / "kb_chunks_v1_4.json"
METADATA_PATH = ROOT / "ai_lab" / "artifacts" / "retriever_v1_4" / "chunk_metadata.json"
AUDIT_REPORT_PATH = ROOT / "ai_lab" / "reports" / "retriever_v1_4_eval_v2_failure_audit_report.json"
AUDIT_EXAMPLES_PATH = ROOT / "ai_lab" / "reports" / "retriever_v1_4_eval_v2_failure_audit_examples.csv"

RESULT_BOUNDARY_TOPICS = {"result_interpretation", "test_result_explainer", "medical_result_explanation_boundary", "results"}
URGENT_TOPICS = {"red_flag_general", "red_flag_signs", "emergency_warning", "urgent_advice", "safety_boundary"}
RELATED_LAB_GROUPS = [
    {"general_lab_tests_blood_tests", "general_lab_tests_routine_blood_testing", "lab_preparation_fasting", "test_meaning", "test_use", "preparation"},
    {"cbc_anemia_infection_basics", "inflammation_infection_context", "infection_testing_blood_culture"},
    {"glucose_fasting_blood_glucose_diabetes_screening", "hba1c_diabetes_monitoring_screening", "glucose_hba1c_diabetes_screening"},
    {"lipid_panel_cholesterol", "lipid_panel_triglycerides"},
    {"kidney_function_creatinine_egfr", "kidney_function_egfr", "urine_albumin_kidney_monitoring", "urine_albumin_ckd_screening_context", "urinalysis_urine_protein_glucose_uti_kidney_context"},
    {"tsh_thyroid_screening", "t4_thyroid_testing", "thyroid_tests_tsh_t4_t3"},
]
VI_ALIAS_HINTS = {
    "cbc_anemia_infection_basics": ["thiếu máu", "công thức máu", "bạch cầu", "chóng mặt", "da xanh"],
    "glucose_hba1c_diabetes_screening": ["tiểu đường", "đường huyết", "đường máu", "khát nước", "tiểu nhiều"],
    "hba1c_diabetes_monitoring_screening": ["hba1c", "đường huyết"],
    "lipid_panel_cholesterol": ["mỡ máu", "cholesterol", "tim mạch"],
    "liver_function_alt_ast_bilirubin": ["men gan", "gan", "alt", "ast", "vàng da"],
    "kidney_function_creatinine_egfr": ["thận", "creatinine", "egfr"],
    "urinalysis_urine_protein_glucose_uti_kidney_context": ["nước tiểu", "protein"],
    "tsh_thyroid_screening": ["tuyến giáp", "tsh", "lạnh người", "rụng tóc"],
    "general_lab_tests_blood_tests": ["tổng quát", "xét nghiệm máu", "khám sức khỏe"],
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


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def bool_value(value: Any) -> bool:
    return str(value).strip().lower() == "true"


def split_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item) for item in value if str(item).strip()]
    return [part for part in str(value or "").split(";") if part]


def normalize(value: Any) -> str:
    return str(value or "").lower().strip()


def topic_related(expected_topics: set[str], top_topics: set[str]) -> bool:
    for group in RELATED_LAB_GROUPS:
        if expected_topics & group and top_topics & group:
            return True
    return False


def build_chunk_lookup(chunks: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    lookup = {}
    for chunk in chunks:
        for key in [chunk.get("kb_id"), chunk.get("chunk_id")]:
            if key:
                lookup[str(key)] = chunk
    return lookup


def corpus_has_alias(expected_topics: set[str], query: str, chunks: list[dict[str, Any]]) -> bool:
    lowered_query = normalize(query)
    relevant_aliases = []
    for topic in expected_topics:
        relevant_aliases.extend(VI_ALIAS_HINTS.get(topic, []))
    query_aliases = [alias for alias in relevant_aliases if alias in lowered_query]
    if not query_aliases:
        return True

    candidate_text = "\n".join(
        normalize(chunk.get("chunk_text") or chunk.get("content") or "")
        for chunk in chunks
        if chunk.get("topic") in expected_topics
    )
    return any(alias in candidate_text for alias in query_aliases)


def classify_failure(row: dict[str, str], eval_row: dict[str, Any], chunks: list[dict[str, Any]]) -> str:
    expected_topics = set(split_list(eval_row.get("acceptable_topics")) or [str(eval_row.get("expected_topic") or "")])
    expected_topics.discard("")
    top_topics = set(split_list(row.get("top_5_topics")))
    top3_topics = set(split_list(row.get("top_5_topics"))[:3])
    top_domains = set(split_list(row.get("top_5_domains"))[:3])
    expected_domains = set(split_list(eval_row.get("acceptable_domains")) or split_list(eval_row.get("expected_domain")))
    category = normalize(row.get("category"))

    if eval_row.get("label_alignment") is None or not expected_topics:
        return "eval_label_still_ambiguous"
    if expected_domains and top_domains & expected_domains and not top3_topics & expected_topics:
        if top3_topics & RESULT_BOUNDARY_TOPICS:
            return "result_boundary_overdominates"
        return "acceptable_broad_domain_but_wrong_topic"
    if top3_topics & RESULT_BOUNDARY_TOPICS and category not in {"booking_separation"}:
        return "result_boundary_overdominates"
    if topic_related(expected_topics, top3_topics):
        return "topic_drift_to_related_lab"
    if top3_topics & URGENT_TOPICS and category != "urgent_override":
        return "topic_drift_to_related_lab"
    if not corpus_has_alias(expected_topics, row.get("query", ""), chunks):
        return "chunk_text_missing_vietnamese_terms"
    if any(alias in normalize(row.get("query")) for topic in expected_topics for alias in VI_ALIAS_HINTS.get(topic, [])):
        return "query_needs_vietnamese_alias_or_synonym"
    if not any(chunk.get("topic") in expected_topics for chunk in chunks):
        return "corpus_gap_true_missing_knowledge"
    return "other"


def suggested_fix_plan(reason_counts: Counter[str]) -> list[dict[str, Any]]:
    plan = []
    if reason_counts.get("result_boundary_overdominates", 0):
        plan.append({
            "priority": 1,
            "area": "retrieval_text_weighting",
            "suggestion": "Reduce generic result-boundary dominance in chunk_text or add topic-specific aliases so broad result explainer chunks stop outranking lab-specific chunks.",
            "affected_failures": reason_counts["result_boundary_overdominates"],
        })
    if reason_counts.get("chunk_text_missing_vietnamese_terms", 0) or reason_counts.get("query_needs_vietnamese_alias_or_synonym", 0):
        plan.append({
            "priority": 2,
            "area": "vietnamese_alias_layer",
            "suggestion": "Add source-backed retrieval aliases/metadata for Vietnamese user terms such as mỡ máu, đường huyết, thiếu máu, men gan, thận, nước tiểu, tuyến giáp without changing medical claims.",
            "affected_failures": reason_counts.get("chunk_text_missing_vietnamese_terms", 0) + reason_counts.get("query_needs_vietnamese_alias_or_synonym", 0),
        })
    if reason_counts.get("topic_drift_to_related_lab", 0) or reason_counts.get("acceptable_broad_domain_but_wrong_topic", 0):
        plan.append({
            "priority": 3,
            "area": "topic_reranking",
            "suggestion": "Add offline reranking/eval experiments using expected topic/category metadata to separate closely related lab topics before runtime promotion.",
            "affected_failures": reason_counts.get("topic_drift_to_related_lab", 0) + reason_counts.get("acceptable_broad_domain_but_wrong_topic", 0),
        })
    if reason_counts.get("eval_label_still_ambiguous", 0):
        plan.append({
            "priority": 4,
            "area": "eval_label_review",
            "suggestion": "Manually review unresolved/ambiguous eval rows before using them as hard retrieval labels.",
            "affected_failures": reason_counts["eval_label_still_ambiguous"],
        })
    if reason_counts.get("corpus_gap_true_missing_knowledge", 0):
        plan.append({
            "priority": 5,
            "area": "kb_expansion",
            "suggestion": "Only after label/alias/reranking checks, add new source-backed KB if a topic is truly absent.",
            "affected_failures": reason_counts["corpus_gap_true_missing_knowledge"],
        })
    return plan


def write_examples(rows: list[dict[str, Any]]) -> None:
    headers = [
        "id", "query", "category", "expected_topic", "acceptable_topics",
        "top_1_kb_id", "top_1_topic", "top_1_domain", "top_1_score",
        "top_5_kb_ids", "top_5_topics", "top_5_domains", "failure_reason",
        "diagnostic_note",
    ]
    with AUDIT_EXAMPLES_PATH.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers)
        writer.writeheader()
        for row in rows:
            writer.writerow({header: row.get(header, "") for header in headers})


def main() -> None:
    report_v2 = load_json(REPORT_V2_PATH)
    details = read_csv(DETAILS_V2_PATH)
    eval_rows = load_jsonl(EVAL_V2_PATH)
    chunks = load_json(CHUNKS_PATH)
    _metadata = load_json(METADATA_PATH)
    eval_by_id = {str(row.get("id")): row for row in eval_rows}

    failed_at_3 = [row for row in details if not bool_value(row.get("hit_at_3"))]
    reason_counts: Counter[str] = Counter()
    category_counts: Counter[str] = Counter()
    confused_pairs: Counter[str] = Counter()
    audited_failures: list[dict[str, Any]] = []

    for row in failed_at_3:
        eval_row = eval_by_id.get(str(row.get("id")), {})
        reason = classify_failure(row, eval_row, chunks)
        reason_counts[reason] += 1
        category_counts[row.get("category") or "missing"] += 1
        expected_topic = str(eval_row.get("expected_topic") or row.get("expected_topic") or "")
        confused_pairs[f"{expected_topic} -> {row.get('top_1_topic') or 'missing'}"] += 1
        diagnostic_note = {
            "eval_label_still_ambiguous": "Aligned labels are still absent or too broad.",
            "query_needs_vietnamese_alias_or_synonym": "Vietnamese query term likely needs explicit alias support.",
            "chunk_text_missing_vietnamese_terms": "Expected topic exists, but relevant chunks may not contain common Vietnamese aliases used by query.",
            "topic_drift_to_related_lab": "Top results are related medical/lab topics but not the expected topic.",
            "result_boundary_overdominates": "Generic result interpretation/safety boundary chunks outrank topic-specific chunks.",
            "corpus_gap_true_missing_knowledge": "Expected topic appears absent from corpus.",
            "acceptable_broad_domain_but_wrong_topic": "Domain is acceptable, but topic is wrong within that domain.",
            "other": "Needs manual inspection.",
        }[reason]
        audited_failures.append({
            "id": row.get("id"),
            "query": row.get("query"),
            "category": row.get("category"),
            "expected_topic": expected_topic,
            "acceptable_topics": ";".join(split_list(eval_row.get("acceptable_topics"))),
            "top_1_kb_id": row.get("top_1_kb_id"),
            "top_1_topic": row.get("top_1_topic"),
            "top_1_domain": row.get("top_1_domain"),
            "top_1_score": row.get("top_1_score"),
            "top_5_kb_ids": row.get("top_5_kb_ids"),
            "top_5_topics": row.get("top_5_topics"),
            "top_5_domains": row.get("top_5_domains"),
            "failure_reason": reason,
            "diagnostic_note": diagnostic_note,
        })

    important_examples = sorted(
        audited_failures,
        key=lambda row: (
            -reason_counts[row["failure_reason"]],
            -category_counts[row.get("category") or "missing"],
            row.get("id") or "",
        ),
    )[:10]
    write_examples(important_examples)

    summary = {
        "total_eval_rows": report_v2.get("summary", {}).get("count", len(details)),
        "hit_at_1": report_v2.get("summary", {}).get("hit_at_1"),
        "hit_at_3": report_v2.get("summary", {}).get("hit_at_3"),
        "hit_at_5": report_v2.get("summary", {}).get("hit_at_5"),
        "failed_at_3_count": len(failed_at_3),
        "reason_counts": dict(reason_counts),
        "top_failed_categories": dict(category_counts.most_common(10)),
        "top_confused_topic_pairs": dict(confused_pairs.most_common(15)),
        "label_or_eval_error_count": reason_counts.get("eval_label_still_ambiguous", 0),
        "vietnamese_alias_error_count": reason_counts.get("query_needs_vietnamese_alias_or_synonym", 0) + reason_counts.get("chunk_text_missing_vietnamese_terms", 0),
        "topic_drift_error_count": reason_counts.get("topic_drift_to_related_lab", 0) + reason_counts.get("acceptable_broad_domain_but_wrong_topic", 0) + reason_counts.get("result_boundary_overdominates", 0),
        "corpus_gap_true_missing_knowledge_count": reason_counts.get("corpus_gap_true_missing_knowledge", 0),
    }
    audit_report = {
        "report_name": "retriever_v1_4_eval_v2_failure_audit_report",
        "inputs": {
            "eval_report_v2": "ai_lab/reports/retriever_v1_4_offline_eval_report_v2.json",
            "eval_details_v2": "ai_lab/reports/retriever_v1_4_offline_eval_details_v2.csv",
            "eval_v2": "ai_lab/datasets/eval/retriever_v1_4_batch4a_vi_eval_v2.jsonl",
            "chunks": "ai_lab/artifacts/retriever_v1_4/kb_chunks_v1_4.json",
            "metadata": "ai_lab/artifacts/retriever_v1_4/chunk_metadata.json",
        },
        "summary": summary,
        "suggested_fix_plan": suggested_fix_plan(reason_counts),
        "important_examples": important_examples,
        "examples_csv": "ai_lab/reports/retriever_v1_4_eval_v2_failure_audit_examples.csv",
        "all_failed_at_3": audited_failures,
    }
    AUDIT_REPORT_PATH.write_text(json.dumps(audit_report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"error_count": 1, "errors": [str(exc)]}, ensure_ascii=False, indent=2))
        sys.exit(1)
