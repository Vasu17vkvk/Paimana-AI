"""
NIRMAAN AI Assistant Orchestration Service.

Routing strategy:

FACT_QUERY
    PostgreSQL-backed project context only.
    No Gemini generation.

ML_QUERY
    Existing NIRMAAN ML outputs only.
    No Gemini generation.

RAG_QUERY
    Gemini + File Search.
    No project context required unless the user supplied one.

HYBRID_QUERY
    PostgreSQL + existing ML + Gemini File Search.
    One Gemini generation call.

GENERAL_QUERY
    Gemini only.
"""

from __future__ import annotations

import json
import re
from typing import Any

from app.services.assistant_context_service import (
    get_project_context,
)
from app.services.gemini_service import (
    generate_grounded_response,
)
from app.services.rag_service import (
    _get_file_search_tool,
    _extract_citations,
)


# ---------------------------------------------------------------------------
# Query classes
# ---------------------------------------------------------------------------

FACT_QUERY = "FACT_QUERY"
ML_QUERY = "ML_QUERY"
RAG_QUERY = "RAG_QUERY"
HYBRID_QUERY = "HYBRID_QUERY"
GENERAL_QUERY = "GENERAL_QUERY"


# ---------------------------------------------------------------------------
# Query keyword groups
# ---------------------------------------------------------------------------

FACT_KEYWORDS = (
    "name",
    "ministry",
    "sector",
    "state",
    "agency",
    "implementing agency",
    "completion date",
    "original completion",
    "revised completion",
    "status",
    "schedule status",
    "cost status",
    "original cost",
    "expenditure",
    "spent",
    "spending",
    "progress",
    "physical progress",
    "delay days",
    "how late",
    "completion",
    "project details",
)

ML_KEYWORDS = (
    "risk score",
    "risk level",
    "future delay",
    "delay probability",
    "delay prediction",
    "progress stall",
    "stall probability",
    "stall prediction",
    "predicted cost",
    "cost prediction",
    "cost overrun prediction",
    "cost risk",
    "early warning",
    "warning",
    "priority",
    "ml model",
    "model prediction",
)

RAG_KEYWORDS = (
    "according to",
    "research",
    "study",
    "studies",
    "guideline",
    "guidelines",
    "government guidance",
    "best practice",
    "best practices",
    "project management practice",
    "project management practices",
    "cause",
    "causes",
    "mitigation",
    "mitigation strategy",
    "mitigation strategies",
    "recommendation",
    "recommendations",
    "procurement",
    "contract management",
    "risk management",
    "schedule management",
    "infrastructure projects",
    "infrastructure project delivery",
    "india",
)

HYBRID_KEYWORDS = (
    "why is this project",
    "why is the project",
    "why has this project",
    "why has the project",
    "what is causing this project",
    "what is causing the project",
    "how can this project",
    "how can the project",
    "what should we do",
    "what should be done",
    "what are the causes for this project",
    "explain this project's risk",
    "explain the project's risk",
    "explain its risk",
    "recommend actions for this project",
    "recommend actions for the project",
    "how to mitigate",
    "how should we mitigate",
)


PROJECT_CODE_PATTERN = re.compile(
    r"\b\d{5,8}\b"
)


# ---------------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------------

def _normalise_query(query: str) -> str:
    return " ".join(
        str(query).strip().lower().split()
    )


def _contains_any(
    query: str,
    keywords: tuple[str, ...],
) -> bool:
    return any(
        keyword in query
        for keyword in keywords
    )


def extract_project_code(
    query: str,
) -> str | None:
    """
    Extract a likely NIRMAAN project code from the user's question.

    Current project identifiers are numeric, e.g. 400005.
    """
    match = PROJECT_CODE_PATTERN.search(
        str(query)
    )

    if not match:
        return None

    return match.group(0)


