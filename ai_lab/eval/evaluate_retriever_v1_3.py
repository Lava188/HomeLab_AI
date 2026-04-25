from __future__ import annotations

import json
from pathlib import Path
from statistics import mean
from typing import Any

import faiss
import numpy as np
from sentence_transformers import SentenceTransformer


ROOT = Path(__file__).resolve().parents[1]
ARTIFACT_DIR = ROOT / "artifacts" / "retriever_v1_3"
REPORTS_DIR = ROOT / "reports"

MANIFEST_PATH = ARTIFACT_DIR / "retriever_manifest.json"
CONFIG_PATH = ARTIFACT_DIR / "embedding_config.json"
JSON_REPORT_PATH = REPORTS_DIR / "retriever_v1_3_eval_report.json"
MD_REPORT_PATH = REPORTS_DIR / "retriever_v1_3_eval_report.md"

EVAL_QUERIES: list[dict[str, Any]] = [
    {
        "id": "stomach_ache_emergency_001",
        "group": "dau_bung",
        "query": "đau bụng dữ dội kèm nôn ra máu hoặc đi ngoài phân đen có cần cấp cứu không",
        "expected_chunk_ids": ["kb_v1_2_035_c1"],
        "expected_source_id": "nhs_stomach_ache",
        "expected_keywords": ["đau bụng", "nôn ra máu", "phân đen", "cấp cứu"],
    },
    {
        "id": "stomach_ache_urgent_002",
        "group": "dau_bung",
        "query": "đau bụng kéo dài tái diễn kèm sốt nên đi khám khi nào",
        "expected_chunk_ids": ["kb_v1_2_036_c1"],
        "expected_source_id": "nhs_stomach_ache",
        "expected_keywords": ["đau bụng kéo dài", "tái diễn", "sốt", "khám sớm"],
    },
    {
        "id": "headache_emergency_001",
        "group": "dau_dau",
        "query": "đau đầu dữ dội đột ngột kèm yếu tay chân hoặc nói khó có nguy hiểm không",
        "expected_chunk_ids": ["kb_v1_2_033_c1"],
        "expected_source_id": "nhs_headaches",
        "expected_keywords": ["đau đầu dữ dội", "đột ngột", "thần kinh", "cấp cứu"],
    },
    {
        "id": "headache_urgent_002",
        "group": "dau_dau",
        "query": "đau đầu kéo dài tái diễn kèm nôn ói nên đi khám không",
        "expected_chunk_ids": ["kb_v1_2_034_c1"],
        "expected_source_id": "nhs_headaches",
        "expected_keywords": ["đau đầu kéo dài", "tái diễn", "nôn ói", "khám sớm"],
    },
    {
        "id": "fainting_emergency_001",
        "group": "ngat_xiu",
        "query": "bị ngất kèm đau ngực khó thở hoặc chấn thương có cần cấp cứu không",
        "expected_chunk_ids": ["kb_v1_2_031_c1"],
        "expected_source_id": "nhs_fainting_adults",
        "expected_keywords": ["ngất", "đau ngực", "khó thở", "cấp cứu"],
    },
    {
        "id": "fainting_urgent_002",
        "group": "ngat_xiu",
        "query": "ngất tái diễn chưa rõ nguyên nhân có nên được đánh giá y tế không",
        "expected_chunk_ids": ["kb_v1_2_032_c1"],
        "expected_source_id": "nhs_fainting_adults",
        "expected_keywords": ["ngất tái diễn", "chưa rõ nguyên nhân", "đánh giá y tế"],
    },
    {
        "id": "anaphylaxis_emergency_001",
        "group": "di_ung_nang_phan_ve",
        "query": "dị ứng nặng phản vệ sưng môi khó thở cần gọi cấp cứu ngay không",
        "expected_chunk_ids": ["kb_v1_2_029_c1"],
        "expected_source_id": "nhs_anaphylaxis",
        "expected_keywords": ["phản vệ", "dị ứng nặng", "khó thở", "cấp cứu"],
    },
    {
        "id": "anaphylaxis_adrenaline_002",
        "group": "di_ung_nang_phan_ve",
        "query": "đã có bút tiêm adrenaline khi phản vệ thì dùng thế nào và có cần đi cấp cứu không",
        "expected_chunk_ids": ["kb_v1_2_030_c1"],
        "expected_source_id": "nhs_anaphylaxis",
        "expected_keywords": ["adrenaline", "phản vệ", "cấp cứu"],
    },
    {
        "id": "blood_test_results_001",
        "group": "giai_thich_xet_nghiem_pho_bien",
        "query": "kết quả xét nghiệm máu phức tạp cần hỏi ai giải thích và có cần xét nghiệm thêm không",
        "expected_chunk_ids": ["kb_v1_3_042_c1", "kb_v1_009_c1"],
        "expected_source_id": "blood_tests",
        "expected_keywords": ["kết quả xét nghiệm máu", "nhân viên y tế", "xét nghiệm thêm"],
    },
    {
        "id": "cbc_explainer_002",
        "group": "giai_thich_xet_nghiem_pho_bien",
        "query": "CBC công thức máu toàn bộ dùng để kiểm tra tế bào máu thiếu máu nhiễm trùng",
        "expected_chunk_ids": ["kb_v1_2_019_c1", "kb_v1_2_020_c1"],
        "expected_source_id": "medlineplus_cbc_test",
        "expected_keywords": ["CBC", "tế bào máu", "thiếu máu", "nhiễm trùng"],
    },
    {
        "id": "bmp_explainer_003",
        "group": "giai_thich_xet_nghiem_pho_bien",
        "query": "BMP xét nghiệm chuyển hóa cơ bản kiểm tra sức khỏe chung và chức năng thận",
        "expected_chunk_ids": ["kb_v1_2_017_c1", "kb_v1_2_018_c1"],
        "expected_source_id": "medlineplus_bmp_test",
        "expected_keywords": ["BMP", "chuyển hóa cơ bản", "chức năng thận"],
    },
    {
        "id": "crp_explainer_004",
        "group": "giai_thich_xet_nghiem_pho_bien",
        "query": "CRP là xét nghiệm gì có chỉ ra vị trí viêm trong cơ thể không",
        "expected_chunk_ids": ["kb_v1_2_021_c1", "kb_v1_2_022_c1"],
        "expected_source_id": "medlineplus_crp_test",
        "expected_keywords": ["CRP", "viêm", "không chỉ ra vị trí"],
    },
]


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def retrieve(
    query: str,
    *,
    model: SentenceTransformer,
    index: faiss.Index,
    chunks: list[dict[str, Any]],
    config: dict[str, Any],
    top_k: int,
) -> list[dict[str, Any]]:
    query_text = config.get("query_prefix", "query: ") + query.strip()
    query_embedding = model.encode(
        [query_text],
        convert_to_numpy=True,
        normalize_embeddings=bool(config.get("normalized", True)),
        show_progress_bar=False,
    ).astype("float32")
    scores, indices = index.search(query_embedding, top_k)
    results: list[dict[str, Any]] = []
    for score, idx in zip(scores[0], indices[0]):
        if idx < 0:
            continue
        chunk = chunks[int(idx)]
        results.append(
            {
                "rank": len(results) + 1,
                "score": float(score),
                "chunk_id": chunk["chunk_id"],
                "kb_id": chunk["kb_id"],
                "source_id": chunk["source_id"],
                "section": chunk["section"],
                "title": chunk["title"],
            }
        )
    return results


