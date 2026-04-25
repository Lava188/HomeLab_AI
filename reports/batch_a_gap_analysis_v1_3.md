# Batch A Gap Analysis v1_3

## Scope

This gap analysis compares the four Batch A target domains against the current `v1_2` KB, raw manifest, and extract manifest. It is a planning artifact only. It does not modify KB data, create `medical_kb_v1_3.json`, rebuild retriever artifacts, or rerun evaluation.

## Baseline Evidence

| Evidence area | Current state |
|---|---|
| KB baseline | `ai_lab/datasets/medical_kb_v1_2.json` |
| KB item count | 38 items |
| Retriever baseline | `ai_lab/artifacts/retriever_v1_2/` |
| Retriever version | `v1_2` |
| Retriever chunk count | 38 chunks |
| Raw manifest | `ai_lab/raw/raw_manifest.jsonl`, 22 entries |
| Extract manifest | `ai_lab/extracted/extract_manifest.jsonl`, 22 entries |
| Retrieval eval | `ai_lab/reports/retrieval_eval_v1_2.csv`, 65 rows |
| Retrieval summary | Strict Recall@1 `0.9385`; Strict Recall@3 `1.0000`; Acceptable Top-3 Match `1.0000` |
| Grounded-response summary | Mode accuracy `0.9583`; unsafe banned pattern count `0`; residual problem cases `1` |

## Domain Gap Matrix

### 1. Blood Tests

Current KB coverage:

- `blood_tests`: 5 KB items in `medical_kb_v1_2.json`
- Relevant sections: `test_explainers`
- Existing emphasis: what blood tests are, why they may be ordered, common blood tests, preparation, and receiving results

Current raw/extract coverage:

- `blood_tests`: registered and extracted; `use_in_v1=true`
- `medlineplus_blood_testing_overview`: registered and extracted; marked `duplicate_or_review_needed`; duplicate of `blood_tests`
- `nhs_blood_tests`: registered and extracted; marked `duplicate_or_review_needed`; exact duplicate of `blood_tests`

Gap classification:

| Gap type | Classification |
|---|---|
| Already represented | Yes. General blood-test explanation is represented by 5 KB items. |
| Partially represented | Yes. Current coverage is broad but may not fully separate limitations, result-context wording, and preparation caveats. |
| Missing patient-facing explanation | No major gap found. |
| Missing red-flag detail | Not a primary blood-test explainer need; red flags are covered by other target domains. |
| Missing urgent/emergency phrasing | Not a primary blood-test explainer need. |
| Missing limitation/disclaimer content | Partial gap. A concise item could clarify that blood tests support assessment but do not diagnose every condition by themselves. |
| Candidate source needed | No new source needed. Existing `blood_tests` is sufficient; `medlineplus_blood_testing_overview` may be reviewed only for non-duplicative limitation wording. |
| duplicate_or_review_needed | Yes. `medlineplus_blood_testing_overview` and `nhs_blood_tests` are both flagged as duplicate or review-needed. |

### 2. Chest Pain

Current KB coverage:

- `chest_pain`: 3 KB items in `medical_kb_v1_2.json`
- Relevant section: `red_flags`
- Existing emphasis: emergency escalation, early medical assessment, and avoiding self-diagnosis

Current raw/extract coverage:

- `chest_pain`: registered and extracted; `use_in_v1=true`; review required

Gap classification:

| Gap type | Classification |
|---|---|
| Already represented | Yes. Chest-pain red flags are represented. |
| Partially represented | Yes. Existing entries cover escalation, but a small refinement could improve urgent/emergency phrasing or limitation wording. |
| Missing patient-facing explanation | Partial gap. The current coverage is red-flag focused rather than explanatory. |
| Missing red-flag detail | Partial gap. Red flags exist, but symptom-cluster wording may need clearer patient-facing grouping. |
| Missing urgent/emergency phrasing | Partial gap. Emergency wording exists, but one tighter item may help retrieval for urgent phrasing. |
| Missing limitation/disclaimer content | Partial gap. One item already discourages self-diagnosis; this can remain conservative. |
| Candidate source needed | No new source needed. Existing `chest_pain` source is registered and extracted. |
| duplicate_or_review_needed | No duplicate source found for this domain in the current manifests. |

### 3. Shortness of Breath

Current KB coverage:

- `shortness_of_breath`: 3 KB items in `medical_kb_v1_2.json`
- Relevant section: `red_flags`
- Existing emphasis: emergency support, early medical assessment, and avoiding self-diagnosis

Current raw/extract coverage:

