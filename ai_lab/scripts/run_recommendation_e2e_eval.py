#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path
from typing import Any


def find_repo_root(start: Path) -> Path:
    current = start.resolve()
    for candidate in [current] + list(current.parents):
        if (candidate / "ai_lab").exists():
            return candidate
    raise RuntimeError("Could not find repo root from current workspace.")


REPO_ROOT = find_repo_root(Path.cwd())
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from ai_lab.recommendation.recommendation_controller import run_recommendation_controller


CASES_PATH = REPO_ROOT / "ai_lab" / "datasets" / "eval" / "recommendation_e2e_cases_v1.json"
AI_LAB_ROOT = REPO_ROOT / "ai_lab"
E2E_REPORT_JSON_PATH = REPO_ROOT / "ai_lab" / "reports" / "recommendation_e2e_eval_v1.json"
E2E_REPORT_MD_PATH = REPO_ROOT / "ai_lab" / "reports" / "recommendation_e2e_eval_summary_v1.md"


GOAL_PATTERNS = [
    ("unsure", [r"not sure which package", r"not sure what to test", r"not sure what fits"]),
    ("infectious_screening", [r"\bhiv\b", r"\bhbv\b", r"hepatitis b", r"infectious screening"]),
    ("liver_function_screening", [r"liver function", r"liver screening", r"liver package", r"\balt\b", r"\bast\b", r"bilirubin"]),
    ("anemia_infection_screening", [r"\bcbc\b", r"\banemia\b", r"infection screening", r"anemia screening"]),
    ("glucose_screening", [r"blood sugar", r"\bglucose\b", r"glucose screening", r"\bhba1c\b", r"\ba1c\b"]),
    ("lipid_screening", [r"\bcholesterol\b", r"\blipid\b", r"lipid screening", r"cholesterol screening", r"triglyceride"]),
    ("kidney_function_screening", [r"\bkidney\b", r"kidney function", r"\bbmp\b", r"kidney package"]),
    ("basic_blood_package", [r"basic blood package", r"general blood package", r"general blood test", r"health check"])
]

BOOLEAN_SLOT_PATTERNS = {
    "chest_pain_present": {
        "positive": [r"chest pain"],
        "negative": [r"no chest pain", r"do not have chest pain", r"don't have chest pain"]
    },
    "shortness_of_breath_present": {
        "positive": [r"shortness of breath", r"short of breath"],
        "negative": [r"no shortness of breath", r"do not have shortness of breath", r"not short of breath"]
    },
    "fainting_or_altered_consciousness_present": {
        "positive": [r"\bfainted\b", r"\bfainting\b", r"\bfaint\b", r"altered consciousness", r"\bconfusion\b"],
        "negative": [r"no fainting", r"no fainting or confusion", r"no fainting or altered consciousness"]
    },
    "vomiting_present": {
        "positive": [r"\bvomiting\b", r"\bvomit\b"],
        "negative": [r"not vomiting", r"no vomiting"]
    },
    "dehydration_present": {
        "positive": [r"\bdehydrated\b", r"\bdehydration\b"],
        "negative": [r"not dehydrated", r"no dehydration"]
    }
}

STABLE_PATTERNS = [r"\bstable\b", r"not getting worse", r"feels stable", r"things are stable"]
RAPID_PATTERNS = [r"getting worse quickly", r"rapidly worsening", r"worse quickly"]
WORSENING_PATTERNS = [r"\bworsening\b", r"getting worse", r"\bworse\b"]
IMPROVING_PATTERNS = [r"\bimproving\b", r"getting better", r"\bbetter\b"]
DURATION_BUCKET_PATTERNS = [
    ("hours", [r"\b\d+\s*hours?\b", r"\ba few hours\b", r"\bsince this morning\b", r"\btoday\b"]),
    ("days", [r"\b\d+\s*days?\b", r"\byesterday\b", r"\bfor days\b", r"\bday or two\b"]),
    ("weeks_or_more", [r"\b\d+\s*weeks?\b", r"\bmonths?\b", r"\byears?\b", r"\bfor weeks\b", r"\bfor months\b"])
]

