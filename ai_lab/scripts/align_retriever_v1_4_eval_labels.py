#!/usr/bin/env python
from __future__ import annotations

import json
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
EVAL_INPUT_CANDIDATES = [
    ROOT / "ai_lab" / "datasets" / "eval" / "retriever_v1_4_batch4a_vi_eval.jsonl",
    ROOT / "ai_lab" / "evals" / "retriever_v1_4_batch4a_vi_eval.jsonl",
]
OUTPUT_EVAL_PATH = ROOT / "ai_lab" / "datasets" / "eval" / "retriever_v1_4_batch4a_vi_eval_v2.jsonl"
CHUNKS_PATH = ROOT / "ai_lab" / "artifacts" / "retriever_v1_4" / "kb_chunks_v1_4.json"
METADATA_PATH = ROOT / "ai_lab" / "artifacts" / "retriever_v1_4" / "chunk_metadata.json"
AUDIT_REPORT_PATH = ROOT / "ai_lab" / "reports" / "retriever_v1_4_eval_failure_audit_report.json"
ALIGNMENT_REPORT_PATH = ROOT / "ai_lab" / "reports" / "retriever_v1_4_eval_label_alignment_report.json"


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


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "\n".join(json.dumps(row, ensure_ascii=False) for row in rows) + "\n",
        encoding="utf-8",
    )


def find_eval_input() -> Path:
    for path in EVAL_INPUT_CANDIDATES:
        if path.exists():
            return path
    raise FileNotFoundError(
        "Missing source eval file. Checked: "
        + ", ".join(path.relative_to(ROOT).as_posix() for path in EVAL_INPUT_CANDIDATES)
    )


def normalize(value: Any) -> str:
    return str(value or "").lower().strip()


def topic_exists(topic: str, corpus_topics: set[str]) -> bool:
    return topic in corpus_topics


def existing_topics(candidates: list[str], corpus_topics: set[str]) -> list[str]:
    return [topic for topic in candidates if topic_exists(topic, corpus_topics)]


def build_topic_domains(chunks: list[dict[str, Any]], metadata: list[dict[str, Any]]) -> dict[str, list[str]]:
    domains_by_topic: dict[str, set[str]] = defaultdict(set)
    for row in [*chunks, *metadata]:
        topic = row.get("topic")
        domain = row.get("domain")
        if topic and domain:
            domains_by_topic[str(topic)].add(str(domain))
    return {topic: sorted(domains) for topic, domains in domains_by_topic.items()}


def add_if_keyword(text: str, keyword: str, topics: list[str], candidates: list[str]) -> None:
    if keyword in text:
        candidates.extend(topics)


