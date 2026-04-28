#!/usr/bin/env python
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
SCRIPT_DIR = ROOT / "ai_lab" / "scripts"
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from semantic_retriever_bridge_v1_4 import (  # noqa: E402
    ARTIFACT_DIR,
    RETRIEVAL_STRATEGY,
    SemanticRetrieverV14,
)


QUERIES = [
    "tôi muốn xét nghiệm tổng quát",
    "tôi hay mệt muốn biết nên xét nghiệm gì",
    "tôi muốn kiểm tra thận",
    "xét nghiệm đường huyết với HbA1c khác gì nhau",
    "mỡ máu cholesterol triglyceride là gì",
    "xét nghiệm men gan ALT AST bilirubin để làm gì",
    "xét nghiệm nước tiểu có kiểm tra được thận không",
    "xét nghiệm tuyến giáp TSH T4 là gì",
    "trước khi xét nghiệm máu có cần nhịn ăn không",
    "tôi có kết quả CBC rồi, đọc giúp tôi bị bệnh gì",
]


def fail(errors: list[str], query: str, message: str) -> None:
    errors.append(f"{query}: {message}")


def has_minimum_result_metadata(result: dict[str, Any]) -> bool:
    return bool(
        (result.get("topic"))
        and (result.get("domain"))
        and (result.get("source_url") or result.get("final_url"))
        and result.get("provenance") is not None
    )


def main() -> None:
    errors: list[str] = []
    warnings: list[str] = []
    retriever = SemanticRetrieverV14(ARTIFACT_DIR)
    query_summaries = []

    for query in QUERIES:
        payload = retriever.run_retrieval(query, top_k=5, candidate_top_k=20)
        results = payload.get("results") or payload.get("topChunks") or []

        if payload.get("retrieverVersion") != "v1_4":
            fail(errors, query, "retrieverVersion is not v1_4")
        if payload.get("retrievalStrategy") != RETRIEVAL_STRATEGY:
            fail(errors, query, "retrievalStrategy mismatch")
        if not str(payload.get("artifactDir") or "").endswith("ai_lab/artifacts/retriever_v1_4"):
            fail(errors, query, "artifactDir is not retriever_v1_4")
        if payload.get("runtimePromoted") is True:
            fail(errors, query, "runtimePromoted is true")
        if payload.get("runtimeDefaultChanged") is True:
            fail(errors, query, "runtimeDefaultChanged is true")
        if not results:
            fail(errors, query, "no results returned")
        if not payload.get("queryExpansionApplied"):
            fail(errors, query, "queryExpansionApplied is not true")

        for index, result in enumerate(results, 1):
            if not has_minimum_result_metadata(result):
                fail(errors, query, f"result {index} missing topic/domain/source/provenance metadata")
            if result.get("runtimePromoted") is True:
                fail(errors, query, f"result {index} unexpectedly has runtimePromoted=true")

        query_summaries.append(
            {
                "query": query,
                "queryExpansionApplied": payload.get("queryExpansionApplied"),
                "detectedAliasGroups": payload.get("detectedAliasGroups", []),
                "result_count": len(results),
                "top_topic": results[0].get("topic") if results else None,
                "top_domain": results[0].get("domain") if results else None,
                "latencyMs": payload.get("latencyMs"),
            }
        )

    summary = {
        "smoke": "semantic_bridge_v1_4_controlled",
        "total_queries": len(QUERIES),
        "passed_queries": len(QUERIES) if not errors else 0,
        "retrieverVersion": "v1_4",
        "retrievalStrategy": RETRIEVAL_STRATEGY,
        "artifactDir": "ai_lab/artifacts/retriever_v1_4",
        "runtimePromoted": False,
        "runtimeDefaultChanged": False,
        "warning_count": len(warnings),
        "error_count": len(errors),
        "warnings": warnings,
        "errors": errors,
        "queries": query_summaries,
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    if errors:
        sys.exit(1)


if __name__ == "__main__":
    main()