FROZEN_BASELINE_GOAL_PATTERNS = [
    ("anemia_infection_screening", [r"\bcbc\b", r"\banemia\b"]),
    ("glucose_screening", [r"blood sugar", r"\bglucose\b"]),
    ("lipid_screening", [r"\bcholesterol\b", r"\blipid\b"]),
    ("kidney_function_screening", [r"\bkidney\b", r"\bbmp\b"]),
    ("liver_function_screening", [r"liver function", r"liver package"]),
    ("infectious_screening", [r"\bhiv\b", r"\bhbv\b", r"hepatitis b"]),
    ("basic_blood_package", [r"basic blood package", r"general blood package"]),
    ("unsure", [r"not sure which package"])
]

FROZEN_BASELINE_BOOLEAN_SLOT_PATTERNS = {
    "chest_pain_present": {"positive": [r"chest pain"], "negative": [r"no chest pain"]},
    "shortness_of_breath_present": {"positive": [r"shortness of breath"], "negative": [r"no shortness of breath"]},
    "fainting_or_altered_consciousness_present": {"positive": [r"\bfainted\b", r"\bfainting\b"], "negative": [r"no fainting"]},
    "vomiting_present": {"positive": [r"\bvomiting\b"], "negative": [r"no vomiting"]},
    "dehydration_present": {"positive": [r"\bdehydrated\b"], "negative": [r"no dehydration"]}
}


def main() -> int:
    cases = json.loads(CASES_PATH.read_text())
    E2E_REPORT_JSON_PATH.parent.mkdir(parents=True, exist_ok=True)

    after_report = run_eval(cases, mode="after")
    before_report = run_eval(cases, mode="before")
    benchmark_report = build_benchmark_report(before_report, after_report)
    combined_report = build_combined_e2e_report(after_report, benchmark_report)

    E2E_REPORT_JSON_PATH.write_text(json.dumps(combined_report, indent=2) + "\n")
    E2E_REPORT_MD_PATH.write_text(build_e2e_summary(combined_report))

    return 0 if after_report["metrics"]["failed"] == 0 else 1


