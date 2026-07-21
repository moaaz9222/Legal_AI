"""
main.py — FastAPI backend for the Legal RAG app
"""
import os
import logging
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(name)s | %(message)s")
logger = logging.getLogger(__name__)

# Auto-discover the PDF in the parent folder (handles Arabic filenames)
_parent_dir = Path(__file__).parent.parent
_pdf_files = list(_parent_dir.glob("*.pdf"))
PDF_PATH = str(_pdf_files[0]) if _pdf_files else str(_parent_dir / "document.pdf")

# ── Startup: auto-ingest if vector store not present ──────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    import rag
    if not rag.is_ready():
        logger.info("Vector store not found. Auto-ingesting PDF on startup...")
        try:
            stats = await rag.ingest_pdf(PDF_PATH)
            logger.info(f"Auto-ingestion done: {stats}")
        except Exception as e:
            logger.error(f"Auto-ingestion failed: {e}")
    else:
        logger.info("Vector store already loaded.")
    yield


app = FastAPI(
    title="Legal RAG API — قانون العقوبات",
    description="RAG-powered legal assistant for the Arabic Penal Code",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3001", "http://127.0.0.1:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Request / Response Models ─────────────────────────────────────────────────
class ChatRequest(BaseModel):
    question: str
    k: int = 5  # number of chunks to retrieve
    chat_history: list[dict] = []

class IngestResponse(BaseModel):
    status: str
    stats: dict

# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/api/status")
async def status():
    """Check if the document is ingested and ready."""
    import rag
    ready = rag.is_ready()
    meta = rag.get_meta()
    return {
        "ready": ready,
        "pdf_path": PDF_PATH,
        "pdf_exists": Path(PDF_PATH).exists(),
        "meta": meta,
    }


@app.post("/api/ingest")
async def ingest(background_tasks: BackgroundTasks):
    """Trigger (re-)ingestion of the PDF."""
    import rag

    if not Path(PDF_PATH).exists():
        raise HTTPException(status_code=404, detail=f"PDF not found at: {PDF_PATH}")

    async def do_ingest():
        await rag.ingest_pdf(PDF_PATH)

    background_tasks.add_task(do_ingest)
    return {"status": "ingestion_started", "pdf": PDF_PATH}


@app.post("/api/chat/stream")
async def chat_stream(req: ChatRequest):
    """
    Streaming RAG chat endpoint.
    Returns Server-Sent Events (SSE) with text/event-stream content type.
    """
    import rag

    if not req.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    async def event_generator():
        try:
            async for token in rag.chat_stream(req.question, chat_history=req.chat_history, k=req.k):
                # SSE format: "data: <token>\n\n"
                # Escape newlines within token
                safe = token.replace("\n", "\\n")
                yield f"data: {safe}\n\n"
        except Exception as e:
            logger.error(f"Streaming error: {e}")
            yield f"data: [ERROR] {str(e)}\n\n"
        finally:
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/chat/sources")
async def chat_sources(req: ChatRequest):
    """Return source chunks used to answer a question (for citation panel)."""
    import rag

    if not req.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    sources = await rag.get_sources(req.question, k=req.k)
    return {"sources": sources}


@app.get("/api/health")
async def health():
    return {"status": "ok"}
