"""
rag.py — Core RAG pipeline using LangChain, Groq, Google Embeddings, and ChromaDB
"""
import os
import logging
from pathlib import Path
from typing import AsyncIterator, List, Dict, Any

from dotenv import load_dotenv
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_groq import ChatGroq
from langchain_chroma import Chroma
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.documents import Document
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough
from langchain_core.messages import HumanMessage, AIMessage
from langchain_core.prompts import MessagesPlaceholder
from operator import itemgetter

from pdf_utils import extract_text_from_pdf, get_pdf_metadata

load_dotenv()
logger = logging.getLogger(__name__)

# ── Configuration ──────────────────────────────────────────────────────────────
CHROMA_PERSIST_DIR = Path(__file__).parent / "chroma_db"
COLLECTION_NAME = "legal_docs"
CHUNK_SIZE = 800
CHUNK_OVERLAP = 150

# Arabic-aware separators (articles, clauses, newlines)
ARABIC_SEPARATORS = [
    "\nمادة ",   # "Article" in Arabic
    "\nالمادة ",
    "\n\n",
    "\n",
    "؛",         # Arabic semicolon
    ".",
    " ",
    "",
]

SYSTEM_PROMPT = """أنت مساعد قانوني متخصص في قانون العقوبات المصري. 
You are a bilingual legal assistant specialized in the Egyptian Penal Code.

Use ONLY the provided context passages to answer the question.
- If the context contains relevant articles, cite them by article number (e.g., المادة 230).
- If you cannot find the answer in the context, say so clearly in both Arabic and English.
- Answer in the same language the user asked in. If they ask in Arabic, answer in Arabic. If in English, answer in English.
- Be precise, cite specific article numbers when available.
- Do NOT make up legal information not found in the provided context.

Context passages from the Penal Code:
{context}
"""

HUMAN_PROMPT = "{question}"

# ── Global state ───────────────────────────────────────────────────────────────
_vectorstore: Chroma | None = None
_embeddings = None
_ingested_meta: Dict[str, Any] = {}


def _get_embeddings():
    global _embeddings
    if _embeddings is None:
        _embeddings = GoogleGenerativeAIEmbeddings(
            model="models/gemini-embedding-2",
            google_api_key=os.environ["GOOGLE_API_KEY"],
        )
    return _embeddings


def is_ready() -> bool:
    """Return True if the vector store is loaded and has documents."""
    global _vectorstore
    if _vectorstore is not None:
        return True
    # Try to reload from disk
    if CHROMA_PERSIST_DIR.exists():
        try:
            _vectorstore = Chroma(
                collection_name=COLLECTION_NAME,
                embedding_function=_get_embeddings(),
                persist_directory=str(CHROMA_PERSIST_DIR),
            )
            count = _vectorstore._collection.count()
            if count > 0:
                logger.info(f"Reloaded vectorstore with {count} chunks from disk.")
                return True
            # chromadb 1.x uses .count() directly on collection
        except AttributeError:
            try:
                count = len(_vectorstore.get()["ids"])
                if count > 0:
                    logger.info(f"Reloaded vectorstore with {count} chunks from disk.")
                    return True
            except Exception:
                pass
        except Exception as e:
            logger.warning(f"Failed to reload vectorstore: {e}")
    return False


def get_meta() -> Dict[str, Any]:
    return _ingested_meta


