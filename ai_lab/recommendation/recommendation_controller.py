#!/usr/bin/env python3
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any


DEFAULT_INPUT = {
    "flow_id": None,
    "collected_slots": {},
    "asked_slots": [],
    "latest_user_text": "",
    "execution_mode": "runtime",
    "debug": False,
}

GOAL_TO_FLOW_ID = {
    "basic_blood_package": "general_basic_screening_flow",
    "unsure": "general_basic_screening_flow",
    "anemia_infection_screening": "anemia_infection_flow",
    "glucose_screening": "glucose_flow",
    "lipid_screening": "lipid_flow",
    "kidney_function_screening": "kidney_function_flow",
    "liver_function_screening": "blocked_package_flow",
    "infectious_screening": "blocked_package_flow",
}

REQUEST_FLAG_HINTS = {
    "diagnosis_required": ["diagnos", "what disease", "what condition", "what illness"],
    "result_interpretation_required": ["interpret", "read my result", "what do these results mean"],
    "unsupported_add_on_tests": ["ferritin", "iron stud", "iron panel", "blood culture", "culture", "pathogen"],
    "unsupported_hba1c_or_add_on_tests": ["a1c", "hba1c", "insulin", "ogtt"],
    "clinical_cardiovascular_risk_estimate_required": ["cardiovascular risk", "heart risk", "risk score"],
    "unsupported_kidney_add_on_tests": ["microalbumin", "urine albumin", "creatinine clearance", "uric acid"],
}

ESCALATION_REQUEST_FLAGS = {
    "diagnosis_required",
    "result_interpretation_required",
    "clinical_cardiovascular_risk_estimate_required",
}

NO_RECOMMEND_REQUEST_FLAGS = {
    "unsupported_add_on_tests",
    "unsupported_hba1c_or_add_on_tests",
    "unsupported_kidney_add_on_tests",
}


def _find_ai_lab_root(start: Path) -> Path:
    current = start.resolve()
    for candidate in [current] + list(current.parents):
        if candidate.name == "ai_lab":
            return candidate
        maybe = candidate / "ai_lab"
        if maybe.exists() and maybe.is_dir():
            return maybe
    raise RuntimeError("Could not find ai_lab root from current workspace.")


@lru_cache(maxsize=1)
def load_controller_schemas(base_dir: str | None = None) -> dict[str, Any]:
    ai_lab_root = Path(base_dir) if base_dir else _find_ai_lab_root(Path.cwd())
    datasets_dir = ai_lab_root / "datasets"
    recommendation_dir = datasets_dir / "recommendation"
    package_catalog = json.loads((datasets_dir / "package_catalog_v1.json").read_text())
    recommendation_schema = json.loads((recommendation_dir / "recommendation_schema_v1.json").read_text())
    slot_schema = json.loads((recommendation_dir / "slot_schema_v1.json").read_text())
    return {
        "ai_lab_root": ai_lab_root,
        "package_catalog": package_catalog,
        "recommendation_schema": recommendation_schema,
        "slot_schema": slot_schema,
        "flow_by_id": {flow["flow_id"]: flow for flow in recommendation_schema["flows"]},
        "slot_by_id": {slot["slot_id"]: slot for slot in slot_schema["slots"]},
        "package_by_id": {pkg["package_id"]: pkg for pkg in package_catalog["packages"]},
    }


