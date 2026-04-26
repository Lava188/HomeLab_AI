# Semantic Bridge v1.3 Shadow Smoke Report

## Executive summary

Semantic bridge smoke ran 6 queries. Routed runtime bridge passed 6/6; direct diagnostic bridge returned `ok` for 6/6.

Runtime integration criteria: routed status ok (6/6), routed mode semantic_faiss (6/6), routed topChunk present (6/6), routed semanticScore valid (6/6).

Latency criteria: total <= 60000 ms and each query <= 15000 ms. Observed total 587 ms; slow queries 0/6.

Recommendation for next step: **READY_FOR_CONTROLLED_HYBRID**.

## Files changed

- `backend/src/services/health-rag/semantic-bridge.service.js`
- `ai_lab/scripts/semantic_retriever_bridge_v1_3.py`
- `backend/scripts/smoke_semantic_bridge_v1_3.js`
- `ai_lab/reports/semantic_bridge_v1_3_shadow_smoke_report.md`

## How to run

Start the persistent bridge server:

```powershell
python ai_lab/scripts/semantic_retriever_bridge_v1_3.py --serve --host 127.0.0.1 --port 8765
```

Run the smoke against server mode:

```powershell
$env:HOMELAB_SEMANTIC_BRIDGE_MODE='server'
$env:HOMELAB_SEMANTIC_BRIDGE_URL='http://127.0.0.1:8765'
node backend/scripts/smoke_semantic_bridge_v1_3.js
```

## Environment flags

- `HOMELAB_SEMANTIC_BRIDGE_SHADOW=true` enables shadow bridge attachment inside `rag.service.js`.
- `HOMELAB_SEMANTIC_ROUTER_GATE=true` enables the controlled semantic router gate for this smoke.
- `HOMELAB_SEMANTIC_ROUTER_GATE_MIN_SCORE` can override the gate's minimum accepted semantic score. Default: `0.8`.
- `HOMELAB_SEMANTIC_BRIDGE_MODE=server` makes Node call a persistent bridge server instead of spawning Python per query.
- `HOMELAB_SEMANTIC_BRIDGE_URL` sets the server URL. Default: `http://127.0.0.1:8765`.
- `HOMELAB_SEMANTIC_BRIDGE_TIMEOUT_MS` controls Python subprocess timeout. This smoke uses `120000` ms unless the caller sets a value.
- `HOMELAB_PYTHON_BIN` can override the Python executable.
- No default runtime switch is performed by this smoke.

## Bridge health

- Bridge mode: `server`
- Server health: `{"ok":true,"runtimeMode":"semantic_faiss","retrieverVersion":"v1_3","modelName":"intfloat/multilingual-e5-small","chunkCount":42,"uptimeSeconds":16.94,"bridgeMode":"server","serverUrl":"http://127.0.0.1:8765"}`
- Total smoke latency: 587 ms

## Smoke results

| Query | Original flow | Final flow | Gate status | Routed status | Routed mode | Routed top | Direct status | Direct top | Route latency | Direct latency | Total latency | Match |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| nhiễm trùng nặng rất mệt xấu đi nhanh | fallback | health_rag | routed | ok | semantic_faiss | kb_v1_001_c1 | ok | kb_v1_001_c1 | 335 ms | 13 ms | 355 ms | different_source |
| nhiễm trùng nặng rất mệt xấu đi nhanh sepsis | health_rag | health_rag | skipped | ok | semantic_faiss | kb_v1_001_c1 | ok | kb_v1_001_c1 | 18 ms | 16 ms | 37 ms | different_source |
| sốt cao rét run người lả đi | fallback | health_rag | routed | ok | semantic_faiss | kb_v1_003_c1 | ok | kb_v1_003_c1 | 32 ms | 15 ms | 49 ms | different_source |
| đau ngực vã mồ hôi khó thở | health_rag | health_rag | skipped | ok | semantic_faiss | kb_v1_3_040_c1 | ok | kb_v1_3_040_c1 | 19 ms | 14 ms | 35 ms | same_chunk |
| tôi muốn xét nghiệm tổng quát | booking | health_rag | routed | ok | semantic_faiss | kb_v1_2_019_c1 | ok | kb_v1_2_019_c1 | 32 ms | 14 ms | 47 ms | different_source |
| tôi hay mệt và muốn biết nên xét nghiệm gì | booking | health_rag | routed | ok | semantic_faiss | kb_v1_001_c1 | ok | kb_v1_001_c1 | 32 ms | 16 ms | 49 ms | different_source |

## Runtime bridge attached?

Yes. Every routed query exposed `meta.debug.semanticBridge` with status `ok`, runtime mode `semantic_faiss`, at least one top chunk, and a valid numeric semantic score.

## Direct bridge runs?

Yes. Direct diagnostic bridge returned `ok` for 6/6 queries and valid semantic scores for 6/6.

## Runtime integration pass?

PASS: runtime metadata confirms semantic bridge attachment for every smoke query and latency is within budget.

## Whether FAISS is used

FAISS is verified by the direct diagnostic bridge through `ai_lab/scripts/semantic_retriever_bridge_v1_3.py`, which calls `faiss.read_index()` and `index.search()`.

## Known limitations

- `runSemanticBridge(..., force: true)` is diagnostic only and is not used to pass runtime integration.
- The semantic router gate uses semantic retrieval only to choose `health_rag`; final answers still use the existing lexical retrieval path.
- The gate does not run for clear booking actions, cancel/reschedule flows, or active operational sessions.
- Server mode keeps FAISS and the embedding model loaded in one Python process; warm calls avoid per-query model load.

## Blockers

- No runtime attachment or latency blocker found by this smoke.

## Recommendation for next step

**READY_FOR_CONTROLLED_HYBRID**: proceed only after reviewing ranking quality; do not switch default runtime yet.