async def ingest_pdf(pdf_path: str) -> Dict[str, Any]:
    """
    Parse the PDF, chunk it, embed, and store in ChromaDB.
    Returns stats about the ingestion.
    """
    global _vectorstore, _ingested_meta

    logger.info(f"Starting ingestion of: {pdf_path}")

    # 1. Extract text page by page
    pages = extract_text_from_pdf(pdf_path)
    meta = get_pdf_metadata(pdf_path)
    logger.info(f"Extracted {len(pages)} pages, {sum(p['char_count'] for p in pages)} chars total")

    # 2. Build LangChain Documents
    docs = [
        Document(
            page_content=p["text"],
            metadata={"page": p["page_num"], "source": meta["title"]},
        )
        for p in pages
    ]

    # 3. Split into chunks
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        separators=ARABIC_SEPARATORS,
        length_function=len,
    )
    chunks = splitter.split_documents(docs)
    logger.info(f"Created {len(chunks)} chunks")

    # 4. Embed and store in ChromaDB (persistent)
    CHROMA_PERSIST_DIR.mkdir(parents=True, exist_ok=True)
    
    import time
    batch_size = 90
    _vectorstore = Chroma(
        collection_name=COLLECTION_NAME,
        embedding_function=_get_embeddings(),
        persist_directory=str(CHROMA_PERSIST_DIR),
    )
    for i in range(0, len(chunks), batch_size):
        batch = chunks[i:i + batch_size]
        logger.info(f"Ingesting batch {i//batch_size + 1}/{len(chunks)//batch_size + 1}...")
        _vectorstore.add_documents(batch)
        if i + batch_size < len(chunks):
            logger.info("Sleeping 65s to respect Google Embeddings Free Tier RPM limits...")
            time.sleep(65)

    _ingested_meta = {
        **meta,
        "chunk_count": len(chunks),
        "page_count": len(pages),
    }
    logger.info("Ingestion complete.")
    return _ingested_meta


async def chat_stream(question: str, chat_history: List[Dict[str, str]] = None, k: int = 5) -> AsyncIterator[str]:
    """
    RAG chat: retrieve relevant chunks, stream LLM response.
    Yields text tokens as they arrive from Groq.
    """
    if not is_ready():
        yield "⚠️ الوثيقة لم تُفهرس بعد. | Document not ingested yet."
        return
        
    chat_history = chat_history or []
    
    # 1. Convert history to LangChain messages
    formatted_history = []
    last_user_q = ""
    for msg in chat_history:
        if msg.get("role") == "user":
            formatted_history.append(HumanMessage(content=msg.get("content", "")))
            last_user_q = msg.get("content", "")
        else:
            formatted_history.append(AIMessage(content=msg.get("content", "")))
            
    # For better retrieval, append last user question to the current one for context
    search_query = f"{last_user_q} {question}" if last_user_q else question

    # 1. Retrieve top-k chunks
    retriever = _vectorstore.as_retriever(
        search_type="similarity",
        search_kwargs={"k": k},
    )

    # 2. Build prompt
    prompt = ChatPromptTemplate.from_messages([
        ("system", SYSTEM_PROMPT),
        MessagesPlaceholder(variable_name="chat_history"),
        ("human", HUMAN_PROMPT),
    ])

    # 3. LLM — Groq with streaming
    llm = ChatGroq(
        model="llama-3.3-70b-versatile",
        groq_api_key=os.environ["GROQ_API_KEY"],
        temperature=0.1,
        streaming=True,
    )

    # 4. Build chain
    def format_docs(docs: List[Document]) -> str:
        parts = []
        for i, doc in enumerate(docs, 1):
            page_label = f"[صفحة {doc.metadata.get('page', '?')}]"
            parts.append(f"--- مقطع {i} {page_label} ---\n{doc.page_content}")
        return "\n\n".join(parts)

    chain = (
        {
            "context": itemgetter("search_query") | retriever | format_docs,
            "question": itemgetter("question"),
            "chat_history": itemgetter("chat_history"),
        }
        | prompt
        | llm
        | StrOutputParser()
    )

    # 5. Stream tokens
    async for token in chain.astream({
        "question": question, 
        "search_query": search_query, 
        "chat_history": formatted_history
    }):
        yield token


async def get_sources(question: str, k: int = 5) -> List[Dict[str, Any]]:
    """Retrieve source chunks for a question (for citations panel)."""
    if not is_ready():
        return []
    retriever = _vectorstore.as_retriever(
        search_type="similarity",
        search_kwargs={"k": k},
    )
    docs = await retriever.ainvoke(question)
    return [
        {
            "page": doc.metadata.get("page", "?"),
            "source": doc.metadata.get("source", ""),
            "excerpt": doc.page_content[:400],
        }
        for doc in docs
    ]