def classify_query(
    query: str,
    project_code: str | None = None,
) -> str:
    """
    Deterministically classify a user query before Gemini is called.

    Hybrid takes precedence because it needs both:
        project facts/ML + general knowledge.
    """
    normalized = _normalise_query(query)

    has_project = bool(
        project_code
        or extract_project_code(normalized)
    )

    is_hybrid = _contains_any(
        normalized,
        HYBRID_KEYWORDS,
    )

    is_ml = _contains_any(
        normalized,
        ML_KEYWORDS,
    )

    is_fact = _contains_any(
        normalized,
        FACT_KEYWORDS,
    )

    is_rag = _contains_any(
        normalized,
        RAG_KEYWORDS,
    )

    if has_project and is_hybrid:
        return HYBRID_QUERY

    if has_project and is_ml and not is_rag:
        return ML_QUERY

    if has_project and is_fact and not is_ml and not is_rag:
        return FACT_QUERY

    if is_hybrid:
        return HYBRID_QUERY

    if is_rag:
        return RAG_QUERY

    if has_project and is_ml:
        return ML_QUERY

    if has_project and is_fact:
        return FACT_QUERY

    return GENERAL_QUERY


def _get_value(
    data: dict[str, Any],
    *keys: str,
) -> Any:
    for key in keys:
        if key in data:
            return data[key]

    return None


def _format_number(
    value: Any,
    decimals: int = 2,
) -> str:
    if value is None:
        return "unavailable"

    try:
        number = float(value)
    except (TypeError, ValueError):
        return str(value)

    return f"{number:,.{decimals}f}"


def _format_probability(
    value: Any,
) -> str:
    if value is None:
        return "unavailable"

    try:
        number = float(value)

        # Existing assistant context stores probabilities as percentages.
        return f"{number:.1f}%"
    except (TypeError, ValueError):
        return str(value)


# ---------------------------------------------------------------------------
# Deterministic fact response
# ---------------------------------------------------------------------------

def _fact_response(
    context: dict[str, Any],
    question: str,
) -> dict[str, Any]:
    project = context.get("project") or {}

    normalized = _normalise_query(question)

    fields: list[tuple[str, str]] = []

    if "name" in normalized:
        fields.append(
            (
                "Project name",
                _get_value(project, "project_name"),
            )
        )

    if "ministry" in normalized:
        fields.append(
            (
                "Ministry",
                _get_value(project, "ministry"),
            )
        )

    if "sector" in normalized:
        fields.append(
            (
                "Sector",
                _get_value(project, "sector"),
            )
        )

    if "state" in normalized:
        fields.append(
            (
                "State",
                _get_value(project, "state"),
            )
        )

    if (
        "agency" in normalized
        or "implementing agency" in normalized
    ):
        fields.append(
            (
                "Implementing agency",
                _get_value(
                    project,
                    "implementing_agency",
                ),
            )
        )

    if (
        "original completion" in normalized
        or (
            "completion date" in normalized
            and "revised" not in normalized
        )
    ):
        fields.append(
            (
                "Original completion",
                _get_value(
                    project,
                    "original_completion",
                ),
            )
        )

    if (
        "revised completion" in normalized
        or "revised date" in normalized
    ):
        fields.append(
            (
                "Revised completion",
                _get_value(
                    project,
                    "revised_completion",
                ),
            )
        )

    if "schedule status" in normalized:
        fields.append(
            (
                "Schedule status",
                _get_value(
                    project,
                    "schedule_status",
                ),
            )
        )

    if "cost status" in normalized:
        fields.append(
            (
                "Cost status",
                _get_value(
                    project,
                    "cost_status",
                ),
            )
        )

    if (
        "original cost" in normalized
        or "approved cost" in normalized
    ):
        fields.append(
            (
                "Original cost",
                (
                    f"₹{_format_number(project.get('original_cost_cr'))} Cr"
                    if project.get("original_cost_cr") is not None
                    else "unavailable"
                ),
            )
        )

    if (
        "expenditure" in normalized
        or "spent" in normalized
    ):
        fields.append(
            (
                "Expenditure",
                (
                    f"₹{_format_number(project.get('expenditure_cr'))} Cr"
                    if project.get("expenditure_cr") is not None
                    else "unavailable"
                ),
            )
        )

    if (
        "progress" in normalized
        or "physical progress" in normalized
    ):
        fields.append(
            (
                "Physical progress",
                (
                    f"{_format_number(project.get('physical_progress_pct'), 1)}%"
                    if project.get("physical_progress_pct") is not None
                    else "unavailable"
                ),
            )
        )

    if (
        "delay days" in normalized
        or "how late" in normalized
        or "delay" in normalized
    ):
        fields.append(
            (
                "Recorded delay",
                (
                    f"{_format_number(project.get('delay_days'), 0)} days"
                    if project.get("delay_days") is not None
                    else "unavailable"
                ),
            )
        )

    if not fields:
        fields = [
            (
                "Project name",
                project.get("project_name"),
            ),
            (
                "Ministry",
                project.get("ministry"),
            ),
            (
                "Sector",
                project.get("sector"),
            ),
            (
                "Schedule status",
                project.get("schedule_status"),
            ),
        ]

    lines = [
        f"Project: {project.get('project_code', 'unknown')}",
    ]

    for label, value in fields:
        display_value = (
            "unavailable"
            if value is None
            else str(value)
        )

        lines.append(
            f"{label}: {display_value}"
        )

    return {
        "text": "\n".join(lines),
        "query_type": FACT_QUERY,
        "project_code": project.get(
            "project_code"
        ),
        "citations": [],
        "model_used": False,
    }


