# Semantic Retrieval Controlled Hybrid Report

## Executive summary

Routing/policy smoke ran 8 queries. Passed 8/8.

Sepsis pair top chunk/source coherence: yes.

Total smoke latency: 912 ms.

Recommendation: **READY_FOR_FRONTEND_MANUAL_TEST**.

## Files changed

- `backend/src/services/router-intent.service.js`
- `backend/scripts/smoke_semantic_bridge_v1_3.js`
- `ai_lab/reports/semantic_retrieval_controlled_hybrid_report.md`

## Server health

`{"ok":true,"runtimeMode":"semantic_faiss","retrieverVersion":"v1_3","modelName":"intfloat/multilingual-e5-small","chunkCount":42,"uptimeSeconds":5633.67,"bridgeMode":"server","serverUrl":"http://127.0.0.1:8765"}`

## Smoke results

| Case | Query | Expected | Pass | Flow | Intent group | Selected retrieval | Top chunk | Top source | Sepsis leak | Latency |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sepsis_plain | nhiễm trùng nặng rất mệt xấu đi nhanh | urgent_health | yes | health_rag | urgent_health | semantic_faiss | kb_v1_001_c1 | nice_sepsis_overview | yes | 460 ms |
| sepsis_with_term | nhiễm trùng nặng rất mệt xấu đi nhanh sepsis | urgent_health | yes | health_rag | urgent_health | semantic_faiss | kb_v1_001_c1 | nice_sepsis_overview | yes | 30 ms |
| chest_pain | đau ngực và mồ hôi khó thở | urgent_health | yes | health_rag | urgent_health | semantic_faiss | kb_v1_3_040_c1 | chest_pain | no | 30 ms |
| mixed_booking_urgent | tôi muốn đặt lịch xét nghiệm vì đau ngực khó thở và vã mồ hôi | urgent_health | yes | health_rag | urgent_health | semantic_faiss | kb_v1_3_040_c1 | chest_pain | no | 62 ms |
| fatigue_test_advice | tôi hay mệt và muốn biết nên xét nghiệm gì | test_advice | yes | health_rag | test_advice | lexical_fallback | kb_v1_3_042_c1 | blood_tests | no | 29 ms |
| general_checkup | tôi muốn xét nghiệm tổng quát | test_advice | yes | health_rag | test_advice | semantic_faiss | kb_v1_2_019_c1 | medlineplus_cbc_test | no | 25 ms |
| booking_explicit | tôi muốn đặt lịch xét nghiệm tổng quát ngày mai | booking | yes | booking | booking | none | none | none | no | 12 ms |
| booking_sample_home | đặt lịch lấy mẫu máu tại nhà | booking | yes | booking | booking | none | none | none | no | 1 ms |

## Pass/fail

PASS: urgent red-flag queries take priority over booking actions, while normal booking cases remain booking.

## Known limitations

- Urgent-over-booking priority is a routing safety rule, not a diagnosis classifier.
- Semantic retrieval remains opt-in and does not change default runtime/env.

## Recommendation next step

**READY_FOR_FRONTEND_MANUAL_TEST**: verify mixed urgent booking cases in the chat UI Network response.