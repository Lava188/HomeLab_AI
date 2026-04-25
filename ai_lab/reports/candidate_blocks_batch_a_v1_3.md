# Candidate Blocks Batch A v1_3

## Scope

This is a review-only candidate artifact for the planned `medical_kb_v1_3` KB expansion. It does not edit `ai_lab/datasets/medical_kb_v1_2.json`, does not create `medical_kb_v1_3.json`, and does not change retriever, runtime, backend, frontend, package, recommendation, chunk, embedding, FAISS, or evaluation files.

## Source and Schema Notes

The current KB baseline is `ai_lab/datasets/medical_kb_v1_2.json` with 38 items. Existing KB items use fields such as `id`, `doc_id`, `source_id`, `source_name`, `source_url`, `section`, `title`, `content`, `source_excerpt`, `language`, `locale`, `risk_level`, `tags`, `keywords`, `test_types`, `faq_type`, `safety_notes`, `review_status`, `use_in_v1`, `kb_version`, `release_version`, `runtime_enabled`, and `promotion_status`.

The candidate CSV keeps core future-KB-compatible fields where possible, including proposed KB ID, section, source ID, source name, candidate patient-facing text, risk level, review status, and disabled runtime/promotion flags. Extra review metadata remains only in this review artifact.

## Candidate Summary

| Candidate ID | Proposed KB ID | Domain | Source ID | Section | Risk | Review status |
|---|---|---|---|---|---|---|
| `batch_a_v1_3_c001` | `kb_v1_3_039` | Sepsis / severe infection red flags | `nice_sepsis_guideline` | `red_flags` | high | `needs_manual_review` |
| `batch_a_v1_3_c002` | `kb_v1_3_040` | Chest pain | `chest_pain` | `red_flags` | high | `needs_manual_review` |
| `batch_a_v1_3_c003` | `kb_v1_3_041` | Shortness of breath | `shortness_of_breath` | `red_flags` | high | `needs_manual_review` |
| `batch_a_v1_3_c004` | `kb_v1_3_042` | Blood tests | `blood_tests` | `test_explainers` | low | `needs_manual_review` |

All candidates have `suggested_runtime_enabled=false` and `suggested_promotion_status=draft_kb_only`.

## Candidate Details

### batch_a_v1_3_c001

- Proposed KB ID: `kb_v1_3_039`
- Domain: Sepsis / severe infection red flags
- Source: `nice_sepsis_guideline` / NICE
- Proposed text: If a possible infection is making someone feel very unwell or rapidly worse, they should get urgent clinical assessment. HomeLab cannot confirm sepsis; severe or fast-worsening symptoms should be treated as urgent.
- Intended gap filled: strengthens severe infection escalation and clinical-assessment limitation wording.
- Evidence note: NICE guideline material is registered and extracted, and covers recognition, early assessment, escalating care, and support for suspected sepsis in people aged 16 or over.
- Provenance: `raw_manifest: nice_sepsis_guideline`; `extract_manifest: ai_lab/extracted/nice_sepsis_guideline.txt`
- Duplicate check: not present as a v1_2 KB source; complements existing `nice_sepsis_overview` items.
- Safety note: high-risk red-flag wording must remain conservative, non-diagnostic, and manually reviewed.

### batch_a_v1_3_c002

- Proposed KB ID: `kb_v1_3_040`
- Domain: Chest pain
- Source: `chest_pain` / NHS
- Proposed text: Chest pain with sweating, feeling sick, light-headedness, or shortness of breath needs immediate medical help. HomeLab cannot decide whether chest pain is a heart attack; seek emergency care when these warning signs are present.
- Intended gap filled: strengthens emergency symptom-cluster retrieval and urgent-care phrasing.
- Evidence note: NHS chest pain source is registered and extracted, and contains emergency advice for chest pain with sweating, sickness, light-headedness, or shortness of breath.
- Provenance: `raw_manifest: chest_pain`; `extract_manifest: ai_lab/extracted/chest_pain.txt`
- Duplicate check: same source already represented in v1_2; candidate is a focused wording refinement, not a new domain.
- Safety note: do not diagnose heart attack; keep emergency escalation grounded and review-required.

### batch_a_v1_3_c003

- Proposed KB ID: `kb_v1_3_041`
- Domain: Shortness of breath
- Source: `shortness_of_breath` / NHS
- Proposed text: Shortness of breath can be serious if lips or skin look very pale, blue, or grey, or if the person becomes suddenly confused. HomeLab cannot diagnose the cause; these warning signs need emergency help.
- Intended gap filled: strengthens severe breathlessness emergency phrasing and limitation wording.
- Evidence note: NHS shortness of breath source is registered and extracted, and lists pale, blue, or grey lips/skin and sudden confusion as emergency warning signs.
- Provenance: `raw_manifest: shortness_of_breath`; `extract_manifest: ai_lab/extracted/shortness_of_breath.txt`
- Duplicate check: same source already represented in v1_2; candidate improves retrieval for severe breathlessness warning signs.
- Safety note: do not diagnose the cause of breathlessness; keep emergency wording source-grounded and manually reviewed.

### batch_a_v1_3_c004

- Proposed KB ID: `kb_v1_3_042`
- Domain: Blood tests
- Source: `blood_tests` / NHS
- Proposed text: Blood tests can help check health, investigate symptoms, or monitor a condition, but results can be complicated and may not give the full answer on their own. Ask a healthcare professional to explain what the result means and whether more tests are needed.
- Intended gap filled: adds concise limitation/disclaimer wording for blood-test interpretation.
- Evidence note: NHS blood tests source is registered and extracted, and states that blood tests may check health or symptoms, results can be complicated, and other tests may sometimes be needed.
- Provenance: `raw_manifest: blood_tests`; `extract_manifest: ai_lab/extracted/blood_tests.txt`
- Duplicate check: uses existing `blood_tests`; avoids `nhs_blood_tests` exact duplicate and does not rely on held-out `medlineplus_blood_testing_overview`.
- Safety note: patient-facing explainer only; do not imply that test results alone diagnose or rule out conditions.

## Sources Used

- `nice_sepsis_guideline`
- `chest_pain`
- `shortness_of_breath`
- `blood_tests`

No CDC, WHO, lab-operations, specimen packing, shipping, sample-handling, or exact-duplicate `nhs_blood_tests` source was used.

## Do Not Do Yet

- Do not edit `ai_lab/datasets/medical_kb_v1_2.json`.
- Do not create `ai_lab/datasets/medical_kb_v1_3.json` yet.
- Do not rebuild chunks.
- Do not rebuild embeddings.
- Do not rebuild FAISS.
- Do not rerun eval.
- Do not touch backend, frontend, package catalog, recommendation layer, or runtime logic.

