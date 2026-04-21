# KB v1_2 Hardening Report

## Scope
- Hardened the versioned KB draft only.
- Kept baseline `medical_kb_v1.json` untouched.
- Did not change backend, runtime promotion, or official notebook retriever/eval artifacts.

## Changes Applied
- Cleaned inherited implementation-style wording from the `v1_2` artifact so `chatbot/HomeLab` phrasing does not leak into patient-facing KB entries.
- Split MedlinePlus test explainers into smaller intent-shaped items for:
  - `medlineplus_bmp_test`
  - `medlineplus_cbc_test`
  - `medlineplus_crp_test`
  - `medlineplus_ddimer_test`
  - `medlineplus_pulse_oximetry_test`
  - `medlineplus_troponin_test`
- Narrowed troponin retrieval cues toward test explanation and result interpretation instead of chest-pain emergency matching.

## Current Draft KB State
- Baseline items carried into `medical_kb_v1_2.json`: 15
- New approved items in `v1_2`: 23
- Total items in `medical_kb_v1_2.json`: 38

## Current By Source
- `medlineplus_blood_culture_test`: 1
- `medlineplus_bmp_test`: 2
- `medlineplus_cbc_test`: 2
- `medlineplus_crp_test`: 2
- `medlineplus_ddimer_test`: 2
- `medlineplus_pulse_oximetry_test`: 2
- `medlineplus_troponin_test`: 2
- `nhs_anaphylaxis`: 2
- `nhs_fainting_adults`: 2
- `nhs_headaches`: 2
- `nhs_stomach_ache`: 2
- `nhs_stroke_symptoms`: 2

## Status
- `medical_kb_v1_2.json` is cleaner and more retrieval-ready than the previous draft.
- `runtime_enabled` remains `false` for the versioned KB draft.
- Official retriever build and comparable eval remain pending the notebook route.

## Remaining Manual Review
- Recheck high-risk emergency wording once more before any runtime promotion.
- Run the official notebook chunking / embedding / retrieval-eval path for `v1_2` before deciding whether retrieval quality is good enough for use.