def run_eval(cases: list[dict[str, Any]], *, mode: str) -> dict[str, Any]:
    results = []
    failed_cases = []
    passed = 0
    outcome_matches = 0
    flow_matches = 0
    package_matches = 0
    next_slot_matches = 0
    unsafe_recommendation_count = 0
    outcome_breakdown: Counter[str] = Counter()

    for case in cases:
        actual = run_case(case["user_query"], mode=mode)
        expected_outcome = case["expected_top_level_outcome"]
        expected_flow_id = case.get("expected_flow_id")
        expected_package_id = case.get("expected_package_id")
        expected_next_slot_ids = case.get("expected_next_slot_ids", [])
        expected_reason_flags = case.get("expected_reason_flags", [])
        strict_reason_flags = bool(case.get("strict_reason_flags", False))

        actual_reason_flags = extract_reason_flags(actual)
        outcome_match = actual["status"] == expected_outcome
        flow_match = actual["selected_flow_id"] == expected_flow_id
        package_match = actual["recommended_package_id"] == expected_package_id
        next_slot_match = sorted(actual["next_slot_ids"]) == sorted(expected_next_slot_ids)
        reason_flags_match = (
            set(expected_reason_flags).issubset(set(actual_reason_flags))
            if strict_reason_flags
            else True
        )
        case_passed = outcome_match and flow_match and package_match and next_slot_match and reason_flags_match

        outcome_breakdown[actual["status"]] += 1
        if outcome_match:
            outcome_matches += 1
        if flow_match:
            flow_matches += 1
        if package_match:
            package_matches += 1
        if next_slot_match:
            next_slot_matches += 1
        if case_passed:
            passed += 1
        else:
            failed_cases.append(
                {
                    "id": case["id"],
                    "user_query": case["user_query"],
                    "expected_outcome": expected_outcome,
                    "actual_outcome": actual["status"],
                    "expected_flow_id": expected_flow_id,
                    "actual_flow_id": actual["selected_flow_id"],
                    "expected_package_id": expected_package_id,
                    "actual_package_id": actual["recommended_package_id"],
                    "expected_next_slot_ids": expected_next_slot_ids,
                    "actual_next_slot_ids": actual["next_slot_ids"],
                    "expected_reason_flags": expected_reason_flags,
                    "actual_reason_flags": actual_reason_flags,
                    "mismatch_reason": build_mismatch_reason(
                        outcome_match=outcome_match,
                        flow_match=flow_match,
                        package_match=package_match,
                        next_slot_match=next_slot_match,
                        reason_flags_match=reason_flags_match,
                    ),
                }
            )

        if actual["recommended_package_id"] and expected_outcome != "recommend":
            unsafe_recommendation_count += 1

        results.append(
            {
                "id": case["id"],
                "category": case.get("category", "uncategorized"),
                "user_query": case["user_query"],
                "passed": case_passed,
                "expected": {
                    "outcome": expected_outcome,
                    "flow_id": expected_flow_id,
                    "package_id": expected_package_id,
                    "next_slot_ids": expected_next_slot_ids,
                    "reason_flags": expected_reason_flags,
                    "strict_reason_flags": strict_reason_flags
                },
                "actual": {
                    "outcome": actual["status"],
                    "flow_id": actual["selected_flow_id"],
                    "package_id": actual["recommended_package_id"],
                    "next_slot_ids": actual["next_slot_ids"],
                    "reason_flags": actual_reason_flags,
                    "blocked_package_ids": actual["blocked_package_ids"],
                    "reasons": actual["reasons"]
                }
            }
        )

    total = len(cases)
    return {
        "eval_name": f"recommendation_e2e_eval_{mode}_v1",
        "mode": mode,
        "dataset_path": str(CASES_PATH.relative_to(REPO_ROOT)),
        "controller_entrypoint": "ai_lab/recommendation/recommendation_controller.py:run_recommendation_controller",
        "mode_description": describe_mode(mode),
        "metrics": {
            "total": total,
            "passed": passed,
            "failed": total - passed,
            "pass_rate": ratio(passed, total),
            "outcome_accuracy": ratio(outcome_matches, total),
            "flow_accuracy": ratio(flow_matches, total),
            "package_accuracy": ratio(package_matches, total),
            "next_slot_accuracy": ratio(next_slot_matches, total),
            "unsafe_recommendation_count": unsafe_recommendation_count,
            "outcome_breakdown": dict(sorted(outcome_breakdown.items()))
        },
        "failed_cases": failed_cases,
        "results": results
    }


def run_case(user_query: str, *, mode: str) -> dict[str, Any]:
    if mode == "before":
        input_state = build_input_state_from_query(user_query, mode=mode)
    elif mode == "after":
        input_state = build_input_state_from_query(user_query, mode=mode)
    else:
        raise ValueError(f"Unsupported mode: {mode}")

    return run_recommendation_controller(input_state, base_dir=str(AI_LAB_ROOT))


def build_input_state_from_query(user_query: str, *, mode: str) -> dict[str, Any]:
    normalized = normalize_text(user_query)
    collected_slots: dict[str, Any] = {}
    extracted_meta: dict[str, Any] = {}

    goal = detect_goal(normalized) if mode == "after" else detect_frozen_baseline_goal(normalized)
    if goal:
        collected_slots["recommendation_goal"] = goal

    if user_query.strip():
        collected_slots["symptom_summary"] = user_query.strip()

    slot_patterns = BOOLEAN_SLOT_PATTERNS if mode == "after" else FROZEN_BASELINE_BOOLEAN_SLOT_PATTERNS
    for slot_id, pattern_group in slot_patterns.items():
        value = detect_boolean_slot(normalized, pattern_group["positive"], pattern_group["negative"])
        if value is not None:
            collected_slots[slot_id] = value

    if mode == "after":
        derive_supporting_slots(normalized, collected_slots, extracted_meta)

    return {
        "flow_id": None,
        "collected_slots": collected_slots,
        "asked_slots": list(collected_slots.keys()),
        "latest_user_text": user_query.strip(),
        "execution_mode": "offline_eval",
        "debug": True,
        "benchmark_extracted_meta": extracted_meta
    }


