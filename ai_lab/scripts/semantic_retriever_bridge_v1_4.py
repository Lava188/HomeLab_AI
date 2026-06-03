#!/usr/bin/env python
from __future__ import annotations

import argparse
import contextlib
import io
import json
import os
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[2]
ARTIFACT_DIR = ROOT / "ai_lab" / "artifacts" / "retriever_v1_4"
RETRIEVAL_STRATEGY = "expanded_query_topic_aware_rerank"
DEFAULT_CANDIDATE_TOP_K = 20
DEFAULT_FINAL_TOP_K = 5
DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434"
DEFAULT_OLLAMA_MODEL = "qwen2.5:3b"
DEFAULT_OLLAMA_TIMEOUT_MS = 3000
OLLAMA_EXISTING_SCORE_WEIGHT = 0.6
OLLAMA_SEMANTIC_SCORE_WEIGHT = 0.4
OLLAMA_CONFIDENCE_THRESHOLD = 0.3
OLLAMA_FALLBACK_REASON = "ollama_fallback_deterministic"

RESULT_BOUNDARY_TOPICS = {
    "result_interpretation",
    "test_result_explainer",
    "medical_result_explanation_boundary",
    "results",
}
URGENT_TOPICS = {
    "red_flag_general",
    "red_flag_signs",
    "emergency_warning",
    "urgent_advice",
    "safety_boundary",
}
RESULT_QUERY_TERMS = [
    "kết quả",
    "ket qua",
    "chỉ số",
    "chi so",
    "cao",
    "thấp",
    "thap",
    "bất thường",
    "bat thuong",
    "đọc",
    "doc",
    "giải thích",
    "giai thich",
    "có chắc",
    "co chac",
    "chắc là",
    "chac la",
]
URGENT_QUERY_TERMS = [
    "đau ngực",
    "dau nguc",
    "khó thở",
    "kho tho",
    "vã mồ hôi",
    "va mo hoi",
    "ngất",
    "ngat",
    "lú lẫn",
    "lu lan",
    "môi tím",
    "moi tim",
    "xấu đi nhanh",
    "xau di nhanh",
    "lan ra tay",
    "cấp cứu",
    "cap cuu",
]