def run_recommendation_controller(
    input_state: dict[str, Any],
    *,
    base_dir: str | None = None,
) -> dict[str, Any]:
    state = {**DEFAULT_INPUT, **(input_state or {})}
    collected_slots = dict(state.get("collected_slots") or {})
    asked_slots = list(state.get("asked_slots") or [])
    latest_user_text = (state.get("latest_user_text") or "").strip()
    execution_mode = str(state.get("execution_mode") or "runtime")
    debug_enabled = bool(state.get("debug"))
    schemas = load_controller_schemas(base_dir)
    flow_id, flow_resolution_reason = _resolve_flow_id(
        requested_flow_id=state.get("flow_id"),
        collected_slots=collected_slots,
        latest_user_text=latest_user_text,
        flow_by_id=schemas["flow_by_id"],
    )
    flow = schemas["flow_by_id"].get(flow_id) if flow_id else None
    request_flags = _derive_request_flags(collected_slots, latest_user_text)
    active_red_flags = []
    derived_red_flag_result = "unknown"
    if flow:
        active_red_flags, derived_red_flag_result = _evaluate_red_flags(flow, collected_slots)
        if "red_flag_screen_result" not in collected_slots:
            collected_slots["red_flag_screen_result"] = derived_red_flag_result
    blocked_package_ids: list[str] = []
    if flow:
        for package_id in flow.get("candidate_packages", []):
            if _package_is_blocked(schemas["package_by_id"].get(package_id)):
                blocked_package_ids.append(package_id)
    if active_red_flags:
        reasons = [f"Red-flag check triggered: {item}" for item in active_red_flags]
        reasons.extend(_request_flag_reasons(request_flags, ESCALATION_REQUEST_FLAGS))
        return _build_output(
            status="escalate",
            selected_flow_id=flow_id,
            missing_required_slots=[],
            next_slot_ids=[],
            active_red_flags=active_red_flags,
            eligible_package_ids=[],
            blocked_package_ids=blocked_package_ids,
            recommended_package_id=None,
            reasons=reasons or ["Active red flags require escalation."],
            debug_enabled=debug_enabled,
            debug_payload={
                "flow_resolution_reason": flow_resolution_reason,
                "execution_mode": execution_mode,
                "request_flags": request_flags,
                "derived_red_flag_screen_result": derived_red_flag_result,
                "asked_slots": asked_slots,
            },
        )
    if any(request_flags.get(flag) for flag in ESCALATION_REQUEST_FLAGS):
        return _build_output(
            status="escalate",
            selected_flow_id=flow_id,
            missing_required_slots=[],
            next_slot_ids=[],
            active_red_flags=[],
            eligible_package_ids=[],
            blocked_package_ids=blocked_package_ids,
            recommended_package_id=None,
            reasons=_request_flag_reasons(request_flags, ESCALATION_REQUEST_FLAGS) or ["Request requires escalation."],
            debug_enabled=debug_enabled,
            debug_payload={
                "flow_resolution_reason": flow_resolution_reason,
                "execution_mode": execution_mode,
                "request_flags": request_flags,
                "asked_slots": asked_slots,
            },
        )
    if any(request_flags.get(flag) for flag in NO_RECOMMEND_REQUEST_FLAGS):
        return _build_output(
            status="do_not_recommend",
            selected_flow_id=flow_id,
            missing_required_slots=[],
            next_slot_ids=[],
            active_red_flags=[],
            eligible_package_ids=[],
            blocked_package_ids=_merge_ids(
                blocked_package_ids,
                flow.get("candidate_packages", []) if flow else [],
            ),
            recommended_package_id=None,
            reasons=_request_flag_reasons(request_flags, NO_RECOMMEND_REQUEST_FLAGS) or ["Unsupported add-on request is outside supported package scope."],
            debug_enabled=debug_enabled,
            debug_payload={
                "flow_resolution_reason": flow_resolution_reason,
                "execution_mode": execution_mode,
                "request_flags": request_flags,
                "asked_slots": asked_slots,
            },
        )
    if not flow:
        return _build_output(
            status="ask_more",
            selected_flow_id=None,
            missing_required_slots=["recommendation_goal", "symptom_summary"],
            next_slot_ids=["recommendation_goal", "symptom_summary"],
            active_red_flags=[],
            eligible_package_ids=[],
            blocked_package_ids=[],
            recommended_package_id=None,
            reasons=["Flow is ambiguous. Collect recommendation_goal before recommending."],
            debug_enabled=debug_enabled,
            debug_payload={
                "flow_resolution_reason": flow_resolution_reason,
                "execution_mode": execution_mode,
                "request_flags": request_flags,
                "asked_slots": asked_slots,
            },
        )
    if any(_package_is_blocked(schemas["package_by_id"].get(pkg_id)) for pkg_id in flow.get("candidate_packages", [])):
        return _build_output(
            status="do_not_recommend",
            selected_flow_id=flow_id,
            missing_required_slots=[],
            next_slot_ids=[],
            active_red_flags=[],
            eligible_package_ids=[],
            blocked_package_ids=_merge_ids(blocked_package_ids, flow.get("candidate_packages", [])),
            recommended_package_id=None,
            reasons=["Requested package area is outside the currently supported package scope."],
            debug_enabled=debug_enabled,
            debug_payload={
                "flow_resolution_reason": flow_resolution_reason,
                "execution_mode": execution_mode,
                "request_flags": request_flags,
                "asked_slots": asked_slots,
            },
        )
    missing_required_slots = _missing_required_slots(flow, collected_slots)
    if missing_required_slots:
        return _build_output(
            status="ask_more",
            selected_flow_id=flow_id,
            missing_required_slots=missing_required_slots,
            next_slot_ids=_ordered_next_slots(flow, missing_required_slots),
            active_red_flags=[],
            eligible_package_ids=[],
            blocked_package_ids=blocked_package_ids,
            recommended_package_id=None,
            reasons=["Required slots are still missing."],
            debug_enabled=debug_enabled,
            debug_payload={
                "flow_resolution_reason": flow_resolution_reason,
                "execution_mode": execution_mode,
                "request_flags": request_flags,
                "derived_red_flag_screen_result": derived_red_flag_result,
                "asked_slots": asked_slots,
            },
        )
    flow_next_slots = _next_action_slots(flow, collected_slots, request_flags)
    if flow_next_slots:
        return _build_output(
            status="ask_more",
            selected_flow_id=flow_id,
            missing_required_slots=[],
            next_slot_ids=flow_next_slots,
            active_red_flags=[],
            eligible_package_ids=[],
            blocked_package_ids=blocked_package_ids,
            recommended_package_id=None,
            reasons=["Flow requires more clarification before recommendation."],
            debug_enabled=debug_enabled,
            debug_payload={
                "flow_resolution_reason": flow_resolution_reason,
                "execution_mode": execution_mode,
                "request_flags": request_flags,
                "asked_slots": asked_slots,
            },
        )
    decision = _select_recommendation(
        flow,
        collected_slots,
        schemas["package_by_id"],
        catalog_runtime_enabled=bool(schemas["package_catalog"].get("runtime_enabled")),
        execution_mode=execution_mode,
        request_flags=request_flags,
    )
    status = decision["status"]
    eligible_package_ids = decision["eligible_package_ids"]
    blocked_package_ids = _merge_ids(blocked_package_ids, decision["blocked_package_ids"])
    reasons = decision["reasons"]
    recommended_package_id = decision["recommended_package_id"]
    return _build_output(
        status=status,
        selected_flow_id=flow_id,
        missing_required_slots=[],
        next_slot_ids=[],
        active_red_flags=[],
        eligible_package_ids=eligible_package_ids,
        blocked_package_ids=blocked_package_ids,
        recommended_package_id=recommended_package_id,
        reasons=reasons,
        debug_enabled=debug_enabled,
        debug_payload={
            "flow_resolution_reason": flow_resolution_reason,
            "execution_mode": execution_mode,
            "request_flags": request_flags,
            "asked_slots": asked_slots,
            "decision": decision["debug"],
        },
    )


