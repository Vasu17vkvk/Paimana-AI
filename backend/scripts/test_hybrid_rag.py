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
from app.services.assistant_service import answer_query


# ---------------------------------------------------------------------------
# Flask application
# ---------------------------------------------------------------------------

app = create_app()


# ---------------------------------------------------------------------------
# Hybrid RAG test
# ---------------------------------------------------------------------------

with app.app_context():

    question = (
        "Why is project 400005 at risk of delay "
        "and what mitigation actions are supported "
        "by the knowledge base?"
    )

    project_code = "400005"

    print()
    print("=" * 90)
    print("NIRMAAN AI - HYBRID RAG TEST")
    print("=" * 90)

    print()
    print("Question:")
    print(question)

    print()
    print("Project code:")
    print(project_code)

    print()
    print("Running hybrid orchestration...")
    print()

    try:

        result = answer_query(
            question=question,
            project_code=project_code,
        )

    except Exception as exc:

        print()
        print("=" * 90)
        print("ERROR")
        print("=" * 90)

        print()
        print(
            f"{type(exc).__name__}: {exc}"
        )

        raise

    # -----------------------------------------------------------------------
    # Final answer
    # -----------------------------------------------------------------------

    print()
    print("=" * 90)
    print("GEMINI ANSWER")
    print("=" * 90)

    print()
    print(
        result.get(
            "text",
            "",
        )
    )

    # -----------------------------------------------------------------------
    # Query type
    # -----------------------------------------------------------------------

    print()
    print("=" * 90)
    print("ROUTING")
    print("=" * 90)

    print()
    print(
        "Query type:",
        result.get(
            "query_type"
        ),
    )

    print(
        "Project code:",
        result.get(
            "project_code"
        ),
    )

    print(
        "Model used:",
        result.get(
            "model_used"
        ),
    )

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

    # -----------------------------------------------------------------------
    # Citations
    # -----------------------------------------------------------------------

    print()
    print("=" * 90)
    print("CITATIONS")
    print("=" * 90)

    citations = result.get(
        "citations",
        [],
    )

    if not citations:

        print(
            "No RAG citations returned."
        )

    else:

        for citation in citations:

            print()
            print(
                f"[Source "
                f"{citation.get('source_number')}]"
            )

            print(
                "Document:",
                citation.get(
                    "document_name"
                ),
            )

            print(
                "Document type:",
                citation.get(
                    "document_type"
                ),
            )

            print(
                "Page:",
                citation.get(
                    "page_number"
                ),
            )

            print(
                "Section:",
                citation.get(
                    "section_title"
                ),
            )

    # -----------------------------------------------------------------------
    # Retrieved RAG chunks
    # -----------------------------------------------------------------------

    print()
    print("=" * 90)
    print("RETRIEVED RAG CHUNKS")
    print("=" * 90)

    chunks = result.get(
        "retrieved_chunks",
        [],
    )

    if not chunks:

        print(
            "No RAG chunks returned."
        )

    else:

        for index, chunk in enumerate(
            chunks,
            start=1,
        ):

            print()
            print(
                f"CHUNK {index}"
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
                "Section:",
                chunk.get(
                    "section_title"
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

    # -----------------------------------------------------------------------
    # Gemini usage
    # -----------------------------------------------------------------------

    print()
    print("=" * 90)
    print("GEMINI TOKEN USAGE")
    print("=" * 90)

    usage = result.get(
        "usage",
        {},
    )

    if not usage:

        print(
            "No usage metadata returned."
        )

    else:

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

    print()
    print("=" * 90)
    print("HYBRID RAG TEST COMPLETE")
    print("=" * 90)