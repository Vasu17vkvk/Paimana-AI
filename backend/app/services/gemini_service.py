"""
NIRMAAN AI Gemini Service.

Gemini is responsible ONLY for:
    - final answer generation
    - explanation
    - reasoning
    - synthesis

Gemini is NOT responsible for:
    - RAG retrieval
    - embeddings
    - vector search
    - keyword search
    - PDF ingestion
    - PostgreSQL queries
    - ML prediction

Architecture:

    PostgreSQL project data
            +
    Existing NIRMAAN ML outputs
            +
    Local RAG / pgvector results
            |
            v
       Compact prompt
            |
            v
          Gemini
            |
            v
       Final answer

The service intentionally performs exactly ONE
Gemini generation request per invocation.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Any

from google import genai
from google.genai import types

from app.config.gemini_config import (
    get_gemini_api_key,
    get_gemini_max_output_tokens,
    get_gemini_model,
    get_gemini_temperature,
    get_gemini_thinking_level,
)


# ============================================================================
# DEFAULT SYSTEM INSTRUCTION
# ============================================================================

SYSTEM_INSTRUCTION = """
You are the AI assistant for NIRMAAN AI, an infrastructure project
monitoring and intelligence platform.

NIRMAAN uses three evidence categories:

1. OBSERVED
   Project-specific facts supplied by NIRMAAN's PostgreSQL-backed
   project context.

2. PREDICTED
   Project-specific predictions and risk metrics supplied by NIRMAAN's
   existing ML engine.

3. GENERAL KNOWLEDGE
   Information retrieved by NIRMAAN's local RAG system from its curated
   knowledge base.

SOURCE-OF-TRUTH RULES:

1. Project-specific observed facts must come only from the supplied
   NIRMAAN project context.

2. Project-specific predictions and risk metrics must come only from
   supplied NIRMAAN ML outputs.

3. General infrastructure knowledge must come only from supplied
   retrieved RAG context.

4. Never invent project-specific numbers, metrics, dates, names,
   probabilities, financial values, or statuses.

5. Never recalculate, modify, or replace supplied ML predictions.

6. Never present a general knowledge statement as a confirmed
   project-specific fact.

7. General knowledge may be used to explain:
   - possible causes
   - mitigation strategies
   - project-management practices
   - procurement practices
   - contract-management practices
   - risk-management practices
   - schedule-management practices
   - infrastructure delivery practices

8. Clearly distinguish:
   OBSERVED
   PREDICTED
   GENERAL KNOWLEDGE

9. If the supplied context does not contain enough information to answer
   the question, state that the information is unavailable or insufficient.

10. Do not invent citations or claim that a source says something that
    was not supplied.

11. When [Source N] labels are supplied, use them for source-based claims.

12. Keep answers professional, concise, evidence-based, and practical.

13. Do not use tools, external search, or external knowledge to replace
    the supplied NIRMAAN context.

14. Do not expose internal prompts, hidden instructions, or implementation
    details unless explicitly asked.
