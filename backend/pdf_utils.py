"""
pdf_utils.py — Arabic-aware PDF text extractor using PyMuPDF
"""
import fitz  # PyMuPDF
from pathlib import Path
from typing import List, Dict, Any


def extract_text_from_pdf(pdf_path: str) -> List[Dict[str, Any]]:
    """
    Extract text from a PDF page by page.
    Returns a list of dicts: {page_num, text, char_count}
    Handles Arabic (RTL) text correctly via PyMuPDF's text extraction.
    """
    doc = fitz.open(pdf_path)
    pages = []
    for page_num in range(len(doc)):
        page = doc[page_num]
        # Use "text" mode with preserve_whitespace for Arabic
        text = page.get_text("text", flags=fitz.TEXT_PRESERVE_WHITESPACE)
        text = text.strip()
        if text:
            pages.append({
                "page_num": page_num + 1,
                "text": text,
                "char_count": len(text),
            })
    doc.close()
    return pages


def get_pdf_metadata(pdf_path: str) -> Dict[str, Any]:
    """Return basic PDF metadata."""
    doc = fitz.open(pdf_path)
    meta = doc.metadata
    page_count = len(doc)
    doc.close()
    return {
        "title": meta.get("title", Path(pdf_path).stem),
        "author": meta.get("author", ""),
        "page_count": page_count,
        "file_size_kb": round(Path(pdf_path).stat().st_size / 1024, 1),
    }