TOPIC_PROFILES = [
    {
        "name": "lipid",
        "aliases": ["mỡ máu", "mo mau", "cholesterol", "triglyceride", "triglycerides", "lipid"],
        "chunk_terms": ["lipid", "cholesterol", "triglyceride"],
        "exact_terms": ["cholesterol", "triglyceride", "triglycerides", "lipid"],
        "expansion": "lipid panel cholesterol triglycerides HDL LDL cardiovascular risk",
    },
    {
        "name": "glucose_hba1c",
        "aliases": [
            "đường huyết",
            "duong huyet",
            "đường máu",
            "duong mau",
            "glucose",
            "hba1c",
            "tiểu đường",
            "tieu duong",
            "đái tháo đường",
            "dai thao duong",
        ],
        "chunk_terms": ["glucose", "hba1c", "diabetes"],
        "exact_terms": ["glucose", "hba1c"],
        "expansion": "blood glucose fasting glucose HbA1c diabetes screening blood sugar",
    },
    {
        "name": "liver",
        "aliases": ["gan", "men gan", "alt", "ast", "bilirubin"],
        "chunk_terms": ["liver", "alt", "ast", "bilirubin", "cmp"],
        "exact_terms": ["alt", "ast", "bilirubin"],
        "expansion": "liver function tests ALT AST bilirubin liver enzymes comprehensive metabolic panel",
    },
    {
        "name": "kidney",
        "aliases": ["thận", "than", "creatinine", "creatinin", "egfr", "chức năng thận", "chuc nang than"],
        "chunk_terms": ["kidney", "creatinine", "egfr", "gfr", "albumin"],
        "exact_terms": ["creatinine", "creatinin", "egfr", "gfr"],
        "expansion": "kidney function creatinine eGFR GFR renal panel kidney tests",
    },
    {
        "name": "urinalysis",
        "aliases": [
            "nước tiểu",
            "nuoc tieu",
            "xét nghiệm nước tiểu",
            "xet nghiem nuoc tieu",
            "tiểu buốt",
            "tieu buot",
            "uti",
            "protein niệu",
            "protein nieu",
            "albumin niệu",
            "albumin nieu",
            "protein",
        ],
        "chunk_terms": ["urinalysis", "urine", "protein", "uti", "albumin"],
        "exact_terms": ["urinalysis", "urine", "protein"],
        "expansion": "urinalysis urine albumin protein urine UTI microalbumin creatinine ratio",
    },
    {
        "name": "thyroid",
        "aliases": ["tuyến giáp", "tuyen giap", "tsh", "t3", "t4"],
        "chunk_terms": ["thyroid", "tsh", "t3", "t4"],
        "exact_terms": ["tsh", "t3", "t4"],
        "expansion": "thyroid tests TSH T4 T3 thyroid stimulating hormone thyroxine",
    },
    {
        "name": "cbc",
        "aliases": [
            "công thức máu",
            "cong thuc mau",
            "cbc",
            "hồng cầu",
            "hong cau",
            "bạch cầu",
            "bach cau",
            "tiểu cầu",
            "tieu cau",
            "thiếu máu",
            "thieu mau",
            "nhiễm trùng",
            "nhiem trung",
            "mệt",
            "met",
            "chóng mặt",
            "chong mat",
        ],
        "chunk_terms": ["cbc", "anemia", "infection", "blood_count", "complete blood count", "blood culture", "crp"],
        "exact_terms": ["cbc", "wbc", "rbc", "platelet", "hemoglobin"],
        "expansion": "complete blood count CBC anemia red blood cells white blood cells platelets hemoglobin infection CRP blood culture",
    },
    {
        "name": "preparation",
        "aliases": [
            "nhịn ăn",
            "nhin an",
            "chuẩn bị xét nghiệm",
            "chuan bi xet nghiem",
            "trước khi xét nghiệm",
            "truoc khi xet nghiem",
            "sợ kim",
            "so kim",
        ],
        "chunk_terms": ["preparation", "prepare", "fasting", "lab_preparation"],
        "exact_terms": ["fasting", "prepare"],
        "expansion": "lab test preparation fasting before blood test needle anxiety",
    },
    {
        "name": "general_labs",
        "aliases": [
            "xét nghiệm tổng quát",
            "xet nghiem tong quat",
            "khám sức khỏe",
            "kham suc khoe",
            "xét nghiệm máu",
            "xet nghiem mau",
            "tổng quát",
            "tong quat",
            "lấy máu",
            "lay mau",
        ],
        "chunk_terms": ["general_lab", "blood_tests", "routine_blood", "test_meaning", "general_info"],
        "exact_terms": ["blood test", "blood tests"],
        "expansion": "blood tests routine blood testing general health checkup lab tests preparation",
    },
]


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


def emit(payload: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False, indent=None))
    sys.stdout.write("\n")


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def content_preview(text: str | None, max_length: int = 220) -> str:
    clean = " ".join(str(text or "").split())
    if len(clean) <= max_length:
        return clean
    return clean[: max_length - 3].rstrip() + "..."


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Controlled semantic FAISS bridge for HomeLab retriever v1_4."
    )
    parser.add_argument("--query", default=None, help="User query text.")
    parser.add_argument("--top-k", type=int, default=DEFAULT_FINAL_TOP_K, help="Final number of chunks to return.")
    parser.add_argument(
        "--candidate-top-k",
        type=int,
        default=DEFAULT_CANDIDATE_TOP_K,
        help="Number of FAISS candidates before topic-aware rerank.",
    )
    parser.add_argument("--serve", action="store_true", help="Run a persistent HTTP bridge server.")
    parser.add_argument("--host", default="127.0.0.1", help="Bridge server host.")
    parser.add_argument("--port", type=int, default=8766, help="Bridge server port.")
    parser.add_argument(
        "--artifact-dir",
        default=str(ARTIFACT_DIR),
        help="Path to retriever_v1_4 artifact directory.",
    )
    return parser.parse_args()


def read_query(args: argparse.Namespace) -> str:
    if args.query is not None:
        return args.query
    return sys.stdin.read().strip()


def detected_profiles(query: str) -> set[str]:
    text = query.lower()
    return {
        profile["name"]
        for profile in TOPIC_PROFILES
        if any(alias in text for alias in profile["aliases"])
    }


def expanded_query(query: str) -> tuple[str, list[str], list[str]]:
    profiles = [profile for profile in TOPIC_PROFILES if profile["name"] in detected_profiles(query)]
    if not profiles:
        return query, [], []
    terms = [profile["expansion"] for profile in profiles]
    return f"{query} {' '.join(terms)}", [profile["name"] for profile in profiles], terms


