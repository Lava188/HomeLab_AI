#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
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
    results = []
    metrics = {
        "total_cases": len(cases),
        "passed_cases": 0,
        "status_matches": 0,
        "recommendation_matches": 0,
        "next_slot_matches": 0,
        "blocked_suppression_matches": 0,
        "unsafe_recommendation_count": 0,
    }
    for case in cases:
        input_state = dict(case["input_state"])
        input_state.setdefault("execution_mode", "offline_eval")
        actual = run_recommendation_controller(input_state, base_dir=str(AI_LAB_ROOT))
        expected_status = case["expected_status"]
        expected_recommended_package_id = case["expected_recommended_package_id"]
        expected_next_slot_ids = case.get("expected_next_slot_ids", [])
        expected_blocked_package_ids = case.get("expected_blocked_package_ids")
        status_match = actual["status"] == expected_status
        recommendation_match = actual["recommended_package_id"] == expected_recommended_package_id
        next_slot_match = actual["next_slot_ids"][: len(expected_next_slot_ids)] == expected_next_slot_ids
        if expected_blocked_package_ids is None:
            blocked_match = True
        else:
            blocked_match = all(pkg_id in actual["blocked_package_ids"] for pkg_id in expected_blocked_package_ids)
        case_passed = status_match and recommendation_match and next_slot_match and blocked_match
        if case_passed:
            metrics["passed_cases"] += 1
        if status_match:
            metrics["status_matches"] += 1
        if recommendation_match:
            metrics["recommendation_matches"] += 1
        if next_slot_match:
            metrics["next_slot_matches"] += 1
        if blocked_match:
            metrics["blocked_suppression_matches"] += 1
        if actual["recommended_package_id"] in set(actual["blocked_package_ids"]):
            metrics["unsafe_recommendation_count"] += 1
        results.append(
            {
                "id": case["id"],
                "passed": case_passed,
                "notes": case.get("notes", ""),
                "expected": {
                    "status": expected_status,
                    "recommended_package_id": expected_recommended_package_id,
                    "next_slot_ids": expected_next_slot_ids,
                    "blocked_package_ids": expected_blocked_package_ids or [],
                },
                "actual": {
                    "status": actual["status"],
                    "recommended_package_id": actual["recommended_package_id"],
                    "next_slot_ids": actual["next_slot_ids"],
                    "blocked_package_ids": actual["blocked_package_ids"],
                    "selected_flow_id": actual["selected_flow_id"],
                    "active_red_flags": actual["active_red_flags"],
                    "reasons": actual["reasons"],
                },
            }
        )
    report = {
        "eval_name": "recommendation_controller_eval_v1",
        "cases_path": str(CASES_PATH.relative_to(REPO_ROOT)),
        "controller_entrypoint": "ai_lab/recommendation/recommendation_controller.py:run_recommendation_controller",
        "metrics": {
            "total_cases": metrics["total_cases"],
            "passed_cases": metrics["passed_cases"],
            "pass_rate": _ratio(metrics["passed_cases"], metrics["total_cases"]),
            "status_accuracy": _ratio(metrics["status_matches"], metrics["total_cases"]),
            "recommendation_accuracy": _ratio(metrics["recommendation_matches"], metrics["total_cases"]),
            "ask_next_slot_accuracy": _ratio(metrics["next_slot_matches"], metrics["total_cases"]),
            "blocked_package_suppression_accuracy": _ratio(metrics["blocked_suppression_matches"], metrics["total_cases"]),
            "unsafe_recommendation_count": metrics["unsafe_recommendation_count"],
        },
        "results": results,
    }
    REPORT_JSON_PATH.write_text(json.dumps(report, indent=2) + "\n")
    REPORT_MD_PATH.write_text(build_summary(report))
    return 0 if metrics["passed_cases"] == metrics["total_cases"] else 1


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
        f"- Pass rate: {metrics['pass_rate']}",
        f"- Status accuracy: {metrics['status_accuracy']}",
        f"- Recommendation accuracy: {metrics['recommendation_accuracy']}",
        f"- Ask-next-slot accuracy: {metrics['ask_next_slot_accuracy']}",
        f"- Blocked package suppression accuracy: {metrics['blocked_package_suppression_accuracy']}",
        f"- Unsafe recommendation count: {metrics['unsafe_recommendation_count']}",
        "",
        "## Case Results",
        "",
    ]
    for result in report["results"]:
        lines.append(
            f"- `{result['id']}`: {'PASS' if result['passed'] else 'FAIL'} "
            f"(status={result['actual']['status']}, recommended={result['actual']['recommended_package_id']})"
        )
    lines.append("")
    lines.append("## Notes")
    lines.append("")
    lines.append("- The controller keeps guarded packages in internal blocking/debug paths but never returns them as final recommendations.")
    lines.append("- When flow selection is unresolved, the controller asks for clarification instead of inferring a package.")
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    raise SystemExit(main())
