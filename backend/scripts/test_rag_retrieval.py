from __future__ import annotations

import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Make the backend directory importable when this script is run directly.
# ---------------------------------------------------------------------------

BACKEND_DIR = Path(__file__).resolve().parents[1]

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


from app import create_app
from app.services.rag_service import debug_retrieval


# ---------------------------------------------------------------------------
# Flask application
# ---------------------------------------------------------------------------

app = create_app()


# ---------------------------------------------------------------------------
# Retrieval test
# ---------------------------------------------------------------------------

with app.app_context():

    question = (
        "What are the common causes of delays "
        "in infrastructure projects?"
    )

    print()
    print("=" * 80)
    print("RAG RETRIEVAL TEST")
    print("=" * 80)

    print()
    print("Question:")
    print(question)

    print()
    print("Searching PostgreSQL + pgvector...")
    print()

    results = debug_retrieval(
        question,
        top_k=4,
    )

    if not results:
        print(
            "NO RESULTS FOUND."
        )

    else:

        print(
            f"Found {len(results)} results."
        )

        for index, result in enumerate(
            results,
            start=1,
        ):

            print()
            print("=" * 80)
            print(
                f"RESULT {index}"
            )
            print("=" * 80)

            print(
                "Document:",
                result.get(
                    "document_name"
                ),
            )

            print(
                "Document type:",
                result.get(
                    "document_type"
                ),
            )

            print(
                "Page:",
                result.get(
                    "page_number"
                ),
            )

            print(
                "Section:",
                result.get(
                    "section_title"
                ),
            )

            print(
                "Topic:",
                result.get(
                    "topic"
                ),
            )

            print(
                "Country:",
                result.get(
                    "country"
                ),
            )

            print(
                "Document year:",
                result.get(
                    "document_year"
                ),
            )

            print(
                "Vector score:",
                result.get(
                    "vector_score"
                ),
            )

            print(
                "Keyword score:",
                result.get(
                    "keyword_score"
                ),
            )

            print(
                "RRF score:",
                result.get(
                    "rrf_score"
                ),
            )

            print()
            print("CONTENT:")
            print("-" * 80)

            print(
                result.get(
                    "chunk_text"
                )
            )