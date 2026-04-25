#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import sys
from collections import Counter, defaultdict
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


CASES_PATH = REPO_ROOT / "ai_lab" / "datasets" / "eval" / "recommendation_controller_cases_v1.json"
REPORT_JSON_PATH = REPO_ROOT / "ai_lab" / "reports" / "recommendation_eval_v1.json"
REPORT_MD_PATH = REPO_ROOT / "ai_lab" / "reports" / "recommendation_eval_summary_v1.md"
AI_LAB_ROOT = REPO_ROOT / "ai_lab"


def main() -> int:
    cases = json.loads(CASES_PATH.read_text())
    REPORT_JSON_PATH.parent.mkdir(parents=True, exist_ok=True)

    results: list[dict[str, Any]] = []
    failed_cases: list[dict[str, Any]] = []
    status_counter: Counter[str] = Counter()
    category_metrics: dict[str, dict[str, Any]] = defaultdict(_new_category_metrics)
    passed_cases = 0
    unsafe_recommendation_count = 0

    for case in cases:
        category = case.get("category", "uncategorized")
        input_state = dict(case["input_state"])
        input_state.setdefault("execution_mode", "offline_eval")
        actual = run_recommendation_controller(input_state, base_dir=str(AI_LAB_ROOT))
        actual_reason_flags = _extract_reason_flags(actual)

        expected_status = case["expected_status"]
        expected_recommended_package_id = case["expected_recommended_package_id"]
        expected_next_slot_ids = case.get("expected_next_slot_ids", [])
        expected_blocked_package_ids = case.get("expected_blocked_package_ids", [])
        expected_reason_flags = case.get("expected_reason_flags", [])

        status_match = actual["status"] == expected_status
        recommendation_match = actual["recommended_package_id"] == expected_recommended_package_id
        next_slot_match = actual["next_slot_ids"] == expected_next_slot_ids
        blocked_match = actual["blocked_package_ids"] == expected_blocked_package_ids
        reason_flags_match = sorted(actual_reason_flags) == sorted(expected_reason_flags)
        case_passed = (
            status_match
            and recommendation_match
            and next_slot_match
            and blocked_match
            and reason_flags_match
        )

        status_counter[actual["status"]] += 1
        category_metrics[category]["total_cases"] += 1
        category_metrics[category]["status_breakdown"][actual["status"]] += 1

        if case_passed:
            passed_cases += 1
            category_metrics[category]["passed_cases"] += 1
        else:
            category_metrics[category]["failed_cases"] += 1
            failed_cases.append(
                {
                    "id": case["id"],
                    "category": category,
                    "expected_status": expected_status,
                    "actual_status": actual["status"],
                    "expected_recommended_package_id": expected_recommended_package_id,
                    "actual_recommended_package_id": actual["recommended_package_id"],
                    "expected_next_slot_ids": expected_next_slot_ids,
                    "actual_next_slot_ids": actual["next_slot_ids"],
                    "expected_blocked_package_ids": expected_blocked_package_ids,
                    "actual_blocked_package_ids": actual["blocked_package_ids"],
                    "expected_reason_flags": expected_reason_flags,
                    "actual_reason_flags": actual_reason_flags,
                }
            )

        if actual["recommended_package_id"] and (
            actual["recommended_package_id"] in set(actual["blocked_package_ids"])
            or expected_status != "recommend"
        ):
            unsafe_recommendation_count += 1

        results.append(
            {
                "id": case["id"],
                "category": category,
                "short_description": case.get("short_description", ""),
                "passed": case_passed,
                "expected": {
                    "status": expected_status,
                    "recommended_package_id": expected_recommended_package_id,
                    "next_slot_ids": expected_next_slot_ids,
                    "blocked_package_ids": expected_blocked_package_ids,
                    "reason_flags": expected_reason_flags,
                },
                "actual": {
                    "status": actual["status"],
                    "recommended_package_id": actual["recommended_package_id"],
                    "next_slot_ids": actual["next_slot_ids"],
                    "blocked_package_ids": actual["blocked_package_ids"],
                    "reason_flags": actual_reason_flags,
                    "selected_flow_id": actual["selected_flow_id"],
                    "active_red_flags": actual["active_red_flags"],
                    "reasons": actual["reasons"],
                },
            }
        )

    total_cases = len(cases)
    metrics = {
        "total_cases": total_cases,
        "passed_cases": passed_cases,
        "failed_cases": total_cases - passed_cases,
        "pass_rate": _ratio(passed_cases, total_cases),
        "status_breakdown": dict(sorted(status_counter.items())),
        "unsafe_recommendation_count": unsafe_recommendation_count,
        "category_breakdown": _finalize_category_metrics(category_metrics),
    }
    report = {
        "eval_name": "recommendation_controller_eval_v1",
        "cases_path": str(CASES_PATH.relative_to(REPO_ROOT)),
        "controller_entrypoint": "ai_lab/recommendation/recommendation_controller.py:run_recommendation_controller",
        "metrics": metrics,
        "failed_cases": failed_cases,
        "results": results,
    }
    REPORT_JSON_PATH.write_text(json.dumps(report, indent=2) + "\n")
    REPORT_MD_PATH.write_text(build_summary(report))
    return 0 if not failed_cases else 1


