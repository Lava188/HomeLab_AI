# Recommendation Controller Eval v1

- Total cases: 9
- Passed cases: 9
- Pass rate: 1.0
- Status accuracy: 1.0
- Recommendation accuracy: 1.0
- Ask-next-slot accuracy: 1.0
- Blocked package suppression accuracy: 1.0
- Unsafe recommendation count: 0

## Case Results

- `ask_more_missing_required_anemia`: PASS (status=ask_more, recommended=None)
- `recommend_allowed_anemia_package`: PASS (status=recommend, recommended=pkg_anemia_infection_basic_v1)
- `guarded_glucose_candidate_suppressed`: PASS (status=do_not_recommend, recommended=None)
- `blocked_package_path`: PASS (status=do_not_recommend, recommended=None)
- `escalate_on_red_flag`: PASS (status=escalate, recommended=None)
- `ambiguous_input_path`: PASS (status=ask_more, recommended=None)
- `ambiguous_non_empty_free_text_requires_clarification`: PASS (status=ask_more, recommended=None)
- `glucose_compound_red_flag_escalates`: PASS (status=escalate, recommended=None)
- `runtime_mode_catalog_disabled_blocks_final_recommend`: PASS (status=do_not_recommend, recommended=None)

## Notes

- The controller keeps guarded packages in internal blocking/debug paths but never returns them as final recommendations.
- When flow selection is unresolved, the controller asks for clarification instead of inferring a package.