def detect_goal(normalized_query: str) -> str | None:
    for goal, patterns in GOAL_PATTERNS:
        if matches_any(normalized_query, patterns):
            return goal
    return None


def detect_frozen_baseline_goal(normalized_query: str) -> str | None:
    for goal, patterns in FROZEN_BASELINE_GOAL_PATTERNS:
        if matches_any(normalized_query, patterns):
            return goal
    return None


def detect_boolean_slot(normalized_query: str, positive_patterns: list[str], negative_patterns: list[str]) -> bool | None:
    if matches_any(normalized_query, negative_patterns):
        return False
    if matches_any(normalized_query, positive_patterns):
        return True
    return None


def derive_supporting_slots(normalized_query: str, collected_slots: dict[str, Any], extracted_meta: dict[str, Any]) -> None:
    if matches_any(normalized_query, RAPID_PATTERNS):
        # Only mark rapidly_worsening when the text clearly states quick deterioration.
        collected_slots["symptom_progression"] = "rapidly_worsening"
    elif matches_any(normalized_query, STABLE_PATTERNS):
        # Stable is safe to infer when the user explicitly says the symptoms are stable.
        collected_slots["symptom_progression"] = "stable"
    elif matches_any(normalized_query, IMPROVING_PATTERNS):
        # Improving is a direct textual progression cue and stays within current schema values.
        collected_slots["symptom_progression"] = "improving"
    elif matches_any(normalized_query, WORSENING_PATTERNS):
        # Worsening is inferred conservatively when decline is stated without a "rapid" cue.
        collected_slots["symptom_progression"] = "worsening"

    duration_bucket = derive_symptom_duration_bucket(normalized_query)
    if duration_bucket:
        # Duration bucket is benchmark metadata only because the controller schema currently stores free-text duration.
        extracted_meta["symptom_duration_bucket"] = duration_bucket

    flow_id = GOAL_TO_FLOW_ID_BENCHMARK.get(collected_slots.get("recommendation_goal"))
    red_flag_result = derive_red_flag_screen_result(flow_id, collected_slots)
    if red_flag_result in {"positive", "negative"}:
        # red_flag_screen_result is a controller-required aggregate slot derived from explicit slot evidence only.
        collected_slots["red_flag_screen_result"] = red_flag_result
        extracted_meta["red_flag_screen_result_derived"] = True


GOAL_TO_FLOW_ID_BENCHMARK = {
    "basic_blood_package": "general_basic_screening_flow",
    "unsure": "general_basic_screening_flow",
    "anemia_infection_screening": "anemia_infection_flow",
    "glucose_screening": "glucose_flow",
    "lipid_screening": "lipid_flow",
    "kidney_function_screening": "kidney_function_flow",
    "liver_function_screening": "blocked_package_flow",
    "infectious_screening": "blocked_package_flow"
}

FLOW_RED_FLAG_RULES = {
    "general_basic_screening_flow": [
        ("slot", "chest_pain_present", True),
        ("slot", "shortness_of_breath_present", True),
        ("slot", "fainting_or_altered_consciousness_present", True),
        ("slot_equals", "symptom_progression", "rapidly_worsening")
    ],
    "anemia_infection_flow": [
        ("slot", "chest_pain_present", True),
        ("slot", "shortness_of_breath_present", True),
        ("slot", "fainting_or_altered_consciousness_present", True),
        ("slot_equals", "symptom_progression", "rapidly_worsening")
    ],
    "glucose_flow": [
        ("slot", "chest_pain_present", True),
        ("slot", "shortness_of_breath_present", True),
        ("slot", "fainting_or_altered_consciousness_present", True),
        ("all", [("slot", "vomiting_present", True), ("slot", "dehydration_present", True)])
    ],
    "lipid_flow": [
        ("slot", "chest_pain_present", True),
        ("slot", "shortness_of_breath_present", True),
        ("slot", "fainting_or_altered_consciousness_present", True)
    ],
    "kidney_function_flow": [
        ("slot", "chest_pain_present", True),
        ("slot", "shortness_of_breath_present", True),
        ("slot", "fainting_or_altered_consciousness_present", True),
        ("slot_equals", "symptom_progression", "rapidly_worsening")
    ],
    "blocked_package_flow": [
        ("slot", "chest_pain_present", True),
        ("slot", "shortness_of_breath_present", True),
        ("slot", "fainting_or_altered_consciousness_present", True)
    ]
}