def _resolve_flow_id(
    *,
    requested_flow_id: str | None,
    collected_slots: dict[str, Any],
    latest_user_text: str,
    flow_by_id: dict[str, Any],
) -> tuple[str | None, str]:
    if requested_flow_id in flow_by_id:
        return requested_flow_id, "explicit_flow_id"
    goal = collected_slots.get("recommendation_goal")
    if goal in GOAL_TO_FLOW_ID:
        return GOAL_TO_FLOW_ID[goal], "goal_mapping"
    if latest_user_text:
        return None, "clarification_required_for_free_text_only"
    return None, "unresolved"


def _derive_request_flags(collected_slots: dict[str, Any], latest_user_text: str) -> dict[str, bool]:
    normalized_text = latest_user_text.lower()
    request_flags: dict[str, bool] = {}
    for flag_name, hints in REQUEST_FLAG_HINTS.items():
        explicit_value = collected_slots.get(f"request_{flag_name}")
        if explicit_value is None:
            explicit_value = collected_slots.get(flag_name)
        request_flags[flag_name] = bool(explicit_value) or any(hint in normalized_text for hint in hints)
    return request_flags


def _evaluate_red_flags(flow: dict[str, Any], collected_slots: dict[str, Any]) -> tuple[list[str], str]:
    active: list[str] = []
    unknown_seen = False
    for rule in flow.get("red_flag_checks", []):
        result = _evaluate_check(rule, collected_slots)
        if result is True:
            active.append(rule)
        elif result is None:
            unknown_seen = True
    if active:
        return active, "positive"
    if unknown_seen:
        return [], "unknown"
    return [], "negative"