# ---------------------------------------------------------------------------
# Deterministic ML response
# ---------------------------------------------------------------------------

def _ml_response(
    context: dict[str, Any],
) -> dict[str, Any]:
    project = context.get("project") or {}
    predictions = context.get("predictions") or {}

    lines = [
        f"Project: {project.get('project_code', 'unknown')}",
        (
            "Overall risk score: "
            f"{_format_number(predictions.get('overall_risk'), 1)}"
        ),
        (
            "Risk level: "
            f"{predictions.get('risk_level') or 'unavailable'}"
        ),
        (
            "Future delay probability: "
            f"{_format_probability(predictions.get('future_delay_probability'))}"
        ),
        (
            "Progress stall probability: "
            f"{_format_probability(predictions.get('progress_stall_probability'))}"
        ),
        (
            "Predicted cost overrun: "
            + (
                f"₹{_format_number(predictions.get('predicted_cost_overrun'))} Cr"
                if predictions.get("predicted_cost_overrun") is not None
                else "unavailable"
            )
        ),
        (
            "Cost risk: "
            f"{_format_number(predictions.get('cost_risk'), 1)}"
        ),
    ]

    return {
        "text": "\n".join(lines),
        "query_type": ML_QUERY,
        "project_code": project.get(
            "project_code"
        ),
        "citations": [],
        "model_used": False,
    }


# ---------------------------------------------------------------------------
# Gemini prompt builders
# ---------------------------------------------------------------------------

def _build_project_prompt(
    question: str,
    context: dict[str, Any],
) -> str:
    compact_context = {
        "project": context.get("project", {}),
        "predictions": context.get(
            "predictions",
            {},
        ),
        "observed_indicators": context.get(
            "observed_indicators",
            [],
        ),
        "recent_history": context.get(
            "recent_history",
            [],
        ),
        "recent_progress": context.get(
            "recent_progress",
            [],
        ),
    }

    serialized = json.dumps(
        compact_context,
        ensure_ascii=False,
        separators=(",", ":"),
        default=str,
    )

    return f"""
User question:
{question}

Authoritative NIRMAAN project context:
{serialized}

Answer the user's question using the supplied project context and the
connected File Search knowledge base.

Use these source labels when useful:

OBSERVED
Facts directly reported in the project context.

PREDICTED
Outputs from the existing NIRMAAN ML models.

GENERAL KNOWLEDGE
Information supported by retrieved File Search documents.

Important:
- Never invent missing project values.
- Never recalculate the supplied ML metrics.
- Do not state that an observed indicator is a proven causal factor.
- General knowledge may explain possible causes or mitigation practices,
  but do not present those possibilities as confirmed causes of this
  project unless the project context supports them.
- Keep the answer practical and concise.
""".strip()