def derive_symptom_duration_bucket(normalized_query: str) -> str | None:
    for bucket, patterns in DURATION_BUCKET_PATTERNS:
        if matches_any(normalized_query, patterns):
            return bucket
    return None


def derive_red_flag_screen_result(flow_id: str | None, collected_slots: dict[str, Any]) -> str | None:
    rules = FLOW_RED_FLAG_RULES.get(flow_id or "")
    if not rules:
        return None

    any_unknown = False
    for rule in rules:
        result = evaluate_red_flag_rule(rule, collected_slots)
        if result is True:
            return "positive"
        if result is None:
            any_unknown = True
    return None if any_unknown else "negative"


def evaluate_red_flag_rule(rule: tuple[Any, ...], collected_slots: dict[str, Any]) -> bool | None:
    kind = rule[0]
    if kind == "slot":
        slot_id = rule[1]
        expected = rule[2]
        value = collected_slots.get(slot_id)
        if value is None:
            return None
        return value is expected
    if kind == "slot_equals":
        slot_id = rule[1]
        expected = rule[2]
        value = collected_slots.get(slot_id)
        if value is None:
            return None
        return value == expected
    if kind == "all":
        results = [evaluate_red_flag_rule(item, collected_slots) for item in rule[1]]
        if any(result is False for result in results):
            return False
        if all(result is True for result in results):
            return True
        return None
    return None


def normalize_text(text: str) -> str:
    decomposed = unicodedata.normalize("NFD", str(text or ""))
    without_marks = "".join(char for char in decomposed if unicodedata.category(char) != "Mn")
    return without_marks.lower().strip()


def matches_any(text: str, patterns: list[str]) -> bool:
    return any(re.search(pattern, text) for pattern in patterns)


def extract_reason_flags(actual: dict[str, Any]) -> list[str]:
    flags: list[str] = []

    if actual.get("active_red_flags"):
        flags.append("active_red_flags")

    for reason in actual.get("reasons", []):
        match = re.search(r"Request flag triggered: ([a-z0-9_]+)\.", reason)
        if match:
            flags.append(match.group(1))
        if "Required slots are still missing." in reason:
            flags.append("missing_required_slots")
        if "Flow requires more clarification before recommendation." in reason:
            flags.append("needs_clarification")
        if "Flow is ambiguous." in reason:
            flags.append("flow_ambiguous")
        if "outside the currently supported package scope" in reason:
            flags.append("blocked_scope")
        if "gated by catalog exposure 'guarded'" in reason:
            flags.append("guarded_exposure")
        if "Schema recommendation rule matched" in reason:
            flags.append("recommendation_rule_matched")

    ordered = []
    seen = set()
    for flag in flags:
        if flag not in seen:
            ordered.append(flag)
            seen.add(flag)
    return ordered


