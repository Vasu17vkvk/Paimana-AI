"""
NIRMAAN AI RAG service.

Uses Gemini File Search only for general infrastructure knowledge,
research, guidance, standards, and mitigation practices.

Project-specific facts and ML predictions remain outside RAG.
"""

from __future__ import annotations

from typing import Any

from app.config.gemini_config import (
    get_gemini_file_search_store,
)
from app.services.gemini_service import (
    generate_grounded_response,
)


RAG_SYSTEM_INSTRUCTION = """
You are NIRMAAN AI's infrastructure knowledge assistant.

Use the connected File Search knowledge base as the primary source for
general infrastructure-project knowledge.

Answer only from information supported by the retrieved documents.

Important rules:

1. Do not invent facts or citations.
2. Do not create project-specific metrics.
3. Do not claim that a documented general cause is definitely the cause
   of a particular project.
4. Clearly distinguish general knowledge from project observations.
5. Prefer concise, practical explanations.
6. When documents disagree or information is insufficient, say so.
7. Preserve important qualifications and limitations from the sources.
"""


def _get_file_search_tool() -> dict[str, Any]:
    store_name = get_gemini_file_search_store()

    if not store_name:
        raise RuntimeError(
            "GEMINI_FILE_SEARCH_STORE is not configured."
        )

    return {
        "type": "file_search",
        "file_search_store_names": [store_name],
        "top_k": 5,
    }


def _annotation_to_dict(annotation: Any) -> dict[str, Any]:
    """
    Convert a citation annotation into a small JSON-safe dictionary.
    """
    result: dict[str, Any] = {}

    for key in (
        "type",
        "file_name",
        "source",
        "page_number",
        "media_id",
    ):
        value = getattr(annotation, key, None)

        if value is None:
            continue

        result[key] = value

    return result


def _extract_citations(response: Any) -> list[dict[str, Any]]:
    """
    Extract File Search citations from Interactions API model-output
    annotations.
    """
    citations: list[dict[str, Any]] = []

    steps = getattr(response, "steps", None)

    if not isinstance(steps, list):
        return citations

    for step in steps:
        if getattr(step, "type", None) != "model_output":
            continue

        content_blocks = getattr(step, "content", None)

        if not isinstance(content_blocks, list):
            continue

        for content_block in content_blocks:
            if getattr(content_block, "type", None) != "text":
                continue

            annotations = getattr(
                content_block,
                "annotations",
                None,
            )

            if not isinstance(annotations, list):
                continue

            for annotation in annotations:
                if (
                    getattr(annotation, "type", None)
                    != "file_citation"
                ):
                    continue

                citation = _annotation_to_dict(
                    annotation
                )

                if citation:
                    citations.append(citation)

    return citations


def answer_from_knowledge_base(
    question: str,
) -> dict[str, Any]:
    """
    Answer a general infrastructure knowledge question using RAG.
    """
    query = str(question).strip()

    if not query:
        raise ValueError(
            "question is required."
        )

    result = generate_grounded_response(
        query,
        tools=[_get_file_search_tool()],
    )

    response = result.get("raw_response")

    return {
        "text": result["text"],
        "citations": _extract_citations(response),
        "model": result["model"],
        "source": "gemini_file_search",
    }