def _general_prompt(
    question: str,
) -> str:
    return f"""
User question:
{question}

Answer as the NIRMAAN AI infrastructure assistant.

For infrastructure-management questions, use the connected knowledge base
when relevant. Do not invent project-specific information.
""".strip()


# ---------------------------------------------------------------------------
# Main orchestration
# ---------------------------------------------------------------------------

def answer_query(
    question: str,
    project_code: str | None = None,
) -> dict[str, Any]:
    """
    Main assistant entry point.

    Routing is deterministic and happens before any Gemini call.
    """
    query = str(question).strip()

    if not query:
        raise ValueError(
            "question is required."
        )

    resolved_project_code = (
        str(project_code).strip()
        if project_code
        else extract_project_code(query)
    )

    query_type = classify_query(
        query,
        resolved_project_code,
    )

    # ---------------------------------------------------------------
    # Project context is loaded only when needed.
    # ---------------------------------------------------------------

    context: dict[str, Any] | None = None

    if query_type in {
        FACT_QUERY,
        ML_QUERY,
        HYBRID_QUERY,
    }:
        if not resolved_project_code:
            return {
                "text": (
                    "Please provide the project code for a "
                    "project-specific answer."
                ),
                "query_type": query_type,
                "project_code": None,
                "citations": [],
                "model_used": False,
            }

        context = get_project_context(
            resolved_project_code
        )

    # ---------------------------------------------------------------
    # FACT QUERY
    # ---------------------------------------------------------------

    if query_type == FACT_QUERY:
        assert context is not None

        return _fact_response(
            context,
            query,
        )

    # ---------------------------------------------------------------
    # ML QUERY
    # ---------------------------------------------------------------

    if query_type == ML_QUERY:
        assert context is not None

        return _ml_response(
            context,
        )

    # ---------------------------------------------------------------
    # RAG QUERY
    # ---------------------------------------------------------------

    if query_type == RAG_QUERY:
        response = generate_grounded_response(
            query,
            system_instruction=(
                """
You are NIRMAAN AI's infrastructure knowledge assistant.

Use Gemini File Search as the primary source for general infrastructure
knowledge.

Do not invent project-specific facts or metrics.

Clearly distinguish recommendations, research findings, and documented
guidance from project-specific observations.

Keep the response practical and concise.
""".strip()
            ),
            tools=[
                _get_file_search_tool()
            ],
        )

        citations = _extract_citations(
            response.get("raw_response")
        )

        return {
            "text": response["text"],
            "query_type": RAG_QUERY,
            "project_code": None,
            "citations": citations,
            "model_used": True,
            "model": response["model"],
        }

    # ---------------------------------------------------------------
    # HYBRID QUERY
    # ---------------------------------------------------------------

    if query_type == HYBRID_QUERY:
        assert context is not None

        response = generate_grounded_response(
            _build_project_prompt(
                query,
                context,
            ),
            tools=[
                _get_file_search_tool()
            ],
        )

        citations = _extract_citations(
            response.get("raw_response")
        )

        return {
            "text": response["text"],
            "query_type": HYBRID_QUERY,
            "project_code": resolved_project_code,
            "citations": citations,
            "model_used": True,
            "model": response["model"],
        }

    # ---------------------------------------------------------------
    # GENERAL QUERY
    # ---------------------------------------------------------------

    response = generate_grounded_response(
        _general_prompt(query)
    )

    return {
        "text": response["text"],
        "query_type": GENERAL_QUERY,
        "project_code": None,
        "citations": [],
        "model_used": True,
        "model": response["model"],
    }