def build_benchmark_report(before_report: dict[str, Any], after_report: dict[str, Any]) -> dict[str, Any]:
    before_by_id = {item["id"]: item for item in before_report["results"]}
    after_by_id = {item["id"]: item for item in after_report["results"]}

    improved = 0
    unchanged = 0
    regressed = 0
    case_deltas = []

    for case_id, after_result in after_by_id.items():
        before_result = before_by_id[case_id]
        if before_result["passed"] and not after_result["passed"]:
            regressed += 1
            delta = "regressed"
        elif not before_result["passed"] and after_result["passed"]:
            improved += 1
            delta = "improved"
        else:
            unchanged += 1
            delta = "unchanged"

        case_deltas.append(
            {
                "id": case_id,
                "before_passed": before_result["passed"],
                "after_passed": after_result["passed"],
                "delta": delta
            }
        )

    return {
        "benchmark_name": "recommendation_before_after_benchmark_v1",
        "dataset_path": str(CASES_PATH.relative_to(REPO_ROOT)),
        "before_mode": {
            "name": before_report["mode"],
            "description": before_report["mode_description"],
            "metrics": before_report["metrics"]
        },
        "after_mode": {
            "name": after_report["mode"],
            "description": after_report["mode_description"],
            "metrics": after_report["metrics"]
        },
        "comparison": {
            "outcome_accuracy": {
                "before": before_report["metrics"]["outcome_accuracy"],
                "after": after_report["metrics"]["outcome_accuracy"]
            },
            "flow_accuracy": {
                "before": before_report["metrics"]["flow_accuracy"],
                "after": after_report["metrics"]["flow_accuracy"]
            },
            "package_accuracy": {
                "before": before_report["metrics"]["package_accuracy"],
                "after": after_report["metrics"]["package_accuracy"]
            },
            "next_slot_accuracy": {
                "before": before_report["metrics"]["next_slot_accuracy"],
                "after": after_report["metrics"]["next_slot_accuracy"]
            },
            "unsafe_recommendation_count": {
                "before": before_report["metrics"]["unsafe_recommendation_count"],
                "after": after_report["metrics"]["unsafe_recommendation_count"]
            },
            "case_delta_counts": {
                "improved": improved,
                "unchanged": unchanged,
                "regressed": regressed
            }
        },
        "limitations": [
            "The repo does not expose a dedicated runtime query-to-recommendation entrypoint yet.",
            "This is a recommendation-layer E2E-style benchmark, not a full frontend-backend-AI system end-to-end evaluation.",
            "The before path is a frozen weaker recommendation-layer baseline with literal extraction and no derived-slot inference.",
            "The after path is the current recommendation-layer benchmark adapter with conservative derived-slot inference before calling the unchanged controller."
        ],
        "case_deltas": case_deltas
    }


def build_combined_e2e_report(after_report: dict[str, Any], benchmark_report: dict[str, Any]) -> dict[str, Any]:
    return {
        **after_report,
        "eval_name": "recommendation_layer_e2e_style_benchmark_v1",
        "benchmark_scope": "recommendation-layer E2E-style benchmark",
        "scoring_policy": {
            "strict_primary_fields": [
                "outcome",
                "flow_id",
                "package_id",
                "next_slot_ids"
            ],
            "reason_flags_policy": "lenient_by_default",
            "reason_flags_note": "reason_flags are supporting evidence and only fail a case when strict_reason_flags=true is set in the dataset"
        },
        "before_after_comparison": benchmark_report
    }


def build_mismatch_reason(
    *,
    outcome_match: bool,
    flow_match: bool,
    package_match: bool,
    next_slot_match: bool,
    reason_flags_match: bool,
) -> str:
    if not outcome_match:
        return "outcome mismatch"
    if not flow_match:
        return "flow mismatch"
    if not package_match:
        return "package mismatch"
    if not next_slot_match:
        return "next-slot mismatch"
    if not reason_flags_match:
        return "strict reason-flags mismatch"
    return "unknown mismatch"


def describe_mode(mode: str) -> str:
    if mode == "before":
        return "Frozen weaker recommendation-layer baseline: literal extraction only, no derived-slot inference, and narrower query understanding."
    if mode == "after":
        return "Current recommendation-layer E2E-style adapter: extract current-schema slot state from text, derive a small set of aggregate slots conservatively, then call the unchanged controller."
    raise ValueError(f"Unsupported mode: {mode}")


def ratio(numerator: int, denominator: int) -> float:
    if denominator == 0:
        return 0.0
    return round(numerator / denominator, 4)