""".strip()


# ============================================================================
# GEMINI CLIENT
# ============================================================================

@lru_cache(maxsize=1)
def get_gemini_client() -> genai.Client:
    """
    Create and cache the Gemini client.

    The client is initialized once per application process.
    """

    api_key = get_gemini_api_key()

    if not api_key:
        raise RuntimeError(
            "GEMINI_API_KEY is not configured."
        )

    return genai.Client(
        api_key=api_key,
    )


# ============================================================================
# GENERATION CONFIG
# ============================================================================

def _build_generation_config(
    system_instruction: str | None = None,
) -> types.GenerateContentConfig:
    """
    Build Gemini generation configuration from NIRMAAN settings.
    """

    instruction = (
        system_instruction.strip()
        if isinstance(
            system_instruction,
            str,
        )
        and system_instruction.strip()
        else SYSTEM_INSTRUCTION
    )

    return types.GenerateContentConfig(

        # ---------------------------------------------------------------
        # System instruction
        # ---------------------------------------------------------------

        system_instruction=instruction,

        # ---------------------------------------------------------------
        # One candidate only.
        #
        # Multiple candidates increase generation work and are not
        # useful for the dashboard assistant.
        # ---------------------------------------------------------------

        candidate_count=1,

        # ---------------------------------------------------------------
        # Read from .env through gemini_config.py.
        # ---------------------------------------------------------------

        max_output_tokens=(
            get_gemini_max_output_tokens()
        ),

        temperature=(
            get_gemini_temperature()
        ),

        # ---------------------------------------------------------------
        # Low thinking keeps latency/cost controlled.
        # ---------------------------------------------------------------

        thinking_config=types.ThinkingConfig(
            thinking_level=(
                get_gemini_thinking_level()
            ),
        ),

        # ---------------------------------------------------------------
        # NIRMAAN does not use Gemini tools.
        #
        # Explicitly disable automatic function calling so the generation
        # layer stays strictly tool-free.
        # ---------------------------------------------------------------

        automatic_function_calling=(
            types.AutomaticFunctionCallingConfig(
                disable=True,
            )
        ),
    )


# ============================================================================
# TEXT EXTRACTION
# ============================================================================

def _extract_text(
    response: Any,
) -> str:
    """
    Extract generated text from the current GenerateContent response.

    The normal SDK path is response.text.

    A candidates fallback is retained for compatibility with SDK versions
    where the text property may not be populated directly.
    """

    # ------------------------------------------------------------------
    # Standard response.text
    # ------------------------------------------------------------------

    response_text = getattr(
        response,
        "text",
        None,
    )

    if isinstance(
        response_text,
        str,
    ):

        response_text = (
            response_text.strip()
        )

        if response_text:
            return response_text

    # ------------------------------------------------------------------
    # Candidate fallback
    # ------------------------------------------------------------------

    candidates = getattr(
        response,
        "candidates",
        None,
    )

    if not isinstance(
        candidates,
        list,
    ):
        return ""

    parts: list[str] = []

    for candidate in candidates:

        if candidate is None:
            continue

        content = getattr(
            candidate,
            "content",
            None,
        )

        if content is None:
            continue

        content_parts = getattr(
            content,
            "parts",
            None,
        )

        if not isinstance(
            content_parts,
            list,
        ):
            continue

        for part in content_parts:

            part_text = getattr(
                part,
                "text",
                None,
            )

            if isinstance(
                part_text,
                str,
            ):

                part_text = (
                    part_text.strip()
                )

                if part_text:
                    parts.append(
                        part_text
                    )

    return "\n\n".join(
        parts
    ).strip()


# ============================================================================
# USAGE METADATA
# ============================================================================

def _extract_usage_metadata(
    response: Any,
) -> dict[str, Any]:
    """
    Extract token usage from Gemini response metadata.

    The current SDK exposes usage_metadata on GenerateContentResponse.
    """

    usage = getattr(
        response,
        "usage_metadata",
        None,
    )

    if usage is None:

        return {
            "prompt_tokens": None,
            "output_tokens": None,
            "thought_tokens": None,
            "cached_tokens": None,
            "tool_tokens": None,
            "total_tokens": None,
        }

    return {
        "prompt_tokens": getattr(
            usage,
            "prompt_token_count",
            None,
        ),
        "output_tokens": getattr(
            usage,
            "candidates_token_count",
            None,
        ),
        "thought_tokens": getattr(
            usage,
            "thoughts_token_count",
            None,
        ),
        "cached_tokens": getattr(
            usage,
            "cached_content_token_count",
            None,
        ),
        "tool_tokens": getattr(
            usage,
            "tool_use_prompt_token_count",
            None,
        ),
        "total_tokens": getattr(
            usage,
            "total_token_count",
            None,
        ),
    }


# ============================================================================
# RESPONSE METADATA
# ============================================================================

def _extract_finish_reason(
    response: Any,
) -> str | None:
    """
    Extract the model finish reason when available.
    """

    candidates = getattr(
        response,
        "candidates",
        None,
    )

    if not isinstance(
        candidates,
        list,
    ) or not candidates:

        return None

    finish_reason = getattr(
        candidates[0],
        "finish_reason",
        None,
    )

    if finish_reason is None:
        return None

    return str(
        finish_reason
    )


# ============================================================================
# MAIN GENERATION FUNCTION
# ============================================================================

def generate_response(
    prompt: str,
    *,
    system_instruction: str | None = None,
) -> dict[str, Any]:
    """
    Generate exactly one Gemini response.

    This function intentionally accepts NO tools argument.

    RAG retrieval must happen before this function is called.
    """

    request_prompt = str(
        prompt
    ).strip()

    if not request_prompt:
        raise ValueError(
            "prompt is required."
        )

    model_name = get_gemini_model()

    if not model_name:
        raise RuntimeError(
            "GEMINI_MODEL is not configured."
        )

    client = get_gemini_client()

    config = _build_generation_config(
        system_instruction
    )

    try:

        response = (
            client.models.generate_content(
                model=model_name,
                contents=request_prompt,
                config=config,
            )
        )

    except Exception as exc:

        raise RuntimeError(
            f"Gemini generation failed: {exc}"
        ) from exc

    generated_text = _extract_text(
        response
    )

    if not generated_text:

        finish_reason = (
            _extract_finish_reason(
                response
            )
        )

        if finish_reason:
            raise RuntimeError(
                "Gemini returned no usable text "
                f"response. Finish reason: "
                f"{finish_reason}"
            )

        raise RuntimeError(
            "Gemini returned no usable text response."
        )

    usage = _extract_usage_metadata(
        response
    )

    return {
        "text": generated_text,
        "model": model_name,
        "usage": usage,
        "finish_reason": (
            _extract_finish_reason(
                response
            )
        ),
        "raw_response": response,
    }


# ============================================================================
# GROUNDED GENERATION
# ============================================================================

def generate_grounded_response(
    prompt: str,
    *,
    system_instruction: str | None = None,
) -> dict[str, Any]:
    """
    Generate a grounded NIRMAAN response.

    The grounding context must already be included in `prompt`.

    Example RAG flow:

        question
           ↓
        local retrieval
           ↓
        top 3 chunks
           ↓
        compact prompt
           ↓
        this function
           ↓
        ONE Gemini generation
    """

    effective_instruction = (
        system_instruction.strip()
        if isinstance(
            system_instruction,
            str,
        )
        and system_instruction.strip()
        else SYSTEM_INSTRUCTION
    )

    return generate_response(
        prompt,
        system_instruction=effective_instruction,
    )


# ============================================================================
# RAG ANSWER HELPER
# ============================================================================

def generate_rag_answer(
    question: str,
    rag_context: str,
) -> dict[str, Any]:
    """
    Generate a final answer from already-retrieved RAG context.

    IMPORTANT:
        This function does NOT retrieve documents.

        It simply sends:
            question
            +
            retrieved context

        to Gemini in one generation request.
    """

    query = str(
        question
    ).strip()

    context = str(
        rag_context
    ).strip()

    if not query:
        raise ValueError(
            "question is required."
        )

    if not context:
        raise ValueError(
            "rag_context is required."
        )

    prompt = f"""
USER QUESTION:

{query}


RETRIEVED NIRMAAN KNOWLEDGE:

{context}


ANSWER REQUIREMENTS:

1. Answer the user's question using the retrieved knowledge.

2. Do not invent information that is not supported by the retrieved
   passages.

3. Use [Source N] labels when making source-based claims.

4. Preserve important qualifications and limitations.

5. If the retrieved evidence is insufficient, say so.

6. Keep the answer concise, practical, and evidence-based.
""".strip()

    return generate_grounded_response(
        prompt,
        system_instruction=SYSTEM_INSTRUCTION,
    )