def _new_category_metrics() -> dict[str, Any]:
    return {
        "total_cases": 0,
        "passed_cases": 0,
        "failed_cases": 0,
        "status_breakdown": Counter(),
    }


def _finalize_category_metrics(category_metrics: dict[str, dict[str, Any]]) -> dict[str, Any]:
    finalized = {}
    for category, metric in sorted(category_metrics.items()):
        total_cases = metric["total_cases"]
        finalized[category] = {
            "total_cases": total_cases,
            "passed_cases": metric["passed_cases"],
            "failed_cases": metric["failed_cases"],
            "pass_rate": _ratio(metric["passed_cases"], total_cases),
            "status_breakdown": dict(sorted(metric["status_breakdown"].items())),
        }
    return finalized


def _extract_reason_flags(actual: dict[str, Any]) -> list[str]:
    flags: list[str] = []
    reasons = actual.get("reasons", [])

    if actual.get("active_red_flags"):
        flags.append("active_red_flags")

    for reason in reasons:
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
        if "catalog-gated" in reason:
            flags.append("catalog_runtime_disabled")
        if "gated by catalog exposure 'guarded'" in reason:
            flags.append("guarded_exposure")
        if "Schema recommendation rule matched" in reason:
            flags.append("recommendation_rule_matched")

    deduped = []
    seen = set()
    for flag in flags:
        if flag not in seen:
            deduped.append(flag)
            seen.add(flag)
    return deduped


def _ratio(numerator: int, denominator: int) -> float:
    if denominator == 0:
        return 0.0
    return round(numerator / denominator, 4)


def build_summary(report: dict[str, Any]) -> str:
    metrics = report["metrics"]
    lines = [
        "# Recommendation Controller Eval v1",
        "",
        f"- Total cases: {metrics['total_cases']}",
        f"- Passed cases: {metrics['passed_cases']}",
        f"- Failed cases: {metrics['failed_cases']}",
        f"- Pass rate: {metrics['pass_rate']}",
        f"- Status breakdown: {_format_breakdown(metrics['status_breakdown'])}",
        f"- Unsafe recommendation count: {metrics['unsafe_recommendation_count']}",
        "",
        "Coverage spans ready-package recommendation, missing-slot clarification, ambiguous routing, red-flag escalation, request-flag escalation, guarded and blocked package suppression, unsupported add-on suppression, direct package asks, and explicit flow/goal conflicts. Red flags currently escalate rather than return do_not_recommend in the existing controller.",
    ]

    if report["failed_cases"]:
        lines.extend(["", "Failed cases:"])
        for item in report["failed_cases"]:
            lines.append(
                f"- {item['id']} [{item['category']}]: "
                f"expected {item['expected_status']} -> {item['expected_recommended_package_id']}, "
                f"got {item['actual_status']} -> {item['actual_recommended_package_id']}"
            )

    return "\n".join(lines) + "\n"


def _format_breakdown(items: dict[str, int]) -> str:
    if not items:
        return "none"
    return ", ".join(f"{key}={value}" for key, value in items.items())


if __name__ == "__main__":
    raise SystemExit(main())