- `shortness_of_breath`: registered and extracted; `use_in_v1=true`; review required

Gap classification:

| Gap type | Classification |
|---|---|
| Already represented | Yes. Shortness-of-breath red flags are represented. |
| Partially represented | Yes. Current entries are suitable but compact. |
| Missing patient-facing explanation | Partial gap. The current coverage focuses on escalation rather than plain-language explanation. |
| Missing red-flag detail | Partial gap. Emergency and early-assessment concepts exist, but wording could be strengthened for retrieval around severe breathlessness. |
| Missing urgent/emergency phrasing | Partial gap. Emergency support exists, but one focused item could improve urgent-language coverage. |
| Missing limitation/disclaimer content | Partial gap. Self-diagnosis boundary exists and should be preserved. |
| Candidate source needed | No new source needed. Existing `shortness_of_breath` source is registered and extracted. |
| duplicate_or_review_needed | No duplicate source found for this domain in the current manifests. |

### 4. Sepsis / Severe Infection Red Flags

Current KB coverage:

- `nice_sepsis_overview`: 4 KB items in `medical_kb_v1_2.json`
- Relevant section: `red_flags`
- Existing emphasis: severe infection concern, visible warning signs, deterioration, and emergency transfer

Current raw/extract coverage:

- `nice_sepsis_overview`: registered and extracted; `use_in_v1=true`; represented in the KB
- `nice_sepsis_guideline`: registered and extracted; `use_in_v1=true`; not represented in the v1_2 KB source list

Gap classification:

| Gap type | Classification |
|---|---|
| Already represented | Yes. Severe infection / sepsis red flags are represented by 4 KB items. |
| Partially represented | Yes. The overview source is represented, but the registered `nice_sepsis_guideline` source is not represented in v1_2 KB items. |
| Missing patient-facing explanation | Partial gap. Current content is red-flag focused; any addition must remain patient-facing and non-diagnostic. |
| Missing red-flag detail | Partial gap. Existing red flags are strong, but the guideline source may support a carefully reviewed severe-infection escalation item. |
| Missing urgent/emergency phrasing | Partial gap. Emergency transfer wording exists, but the final-answer simulation has one residual severe-infection mode case. |
| Missing limitation/disclaimer content | Partial gap. Future wording should clarify that severe infection concern requires urgent clinical assessment and cannot be confirmed by HomeLab. |
| Candidate source needed | No new source needed for planning. `nice_sepsis_guideline` is already registered and extracted, but review-required. |
| duplicate_or_review_needed | Not marked as duplicate, but review is required because sepsis content is high-risk and guideline-derived. |

## Recommended Small Batch A Target

Recommended Batch A target: 4 additions maximum.

| Priority | Domain | Proposed addition | Candidate source |
|---:|---|---|---|
| 1 | Sepsis / severe infection red flags | Add one carefully reviewed patient-facing item for severe infection escalation and clinical-assessment limitation. | `nice_sepsis_guideline` |
| 2 | Chest pain | Add one focused item strengthening emergency symptom-cluster retrieval and urgent-care phrasing. | `chest_pain` |
| 3 | Shortness of breath | Add one focused item strengthening severe breathlessness emergency phrasing and limitation wording. | `shortness_of_breath` |
| 4 | Blood tests | Add one concise limitation/disclaimer item explaining that blood tests support assessment but need clinical interpretation. | `blood_tests`; optionally review `medlineplus_blood_testing_overview` for non-duplicative wording only |

This target stays within the 3 to 5 item limit, avoids broad new disease domains, and uses patient-facing source material already registered and extracted in the repository.

## Candidate Sources to Avoid or Hold Out

- `nhs_blood_tests`: hold out because it is marked as an exact duplicate of `blood_tests`.
- `medlineplus_blood_testing_overview`: use only if manual review finds non-duplicative limitation or preparation wording.
- `cdc_dpdx_blood_collection`: exclude from patient-facing Batch A because it is sample-collection/lab-operations oriented.
- `cdc_specimen_packing_and_shipping`: exclude from patient-facing Batch A because it is lab-operations/shipping oriented.
- `who_infectious_shipping_guidance`: exclude from patient-facing Batch A because it is lab-operations/shipping oriented.

## Do Not Do Yet

- Do not edit `ai_lab/datasets/medical_kb_v1_2.json`.
- Do not create `ai_lab/datasets/medical_kb_v1_3.json` yet.
- Do not rebuild chunks.
- Do not rebuild embeddings.
- Do not rebuild FAISS.
- Do not rerun eval.
- Do not touch backend, frontend, package logic, or recommendation-layer logic.

