"""
NIRMAAN AI Query Understanding Service.

Purpose:
    Use Gemini as a query-understanding layer.

Important:
    Gemini does NOT answer the user's factual question here.

    Gemini only converts natural language into a small, structured
    query plan that the deterministic NIRMAAN backend can execute.

Flow:

    User question
        |
        v
    Gemini query understanding
        |
        v
    Structured query plan
        |
        +--> FACT
        +--> ML
        +--> RAG
        +--> HYBRID
        +--> ANALYTICS
        +--> GENERAL

The actual project facts, ML predictions, analytics, and RAG evidence
continue to come from their existing deterministic sources.
"""

from __future__ import annotations

import json
import re
from typing import Any

from app.services.gemini_service import (
    generate_grounded_response,
)


# ============================================================================
# CONSTANTS
# ============================================================================

VALID_INTENTS = {
    "FACT",
    "ML",
    "RAG",
    "HYBRID",
    "ANALYTICS",
    "GENERAL",
}

VALID_OPERATIONS = {
    "ANSWER",
    "GET_FACT",
    "GET_PREDICTION",
    "COUNT_PROJECTS",
    "LIST_PROJECTS",
    "LIST_DIMENSIONS",
    "SEARCH_KNOWLEDGE",
}


# ============================================================================
# SYSTEM INSTRUCTION
# ============================================================================

QUERY_UNDERSTANDING_INSTRUCTION = """
You are the query-understanding layer for NIRMAAN AI.

Your job is NOT to answer the user's question.

Your job is ONLY to convert the user's natural-language question into
a small structured query plan for the NIRMAAN backend.

NIRMAAN has these authoritative sources:

FACT
    PostgreSQL project data.

ML
    Existing NIRMAAN ML predictions.

RAG
    NIRMAAN's curated infrastructure knowledge base.

HYBRID
    PostgreSQL project facts + ML predictions + RAG knowledge.

ANALYTICS
    Portfolio-level PostgreSQL analytics across projects.

GENERAL
    General conversational questions that do not fit the above.

IMPORTANT RULES:

1. Never invent a project code.

2. Extract a numeric project code only when it is explicitly present.

3. Normalize obvious spelling mistakes and Hinglish wording when the intent
   is clear.

4. Normalize state names to standard Indian state/UT names when clear.

5. For RAG questions, create a concise retrieval_query suitable for semantic
   and keyword search.

6. For RAG questions, provide useful retrieval_keywords.

7. For analytics questions, identify the requested operation and filters.

8. Do not produce the factual answer.

9. Do not invent project values, metrics, dates, ministries, sectors, or
   statuses.

10. Return ONLY valid JSON.
""".strip()


# ============================================================================
# JSON EXTRACTION
# ============================================================================

def _extract_json(
    text: str,
) -> dict[str, Any]:
    """
    Extract a JSON object from Gemini output.

    Handles:
        - plain JSON
        - ```json ... ```
        - accidental surrounding text
    """

    raw = str(
        text or ""
    ).strip()

    if not raw:
        raise ValueError(
            "Gemini returned an empty query-understanding response."
        )

    # Remove markdown code fences.
    raw = re.sub(
        r"^```(?:json)?\s*",
        "",
        raw,
        flags=re.IGNORECASE,
    )

    raw = re.sub(
        r"\s*```$",
        "",
        raw,
        flags=re.IGNORECASE,
    )

    raw = raw.strip()

    try:
        parsed = json.loads(
            raw
        )
    except json.JSONDecodeError:

        # Try to locate the first JSON object.
        start = raw.find(
            "{"
        )
        end = raw.rfind(
            "}"
        )

        if start < 0 or end <= start:
            raise ValueError(
                "Gemini did not return valid JSON."
            ) from None

        candidate = raw[
            start:end + 1
        ]

        try:
            parsed = json.loads(
                candidate
            )
        except json.JSONDecodeError as exc:
            raise ValueError(
                "Gemini returned malformed query-understanding JSON."
            ) from exc

    if not isinstance(
        parsed,
        dict,
    ):
        raise ValueError(
            "Query-understanding response must be a JSON object."
        )

    return parsed


# ============================================================================
# NORMALIZATION
# ============================================================================

def _normalize_project_code(
    value: Any,
) -> str | None:
    if value is None:
        return None

    text = str(
        value
    ).strip()

    if not text:
        return None

    match = re.search(
        r"\b\d{5,8}\b",
        text,
    )

    return (
        match.group(0)
        if match
        else None
    )


def _normalize_filters(
    value: Any,
) -> dict[str, Any]:
    if not isinstance(
        value,
        dict,
    ):
        return {}

    allowed_keys = {
        "state",
        "ministry",
        "sector",
        "schedule_status",
        "cost_status",
        "risk_level",
        "project_code",
        "search",
    }

    filters: dict[str, Any] = {}

    for key, item in value.items():

        if key not in allowed_keys:
            continue

        if item is None:
            continue

        text = str(
            item
        ).strip()

        if text:
            filters[key] = text

    if "project_code" in filters:
        normalized_code = _normalize_project_code(
            filters["project_code"]
        )

        if normalized_code:
            filters["project_code"] = normalized_code
        else:
            filters.pop(
                "project_code",
                None,
            )

    return filters