def chunk_haystack(chunk: dict[str, Any], meta: dict[str, Any] | None = None) -> str:
    meta = meta or {}
    fields = ["topic", "title", "medical_scope", "intended_use", "content", "chunk_text"]
    return " ".join(str(chunk.get(field) or meta.get(field) or "") for field in fields).lower()


def chunk_profile_match(chunk: dict[str, Any], meta: dict[str, Any], profile_name: str) -> tuple[bool, int]:
    profile = next((item for item in TOPIC_PROFILES if item["name"] == profile_name), None)
    if not profile:
        return False, 0
    text = chunk_haystack(chunk, meta)
    hits = sum(1 for term in profile["chunk_terms"] if term in text)
    exact_hits = sum(1 for term in profile["exact_terms"] if term in text)
    return hits > 0, hits + exact_hits


def topic_aware_rerank_score(
    original_query: str,
    chunk: dict[str, Any],
    meta: dict[str, Any],
    semantic_score: float,
) -> tuple[float, dict[str, Any]]:
    topic = str(chunk.get("topic") or meta.get("topic") or "")
    query_text = original_query.lower()
    profiles = detected_profiles(original_query)
    result_query = any(term in query_text for term in RESULT_QUERY_TERMS)
    urgent_query = any(term in query_text for term in URGENT_QUERY_TERMS)
    profile_boost = 0.0
    matched_profiles = []

    for profile in profiles:
        ok, strength = chunk_profile_match(chunk, meta, profile)
        if ok:
            matched_profiles.append(profile)
            profile_boost += min(0.18, 0.08 + 0.03 * strength)

    exact_boost = 0.0
    for profile in TOPIC_PROFILES:
        query_exact = [term for term in profile["exact_terms"] if term in query_text]
        if query_exact:
            ok, strength = chunk_profile_match(chunk, meta, profile["name"])
            if ok:
                exact_boost += min(0.14, 0.05 * len(query_exact) + 0.02 * strength)

    boundary_adjustment = 0.0
    if topic in RESULT_BOUNDARY_TOPICS and not result_query:
        boundary_adjustment = -0.16
    elif topic in RESULT_BOUNDARY_TOPICS and result_query:
        boundary_adjustment = 0.06

    urgent_adjustment = 0.0
    if topic in URGENT_TOPICS and urgent_query:
        urgent_adjustment = 0.1
    elif topic in URGENT_TOPICS and not urgent_query:
        urgent_adjustment = -0.1

    generic_adjustment = 0.0
    if (
        profiles
        and topic in {"test_meaning", "test_use", "general_info", "preparation"}
        and "preparation" not in profiles
        and "general_labs" not in profiles
    ):
        generic_adjustment = -0.06

    final_score = semantic_score + profile_boost + exact_boost + boundary_adjustment + urgent_adjustment + generic_adjustment
    return final_score, {
        "detectedAliasGroups": sorted(profiles),
        "matchedAliasGroups": sorted(matched_profiles),
        "profileBoost": round(profile_boost, 4),
        "exactBoost": round(exact_boost, 4),
        "boundaryAdjustment": round(boundary_adjustment, 4),
        "urgentAdjustment": round(urgent_adjustment, 4),
        "genericAdjustment": round(generic_adjustment, 4),
    }


def clamp_unit_score(value: Any, default: float = 0.0) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    if not (number == number):
        return default
    return max(0.0, min(1.0, number))


def strip_json_fence(raw_text: str) -> str:
    text = str(raw_text or "").strip()
    if text.startswith("```"):
        lines = text.splitlines()
        if lines and lines[0].strip().lower() in {"```", "```json"}:
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        return "\n".join(lines).strip()
    return text


def ollama_config() -> dict[str, Any]:
    timeout_raw = (
        os.environ.get("HOMELAB_RETRIEVER_OLLAMA_TIMEOUT_MS")
        or os.environ.get("HOMELAB_INTENT_CLASSIFIER_TIMEOUT_MS")
        or DEFAULT_OLLAMA_TIMEOUT_MS
    )
    try:
        timeout_ms = int(timeout_raw)
    except (TypeError, ValueError):
        timeout_ms = DEFAULT_OLLAMA_TIMEOUT_MS

    return {
        "baseUrl": str(os.environ.get("HOMELAB_OLLAMA_BASE_URL") or DEFAULT_OLLAMA_BASE_URL).rstrip("/"),
        "model": os.environ.get("HOMELAB_RETRIEVER_OLLAMA_MODEL")
        or os.environ.get("HOMELAB_INTENT_CLASSIFIER_MODEL")
        or DEFAULT_OLLAMA_MODEL,
        "timeoutMs": timeout_ms,
    }


