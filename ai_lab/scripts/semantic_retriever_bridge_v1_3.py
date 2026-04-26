import argparse
import contextlib
import io
import json
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[2]
ARTIFACT_DIR = ROOT / "ai_lab" / "artifacts" / "retriever_v1_3"

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
    parser = argparse.ArgumentParser(description="Semantic FAISS bridge for HomeLab retriever v1_3.")
    parser.add_argument("--query", default=None, help="User query text.")
    parser.add_argument("--top-k", type=int, default=3, help="Number of chunks to return.")
    parser.add_argument("--serve", action="store_true", help="Run a persistent HTTP bridge server.")
    parser.add_argument("--host", default="127.0.0.1", help="Bridge server host.")
    parser.add_argument("--port", type=int, default=8765, help="Bridge server port.")
    parser.add_argument(
        "--artifact-dir",
        default=str(ARTIFACT_DIR),
        help="Path to retriever_v1_3 artifact directory.",
    )
    return parser.parse_args()


def read_query(args: argparse.Namespace) -> str:
    if args.query is not None:
        return args.query

    stdin_text = sys.stdin.read()
    return stdin_text.strip()


class SemanticRetriever:
    def __init__(self, artifact_dir: Path) -> None:
        self.artifact_dir = artifact_dir
        self.loaded_at = time.time()

        # Keep third-party chatter out of stdout so Node can parse JSON.
        with contextlib.redirect_stdout(io.StringIO()):
            import faiss  # type: ignore
            from sentence_transformers import SentenceTransformer  # type: ignore

        manifest_path = artifact_dir / "retriever_manifest.json"
        if not manifest_path.exists():
            raise FileNotFoundError(f"retriever_manifest.json not found under {artifact_dir}")

        self.manifest = load_json(manifest_path)
        self.config = load_json(
            artifact_dir / self.manifest.get("embedding_config_file", "embedding_config.json")
        )
        self.chunks = load_json(artifact_dir / self.manifest.get("kb_file", "kb_chunks_v1_3.json"))
        metadata_path = artifact_dir / self.manifest.get("metadata_file", "chunk_metadata.json")
        metadata = load_json(metadata_path) if metadata_path.exists() else []
        self.metadata_by_chunk_id = {
            item.get("chunk_id"): item
            for item in metadata
            if isinstance(item, dict) and item.get("chunk_id")
        }

        faiss_index_path = artifact_dir / self.manifest.get("faiss_index_file", "faiss.index")
        if not faiss_index_path.exists():
            raise FileNotFoundError(f"faiss.index not found under {faiss_index_path}")

        self.model_name = self.config.get("model_name") or self.manifest.get("model_name")
        if not self.model_name:
            raise ValueError("model_name missing from embedding_config.json and retriever_manifest.json")

        with contextlib.redirect_stdout(io.StringIO()):
            self.index = faiss.read_index(str(faiss_index_path))
            self.model = SentenceTransformer(self.model_name)

    def run_retrieval(self, query: str, top_k: int) -> dict[str, Any]:
        started = time.perf_counter()
        with contextlib.redirect_stdout(io.StringIO()):
            query_text = self.config.get("query_prefix", "query: ") + query.strip()
            query_embedding = self.model.encode(
                [query_text],
                convert_to_numpy=True,
                normalize_embeddings=bool(self.config.get("normalized", True)),
                show_progress_bar=False,
            ).astype("float32")

        scores, indices = self.index.search(query_embedding, max(1, int(top_k)))

        top_chunks = []
        for score, idx in zip(scores[0], indices[0]):
            if idx < 0:
                continue

            chunk = self.chunks[int(idx)]
            chunk_id = chunk.get("chunk_id")
            meta = self.metadata_by_chunk_id.get(chunk_id, {})
            top_chunks.append(
                {
                    "rank": len(top_chunks) + 1,
                    "chunk_id": chunk_id,
                    "kb_id": chunk.get("kb_id") or meta.get("kb_id"),
                    "source_id": chunk.get("source_id") or meta.get("source_id"),
                    "title": chunk.get("title"),
                    "section": chunk.get("section") or meta.get("section"),
                    "faq_type": chunk.get("faq_type") or meta.get("faq_type"),
                    "semanticScore": float(score),
                    "contentPreview": content_preview(chunk.get("content")),
                }
            )

        return {
            "query": query,
            "retrieverVersion": self.manifest.get("retriever_version", "v1_3"),
            "runtimeMode": "semantic_faiss",
            "modelName": self.model_name,
            "topChunks": top_chunks,
            "latencyMs": round((time.perf_counter() - started) * 1000, 2),
            "bridgeMode": "server",
        }

    def health(self) -> dict[str, Any]:
        return {
            "ok": True,
            "runtimeMode": "semantic_faiss",
            "retrieverVersion": self.manifest.get("retriever_version", "v1_3"),
            "modelName": self.model_name,
            "chunkCount": len(self.chunks),
            "uptimeSeconds": round(time.time() - self.loaded_at, 2),
        }