def _normalize_query_plan(
    plan: dict[str, Any],
) -> dict[str, Any]:
    """
    Validate and normalize Gemini's proposed query plan.
    """

    intent = str(
        plan.get(
            "intent"
        ) or "GENERAL"
    ).strip().upper()

    if intent not in VALID_INTENTS:
        intent = "GENERAL"

    operation = str(
        plan.get(
            "operation"
        ) or "ANSWER"
    ).strip().upper()

    if operation not in VALID_OPERATIONS:
        operation = "ANSWER"

    project_code = _normalize_project_code(
        plan.get(
            "project_code"
        )
    )

    filters = _normalize_filters(
        plan.get(
            "filters"
        )
    )

    # If project_code is explicitly extracted, keep it synchronized
    # with the filters.
    if project_code:
        filters["project_code"] = (
            project_code
        )

    retrieval_query = str(
        plan.get(
            "retrieval_query"
        ) or ""
    ).strip()

    retrieval_keywords_raw = plan.get(
        "retrieval_keywords"
    )

    if isinstance(
        retrieval_keywords_raw,
        list,
    ):
        retrieval_keywords = [
            str(item).strip()
            for item in retrieval_keywords_raw
            if str(item).strip()
        ]
    else:
        retrieval_keywords = []

    # Limit payload size so a bad model response cannot create a huge object.
    retrieval_keywords = retrieval_keywords[
        :10
    ]

    needs_generation = bool(
        plan.get(
            "needs_generation",
            False,
        )
    )

    return {
        "intent": intent,
        "operation": operation,
        "project_code": project_code,
        "filters": filters,
        "retrieval_query": retrieval_query,
        "retrieval_keywords": retrieval_keywords,
        "needs_generation": needs_generation,
    }


# ============================================================================
# PUBLIC API
# ============================================================================

def understand_query(
    question: str,
) -> dict[str, Any]:
    """
    Convert a user question into a validated structured query plan.

    Gemini is used only for understanding the request.
    No factual answer is generated here.
    """

    query = str(
        question
    ).strip()

    if not query:
        raise ValueError(
            "question is required."
        )

    prompt = f"""
USER QUESTION:

{query}


RETURN ONLY THIS JSON SHAPE:

{{
  "intent": "FACT | ML | RAG | HYBRID | ANALYTICS | GENERAL",
  "operation": "ANSWER | GET_FACT | GET_PREDICTION | COUNT_PROJECTS | LIST_PROJECTS | LIST_DIMENSIONS | SEARCH_KNOWLEDGE",
  "project_code": null,
  "filters": {{
    "state": null,
    "ministry": null,
    "sector": null,
    "schedule_status": null,
    "cost_status": null,
    "risk_level": null,
    "project_code": null,
    "search": null
  }},
  "retrieval_query": "",
  "retrieval_keywords": [],
  "needs_generation": false
}}

INTERPRETATION EXAMPLES:

Question:
"project 400006 kis ministry ke andr h?"

Expected intent:
FACT

Expected operation:
GET_FACT

Expected project_code:
"400006"

Expected filters:
{{"project_code": "400006"}}

Question:
"uttar pradesh me kon se projects delayed hai"

Expected intent:
ANALYTICS

Expected operation:
LIST_PROJECTS

Expected filters:
{{
  "state": "Uttar Pradesh",
  "schedule_status": "Delayed"
}}

Question:
"gujrat me kitne project hai"

Expected intent:
ANALYTICS

Expected operation:
COUNT_PROJECTS

Expected filters:
{{
  "state": "Gujarat"
}}

Question:
"what are common causes of infrastructure delays?"

Expected intent:
RAG

Expected operation:
SEARCH_KNOWLEDGE

retrieval_query:
"common causes of delays in infrastructure projects"

retrieval_keywords:
[
  "infrastructure project delays",
  "causes of delay",
  "schedule delay",
  "project delivery"
]

Question:
"why is project 400005 delayed?"

Expected intent:
HYBRID

Expected operation:
ANSWER

Expected project_code:
"400005"

Question:
"what is the risk score for project 400005?"

Expected intent:
ML

Expected operation:
GET_PREDICTION

Expected project_code:
"400005"

Now classify the user's question.

Return ONLY JSON.
""".strip()

    response = generate_grounded_response(
        prompt,
        system_instruction=(
            QUERY_UNDERSTANDING_INSTRUCTION
        ),
    )

    plan = _extract_json(
        response.get(
            "text",
            "",
        )
    )

    normalized = _normalize_query_plan(
        plan
    )

    # Keep usage/model information available for debugging.
    normalized["model"] = response.get(
        "model"
    )

    normalized["usage"] = response.get(
        "usage",
        {},
    )

    return normalized