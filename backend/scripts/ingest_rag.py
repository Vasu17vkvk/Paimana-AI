"""
NIRMAAN AI RAG ingestion pipeline.

Existing PostgreSQL table:

    nirmaan_rag_documents

Pipeline:

    PDF
      ↓
    PyMuPDF
      ↓
    text extraction
      ↓
    chunks
      ↓
    BAAI/bge-small-en-v1.5
      ↓
    384-dimensional embeddings
      ↓
    PostgreSQL + pgvector

Gemini is NOT used during ingestion.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path
from typing import Any

import pymupdf as fitz
from sentence_transformers import SentenceTransformer
from sqlalchemy import text

import sys
from pathlib import Path

# Add the backend directory to Python's import path.
BACKEND_DIR = Path(__file__).resolve().parents[1]

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import create_app
from app.extensions import db


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

EMBEDDING_MODEL_NAME = "BAAI/bge-small-en-v1.5"

CHUNK_SIZE_WORDS = 600
CHUNK_OVERLAP_WORDS = 80


# ---------------------------------------------------------------------------
# Document metadata
# ---------------------------------------------------------------------------

DOCUMENT_METADATA: dict[str, dict[str, Any]] = {
    "1-s2.0-S2666827021000839-main.pdf": {
        "document_type": "research",
        "topic": "delay",
        "country": "Global",
    },
    "1705.07874v2.pdf": {
        "document_type": "research",
        "topic": "machine_learning",
        "country": "Global",
    },
    "AI-driven_risk_identification_model_for_infrastructure_project.pdf": {
        "document_type": "research",
        "topic": "risk_management",
        "country": "Global",
    },
    "A_1010933404324.pdf": {
        "document_type": "research",
        "topic": "infrastructure",
        "country": "Global",
    },
    "Annual Report 2024-25 English_FINAL_LOW RES_0.pdf": {
        "document_type": "government",
        "topic": "project_management",
        "country": "India",
    },
    "Annual Report of NITI Aayog 2025-26 (English).pdf": {
        "document_type": "government",
        "topic": "project_management",
        "country": "India",
    },
    "Efficiency and competitiveness of Indian Railways.pdf": {
        "document_type": "research",
        "topic": "railways",
        "country": "India",
    },
    "RFP_For_Preparation_Of_Infrastructure_Projects_Pipeline.pdf": {
        "document_type": "government",
        "topic": "project_pipeline",
        "country": "India",
    },
    "TaskForceReport-onProject-ProgramManagement_2.pdf": {
        "document_type": "government",
        "topic": "project_management",
        "country": "India",
    },
    "bh1.pdf": {
        "document_type": "government",
        "topic": "infrastructure",
        "country": "India",
    },
    "echap09.pdf": {
        "document_type": "government",
        "topic": "infrastructure",
        "country": "India",
    },
    "s10791-025-09769-x.pdf": {
        "document_type": "research",
        "topic": "machine_learning",
        "country": "India",
    },
    "s40030-025-00899-5.pdf": {
        "document_type": "research",
        "topic": "delay",
        "country": "India",
    },
    "s42452-026-08965-8.pdf": {
        "document_type": "research",
        "topic": "cost",
        "country": "Global",
    },
}


# ---------------------------------------------------------------------------
# Text helpers
# ---------------------------------------------------------------------------

def clean_text(value: str) -> str:
    """
    Clean extracted PDF text.
    """

    if not value:
        return ""

    value = value.replace(
        "\u00ad",
        "",
    )

    value = value.replace(
        "\xa0",
        " ",
    )

    value = re.sub(
        r"\s+",
        " ",
        value,
    )

    return value.strip()


def looks_like_heading(
    value: str,
) -> bool:
    """
    Lightweight heading detector.

    This is intentionally conservative.
    """

    value = value.strip()

    if not value:
        return False

    if len(value) > 180:
        return False

    words = value.split()

    if len(words) > 18:
        return False

    # Numbered headings:
    # 1 Introduction
    # 2.1 Risk Management
    # 3.2.1 Delay Causes
    if re.match(
        r"^\d+(?:\.\d+){0,4}\s+",
        value,
    ):
        return True

    alphabetic = [
        char
        for char in value
        if char.isalpha()
    ]

    if not alphabetic:
        return False

    upper_ratio = (
        sum(
            char.isupper()
            for char in alphabetic
        )
        / len(alphabetic)
    )

    return (
        upper_ratio > 0.75
        and len(words) <= 14
    )


def split_into_chunks(
    value: str,
    chunk_size: int = CHUNK_SIZE_WORDS,
    overlap: int = CHUNK_OVERLAP_WORDS,
) -> list[str]:
    """
    Split text into overlapping word chunks.
    """

    words = value.split()

    if not words:
        return []

    if overlap >= chunk_size:
        raise ValueError(
            "Chunk overlap must be smaller "
            "than chunk size."
        )

    chunks: list[str] = []

    start = 0

    while start < len(words):

        end = min(
            start + chunk_size,
            len(words),
        )

        chunk = " ".join(
            words[start:end]
        ).strip()

        if chunk:
            chunks.append(
                chunk
            )

        if end >= len(words):
            break

        start = end - overlap

    return chunks


def make_chunk_hash(
    document_name: str,
    page_number: int,
    chunk_index: int,
    chunk_text: str,
) -> str:
    """
    Create a stable identifier for an ingested chunk.
    """

    raw = (
        f"{document_name}|"
        f"{page_number}|"
        f"{chunk_index}|"
        f"{chunk_text}"
    )

    return hashlib.sha256(
        raw.encode("utf-8")
    ).hexdigest()


# ---------------------------------------------------------------------------
# PDF processing
# ---------------------------------------------------------------------------

def extract_document_chunks(
    pdf_path: Path,
) -> list[dict[str, Any]]:
    """
    Extract pages and convert them into RAG chunks.

    Existing database fields used:

        document_name
        document_type
        source
        page_number
        section_title
        chunk_index
        chunk_text
        topic
        country
        document_year
        metadata
        embedding
    """

    metadata = DOCUMENT_METADATA.get(
        pdf_path.name,
        {
            "document_type": "research",
            "topic": "infrastructure",
            "country": "Global",
        },
    )

    document_chunks: list[
        dict[str, Any]
    ] = []

    document = fitz.open(
        pdf_path
    )

    try:

        for page_index in range(
            document.page_count
        ):

            page_number = page_index + 1

            page = document.load_page(
                page_index
            )

            raw_text = page.get_text(
                "text"
            )

            page_text = clean_text(
                raw_text
            )

            if not page_text:
                continue

            # -------------------------------------------------------
            # Break page into rough structural sections.
            # -------------------------------------------------------

            raw_lines = re.split(
                r"\n+",
                raw_text,
            )

            current_section = (
                pdf_path.stem
            )

            section_buffer: list[
                str
            ] = []

            sections: list[
                tuple[str, str]
            ] = []

            for raw_line in raw_lines:

                line = clean_text(
                    raw_line
                )

                if not line:
                    continue

                if looks_like_heading(
                    line
                ):

                    if section_buffer:
                        sections.append(
                            (
                                current_section,
                                " ".join(
                                    section_buffer
                                ),
                            )
                        )

                        section_buffer = []

                    current_section = line[
                        :300
                    ]

                else:
                    section_buffer.append(
                        line
                    )

            if section_buffer:
                sections.append(
                    (
                        current_section,
                        " ".join(
                            section_buffer
                        ),
                    )
                )

            # -------------------------------------------------------
            # If no sections were detected, use the whole page.
            # -------------------------------------------------------

            if not sections:
                sections = [
                    (
                        pdf_path.stem,
                        page_text,
                    )
                ]

            # -------------------------------------------------------
            # Create chunks.
            # -------------------------------------------------------

            page_chunk_index = 0

            for (
                section_title,
                section_text,
            ) in sections:

                section_text = clean_text(
                    section_text
                )

                if not section_text:
                    continue

                chunks = split_into_chunks(
                    section_text
                )

                for chunk_text in chunks:

                    document_chunks.append(
                        {
                            "document_name": (
                                pdf_path.name
                            ),
                            "document_type": (
                                metadata.get(
                                    "document_type"
                                )
                            ),
                            "source": (
                                pdf_path.name
                            ),
                            "page_number": (
                                page_number
                            ),
                            "section_title": (
                                section_title
                            ),
                            "chunk_index": (
                                page_chunk_index
                            ),
                            "chunk_text": (
                                chunk_text
                            ),
                            "topic": (
                                metadata.get(
                                    "topic"
                                )
                            ),
                            "country": (
                                metadata.get(
                                    "country"
                                )
                            ),
                            "document_year": (
                                metadata.get(
                                    "document_year"
                                )
                            ),
                            "metadata": {
                                "ingestion": "local",
                                "embedding_model": (
                                    EMBEDDING_MODEL_NAME
                                ),
                            },
                        }
                    )

                    page_chunk_index += 1

    finally:
        document.close()

    # Re-number chunks globally for this document.
    for index, chunk in enumerate(
        document_chunks
    ):
        chunk["chunk_index"] = index

    return document_chunks


# ---------------------------------------------------------------------------
# Database operations
# ---------------------------------------------------------------------------

def delete_existing_document(
    document_name: str,
) -> None:
    """
    Remove an existing document so it can be rebuilt cleanly.
    """

    db.session.execute(
        text(
            """
            DELETE FROM nirmaan_rag_documents
            WHERE document_name = :document_name
            """
        ),
        {
            "document_name": document_name
        },
    )

    db.session.commit()


def insert_chunks(
    chunks: list[dict[str, Any]],
    embeddings: list[list[float]],
) -> int:
    """
    Insert chunks into the existing NIRMAAN table.
    """

    if len(chunks) != len(
        embeddings
    ):
        raise ValueError(
            "Number of chunks and embeddings "
            "must match."
        )

    insert_sql = text(
        """
        INSERT INTO nirmaan_rag_documents (
            document_name,
            document_type,
            source,
            page_number,
            section_title,
            chunk_index,
            chunk_text,
            topic,
            country,
            document_year,
            embedding,
            metadata
        )
        VALUES (
            :document_name,
            :document_type,
            :source,
            :page_number,
            :section_title,
            :chunk_index,
            :chunk_text,
            :topic,
            :country,
            :document_year,
            CAST(:embedding AS vector),
            CAST(:metadata AS jsonb)
        )
        """
    )

    inserted = 0

    for chunk, embedding in zip(
        chunks,
        embeddings,
    ):

        vector_string = (
            "["
            + ",".join(
                f"{float(value):.8f}"
                for value in embedding
            )
            + "]"
        )

        db.session.execute(
            insert_sql,
            {
                "document_name": chunk[
                    "document_name"
                ],
                "document_type": chunk[
                    "document_type"
                ],
                "source": chunk[
                    "source"
                ],
                "page_number": chunk[
                    "page_number"
                ],
                "section_title": chunk[
                    "section_title"
                ],
                "chunk_index": chunk[
                    "chunk_index"
                ],
                "chunk_text": chunk[
                    "chunk_text"
                ],
                "topic": chunk[
                    "topic"
                ],
                "country": chunk[
                    "country"
                ],
                "document_year": chunk[
                    "document_year"
                ],
                "embedding": vector_string,
                "metadata": json.dumps(
                    chunk[
                        "metadata"
                    ],
                    ensure_ascii=False,
                ),
            },
        )

        inserted += 1

    db.session.commit()

    return inserted


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:

    parser = argparse.ArgumentParser(
        description=(
            "Ingest NIRMAAN curated PDFs "
            "into PostgreSQL + pgvector."
        )
    )

    parser.add_argument(
        "--corpus",
        required=True,
        type=Path,
        help=(
            "Directory containing the curated "
            "RAG PDF files."
        ),
    )

    parser.add_argument(
        "--rebuild",
        action="store_true",
        help=(
            "Delete existing documents before "
            "re-ingesting them."
        ),
    )

    args = parser.parse_args()

    corpus = (
        args.corpus
        .expanduser()
        .resolve()
    )

    if not corpus.exists():
        raise SystemExit(
            f"Corpus directory does not exist: {corpus}"
        )

    pdf_files = sorted(
        corpus.glob("*.pdf")
    )

    if not pdf_files:
        raise SystemExit(
            f"No PDF files found in: {corpus}"
        )

    print(
        f"Found {len(pdf_files)} PDF files."
    )

    print(
        f"Loading embedding model: "
        f"{EMBEDDING_MODEL_NAME}"
    )

    embedding_model = (
        SentenceTransformer(
            EMBEDDING_MODEL_NAME
        )
    )

    app = create_app()

    with app.app_context():

        total_chunks = 0

        for pdf_path in pdf_files:

            print()
            print("=" * 70)
            print(
                f"Processing: {pdf_path.name}"
            )

            if args.rebuild:
                print(
                    "Removing existing document..."
                )

                delete_existing_document(
                    pdf_path.name
                )

            chunks = (
                extract_document_chunks(
                    pdf_path
                )
            )

            if not chunks:
                print(
                    "WARNING: No text extracted."
                )
                continue

            print(
                f"Created {len(chunks)} chunks."
            )

            texts = [
                chunk[
                    "chunk_text"
                ]
                for chunk in chunks
            ]

            print(
                "Creating local embeddings..."
            )

            embeddings = (
                embedding_model.encode(
                    texts,
                    normalize_embeddings=True,
                    show_progress_bar=True,
                )
            )

            embedding_lists = [
                embedding.tolist()
                for embedding in embeddings
            ]

            inserted = insert_chunks(
                chunks,
                embedding_lists,
            )

            total_chunks += inserted

            print(
                f"Inserted {inserted} chunks."
            )

        # -----------------------------------------------------------
        # Final statistics.
        # -----------------------------------------------------------

        row_count = db.session.execute(
            text(
                """
                SELECT COUNT(*)
                FROM nirmaan_rag_documents
                """
            )
        ).scalar()

        document_count = db.session.execute(
            text(
                """
                SELECT COUNT(
                    DISTINCT document_name
                )
                FROM nirmaan_rag_documents
                """
            )
        ).scalar()

        embedding_count = db.session.execute(
            text(
                """
                SELECT COUNT(*)
                FROM nirmaan_rag_documents
                WHERE embedding IS NOT NULL
                """
            )
        ).scalar()

        print()
        print("=" * 70)
        print("RAG INGESTION COMPLETE")
        print("=" * 70)

        print(
            f"Documents: {document_count}"
        )

        print(
            f"Total chunks: {row_count}"
        )

        print(
            f"Embedded chunks: {embedding_count}"
        )

        print(
            f"Chunks processed this run: "
            f"{total_chunks}"
        )


if __name__ == "__main__":
    main()