def keyword_match(results: list[dict[str, Any]], chunks_by_id: dict[str, dict[str, Any]], expected_keywords: list[str]) -> bool:
    haystack = "\n".join(
        chunks_by_id[result["chunk_id"]].get("chunk_text", "").lower()
        for result in results[:3]
    )
    return any(keyword.lower() in haystack for keyword in expected_keywords)


def main() -> int:
    manifest = load_json(MANIFEST_PATH)
    config = load_json(CONFIG_PATH)

    artifact_dir = ROOT.parent / manifest["artifact_dir"]
    chunks = load_json(artifact_dir / manifest["kb_file"])
    metadata = load_json(artifact_dir / manifest["metadata_file"])
    index = faiss.read_index(str(artifact_dir / manifest["faiss_index_file"]))

    if len(chunks) != manifest["chunk_count"]:
        raise RuntimeError("Chunk count does not match retriever_manifest.json")
    if len(metadata) != manifest["chunk_count"]:
        raise RuntimeError("Metadata count does not match retriever_manifest.json")
    if index.ntotal != manifest["chunk_count"]:
        raise RuntimeError("FAISS ntotal does not match retriever_manifest.json")

    model = SentenceTransformer(config["model_name"])
    top_k = int(manifest.get("top_k_default", 3))
    chunks_by_id = {chunk["chunk_id"]: chunk for chunk in chunks}

    rows: list[dict[str, Any]] = []
    for sample in EVAL_QUERIES:
        results = retrieve(
            sample["query"],
            model=model,
            index=index,
            chunks=chunks,
            config=config,
            top_k=top_k,
        )
        expected_chunk_ids = set(sample["expected_chunk_ids"])
        top1 = results[0] if results else None
        top3_chunk_ids = [result["chunk_id"] for result in results[:3]]
        hit_at_1 = bool(top1 and top1["chunk_id"] in expected_chunk_ids)
        hit_at_3 = any(chunk_id in expected_chunk_ids for chunk_id in top3_chunk_ids)
        expected_source_hit_at_3 = any(result["source_id"] == sample["expected_source_id"] for result in results[:3])
        expected_keyword_hit_at_3 = keyword_match(results, chunks_by_id, sample["expected_keywords"])

        rows.append(
            {
                **sample,
                "top1": top1,
                "top3": results[:3],
                "top3_chunk_ids": top3_chunk_ids,
                "hit_at_1": hit_at_1,
                "hit_at_3": hit_at_3,
                "expected_source_hit_at_3": expected_source_hit_at_3,
                "expected_keyword_hit_at_3": expected_keyword_hit_at_3,
            }
        )

    total = len(rows)
    hit_at_1 = mean(1.0 if row["hit_at_1"] else 0.0 for row in rows)
    hit_at_3 = mean(1.0 if row["hit_at_3"] else 0.0 for row in rows)
    source_hit_at_3 = mean(1.0 if row["expected_source_hit_at_3"] else 0.0 for row in rows)
    keyword_hit_at_3 = mean(1.0 if row["expected_keyword_hit_at_3"] else 0.0 for row in rows)
    failed = [row for row in rows if not row["hit_at_3"]]

    runtime_readiness = (
        "not_ready_for_runtime_switch"
        if failed or hit_at_1 < 0.8
        else "candidate_ready_for_larger_eval_before_runtime_switch"
    )

    report = {
        "retriever_version": manifest["retriever_version"],
        "kb_version": manifest["kb_version"],
        "artifact_dir": manifest["artifact_dir"],
        "model_name": config["model_name"],
        "top_k": top_k,
        "query_count": total,
        "metrics": {
            "hit_at_1": hit_at_1,
            "hit_at_3": hit_at_3,
            "expected_source_hit_at_3": source_hit_at_3,
            "expected_keyword_hit_at_3": keyword_hit_at_3,
        },
        "runtime_readiness": runtime_readiness,
        "failures": [
            {
                "id": row["id"],
                "group": row["group"],
                "query": row["query"],
                "expected_chunk_ids": row["expected_chunk_ids"],
                "top3_chunk_ids": row["top3_chunk_ids"],
            }
            for row in failed
        ],
        "rows": rows,
    }

    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    with JSON_REPORT_PATH.open("w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    md_lines = [
        "# retriever_v1_3 Eval Report",
        "",
        "## Scope",
        "",
        "This eval loads the existing `retriever_v1_3` artifact only. It does not rebuild embeddings, FAISS, chunks, backend, frontend, runtime, policy, package catalog, or recommendation-layer logic.",
        "",
        "## Artifact",
        "",
        f"- Retriever version: `{manifest['retriever_version']}`",
        f"- KB version: `{manifest['kb_version']}`",
        f"- Artifact dir: `{manifest['artifact_dir']}`",
        f"- Model: `{config['model_name']}`",
        f"- Top-k: `{top_k}`",
        "",
        "## Metrics",
        "",
        f"- Query count: `{total}`",
        f"- Hit@1: `{hit_at_1:.4f}`",
        f"- Hit@3: `{hit_at_3:.4f}`",
        f"- Expected source Hit@3: `{source_hit_at_3:.4f}`",
        f"- Expected keyword Hit@3: `{keyword_hit_at_3:.4f}`",
        "",
        "## Failures",
        "",
    ]
    if failed:
        for row in failed:
            md_lines.extend(
                [
                    f"- `{row['id']}` / `{row['group']}`",
                    f"  - Query: {row['query']}",
                    f"  - Expected: {', '.join(row['expected_chunk_ids'])}",
                    f"  - Top3: {', '.join(row['top3_chunk_ids'])}",
                ]
            )
    else:
        md_lines.append("- None")

    md_lines.extend(
        [
            "",
            "## Per-Query Results",
            "",
        ]
    )
    for row in rows:
        top1_chunk = row["top1"]["chunk_id"] if row["top1"] else "None"
        md_lines.extend(
            [
                f"- `{row['id']}` / `{row['group']}`",
                f"  - Hit@1: `{row['hit_at_1']}`; Hit@3: `{row['hit_at_3']}`",
                f"  - Top1: `{top1_chunk}`",
                f"  - Top3: `{', '.join(row['top3_chunk_ids'])}`",
            ]
        )

    md_lines.extend(
        [
            "",
            "## Runtime Readiness Note",
            "",
            f"- Status: `{runtime_readiness}`",
            "- Recommendation: run the larger retrieval eval v1_3/eval v2 before switching any runtime or recommendation behavior.",
        ]
    )

    MD_REPORT_PATH.write_text("\n".join(md_lines) + "\n", encoding="utf-8")

    print(f"query_count={total}")
    print(f"hit_at_1={hit_at_1:.4f}")
    print(f"hit_at_3={hit_at_3:.4f}")
    print(f"failures={len(failed)}")
    print(f"json_report={JSON_REPORT_PATH}")
    print(f"md_report={MD_REPORT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
