# HomeLab AI Evaluation Criteria (Minimum Viable Release-Level Document)

## Purpose

This document records the minimum evaluation principles that can be justified from the current HomeLab AI baseline repository during the Stage 1 freeze polish pass.

It is not a new benchmark definition. It is a release-level clarification of how current retrieval and answer-quality assets should be interpreted.

## Evaluation scope

The baseline evaluation scope is narrow and health-domain constrained:

- blood test information and preparation
- chest pain red flags
- shortness of breath red flags
- severe infection / sepsis awareness red flags

Evaluation results should be interpreted relative to this narrow baseline scope, not as evidence of broad medical capability.

## What retrieval evaluation is trying to measure

At minimum, current retrieval evaluation is trying to measure whether the retriever returns clinically relevant chunk candidates for the intended scope.

From the current eval files and retrieval reports, this includes:

- correct source group selection
- correct section selection
- correct chunk retrieval at top-1 when possible
- acceptable retrieval within top-3 when top-1 varies but the answer basis remains valid

## Top-1 and top-3 interpretation

The current baseline policy and reports make top-3 interpretation important.

Conservative interpretation:

- top-1 is useful for direct informational questions when the retrieval target is unambiguous
- top-3 is the more important policy decision basis for safety-sensitive and mixed emergency cases
- a retrieval result may still be operationally acceptable when top-1 differs but the relevant source/section appears within top-3

This is especially relevant because the active policy document explicitly prioritizes top-3 reasoning over top-1-only behavior in emergency contexts.

## Why mixed emergency cases matter

Mixed emergency cases matter because a safe answer may depend on multiple red-flag chunks from different source groups appearing together in the retrieval set.

Examples in current scope include overlapping signals such as:

- chest pain plus shortness of breath
- shortness of breath plus severe deterioration signs
- multiple red-flag sources that should trigger a conservative mixed-emergency answer

For this reason, retrieval evaluation should not be interpreted only as a single-best-hit problem.

## Qualitative criteria for grounded answers

At a high level, a grounded answer in this baseline should:

- remain anchored to retrieved baseline content
- avoid unsupported diagnosis
- avoid medication prescribing
- use conservative safety language for red-flag content
- distinguish informational blood-test guidance from urgent or emergency guidance
- use top-3 evidence appropriately when a mixed emergency pattern is present

## What counts as unsafe behavior at a high level

Unsafe behavior in the current baseline would include, at minimum:

- diagnosing a disease from the limited retrieval baseline
- prescribing medication or giving dosing instructions
- downplaying red-flag combinations that should trigger urgent or emergency escalation
- ignoring mixed-emergency evidence appearing across top-3 retrieved chunks
- producing answers that go materially beyond the narrow evidence base

## Interpreting current reports conservatively

Current retrieval and answer-simulation reports are useful baseline evidence, but this polish task did not regenerate them.

Therefore:

- current report files should be treated as repository evidence available at inspection time
- this document does not introduce new measured thresholds
- future evaluations should compare against the frozen v1.1 baseline rather than reinterpret these files as newly rerun results

## Baseline-relative interpretation note

No exact threshold values are defined in this document because the repository does not provide a fully populated release-grade evaluation specification.

Instead, the current baseline should be interpreted using relative principles:

- better top-1 alignment is desirable
- strong top-3 coverage is critical for safety-sensitive cases
- mixed emergency handling is more important than top-1 purity alone in overlapping red-flag scenarios
- groundedness and safety are primary qualitative constraints on final answers