def build_ollama_semantic_prompt(query: str, chunks: list[dict[str, Any]]) -> str:
    candidate_payload = []
    for index, chunk in enumerate(chunks):
        candidate_payload.append(
            {
                "index": index,
                "chunk_id": chunk.get("chunk_id") or chunk.get("kb_id") or str(index),
                "title": chunk.get("title"),
                "topic": chunk.get("topic"),
                "medical_scope": chunk.get("medical_scope"),
                "intended_use": chunk.get("intended_use"),
                "content": content_preview(chunk.get("content") or chunk.get("chunk_text"), 700),
            }
        )

    return "\n".join(
        [
            "You are a read-only semantic relevance scorer for HomeLab retrieval.",
            "Return JSON only. Do not include markdown, prose, code, tool calls, or instructions.",
            "Safety: do not diagnose, recommend treatment, create bookings, update drafts, mutate records, or take actions.",
            "Task: score each candidate chunk for relevance to the user query.",
            "Use only the provided query and candidate chunk text.",
            "Return this exact JSON schema:",
            json.dumps(
                {
                    "scores": [
                        {
                            "index": 0,
                            "relevance": "number from 0 to 1",
                            "confidence": "number from 0 to 1",
                            "reason": "short string",
                        }
                    ]
                },
                ensure_ascii=False,
            ),
            "",
            "USER_QUERY:",
            query,
            "",
            "CANDIDATE_CHUNKS_JSON:",
            json.dumps(candidate_payload, ensure_ascii=False),
        ]
    )


def parse_ollama_semantic_scores(payload: dict[str, Any], candidate_count: int) -> dict[int, dict[str, Any]]:
    raw_response = payload.get("response")
    if not isinstance(raw_response, str) or not raw_response.strip():
        raise ValueError("empty_ollama_response")

    parsed = json.loads(strip_json_fence(raw_response))
    if not isinstance(parsed, dict) or not isinstance(parsed.get("scores"), list):
        raise ValueError("invalid_ollama_schema")

    scores: dict[int, dict[str, Any]] = {}
    for item in parsed["scores"]:
        if not isinstance(item, dict):
            continue
        try:
            index = int(item.get("index"))
        except (TypeError, ValueError):
            continue
        if index < 0 or index >= candidate_count:
            continue
        scores[index] = {
            "relevance": clamp_unit_score(item.get("relevance")),
            "confidence": clamp_unit_score(item.get("confidence")),
            "reason": str(item.get("reason") or "")[:160],
        }
    return scores