def run_retrieval(query: str, top_k: int, artifact_dir: Path) -> dict[str, Any]:
    result = SemanticRetriever(artifact_dir).run_retrieval(query, top_k)
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


def make_handler(retriever: SemanticRetriever) -> type[BaseHTTPRequestHandler]:
    class SemanticBridgeHandler(BaseHTTPRequestHandler):
        def log_message(self, format: str, *args: Any) -> None:  # noqa: A002 - BaseHTTPRequestHandler API.
            sys.stderr.write("%s - - [%s] %s\n" % (self.address_string(), self.log_date_time_string(), format % args))

        def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API.
            path = urlparse(self.path).path
            if path == "/health":
                write_json_response(self, 200, retriever.health())
                return

            write_json_response(self, 404, {"ok": False, "error": "not found"})

        def do_POST(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API.
            path = urlparse(self.path).path
            if path != "/query":
                write_json_response(self, 404, {"ok": False, "error": "not found"})
                return

            try:
                payload = read_json_body(self)
                query = str(payload.get("query") or "").strip()
                top_k = int(payload.get("topK") or payload.get("top_k") or 3)
                if not query:
                    write_json_response(
                        self,
                        400,
                        {
                            "query": query,
                            "retrieverVersion": "v1_3",
                            "runtimeMode": "semantic_faiss",
                            "modelName": retriever.model_name,
                            "topChunks": [],
                            "error": "query is required",
                        },
                    )
                    return

                write_json_response(self, 200, retriever.run_retrieval(query, top_k))
            except Exception as error:  # noqa: BLE001 - JSON error payload is the bridge contract.
                write_json_response(
                    self,
                    500,
                    {
                        "retrieverVersion": "v1_3",
                        "runtimeMode": "semantic_faiss",
                        "modelName": retriever.model_name,
                        "topChunks": [],
                        "error": f"{type(error).__name__}: {error}",
                    },
                )

    return SemanticBridgeHandler


def run_server(args: argparse.Namespace) -> None:
    retriever = SemanticRetriever(Path(args.artifact_dir))
    server = ThreadingHTTPServer((args.host, args.port), make_handler(retriever))
    sys.stderr.write(
        f"Semantic bridge server listening on http://{args.host}:{args.port} "
        f"with {retriever.model_name}\n"
    )
    server.serve_forever()


def main() -> None:
    args = parse_args()

    if args.serve:
        try:
            run_server(args)
        except KeyboardInterrupt:
            return
        except Exception as error:  # noqa: BLE001 - JSON error payload is the bridge contract.
            sys.stderr.write(f"{type(error).__name__}: {error}\n")
            sys.exit(1)
        return

    query = read_query(args)

    if not query:
        emit(
            {
                "query": query,
                "retrieverVersion": "v1_3",
                "runtimeMode": "semantic_faiss",
                "modelName": None,
                "topChunks": [],
                "error": "query is required",
            }
        )
        return

    try:
        emit(run_retrieval(query, args.top_k, Path(args.artifact_dir)))
    except Exception as error:  # noqa: BLE001 - JSON error payload is the bridge contract.
        emit(
            {
                "query": query,
                "retrieverVersion": "v1_3",
                "runtimeMode": "semantic_faiss",
                "modelName": None,
                "topChunks": [],
                "error": f"{type(error).__name__}: {error}",
            }
        )


if __name__ == "__main__":
    main()
