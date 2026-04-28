#!/usr/bin/env python
from __future__ import annotations

import json
import subprocess
import sys
import time
from pathlib import Path
from typing import Any
from urllib.error import URLError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[2]
BRIDGE_SCRIPT = ROOT / "ai_lab" / "scripts" / "semantic_retriever_bridge_v1_4.py"
ARTIFACT_DIR = ROOT / "ai_lab" / "artifacts" / "retriever_v1_4"
HOST = "127.0.0.1"
PORT = 8766
BASE_URL = f"http://{HOST}:{PORT}"
RETRIEVAL_STRATEGY = "expanded_query_topic_aware_rerank"

QUERIES = [
    "xét nghiệm tổng quát",
    "mệt mỏi nên xét nghiệm gì",
    "kiểm tra thận",
    "HbA1c với đường huyết khác nhau thế nào",
    "mỡ máu cholesterol triglyceride là gì",
    "men gan ALT AST để làm gì",
    "xét nghiệm nước tiểu kiểm tra được gì",
    "xét nghiệm tuyến giáp TSH T4 là gì",
    "có cần nhịn ăn trước khi xét nghiệm máu không",
    "tôi có kết quả CBC rồi đọc giúp tôi",
]

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


def request_json(method: str, path: str, payload: dict[str, Any] | None = None, timeout: float = 10.0) -> dict[str, Any]:
    body = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json; charset=utf-8"

    request = Request(f"{BASE_URL}{path}", data=body, headers=headers, method=method)
    with urlopen(request, timeout=timeout) as response:  # noqa: S310 - local smoke against loopback bridge.
        return json.loads(response.read().decode("utf-8"))


def wait_for_health(deadline_seconds: float = 90.0) -> dict[str, Any]:
    deadline = time.time() + deadline_seconds
    last_error = None
    while time.time() < deadline:
        try:
            payload = request_json("GET", "/health", timeout=3.0)
            if payload:
                return payload
        except (URLError, TimeoutError, ConnectionError, json.JSONDecodeError) as error:
            last_error = error
        time.sleep(1.0)
    raise RuntimeError(f"bridge /health did not become ready: {last_error}")


def artifact_ok(value: Any) -> bool:
    normalized = str(value or "").replace("\\", "/")
    return normalized.endswith("ai_lab/artifacts/retriever_v1_4")


def add_error(errors: list[str], label: str, message: str) -> None:
    errors.append(f"{label}: {message}")


def validate_health(payload: dict[str, Any], errors: list[str]) -> bool:
    before = len(errors)
    if payload.get("ok") is not True:
        add_error(errors, "health", "ok is not true")
    if payload.get("retrieverVersion") != "v1_4":
        add_error(errors, "health", "retrieverVersion is not v1_4")
    if payload.get("retrievalStrategy") != RETRIEVAL_STRATEGY:
        add_error(errors, "health", "retrievalStrategy mismatch")
    if not artifact_ok(payload.get("artifactDir")):
        add_error(errors, "health", "artifactDir does not end with ai_lab/artifacts/retriever_v1_4")
    if payload.get("chunkCount") != 97:
        add_error(errors, "health", "chunkCount is not 97")
    if payload.get("candidateTopKDefault") != 20:
        add_error(errors, "health", "candidateTopKDefault is not 20")
    if payload.get("finalTopKDefault") != 5:
        add_error(errors, "health", "finalTopKDefault is not 5")
    if payload.get("runtimePromoted") is not False:
        add_error(errors, "health", "runtimePromoted is not false")
    if payload.get("runtimeDefaultChanged") is not False:
        add_error(errors, "health", "runtimeDefaultChanged is not false")
    return len(errors) == before


def result_has_minimum_contract(result: dict[str, Any]) -> bool:
    return bool(
        (result.get("chunk_id") or result.get("kb_id"))
        and result.get("topic")
        and result.get("domain")
        and (result.get("source_url") or result.get("final_url"))
        and result.get("provenance") is not None
        and result.get("semanticScore") is not None
        and result.get("rerankScore") is not None
        and result.get("rankBeforeRerank") is not None
        and result.get("rankAfterRerank") is not None
    )


