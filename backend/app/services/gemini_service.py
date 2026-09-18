"""
NIRMAAN AI Gemini service.

Gemini is responsible for explanation and synthesis only.

Project-specific facts and ML predictions must come from NIRMAAN's
authoritative PostgreSQL/database and existing ML engine.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Any

from google import genai

from app.config.gemini_config import (
    get_gemini_api_key,
    get_gemini_model,
)


SYSTEM_INSTRUCTION = """
You are the AI assistant for NIRMAAN AI, an infrastructure project
monitoring platform.

SOURCE-OF-TRUTH RULES:

1. Project-specific observed facts come from the supplied NIRMAAN project
   context backed by PostgreSQL.

2. Project-specific predictions and risk metrics come from the supplied
   NIRMAAN ML outputs.

3. Retrieved knowledge from Gemini File Search is general knowledge,
   project-management guidance, research findings, and government guidance.

4. Never invent project-specific numbers.

5. Never recalculate or modify NIRMAAN ML predictions.

6. Clearly distinguish:
   - OBSERVED: directly reported project facts
   - PREDICTED: outputs from NIRMAAN ML models
   - GENERAL KNOWLEDGE: information retrieved from the knowledge base

7. Do not claim that a general infrastructure-project cause is the cause
   of a particular project unless the supplied project data supports it.

8. When information is missing, say that it is unavailable rather than
   guessing.

9. Keep answers professional, concise, evidence-based, and useful to
   infrastructure project managers.

10. When discussing recommendations, connect them to the supplied facts
    and clearly indicate when they come from general knowledge.
"""


@lru_cache(maxsize=1)
def get_gemini_client() -> genai.Client:
    """
    Create and cache the Gemini client.
    """
    return genai.Client(
        api_key=get_gemini_api_key(),
    )


def _extract_text(response: Any) -> str:
    """
    Extract generated text from an Interactions API response.

    The response shape can vary between SDK versions, so this function
    intentionally handles the common representations.
    """
    output_text = getattr(response, "output_text", None)

    if isinstance(output_text, str) and output_text.strip():
        return output_text.strip()

    outputs = getattr(response, "outputs", None)

    if not isinstance(outputs, list):
        return ""

    parts: list[str] = []

    for item in outputs:
        if item is None:
            continue

        text_value = getattr(item, "text", None)

        if isinstance(text_value, str) and text_value.strip():
            parts.append(text_value.strip())
            continue

        content = getattr(item, "content", None)

        if isinstance(content, str) and content.strip():
            parts.append(content.strip())
            continue

        if isinstance(content, list):
            for content_item in content:
                nested_text = getattr(
                    content_item,
                    "text",
                    None,
                )

                if (
                    isinstance(nested_text, str)
                    and nested_text.strip()
                ):
                    parts.append(nested_text.strip())

    return "\n\n".join(parts).strip()


def generate_response(
    prompt: str,
    *,
    system_instruction: str | None = None,
    tools: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """
    Generate a Gemini response.

    Generation is intentionally centralized here so model configuration,
    safety rules, and future token optimizations remain in one place.
    """
    question = str(prompt).strip()

    if not question:
        raise ValueError("prompt is required.")

    client = get_gemini_client()

    request_tools = tools or []

    response = client.interactions.create(
        model=get_gemini_model(),
        input=question,
        system_instruction=(
            system_instruction
            or SYSTEM_INSTRUCTION
        ),
        tools=request_tools,
    )

    text = _extract_text(response)

    if not text:
        raise RuntimeError(
            "Gemini returned no usable text response."
        )

    return {
        "text": text,
        "model": get_gemini_model(),
        "raw_response": response,
    }


def generate_grounded_response(
    prompt: str,
    *,
    system_instruction: str | None = None,
    tools: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """
    Generate a response using the standard NIRMAAN source-of-truth rules.
    """
    return generate_response(
        prompt,
        system_instruction=(
            system_instruction
            or SYSTEM_INSTRUCTION
        ),
        tools=tools,
    )
    """
    Generate a response using the standard NIRMAAN source-of-truth rules.
    """
    return generate_response(
        prompt,
        system_instruction=SYSTEM_INSTRUCTION,
        tools=tools,
    )