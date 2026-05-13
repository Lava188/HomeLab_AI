#!/usr/bin/env python
from __future__ import annotations

import contextlib
import io
import json
import sys
from pathlib import Path
from typing import Any

import numpy as np


ROOT = Path(__file__).resolve().parents[2]
ARTIFACT_DIR = ROOT / "ai_lab" / "artifacts" / "retriever_v1_4"
EXPECTED_COUNT = 97
EXPECTED_SOURCE_CORPUS = "ai_lab/artifacts/retriever_v1_4/kb_v1_4_merged_corpus.jsonl"
DISALLOWED_MARKERS = ("mock", "simulated", "demo")


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def contains_disallowed_marker(value: Any) -> str | None:
    text = json.dumps(value, ensure_ascii=False).lower()
    for marker in DISALLOWED_MARKERS:
        if marker in text:
            return marker
    return None


def main() -> None:
    with contextlib.redirect_stdout(io.StringIO()):
        import faiss  # type: ignore

    warnings: list[str] = []
    errors: list[str] = []

    manifest_path = ARTIFACT_DIR / "retriever_manifest.json"
    config_path = ARTIFACT_DIR / "embedding_config.json"
    chunks_path = ARTIFACT_DIR / "kb_chunks_v1_4.json"
    metadata_path = ARTIFACT_DIR / "chunk_metadata.json"
    embeddings_path = ARTIFACT_DIR / "chunk_embeddings.npy"
    faiss_path = ARTIFACT_DIR / "faiss.index"

    for path in [manifest_path, config_path, chunks_path, metadata_path, embeddings_path, faiss_path]:
        if not path.exists():
            errors.append(f"Missing artifact file: {path.relative_to(ROOT).as_posix()}")

    if errors:
        print(json.dumps({"error_count": len(errors), "errors": errors}, ensure_ascii=False, indent=2))
        sys.exit(1)

    manifest = load_json(manifest_path)
    config = load_json(config_path)
    chunks = load_json(chunks_path)
    metadata = load_json(metadata_path)
    embeddings = np.load(embeddings_path)
    index = faiss.read_index(str(faiss_path))

    if len(chunks) != EXPECTED_COUNT:
        errors.append(f"Expected {EXPECTED_COUNT} chunks, got {len(chunks)}.")
    if len(metadata) != EXPECTED_COUNT:
        errors.append(f"Expected {EXPECTED_COUNT} metadata rows, got {len(metadata)}.")
    if embeddings.shape[0] != EXPECTED_COUNT:
        errors.append(f"Expected {EXPECTED_COUNT} embedding vectors, got {embeddings.shape[0]}.")
    if int(index.ntotal) != EXPECTED_COUNT:
        errors.append(f"Expected FAISS ntotal {EXPECTED_COUNT}, got {int(index.ntotal)}.")

    embedding_dimension = int(config.get("embedding_dimension") or 0)
    if embeddings.ndim != 2:
        errors.append(f"Embeddings must be 2D, got shape {embeddings.shape}.")
    elif embeddings.shape[1] != embedding_dimension:
        errors.append(
            f"Embedding dimension mismatch: config={embedding_dimension}, actual={embeddings.shape[1]}."
        )
    if int(index.d) != embedding_dimension:
        errors.append(f"FAISS dimension mismatch: config={embedding_dimension}, index={int(index.d)}.")

    chunk_ids: set[str] = set()
    kb_ids: set[str] = set()
    merged_ids: set[str] = set()
    domain_counts: dict[str, int] = {}
    record_type_counts: dict[str, int] = {}

    for row_number, chunk in enumerate(chunks, start=1):
        label = chunk.get("chunk_id") or f"row_{row_number}"
        for field in ["chunk_id", "kb_id", "merged_id", "content", "provenance", "source_url", "domain", "topic"]:
            if chunk.get(field) in (None, ""):
                errors.append(f"{label}: missing {field}.")

        if not str(chunk.get("content") or "").strip():
            errors.append(f"{label}: content is empty.")

        if chunk.get("runtime_promoted") is not False:
            errors.append(f"{label}: runtime_promoted must be false.")

        marker = contains_disallowed_marker(
            {"content": chunk.get("content"), "provenance": chunk.get("provenance")}
        )
        if marker:
            errors.append(f"{label}: disallowed marker '{marker}' found in content/provenance.")

        for field_name, target_set in [
            ("chunk_id", chunk_ids),
            ("kb_id", kb_ids),
            ("merged_id", merged_ids),
        ]:
            value = str(chunk.get(field_name) or "")
            if value:
                if value in target_set:
                    errors.append(f"Duplicate {field_name}: {value}.")
                target_set.add(value)

        domain = str(chunk.get("domain") or "unknown")
        record_type = str(chunk.get("record_type") or "unknown")
        domain_counts[domain] = domain_counts.get(domain, 0) + 1
        record_type_counts[record_type] = record_type_counts.get(record_type, 0) + 1

    if manifest.get("runtime_promoted") is not False:
        errors.append("Manifest runtime_promoted must be false.")
    if manifest.get("runtime_default_changed") is not False:
        errors.append("Manifest runtime_default_changed must be false.")
    if manifest.get("source_corpus_path") != EXPECTED_SOURCE_CORPUS:
        errors.append("Manifest source_corpus_path is incorrect.")
    if manifest.get("total_chunks") != EXPECTED_COUNT:
        errors.append(f"Manifest total_chunks must be {EXPECTED_COUNT}.")
    if manifest.get("embeddings_built") is not True:
        errors.append("Manifest embeddings_built must be true.")
    if manifest.get("faiss_built") is not True:
        errors.append("Manifest faiss_built must be true.")

    summary = {
        "total_chunks": len(chunks),
        "embedding_vector_count": int(embeddings.shape[0]) if embeddings.ndim >= 1 else 0,
        "embedding_dimension": int(embeddings.shape[1]) if embeddings.ndim == 2 else None,
        "config_embedding_dimension": embedding_dimension,
        "faiss_ntotal": int(index.ntotal),
        "faiss_dimension": int(index.d),
        "warning_count": len(warnings),
        "error_count": len(errors),
        "domain_counts": domain_counts,
        "record_type_counts": record_type_counts,
        "warnings": warnings,
        "errors": errors,
    }

    print(json.dumps(summary, ensure_ascii=False, indent=2))

    if errors:
        sys.exit(1)


if __name__ == "__main__":
    main()