def _evaluate_check(rule: str, collected_slots: dict[str, Any]) -> bool | None:
    if " AND " in rule:
        parts = [part.strip() for part in rule.split(" AND ")]
        part_results = [_evaluate_check(part, collected_slots) for part in parts]
        if any(result is False for result in part_results):
            return False
        if all(result is True for result in part_results):
            return True
        return None
    if rule.startswith("slot:"):
        return _match_slot_atom(rule, collected_slots)
    return None


def _missing_required_slots(flow: dict[str, Any], collected_slots: dict[str, Any]) -> list[str]:
    missing = []
    for slot_id in flow.get("required_slots", []):
        if slot_id == "red_flag_screen_result":
            if collected_slots.get(slot_id) not in {"positive", "negative"}:
                missing.append(slot_id)
            continue
        if not _slot_has_value(collected_slots.get(slot_id)):
            missing.append(slot_id)
    return missing


def _ordered_next_slots(flow: dict[str, Any], slot_ids: list[str]) -> list[str]:
    ordered = []
    seen = set()
    for slot_id in flow.get("slot_order", []):
        if slot_id in slot_ids and slot_id not in seen:
            ordered.append(slot_id)
            seen.add(slot_id)
    for slot_id in slot_ids:
        if slot_id not in seen:
            ordered.append(slot_id)
            seen.add(slot_id)
    return ordered


def _next_action_slots(
    flow: dict[str, Any],
    collected_slots: dict[str, Any],
    request_flags: dict[str, bool],
) -> list[str]:
    for rule in flow.get("next_action_rules", []):
        if _all_atoms_match(
            rule.get("when_all", []),
            collected_slots,
            active_red_flags=[],
            request_flags=request_flags,
        ):
            desired = rule.get("ask_next_slots", [])
            return [slot_id for slot_id in desired if not _slot_has_value(collected_slots.get(slot_id))]
    return []


def _select_recommendation(
    flow: dict[str, Any],
    collected_slots: dict[str, Any],
    package_by_id: dict[str, Any],
    *,
    catalog_runtime_enabled: bool,
    execution_mode: str,
    request_flags: dict[str, bool],
) -> dict[str, Any]:
    blocked_package_ids: list[str] = []
    decision_debug = {"matched_rule": None}
    for rule in flow.get("recommendation_rules", []):
        if not _all_atoms_match(
            rule.get("when_all", []),
            collected_slots,
            active_red_flags=[],
            request_flags=request_flags,
        ):
            continue
        decision_debug["matched_rule"] = rule
        candidate_package_id = rule.get("recommend_package") or rule.get("guarded_candidate")
        package = package_by_id.get(candidate_package_id)
        if not package:
            blocked_package_ids.append(candidate_package_id)
            return {
                "status": "do_not_recommend",
                "eligible_package_ids": [],
                "blocked_package_ids": blocked_package_ids,
                "recommended_package_id": None,
                "reasons": [f"Candidate package {candidate_package_id} is missing from the package catalog."],
                "debug": decision_debug,
            }
        if _package_is_recommendable(
            package,
            catalog_runtime_enabled=catalog_runtime_enabled,
            execution_mode=execution_mode,
        ):
            return {
                "status": "recommend",
                "eligible_package_ids": [candidate_package_id],
                "blocked_package_ids": blocked_package_ids,
                "recommended_package_id": candidate_package_id,
                "reasons": [f"Schema recommendation rule matched for {candidate_package_id}."],
                "debug": decision_debug,
            }
        blocked_package_ids.append(candidate_package_id)
        exposure = package.get("recommendation_exposure")
        if execution_mode == "runtime" and not catalog_runtime_enabled and exposure == "allowed":
            reason = (
                f"Candidate package {candidate_package_id} is catalog-gated because "
                "package_catalog_v1 runtime is not enabled."
            )
        else:
            reason = f"Candidate package {candidate_package_id} is gated by catalog exposure '{exposure}'."
        return {
            "status": "do_not_recommend",
            "eligible_package_ids": [],
            "blocked_package_ids": blocked_package_ids,
            "recommended_package_id": None,
            "reasons": [reason],
            "debug": decision_debug,
        }
    return {
        "status": "do_not_recommend",
        "eligible_package_ids": [],
        "blocked_package_ids": blocked_package_ids,
        "recommended_package_id": None,
        "reasons": ["No eligible recommendation rule matched."],
        "debug": decision_debug,
    }


