#!/usr/bin/env python
from __future__ import annotations

import contextlib
import io
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np


ROOT = Path(__file__).resolve().parents[2]
ARTIFACT_DIR = ROOT / "ai_lab" / "artifacts" / "retriever_v1_4"
V1_3_CONFIG_PATH = ROOT / "ai_lab" / "artifacts" / "retriever_v1_3" / "embedding_config.json"
SOURCE_CORPUS_PATH = ARTIFACT_DIR / "kb_v1_4_merged_corpus.jsonl"

KB_FILE = "kb_chunks_v1_4.json"
METADATA_FILE = "chunk_metadata.json"
EMBEDDINGS_FILE = "chunk_embeddings.npy"
FAISS_INDEX_FILE = "faiss.index"
EMBEDDING_CONFIG_FILE = "embedding_config.json"
MANIFEST_FILE = "retriever_manifest.json"


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError as exc:
            raise ValueError(f"{path}:{line_number}: invalid JSON: {exc}") from exc
    return rows


def write_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def build_chunk_text(row: dict[str, Any]) -> str:
    existing = str(row.get("chunk_text") or "").strip()
    if existing:
        return existing

    parts = [
        f"Title: {row.get('title') or ''}",
        f"Topic: {row.get('topic') or ''}",
        f"Intended use: {row.get('intended_use') or ''}",
        f"Medical scope: {row.get('medical_scope') or ''}",
        f"Content: {row.get('content') or ''}",
    ]
    return "\n".join(part for part in parts if part.strip())


def stable_chunk_id(row: dict[str, Any], index: int) -> str:
    if row.get("chunk_id"):
        return str(row["chunk_id"])
    if row.get("kb_id"):
        return f"{row['kb_id']}_c1"
    return f"kb_v1_4_unknown_{index + 1:03d}_c1"


def to_chunk(row: dict[str, Any], index: int) -> dict[str, Any]:
    chunk_id = stable_chunk_id(row, index)
    content = str(row.get("content") or "").strip()
    chunk = {
        "chunk_id": chunk_id,
        "kb_id": row.get("kb_id") or chunk_id,
        "merged_id": row.get("merged_id"),
        "record_type": row.get("record_type"),
        "source_id": row.get("source_id"),
        "source_url": row.get("source_url"),
        "final_url": row.get("final_url"),
        "domain": row.get("domain"),
        "topic": row.get("topic"),
        "title": row.get("title"),
        "content": content,
        "chunk_text": build_chunk_text(row),
        "intended_use": row.get("intended_use"),
        "medical_scope": row.get("medical_scope"),
        "version": row.get("version"),
        "provenance": row.get("provenance"),
        "runtime_promoted": False,
    }

    for optional_field in [
        "section",
        "risk_level",
        "tags",
        "keywords",
        "test_types",
        "faq_type",
        "safety_notes",
        "review_status",
        "language",
        "locale",
    ]:
        if optional_field in row:
            chunk[optional_field] = row[optional_field]

    return chunk


def to_metadata(chunk: dict[str, Any]) -> dict[str, Any]:
    return {
        "chunk_id": chunk.get("chunk_id"),
        "kb_id": chunk.get("kb_id"),
        "merged_id": chunk.get("merged_id"),
        "record_type": chunk.get("record_type"),
        "source_id": chunk.get("source_id"),
        "source_url": chunk.get("source_url"),
        "final_url": chunk.get("final_url"),
        "domain": chunk.get("domain"),
        "topic": chunk.get("topic"),
        "title": chunk.get("title"),
        "intended_use": chunk.get("intended_use"),
        "medical_scope": chunk.get("medical_scope"),
        "version": chunk.get("version"),
        "runtime_promoted": False,
    }


def main() -> None:
    with contextlib.redirect_stdout(io.StringIO()):
        import faiss  # type: ignore
        from sentence_transformers import SentenceTransformer  # type: ignore

    config = load_json(V1_3_CONFIG_PATH)
    model_name = config["model_name"]
    text_field = config.get("text_field", "chunk_text")
    passage_prefix = config.get("passage_prefix", "passage: ")
    normalize_embeddings = bool(config.get("normalized", True))

    corpus_rows = load_jsonl(SOURCE_CORPUS_PATH)
    chunks = [to_chunk(row, index) for index, row in enumerate(corpus_rows)]
    metadata = [to_metadata(chunk) for chunk in chunks]
    texts = [passage_prefix + str(chunk.get(text_field) or "") for chunk in chunks]

    with contextlib.redirect_stdout(io.StringIO()):
        model = SentenceTransformer(model_name)
        embeddings = model.encode(
            texts,
            convert_to_numpy=True,
            normalize_embeddings=normalize_embeddings,
            show_progress_bar=True,
        ).astype("float32")

    if embeddings.ndim != 2:
        raise ValueError(f"Expected 2D embeddings array, got shape {embeddings.shape}")

    dimension = int(embeddings.shape[1])
    expected_dimension = int(config.get("embedding_dimension") or dimension)
    if dimension != expected_dimension:
        raise ValueError(
            f"Embedding dimension mismatch: config={expected_dimension}, actual={dimension}"
        )

    index_type = config.get("index_type", "IndexFlatIP")
    if index_type != "IndexFlatIP":
        raise ValueError(f"Unsupported index_type for v1.4 build: {index_type}")

    index = faiss.IndexFlatIP(dimension)
    index.add(embeddings)

    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    write_json(ARTIFACT_DIR / KB_FILE, chunks)
    write_json(ARTIFACT_DIR / METADATA_FILE, metadata)
    np.save(ARTIFACT_DIR / EMBEDDINGS_FILE, embeddings)
    faiss.write_index(index, str(ARTIFACT_DIR / FAISS_INDEX_FILE))

    build_config = {
        **config,
        "embedding_dimension": dimension,
        "text_field": text_field,
    }
    write_json(ARTIFACT_DIR / EMBEDDING_CONFIG_FILE, build_config)

    manifest = {
        "retriever_version": "v1_4",
        "kb_version": "v1_4",
        "source_corpus_path": "ai_lab/artifacts/retriever_v1_4/kb_v1_4_merged_corpus.jsonl",
        "artifact_dir": "ai_lab/artifacts/retriever_v1_4",
        "kb_file": KB_FILE,
        "metadata_file": METADATA_FILE,
        "embeddings_file": EMBEDDINGS_FILE,
        "faiss_index_file": FAISS_INDEX_FILE,
        "embedding_config_file": EMBEDDING_CONFIG_FILE,
        "total_chunks": len(chunks),
        "chunk_count": len(chunks),
        "embedding_vector_count": int(embeddings.shape[0]),
        "embedding_dimension": dimension,
        "model_name": model_name,
        "index_type": index_type,
        "top_k_default": 3,
        "mode": "offline_controlled_only",
        "runtime_promoted": False,
        "runtime_default_changed": False,
        "embeddings_built": True,
        "faiss_built": True,
        "build_route": "codex_batch4a_merged_corpus_offline_build",
        "build_timestamp_utc": datetime.now(timezone.utc).isoformat(),
    }
    write_json(ARTIFACT_DIR / MANIFEST_FILE, manifest)

    print(
        json.dumps(
            {
                "total_chunks": len(chunks),
                "embedding_vector_count": int(embeddings.shape[0]),
                "embedding_dimension": dimension,
                "faiss_ntotal": int(index.ntotal),
                "model_name": model_name,
                "runtime_promoted": False,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