def score_chunks_with_ollama(query: str, chunks: list[dict[str, Any]]) -> tuple[dict[int, dict[str, Any]], str | None]:
    if not chunks:
        return {}, None

    config = ollama_config()
    request_payload = {
        "model": config["model"],
        "prompt": build_ollama_semantic_prompt(query, chunks),
        "stream": False,
        "format": "json",
        "options": {"temperature": 0},
    }
    request = Request(
        f"{config['baseUrl']}/api/generate",
        data=json.dumps(request_payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urlopen(request, timeout=max(0.1, float(config["timeoutMs"]) / 1000.0)) as response:
            response_body = response.read().decode("utf-8")
        payload = json.loads(response_body)
        return parse_ollama_semantic_scores(payload, len(chunks)), None
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError, ValueError, OSError):
        return {}, OLLAMA_FALLBACK_REASON


def combine_topic_rerank_with_ollama(
    query: str,
    chunks: list[dict[str, Any]],
    *,
    existing_weight: float = OLLAMA_EXISTING_SCORE_WEIGHT,
    semantic_weight: float = OLLAMA_SEMANTIC_SCORE_WEIGHT,
    scorer: Any = score_chunks_with_ollama,
) -> list[dict[str, Any]]:
    if not chunks:
        return chunks

    ollama_scores, scorer_fallback = scorer(query, chunks)
    for index, chunk in enumerate(chunks):
        existing_score = float(chunk.get("_rerank_score") or 0.0)
        shadow = ollama_scores.get(index) if isinstance(ollama_scores, dict) else None
        semantic_shadow_score = 0.0
        semantic_shadow_used = False
        fallback_reason = scorer_fallback

        if isinstance(shadow, dict):
            confidence = clamp_unit_score(shadow.get("confidence"))
            relevance = clamp_unit_score(shadow.get("relevance"))
            if confidence >= OLLAMA_CONFIDENCE_THRESHOLD:
                semantic_shadow_score = relevance
                semantic_shadow_used = True
                fallback_reason = None
            else:
                fallback_reason = OLLAMA_FALLBACK_REASON
        elif not fallback_reason:
            fallback_reason = OLLAMA_FALLBACK_REASON

        combined_score = (
            existing_score * existing_weight + semantic_shadow_score * semantic_weight
            if semantic_shadow_used
            else existing_score
        )

        debug = dict(chunk.get("_rerank_debug") or {})
        debug.update(
            {
                "existingScore": round(existing_score, 6),
                "semanticShadowScore": round(semantic_shadow_score, 6),
                "semanticShadowUsed": semantic_shadow_used,
                "fallbackReason": fallback_reason,
                "scoreWeights": {
                    "existing": existing_weight,
                    "semanticShadow": semantic_weight,
                },
            }
        )
        chunk["_existing_rerank_score"] = existing_score
        chunk["_ollama_semantic_score"] = semantic_shadow_score
        chunk["_semantic_shadow_used"] = semantic_shadow_used
        chunk["_fallback_reason"] = fallback_reason
        chunk["_rerank_score"] = float(combined_score)
        chunk["_rerank_debug"] = debug

    return chunks


class SemanticRetrieverV14:
    def __init__(self, artifact_dir: Path) -> None:
        self.artifact_dir = artifact_dir.resolve()
        self.loaded_at = time.time()

        sys.stderr.write("[DEBUG] Importing faiss...\n")
        sys.stderr.flush()
        import faiss  # type: ignore

        sys.stderr.write("[DEBUG] Importing sentence_transformers...\n")
        sys.stderr.flush()
        from sentence_transformers import SentenceTransformer  # type: ignore

        sys.stderr.write("[DEBUG] Loading manifest and config...\n")
        sys.stderr.flush()
        manifest_path = self.artifact_dir / "retriever_manifest.json"
        if not manifest_path.exists():
            raise FileNotFoundError(f"retriever_manifest.json not found under {self.artifact_dir}")

        self.manifest = load_json(manifest_path)
        self.config = load_json(self.artifact_dir / self.manifest.get("embedding_config_file", "embedding_config.json"))
        self.chunks = load_json(self.artifact_dir / self.manifest.get("kb_file", "kb_chunks_v1_4.json"))
        metadata_path = self.artifact_dir / self.manifest.get("metadata_file", "chunk_metadata.json")
        metadata = load_json(metadata_path) if metadata_path.exists() else []
        self.metadata_by_chunk_id = {
            item.get("chunk_id"): item
            for item in metadata
            if isinstance(item, dict) and item.get("chunk_id")
        }

        sys.stderr.write(f"[DEBUG] Loaded {len(self.chunks)} chunks\n")
        sys.stderr.flush()

        faiss_index_path = self.artifact_dir / self.manifest.get("faiss_index_file", "faiss.index")
        if not faiss_index_path.exists():
            raise FileNotFoundError(f"faiss.index not found under {faiss_index_path}")

        self.model_name = self.config.get("model_name") or self.manifest.get("model_name")
        if not self.model_name:
            raise ValueError("model_name missing from embedding_config.json and retriever_manifest.json")

        sys.stderr.write(f"[DEBUG] Loading FAISS index from {faiss_index_path}...\n")
        sys.stderr.flush()
        self.index = faiss.read_index(str(faiss_index_path))

        sys.stderr.write(f"[DEBUG] Loading SentenceTransformer model: {self.model_name}...\n")
        sys.stderr.flush()
        self.model = SentenceTransformer(self.model_name)

        sys.stderr.write("[DEBUG] Retriever initialization complete\n")
        sys.stderr.flush()
            
    def _search_candidates(self, query: str, candidate_top_k: int) -> list[dict[str, Any]]:
        query_text = self.config.get("query_prefix", "query: ") + query.strip()
        query_embedding = self.model.encode(
            [query_text],
            convert_to_numpy=True,
            normalize_embeddings=bool(self.config.get("normalized", True)),
            show_progress_bar=False,
        ).astype("float32")

        scores, indices = self.index.search(query_embedding, max(1, int(candidate_top_k)))
        candidates = []
        for rank, (score, idx) in enumerate(zip(scores[0], indices[0]), 1):
            if idx < 0:
                continue
            chunk = dict(self.chunks[int(idx)])
            chunk["_semantic_score"] = float(score)
            chunk["_rank_before_rerank"] = rank
            candidates.append(chunk)
        return candidates

    def _format_chunk(self, chunk: dict[str, Any], rank_after_rerank: int) -> dict[str, Any]:
        chunk_id = chunk.get("chunk_id")
        meta = self.metadata_by_chunk_id.get(chunk_id, {})
        provenance = chunk.get("provenance") or meta.get("provenance") or {}
        source_url = chunk.get("source_url") or meta.get("source_url") or provenance.get("source_url")
        final_url = chunk.get("final_url") or meta.get("final_url") or provenance.get("final_url") or source_url

        return {
            "rank": rank_after_rerank,
            "id": chunk_id or chunk.get("kb_id"),
            "chunk_id": chunk_id,
            "kb_id": chunk.get("kb_id") or meta.get("kb_id"),
            "merged_id": chunk.get("merged_id") or meta.get("merged_id"),
            "source_id": chunk.get("source_id") or meta.get("source_id"),
            "title": chunk.get("title") or meta.get("title"),
            "section": chunk.get("section") or meta.get("section"),
            "faq_type": chunk.get("faq_type") or meta.get("faq_type"),
            "topic": chunk.get("topic") or meta.get("topic"),
            "domain": chunk.get("domain") or meta.get("domain"),
            "source_url": source_url,
            "final_url": final_url,
            "medical_scope": chunk.get("medical_scope") or meta.get("medical_scope"),
            "intended_use": chunk.get("intended_use") or meta.get("intended_use"),
            "semanticScore": float(chunk.get("_semantic_score") or 0),
            "rerankScore": float(chunk.get("_rerank_score") or 0),
            "semanticShadowScore": float(chunk.get("_ollama_semantic_score") or 0),
            "semanticShadowUsed": bool(chunk.get("_semantic_shadow_used")),
            "fallbackReason": chunk.get("_fallback_reason"),
            "rankBeforeRerank": int(chunk.get("_rank_before_rerank") or 0),
            "rankAfterRerank": rank_after_rerank,
            "rerankDebug": chunk.get("_rerank_debug") or {},
            "provenance": provenance,
            "contentPreview": content_preview(chunk.get("content") or chunk.get("chunk_text")),
        }

    def run_retrieval(self, query: str, top_k: int = DEFAULT_FINAL_TOP_K, candidate_top_k: int = DEFAULT_CANDIDATE_TOP_K) -> dict[str, Any]:
        started = time.perf_counter()
        final_top_k = max(1, int(top_k or DEFAULT_FINAL_TOP_K))
        candidates_top_k = max(final_top_k, int(candidate_top_k or DEFAULT_CANDIDATE_TOP_K))
        expanded, alias_groups, expansion_terms = expanded_query(query)
        candidates = self._search_candidates(expanded, candidates_top_k)
        reranked = []

        for chunk in candidates:
            meta = self.metadata_by_chunk_id.get(chunk.get("chunk_id"), {})
            rerank_score, debug = topic_aware_rerank_score(
                original_query=query,
                chunk=chunk,
                meta=meta,
                semantic_score=float(chunk.get("_semantic_score") or 0),
            )
            chunk["_rerank_score"] = float(rerank_score)
            chunk["_rerank_debug"] = debug
            reranked.append(chunk)

        combine_topic_rerank_with_ollama(query, reranked)
        reranked.sort(key=lambda item: float(item.get("_rerank_score") or 0), reverse=True)
        top_chunks = [
            self._format_chunk(chunk, rank)
            for rank, chunk in enumerate(reranked[:final_top_k], 1)
        ]

        artifact_display = self.artifact_dir.relative_to(ROOT).as_posix() if self.artifact_dir.is_relative_to(ROOT) else str(self.artifact_dir)
        return {
            "query": query,
            "retrieverVersion": "v1_4",
            "runtimeMode": "semantic_faiss",
            "retrievalStrategy": RETRIEVAL_STRATEGY,
            "artifactDir": artifact_display,
            "modelName": self.model_name,
            "queryExpansionApplied": bool(alias_groups),
            "expandedQuery": expanded,
            "detectedAliasGroups": alias_groups,
            "queryExpansionTerms": expansion_terms,
            "candidateTopK": candidates_top_k,
            "finalTopK": final_top_k,
            "runtimePromoted": False,
            "runtimeDefaultChanged": False,
            "topChunks": top_chunks,
            "results": top_chunks,
            "latencyMs": round((time.perf_counter() - started) * 1000, 2),
            "bridgeMode": "server",
        }

    def health(self) -> dict[str, Any]:
        artifact_display = self.artifact_dir.relative_to(ROOT).as_posix() if self.artifact_dir.is_relative_to(ROOT) else str(self.artifact_dir)
        return {
            "ok": True,
            "runtimeMode": "semantic_faiss",
            "retrieverVersion": "v1_4",
            "retrievalStrategy": RETRIEVAL_STRATEGY,
            "artifactDir": artifact_display,
            "modelName": self.model_name,
            "chunkCount": len(self.chunks),
            "candidateTopKDefault": DEFAULT_CANDIDATE_TOP_K,
            "finalTopKDefault": DEFAULT_FINAL_TOP_K,
            "runtimePromoted": False,
            "runtimeDefaultChanged": False,
            "uptimeSeconds": round(time.time() - self.loaded_at, 2),
        }


def run_retrieval(query: str, top_k: int, candidate_top_k: int, artifact_dir: Path) -> dict[str, Any]:
    result = SemanticRetrieverV14(artifact_dir).run_retrieval(query, top_k, candidate_top_k)
    return {
        **result,
        "bridgeMode": "process",
    }


def write_json_response(handler: BaseHTTPRequestHandler, status: int, payload: dict[str, Any]) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def read_json_body(handler: BaseHTTPRequestHandler) -> dict[str, Any]:
    content_length = int(handler.headers.get("Content-Length") or "0")
    if content_length <= 0:
        return {}
    raw_body = handler.rfile.read(content_length).decode("utf-8")
    return json.loads(raw_body or "{}")


def make_handler(retriever: SemanticRetrieverV14) -> type[BaseHTTPRequestHandler]:
    class SemanticBridgeHandler(BaseHTTPRequestHandler):
        def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
            sys.stderr.write("%s - - [%s] %s\n" % (self.address_string(), self.log_date_time_string(), format % args))

        def do_GET(self) -> None:  # noqa: N802
            path = urlparse(self.path).path
            if path == "/health":
                write_json_response(self, 200, retriever.health())
                return
            write_json_response(self, 404, {"ok": False, "error": "not found"})

        def do_POST(self) -> None:  # noqa: N802
            path = urlparse(self.path).path
            if path != "/query":
                write_json_response(self, 404, {"ok": False, "error": "not found"})
                return

            try:
                payload = read_json_body(self)
                query = str(payload.get("query") or "").strip()
                top_k = int(payload.get("topK") or payload.get("top_k") or DEFAULT_FINAL_TOP_K)
                candidate_top_k = int(
                    payload.get("candidateTopK") or payload.get("candidate_top_k") or DEFAULT_CANDIDATE_TOP_K
                )
                if not query:
                    write_json_response(
                        self,
                        400,
                        {
                            "query": query,
                            "retrieverVersion": "v1_4",
                            "runtimeMode": "semantic_faiss",
                            "retrievalStrategy": RETRIEVAL_STRATEGY,
                            "modelName": retriever.model_name,
                            "topChunks": [],
                            "results": [],
                            "runtimePromoted": False,
                            "runtimeDefaultChanged": False,
                            "error": "query is required",
                        },
                    )
                    return
                write_json_response(self, 200, retriever.run_retrieval(query, top_k, candidate_top_k))
            except Exception as error:  # noqa: BLE001
                write_json_response(
                    self,
                    500,
                    {
                        "retrieverVersion": "v1_4",
                        "runtimeMode": "semantic_faiss",
                        "retrievalStrategy": RETRIEVAL_STRATEGY,
                        "modelName": retriever.model_name,
                        "topChunks": [],
                        "results": [],
                        "runtimePromoted": False,
                        "runtimeDefaultChanged": False,
                        "error": f"{type(error).__name__}: {error}",
                    },
                )

    return SemanticBridgeHandler


def run_server(args: argparse.Namespace) -> None:
    sys.stderr.write(f"[DEBUG] Loading retriever from {args.artifact_dir}...\n")
    sys.stderr.flush()
    retriever = SemanticRetrieverV14(Path(args.artifact_dir))
    sys.stderr.write(f"[DEBUG] Retriever loaded, model={retriever.model_name}\n")
    sys.stderr.flush()
    sys.stderr.write(f"[DEBUG] Creating HTTP server on {args.host}:{args.port}...\n")
    sys.stderr.flush()
    server = ThreadingHTTPServer((args.host, args.port), make_handler(retriever))
    server.allow_reuse_address = True
    sys.stderr.write(
        f"Semantic bridge v1_4 server listening on http://{args.host}:{args.port} "
        f"with {retriever.model_name}\n"
    )
    sys.stderr.flush()
    server.serve_forever()


def test_ollama_topic_rerank() -> None:
    query = "cholesterol cao có nguy hiểm không"
    candidates = [
        {
            "chunk_id": "chunk_lipid",
            "title": "Lipid panel",
            "topic": "result_interpretation",
            "content": "Cholesterol, LDL, HDL and triglyceride results help assess cardiovascular risk.",
            "_semantic_score": 0.72,
            "_rank_before_rerank": 1,
        },
        {
            "chunk_id": "chunk_prepare",
            "title": "Chuẩn bị xét nghiệm",
            "topic": "preparation",
            "content": "Some blood tests require fasting before the sample is collected.",
            "_semantic_score": 0.7,
            "_rank_before_rerank": 2,
        },
        {
            "chunk_id": "chunk_cbc",
            "title": "Complete blood count",
            "topic": "test_meaning",
            "content": "CBC measures white blood cells, red blood cells, platelets, and hemoglobin.",
            "_semantic_score": 0.68,
            "_rank_before_rerank": 3,
        },
    ]

    reranked = []
    for chunk in candidates:
        existing_score, debug = topic_aware_rerank_score(
            original_query=query,
            chunk=chunk,
            meta={},
            semantic_score=float(chunk.get("_semantic_score") or 0),
        )
        chunk["_rerank_score"] = existing_score
        chunk["_rerank_debug"] = debug
        reranked.append(chunk)

    def mock_scorer(_query: str, _chunks: list[dict[str, Any]]) -> tuple[dict[int, dict[str, Any]], str | None]:
        return {
            0: {"relevance": 0.95, "confidence": 0.9, "reason": "lipid result match"},
            1: {"relevance": 0.25, "confidence": 0.85, "reason": "preparation only"},
            2: {"relevance": 0.4, "confidence": 0.2, "reason": "low confidence unrelated"},
        }, None

    combine_topic_rerank_with_ollama(query, reranked, scorer=mock_scorer)
    reranked.sort(key=lambda item: float(item.get("_rerank_score") or 0), reverse=True)

    for chunk in reranked:
        print(
            json.dumps(
                {
                    "chunk_id": chunk.get("chunk_id"),
                    "existing_score": round(float(chunk.get("_existing_rerank_score") or 0), 4),
                    "ollama_semantic_score": round(float(chunk.get("_ollama_semantic_score") or 0), 4),
                    "combined_final_score": round(float(chunk.get("_rerank_score") or 0), 4),
                    "semanticShadowUsed": bool(chunk.get("_semantic_shadow_used")),
                    "fallbackReason": chunk.get("_fallback_reason"),
                },
                ensure_ascii=False,
            )
        )


def main() -> None:
    args = parse_args()
    artifact_dir = Path(args.artifact_dir)

    if args.serve:
        try:
            run_server(args)
        except KeyboardInterrupt:
            return
        except Exception as error:  # noqa: BLE001
            sys.stderr.write(f"{type(error).__name__}: {error}\n")
            sys.exit(1)
        return

    query = read_query(args)
    if not query:
        emit(
            {
                "query": query,
                "retrieverVersion": "v1_4",
                "runtimeMode": "semantic_faiss",
                "retrievalStrategy": RETRIEVAL_STRATEGY,
                "modelName": None,
                "topChunks": [],
                "results": [],
                "runtimePromoted": False,
                "runtimeDefaultChanged": False,
                "error": "query is required",
            }
        )
        return

    try:
        emit(run_retrieval(query, args.top_k, args.candidate_top_k, artifact_dir))
    except Exception as error:  # noqa: BLE001
        emit(
            {
                "query": query,
                "retrieverVersion": "v1_4",
                "runtimeMode": "semantic_faiss",
                "retrievalStrategy": RETRIEVAL_STRATEGY,
                "modelName": None,
                "topChunks": [],
                "results": [],
                "runtimePromoted": False,
                "runtimeDefaultChanged": False,
                "error": f"{type(error).__name__}: {error}",
            }
        )


if __name__ == "__main__":
    main()