def _all_atoms_match(
    atoms: list[str],
    collected_slots: dict[str, Any],
    active_red_flags: list[str],
    request_flags: dict[str, bool],
) -> bool:
    for atom in atoms:
        result = _evaluate_atom(atom, collected_slots, active_red_flags, request_flags)
        if result is not True:
            return False
    return True


def _package_is_recommendable(
    package: dict[str, Any] | None,
    *,
    catalog_runtime_enabled: bool,
    execution_mode: str,
) -> bool:
    if not package:
        return False
    package_ready = bool(package.get("runtime_allowed")) and package.get("recommendation_exposure") == "allowed"
    if not package_ready:
        return False
    if execution_mode == "offline_eval":
        return True
    return catalog_runtime_enabled


def _package_is_blocked(package: dict[str, Any] | None) -> bool:
    if not package:
        return True
    exposure = package.get("recommendation_exposure")
    return exposure in {"none", "blocked"}


def _slot_has_value(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip()) and value != "unknown"
    return True


def _evaluate_atom(
    atom: str,
    collected_slots: dict[str, Any],
    active_red_flags: list[str],
    request_flags: dict[str, bool],
) -> bool | None:
    if atom.startswith("goal:"):
        expected_goal = atom.split(":", 1)[1]
        return collected_slots.get("recommendation_goal") == expected_goal
    if atom.startswith("flag:"):
        flag_name = atom.split(":", 1)[1]
        red_flag_active = bool(active_red_flags) or collected_slots.get("red_flag_screen_result") == "positive"
        if flag_name == "active_red_flags":
            return red_flag_active
        if flag_name == "no_active_red_flags":
            return not red_flag_active
        return None
    if atom.startswith("slot:"):
        return _match_slot_atom(atom, collected_slots)
    if atom.startswith("request_flag:") or atom.startswith("request:"):
        flag_name = atom.split(":", 1)[1]
        return bool(request_flags.get(flag_name))
    return None


def _match_slot_atom(atom: str, collected_slots: dict[str, Any]) -> bool | None:
    expression = atom[len("slot:") :]
    if "=" in expression:
        slot_id, expected = expression.split("=", 1)
        value = collected_slots.get(slot_id)
        if not _slot_has_value(value):
            return None
        return _normalize_value(value) == _normalize_value(expected)
    value = collected_slots.get(expression)
    if not _slot_has_value(value):
        return None
    return value is True


def _normalize_value(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value).strip().lower()


def _request_flag_reasons(request_flags: dict[str, bool], requested_flags: set[str]) -> list[str]:
    reasons = []
    for flag_name in sorted(requested_flags):
        if request_flags.get(flag_name):
            reasons.append(f"Request flag triggered: {flag_name}.")
    return reasons


def _merge_ids(*groups: list[str]) -> list[str]:
    merged = []
    seen = set()
    for group in groups:
        for item in group:
            if item not in seen:
                merged.append(item)
                seen.add(item)
    return merged


def _build_output(
    *,
    status: str,
    selected_flow_id: str | None,
    missing_required_slots: list[str],
    next_slot_ids: list[str],
    active_red_flags: list[str],
    eligible_package_ids: list[str],
    blocked_package_ids: list[str],
    recommended_package_id: str | None,
    reasons: list[str],
    debug_enabled: bool,
    debug_payload: dict[str, Any],
) -> dict[str, Any]:
    output = {
        "status": status,
        "selected_flow_id": selected_flow_id,
        "missing_required_slots": missing_required_slots,
        "next_slot_ids": next_slot_ids,
        "active_red_flags": active_red_flags,
        "eligible_package_ids": eligible_package_ids,
        "blocked_package_ids": blocked_package_ids,
        "recommended_package_id": recommended_package_id,
        "reasons": reasons,
        "debug": debug_payload if debug_enabled else {},
    }
    return output


__all__ = ["load_controller_schemas", "run_recommendation_controller"]