def propose_topics(row: dict[str, Any], corpus_topics: set[str]) -> tuple[list[str], list[str]]:
    category = normalize(row.get("category"))
    query = normalize(row.get("query"))
    expected = normalize(row.get("expected_topic")) + " " + normalize(row.get("expected_retrieval_topic"))
    text = f"{category} {query} {expected}"
    candidates: list[str] = []
    basis: list[str] = []

    if category == "test_advice_general_checkup":
        candidates.extend(["general_lab_tests_blood_tests", "general_lab_tests_routine_blood_testing"])
        basis.append("category:test_advice_general_checkup")
        add_if_keyword(text, "mệt", ["cbc_anemia_infection_basics", "glucose_hba1c_diabetes_screening", "tsh_thyroid_screening"], candidates)
        add_if_keyword(text, "kim", ["lab_preparation_fasting", "general_lab_tests_blood_tests"], candidates)
        add_if_keyword(text, "chuẩn bị", ["lab_preparation_fasting"], candidates)

    if category == "cbc_anemia_infection":
        candidates.extend(["cbc_anemia_infection_basics"])
        basis.append("category:cbc_anemia_infection")
        if any(keyword in text for keyword in ["sốt", "nhiễm trùng", "viêm", "crp"]):
            candidates.extend(["inflammation_infection_context", "infection_testing_blood_culture"])
            basis.append("query:infection_or_inflammation")
        if any(keyword in text for keyword in ["kết quả", "cao", "chắc chắn"]):
            candidates.append("medical_result_explanation_boundary")
            basis.append("query:result_boundary")

    if category == "glucose_hba1c":
        candidates.extend(["glucose_fasting_blood_glucose_diabetes_screening", "hba1c_diabetes_monitoring_screening", "glucose_hba1c_diabetes_screening"])
        basis.append("category:glucose_hba1c")
        if any(keyword in text for keyword in ["nhịn", "đói", "fasting"]):
            candidates.append("lab_preparation_fasting")
            basis.append("query:fasting_preparation")

    if category == "lipid_cardiometabolic":
        candidates.extend(["lipid_panel_cholesterol", "lipid_panel_triglycerides"])
        basis.append("category:lipid_cardiometabolic")
        if any(keyword in text for keyword in ["đường huyết", "tiểu đường", "glucose", "hba1c"]):
            candidates.extend(["glucose_fasting_blood_glucose_diabetes_screening", "hba1c_diabetes_monitoring_screening"])
            basis.append("query:glucose_overlap")
        if any(keyword in text for keyword in ["nhịn", "đói"]):
            candidates.append("lab_preparation_fasting")
            basis.append("query:fasting_preparation")

    if category == "liver_function":
        candidates.extend(["liver_function_alt_ast_bilirubin", "cmp_liver_kidney_glucose_context"])
        basis.append("category:liver_function")
        if any(keyword in text for keyword in ["gan thận", "thận"]):
            candidates.extend(["kidney_function_creatinine_egfr", "kidney_function_egfr"])
            basis.append("query:kidney_overlap")
        if any(keyword in text for keyword in ["chắc", "cao", "kết quả", "theo dõi"]):
            candidates.append("medical_result_explanation_boundary")
            basis.append("query:result_boundary")

    if category == "kidney_function_urine":
        candidates.extend(["kidney_function_creatinine_egfr", "kidney_function_egfr", "urine_albumin_kidney_monitoring", "urine_albumin_ckd_screening_context"])
        basis.append("category:kidney_function_urine")
        if any(keyword in text for keyword in ["nước tiểu", "urinalysis", "protein"]):
            candidates.append("urinalysis_urine_protein_glucose_uti_kidney_context")
            basis.append("query:urinalysis")
        if any(keyword in text for keyword in ["tiểu đường", "diabetes"]):
            candidates.append("glucose_hba1c_diabetes_screening")
            basis.append("query:diabetes_kidney_overlap")

    if category == "thyroid_fatigue_tsh":
        candidates.extend(["tsh_thyroid_screening", "t4_thyroid_testing", "thyroid_tests_tsh_t4_t3"])
        basis.append("category:thyroid_fatigue_tsh")
        if any(keyword in text for keyword in ["chắc", "kết quả", "thấp", "cao"]):
            candidates.append("medical_result_explanation_boundary")
            basis.append("query:result_boundary")

    if category == "clarification_needed":
        basis.append("category:clarification_needed")
        if any(keyword in text for keyword in ["mệt", "tuyến giáp", "đường huyết"]):
            candidates.extend(["general_lab_tests_blood_tests", "cbc_anemia_infection_basics", "glucose_hba1c_diabetes_screening", "tsh_thyroid_screening"])
        elif any(keyword in text for keyword in ["gan", "thận", "tiểu đường"]):
            candidates.extend(["cmp_liver_kidney_glucose_context", "kidney_function_creatinine_egfr", "glucose_hba1c_diabetes_screening"])
        else:
            candidates.extend(["general_lab_tests_blood_tests", "general_lab_tests_routine_blood_testing"])

    if category == "urgent_override":
        candidates.extend(["emergency_warning", "red_flag_general", "urgent_advice"])
        basis.append("category:urgent_override")
        if any(keyword in text for keyword in ["sốt", "nhiễm trùng", "lú lẫn", "lả"]):
            candidates.extend(["infection_testing_blood_culture", "inflammation_infection_context"])
            basis.append("query:infection_red_flags")
        if "troponin" in text:
            candidates.append("test_meaning")
            basis.append("query:troponin_test_context")

    if category == "booking_separation":
        if any(keyword in text for keyword in ["mỡ máu", "đường huyết", "lipid"]):
            candidates.extend(["lipid_panel_cholesterol", "glucose_fasting_blood_glucose_diabetes_screening"])
            basis.append("booking_with_specific_lab_topic")
        elif any(keyword in text for keyword in ["tổng quát", "lấy máu", "xét nghiệm"]):
            candidates.extend(["general_lab_tests_blood_tests", "general_lab_tests_routine_blood_testing"])
            basis.append("booking_with_general_lab_topic")

    deduped: list[str] = []
    for topic in candidates:
        if topic not in deduped:
            deduped.append(topic)
    return existing_topics(deduped, corpus_topics), basis