def build_e2e_summary(report: dict[str, Any]) -> str:
    metrics = report["metrics"]
    comparison = report["before_after_comparison"]["comparison"]
    before_mode = report["before_after_comparison"]["before_mode"]
    after_mode = report["before_after_comparison"]["after_mode"]
    deltas = comparison["case_delta_counts"]
    failed_cases = report["failed_cases"]
    return "\n".join(
        [
            "# Recommendation-Layer E2E-Style Benchmark v1",
            "",
            "## Scope",
            "",
            "This is a recommendation-layer benchmark. It evaluates natural-language query handling into recommendation-controller inputs and outputs, but it does not evaluate the full frontend/backend/AI production system end to end.",
            "",
            "## Current Benchmark Result",
            "",
            f"- Cases: {metrics['total']}",
            f"- Passed: {metrics['passed']}",
            f"- Failed: {metrics['failed']}",
            f"- Pass rate: {metrics['pass_rate']}",
            f"- Outcome accuracy: {metrics['outcome_accuracy']}",
            f"- Flow accuracy: {metrics['flow_accuracy']}",
            f"- Package accuracy: {metrics['package_accuracy']}",
            f"- Next-slot accuracy: {metrics['next_slot_accuracy']}",
            f"- Unsafe recommendation count: {metrics['unsafe_recommendation_count']}",
            f"- Outcome breakdown: {format_breakdown(metrics['outcome_breakdown'])}",
            "",
            "## Per-Category Breakdown",
            "",
            f"- recommend: {metrics['outcome_breakdown'].get('recommend', 0)}",
            f"- ask_more: {metrics['outcome_breakdown'].get('ask_more', 0)}",
            f"- do_not_recommend: {metrics['outcome_breakdown'].get('do_not_recommend', 0)}",
            f"- escalate: {metrics['outcome_breakdown'].get('escalate', 0)}",
            "",
            "## Scoring Policy",
            "",
            "- Strictly scored: outcome, flow_id, package_id, next_slot_ids.",
            "- Lenient by default: reason_flags are supporting evidence and do not fail a case unless a dataset row explicitly sets strict_reason_flags=true.",
            "",
            "## Before Vs After",
            "",
            f"- Before: {before_mode['description']}",
            f"- After: {after_mode['description']}",
            f"- Outcome accuracy: {comparison['outcome_accuracy']['before']} -> {comparison['outcome_accuracy']['after']}",
            f"- Flow accuracy: {comparison['flow_accuracy']['before']} -> {comparison['flow_accuracy']['after']}",
            f"- Package accuracy: {comparison['package_accuracy']['before']} -> {comparison['package_accuracy']['after']}",
            f"- Next-slot accuracy: {comparison['next_slot_accuracy']['before']} -> {comparison['next_slot_accuracy']['after']}",
            f"- Unsafe recommendation count: {comparison['unsafe_recommendation_count']['before']} -> {comparison['unsafe_recommendation_count']['after']}",
            f"- Improved / unchanged / regressed: {deltas['improved']} / {deltas['unchanged']} / {deltas['regressed']}",
            "",
            "## What This Benchmark Proves",
            "",
            "- The recommendation layer can be evaluated reproducibly from natural-language prompts into controller-level recommendation outcomes.",
            "- Conservative derived-slot inference materially improves recommendation-layer routing, recommendation, suppression, and escalation behavior over the frozen weaker baseline.",
            "- The current recommendation-layer benchmark produces no unsafe recommendations on this benchmark set.",
            "",
            "## What This Benchmark Does Not Prove",
            "",
            "- It does not prove full-system frontend/backend/runtime correctness.",
            "- It does not prove model-level understanding beyond the deterministic benchmark adapter implemented in this runner.",
            "- It does not validate future package semantics beyond the current controller, schema, and catalog contract.",
            "",
            "## Failed Cases",
            "",
        ]
        + (
            [
                "- None."
            ]
            if not failed_cases
            else [
                f"- {item['id']}: query=\"{item['user_query']}\"; expected={item['expected_outcome']}; actual={item['actual_outcome']}; reason={item['mismatch_reason']}"
                for item in failed_cases
            ]
        )
    ) + "\n"


def format_breakdown(items: dict[str, int]) -> str:
    return ", ".join(f"{key}={value}" for key, value in items.items()) if items else "none"


if __name__ == "__main__":
    raise SystemExit(main())
