from __future__ import annotations

import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Make backend importable when running this script directly.
# ---------------------------------------------------------------------------

BACKEND_DIR = Path(__file__).resolve().parents[1]

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


from app import create_app
from app.services.rag_service import (
    answer_from_knowledge_base,
)


app = create_app()


with app.app_context():

    question = (
        "What are the common causes of delays "
        "in infrastructure projects?"
    )

    print()
    print("=" * 80)
    print("NIRMAAN AI - FULL RAG TEST")
    print("=" * 80)

    print()
    print("Question:")
    print(question)

    print()
    print("Retrieving local RAG knowledge...")
    print()

    result = answer_from_knowledge_base(
        question,
        top_k=4,
    )

    print()
    print("=" * 80)
    print("GEMINI ANSWER")
    print("=" * 80)

    print()
    print(result.get("text", ""))

    print()
    print("=" * 80)
    print("CITATIONS")
    print("=" * 80)

    citations = result.get(
        "citations",
        [],
    )

    if not citations:
        print("No citations returned.")

    else:
        for citation in citations:

            print(
                f"[Source {citation.get('source_number')}] "
                f"{citation.get('document_name')}"
            )

            print(
                f"Page: "
                f"{citation.get('page_number')}"
            )

            print(
                f"Section: "
                f"{citation.get('section_title')}"
            )

            print()

    print()
    print("=" * 80)
    print("RETRIEVED CHUNKS")
    print("=" * 80)

    chunks = result.get(
        "retrieved_chunks",
        [],
    )

    for index, chunk in enumerate(
        chunks,
        start=1,
    ):

        print()
        print(
            f"Chunk {index}"
        )

        print(
            "Document:",
            chunk.get(
                "document_name"
            ),
        )

        print(
            "Page:",
            chunk.get(
                "page_number"
            ),
        )

        print(
            "Vector score:",
            chunk.get(
                "vector_score"
            ),
        )

        print(
            "Keyword score:",
            chunk.get(
                "keyword_score"
            ),
        )

        print(
            "RRF score:",
            chunk.get(
                "rrf_score"
            ),
        )

    print()
    print("=" * 80)
    print("GEMINI TOKEN USAGE")
    print("=" * 80)

    usage = result.get(
        "usage",
        {},
    )

    if usage:
        print(
            "Prompt tokens:",
            usage.get(
                "prompt_tokens"
            ),
        )

        print(
            "Output tokens:",
            usage.get(
                "output_tokens"
            ),
        )

        print(
            "Thought tokens:",
            usage.get(
                "thought_tokens"
            ),
        )

        print(
            "Cached tokens:",
            usage.get(
                "cached_tokens"
            ),
        )

        print(
            "Total tokens:",
            usage.get(
                "total_tokens"
            ),
        )

    else:
        print(
            "No Gemini usage metadata returned."
        )

    print()
    print(
        "Model:",
        result.get(
            "model"
        ),
    )

    print(
        "Source:",
        result.get(
            "source"
        ),
    )