def validate_query_response(query: str, payload: dict[str, Any], errors: list[str]) -> bool:
    before = len(errors)
    label = f"query={query}"
    if payload.get("retrieverVersion") != "v1_4":
        add_error(errors, label, "retrieverVersion is not v1_4")
    if payload.get("retrievalStrategy") != RETRIEVAL_STRATEGY:
        add_error(errors, label, "retrievalStrategy mismatch")
    if not artifact_ok(payload.get("artifactDir")):
        add_error(errors, label, "artifactDir mismatch")
    if payload.get("candidateTopK") != 20:
        add_error(errors, label, "candidateTopK is not 20")
    if payload.get("finalTopK") != 5:
        add_error(errors, label, "finalTopK is not 5")
    if payload.get("runtimePromoted") is not False:
        add_error(errors, label, "runtimePromoted is not false")
    if payload.get("runtimeDefaultChanged") is not False:
        add_error(errors, label, "runtimeDefaultChanged is not false")

    results = payload.get("results") or payload.get("topChunks") or []
    if not results:
        add_error(errors, label, "no results/topChunks returned")
    for index, result in enumerate(results, 1):
        if not isinstance(result, dict) or not result_has_minimum_contract(result):
            add_error(errors, label, f"result {index} missing minimum result contract")

    return len(errors) == before


def start_bridge() -> subprocess.Popen[str]:
    command = [
        sys.executable,
        str(BRIDGE_SCRIPT),
        "--serve",
        "--host",
        HOST,
        "--port",
        str(PORT),
        "--artifact-dir",
        str(ARTIFACT_DIR),
    ]
    return subprocess.Popen(
        command,
        cwd=str(ROOT),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
    )


def stop_bridge(process: subprocess.Popen[str]) -> None:
    if process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=10)


def main() -> None:
    errors: list[str] = []
    warnings: list[str] = []
    query_summaries: list[dict[str, Any]] = []
    health_payload: dict[str, Any] = {}
    passed_queries = 0
    process = start_bridge()

    try:
        health_payload = wait_for_health()
        health_ok = validate_health(health_payload, errors)

        for query in QUERIES:
            try:
                payload = request_json(
                    "POST",
                    "/query",
                    {
                        "query": query,
                        "topK": 5,
                        "candidateTopK": 20,
                    },
                    timeout=30.0,
                )
                if validate_query_response(query, payload, errors):
                    passed_queries += 1
                results = payload.get("results") or payload.get("topChunks") or []
                top_result = results[0] if results else {}
                query_summaries.append(
                    {
                        "query": query,
                        "result_count": len(results),
                        "queryExpansionApplied": payload.get("queryExpansionApplied"),
                        "detectedAliasGroups": payload.get("detectedAliasGroups", []),
                        "queryExpansionTerms": payload.get("queryExpansionTerms", []),
                        "top_topic": top_result.get("topic"),
                        "top_domain": top_result.get("domain"),
                        "latencyMs": payload.get("latencyMs"),
                    }
                )
            except Exception as error:  # noqa: BLE001 - smoke should report all query failures.
                add_error(errors, f"query={query}", f"{type(error).__name__}: {error}")
                query_summaries.append(
                    {
                        "query": query,
                        "result_count": 0,
                        "queryExpansionApplied": None,
                        "detectedAliasGroups": [],
                        "queryExpansionTerms": [],
                        "top_topic": None,
                        "top_domain": None,
                        "latencyMs": None,
                    }
                )
    except Exception as error:  # noqa: BLE001
        health_ok = False
        add_error(errors, "startup", f"{type(error).__name__}: {error}")
    finally:
        stop_bridge(process)

    if process.returncode not in (0, None, -15, 1):
        warnings.append(f"bridge exited with returncode={process.returncode}")

    summary = {
        "smoke": "semantic_bridge_v1_4_server_contract",
        "health_ok": bool(health_payload) and "health: " not in "\n".join(errors),
        "total_queries": len(QUERIES),
        "passed_queries": passed_queries,
        "retrieverVersion": health_payload.get("retrieverVersion"),
        "retrievalStrategy": health_payload.get("retrievalStrategy"),
        "artifactDir": health_payload.get("artifactDir"),
        "runtimePromoted": False,
        "runtimeDefaultChanged": False,
        "warning_count": len(warnings),
        "error_count": len(errors),
        "errors": errors,
        "warnings": warnings,
        "queries": query_summaries,
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    if errors:
        sys.exit(1)


if __name__ == "__main__":
    main()