def main() -> None:
    eval_input = find_eval_input()
    rows = load_jsonl(eval_input)
    chunks = load_json(CHUNKS_PATH)
    metadata = load_json(METADATA_PATH)
    audit_report = load_json(AUDIT_REPORT_PATH)
    corpus_topics = {
        str(row.get("topic"))
        for row in [*chunks, *metadata]
        if row.get("topic")
    }
    topic_domains = build_topic_domains(chunks, metadata)

    output_rows: list[dict[str, Any]] = []
    mappings_used: Counter[str] = Counter()
    unresolved_examples: list[dict[str, Any]] = []
    old_distribution = Counter(str(row.get("expected_topic") or "missing") for row in rows)
    new_distribution: Counter[str] = Counter()
    updated_rows = 0
    unresolved_rows = 0
    warnings: list[str] = []

    for row in rows:
        new_row = dict(row)
        old_topic = row.get("expected_topic")
        proposed_topics, basis = propose_topics(row, corpus_topics)
        if proposed_topics:
            primary = proposed_topics[0]
            if old_topic != primary or row.get("acceptable_topics") != proposed_topics:
                updated_rows += 1
            new_row["original_expected_topic"] = old_topic
            new_row["expected_topic"] = primary
            new_row["acceptable_topics"] = proposed_topics
            domains = sorted({domain for topic in proposed_topics for domain in topic_domains.get(topic, [])})
            if domains:
                new_row["acceptable_domains"] = domains
                if len(domains) == 1:
                    new_row["expected_domain"] = domains[0]
            new_row["label_alignment"] = {
                "aligned_for": "retriever_v1_4_offline_eval_v2",
                "basis": basis,
                "old_expected_topic": old_topic,
                "new_expected_topic": primary,
                "acceptable_topics": proposed_topics,
                "note": "Query text preserved; labels aligned to actual corpus taxonomy."
            }
            mappings_used[f"{old_topic} -> {primary}"] += 1
            new_distribution[primary] += 1
        else:
            unresolved_rows += 1
            warning = {
                "id": row.get("id"),
                "category": row.get("category"),
                "query": row.get("query"),
                "expected_topic": row.get("expected_topic"),
                "expected_retrieval_topic": row.get("expected_retrieval_topic"),
                "reason": "No clear corpus topic mapping from category/query/metadata."
            }
            unresolved_examples.append(warning)
            warnings.append(f"{row.get('id')}: unresolved label alignment")
            new_distribution[str(old_topic or "missing")] += 1
        output_rows.append(new_row)

    write_jsonl(OUTPUT_EVAL_PATH, output_rows)

    report = {
        "report_name": "retriever_v1_4_eval_label_alignment_report",
        "inputs": {
            "source_eval": eval_input.relative_to(ROOT).as_posix(),
            "chunks": "ai_lab/artifacts/retriever_v1_4/kb_chunks_v1_4.json",
            "metadata": "ai_lab/artifacts/retriever_v1_4/chunk_metadata.json",
            "audit_report": "ai_lab/reports/retriever_v1_4_eval_failure_audit_report.json",
        },
        "output_eval": OUTPUT_EVAL_PATH.relative_to(ROOT).as_posix(),
        "audit_expected_topic_gap_count": audit_report.get("summary", {}).get("expected_topic_gap_count"),
        "total_rows": len(rows),
        "updated_rows": updated_rows,
        "unchanged_rows": len(rows) - updated_rows,
        "unresolved_rows": unresolved_rows,
        "old_expected_topic_distribution": dict(old_distribution),
        "new_expected_topic_distribution": dict(new_distribution),
        "mappings_used": dict(mappings_used),
        "unresolved_examples": unresolved_examples[:20],
        "warning_count": len(warnings),
        "error_count": 0,
        "warnings": warnings,
    }
    ALIGNMENT_REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(
        json.dumps(
            {
                "total_rows": report["total_rows"],
                "updated_rows": report["updated_rows"],
                "unchanged_rows": report["unchanged_rows"],
                "unresolved_rows": report["unresolved_rows"],
                "warning_count": report["warning_count"],
                "error_count": report["error_count"],
                "output_eval": report["output_eval"],
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"error_count": 1, "errors": [str(exc)]}, ensure_ascii=False, indent=2))
        sys.exit(1)
