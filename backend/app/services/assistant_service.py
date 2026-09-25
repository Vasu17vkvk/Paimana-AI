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
    Local RAG retrieval:
        Local embedding model
        PostgreSQL + pgvector
        PostgreSQL keyword search
        Weighted Reciprocal Rank Fusion
        Quality filtering
        Document diversity

    Gemini is used only once to generate the final answer.

HYBRID_QUERY
    PostgreSQL project context
    +
    Existing ML outputs
    +
    Local RAG retrieval
    +
    One Gemini generation call.

GENERAL_QUERY
    Gemini only.
"""

from __future__ import annotations

import json
import re
from typing import Any

from sqlalchemy import text

from app.extensions import db

import pandas as pd

from app.services.assistant_context_service import (
    get_project_context,
)

from app.services.gemini_service import (
    generate_grounded_response,
)

from app.services.rag_service import (
    answer_from_knowledge_base,
    retrieve_knowledge,
)

from app.services.query_understanding_service import (
    understand_query,
)

from app.services.project_analytics_service import (
    model_scores_from_features_batch,
)


# ============================================================================
# QUERY CLASSES
# ============================================================================

FACT_QUERY = "FACT_QUERY"
ML_QUERY = "ML_QUERY"
RAG_QUERY = "RAG_QUERY"
HYBRID_QUERY = "HYBRID_QUERY"
ANALYTICS_QUERY = "ANALYTICS_QUERY"
GENERAL_QUERY = "GENERAL_QUERY"


# ============================================================================
# QUERY KEYWORDS
# ============================================================================

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
    "approved cost",
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
    "risk",
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
    "prediction",
    "predict",
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
    "root cause",
    "root causes",
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
    "why is my project",
    "why has my project",
    "what is causing this project",
    "what is causing the project",
    "what is causing my project",
    "what caused this project",
    "what caused the project",
    "what caused my project",
    "how can this project",
    "how can the project",
    "how can my project",
    "what should we do",
    "what should be done",
    "what are the causes for this project",
    "what are the causes of this project",
    "what are the causes of the project",
    "explain this project's risk",
    "explain the project's risk",
    "explain its risk",
    "explain this project",
    "recommend actions for this project",
    "recommend actions for the project",
    "recommend actions for my project",
    "how to mitigate",
    "how should we mitigate",
    "how do we mitigate",
    "how can we mitigate",
)

PROJECT_CODE_PATTERN = re.compile(r"\b\d{5,8}\b")


# ============================================================================
# RAG / HYBRID TOKEN OPTIMIZATION
# ============================================================================

# Final RAG chunks sent to Gemini.
RAG_TOP_K = 3

# Project context limits before sending to Gemini.
HYBRID_MAX_HISTORY_ITEMS = 3
HYBRID_MAX_PROGRESS_ITEMS = 3
HYBRID_MAX_INDICATOR_ITEMS = 5

# Prompt-level character budgets.
# Retrieval itself remains local and is NOT affected by these limits.
HYBRID_MAX_RAG_CHARS_PER_SOURCE = 1200
HYBRID_MAX_RAG_CONTEXT_CHARS = 3600
HYBRID_MAX_RECORD_CHARS = 450


# ============================================================================
# SYSTEM INSTRUCTIONS
# ============================================================================

RAG_SYSTEM_INSTRUCTION = """
You are NIRMAAN AI's infrastructure knowledge assistant.

Use the retrieved NIRMAAN knowledge passages for general infrastructure
knowledge.

Do not invent facts, statistics, standards, citations, or sources.
Do not turn general causes into confirmed causes of a specific project.
Keep answers concise, practical, and evidence-based.
Cite relevant retrieved passages as [Source N].
If evidence is insufficient, say so.
""".strip()


HYBRID_SYSTEM_INSTRUCTION = """
You are NIRMAAN AI's infrastructure project intelligence assistant.

Evidence categories:
OBSERVED = PostgreSQL project facts.
PREDICTED = existing NIRMAAN ML outputs.
GENERAL KNOWLEDGE = retrieved local RAG passages.

Rules:
1. Do not invent or recalculate project values.
2. Keep OBSERVED, PREDICTED, and GENERAL KNOWLEDGE separate.
3. Do not present an ML prediction as an observed fact.
4. Preserve ML values exactly, but preserve their original units:
   - overall_risk is a score, not a percentage.
   - future_delay_probability is a percentage.
   - progress_stall_probability is a percentage.
   - cost_risk is a percentage.
   - predicted_cost_overrun is a currency amount in Cr.
5. Do not present a general cause as a confirmed cause of this project.
6. Use RAG passages for general guidance and cite them as [Source N].
7. If the supplied evidence does not establish a cause, say so.
8. Keep the answer concise and practical. Prefer 250-350 words and finish all sections.
9. Do not repeat the same fact in multiple sections.
10. Give only the mitigation actions directly supported by the supplied evidence.

""".strip()


GENERAL_SYSTEM_INSTRUCTION = """
You are NIRMAAN AI, an infrastructure project intelligence assistant.

Answer accurately and concisely.
Do not invent project-specific facts, metrics, predictions, or citations.
Say when information is insufficient.
""".strip()


# ============================================================================
# UTILITY HELPERS
# ============================================================================

def _normalise_query(query: str) -> str:
    return " ".join(
        str(query).strip().lower().split()
    )


def _contains_any(
    query: str,
    keywords: tuple[str, ...],
) -> bool:
    return any(
        re.search(
            rf"(?<!\w){re.escape(keyword)}(?!\w)",
            query,
        )
        is not None
        for keyword in keywords
    )

def extract_project_code(
    query: str,
) -> str | None:
    match = PROJECT_CODE_PATTERN.search(
        str(query)
    )

    return match.group(0) if match else None

def extract_project_codes(
    query: str,
) -> list[str]:
    """
    Extract all project codes from a user query.

    Returns unique project codes in the order they appear.
    """
    matches = PROJECT_CODE_PATTERN.findall(
        str(query)
    )

    return list(
        dict.fromkeys(
            match.strip()
            for match in matches
        )
    )

def _is_analytics_intent(
    normalized: str,
) -> bool:
    """
    Detect portfolio-level questions that require PostgreSQL
    aggregation rather than project context or Gemini.
    """

    count_pattern = (
        r"\b(how many|how much|number of|count of|total number of|"
        r"total)\b.*\bprojects?\b"
    )

    dimension_pattern = (
        r"\b(all|which|list|show)\b.*\b"
        r"(states?|ministr(?:y|ies)|sectors?)\b"
    )

    portfolio_pattern = (
        r"\bprojects?\b.*\b"
        r"(by state|by ministry|by sector|in each state|"
        r"in each ministry|in each sector)\b"
    )

    delayed_project_pattern = re.search(
        r"\b(?:which|what|list|show)\b.*"
        r"\bprojects?\b.*"
        r"\bdelayed\b",
        normalized,
    )

    if delayed_project_pattern:
        return True

    return (
        re.search(
            count_pattern,
            normalized,
        )
        is not None
        or re.search(
            dimension_pattern,
            normalized,
        )
        is not None
        or re.search(
            portfolio_pattern,
            normalized,
        )
        is not None
    )

def classify_query(
    query: str,
    project_code: str | None = None,
) -> str:
    """
    Deterministically classify the query before Gemini is called.

    Priority:
        HYBRID
        ML
        FACT
        RAG
        GENERAL

    Important behavior:

    A project selected in the UI does not automatically make a general
    knowledge question a HYBRID query.

    Examples:

        Selected project: 400005
        "What are the common causes of infrastructure delays?"
            -> RAG_QUERY

        Selected project: 400005
        "Why is this project delayed?"
            -> HYBRID_QUERY

        Selected project: 400005
        "What is the risk score?"
            -> ML_QUERY

        Selected project: 400005
        "What is the physical progress?"
            -> FACT_QUERY
    """

    normalized = _normalise_query(
        query
    )

    is_analytics = _is_analytics_intent(
    normalized
)

    resolved_project_code = (
        str(project_code).strip()
        if project_code
        else extract_project_code(
            normalized
        )
    )

    has_project = bool(
        resolved_project_code
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

    # ------------------------------------------------------------------
    # Project-specific reasoning signals.
    # ------------------------------------------------------------------

    cause_words = (
        "why",
        "cause",
        "caused",
        "causing",
        "reason",
        "reasons",
        "root cause",
    )

    mitigation_words = (
        "mitigate",
        "mitigation",
        "recommend",
        "recommendation",
        "action",
        "actions",
        "improve",
        "improvement",
        "prevent",
        "prevention",
        "solve",
        "solution",
        "fix",
    )

        # ------------------------------------------------------------------
        # Determine whether the USER'S QUESTION explicitly refers to a
        # particular project.
        #
        # IMPORTANT:
        # A project selected in the UI is NOT enough.
        #
        # This prevents:
        #
        #   Project = 400005
        #   "What are the common causes of infrastructure delays?"
        #
        # from incorrectly becoming HYBRID_QUERY.
        # ------------------------------------------------------------------

        # ------------------------------------------------------------------
    # Determine whether the USER'S QUESTION refers to a project.
    #
    # This includes:
    #   1. An explicit project code in the question.
    #   2. Explicit project wording.
    #   3. Follow-up wording that clearly refers to the project selected
    #      in the UI, such as "tell me about it".
    # ------------------------------------------------------------------

    selected_project_reference = (
        bool(project_code)
        and _contains_any(
            normalized,
            (
                "it",
                "this one",
                "that project",
                "that one",
                "the selected project",
                "selected project",
                "this",
            ),
        )
    )

    explicit_project_reference = (
        extract_project_code(
            normalized
        ) is not None
        or _contains_any(
            normalized,
            (
                "this project",
                "the project",
                "my project",
                "this project's",
                "the project's",
                "my project's",
                "for this project",
                "for the project",
                "for my project",
                "its risk",
                "its delay",
                "its progress",
                "its cost",
                "its schedule",
                "it is delayed",
                "it is at risk",
                "why is it delayed",
                "why is it at risk",
                "why has it been delayed",
                "what is causing it",
                "what caused it",
                "how can it be mitigated",
                "tell me about it",
                "about it",
                "tell me more about it",
                "give me details about it",
                "give me information about it",
            ),
        )
        or selected_project_reference
    )

    project_reasoning = (
        has_project
        and explicit_project_reference
        and (
            _contains_any(
                normalized,
                cause_words,
            )
            or _contains_any(
                normalized,
                mitigation_words,
            )
        )
    )

    # ------------------------------------------------------------------
    # HYBRID
    #
    # Requires an actual project reference in the question when a project
    # code is supplied separately by the UI.
    # ------------------------------------------------------------------

    if (
        has_project
        and explicit_project_reference
        and (
            is_hybrid
            or project_reasoning
        )
    ):
        return HYBRID_QUERY

    # ------------------------------------------------------------------
    # ANALYTICS
    #
    # Portfolio-level questions are answered from PostgreSQL.
    # A selected project does not turn a portfolio question into
    # a project-specific question.
    # ------------------------------------------------------------------

    if is_analytics:
        return ANALYTICS_QUERY    

    # ------------------------------------------------------------------
    # ML
    # ------------------------------------------------------------------

    if (
        has_project
        and is_ml
        and not is_rag
    ):
        return ML_QUERY

    # ------------------------------------------------------------------
    # FACT
    # ------------------------------------------------------------------

    if (
        has_project
        and is_fact
        and not is_ml
        and not is_rag
    ):
        return FACT_QUERY

    # ------------------------------------------------------------------
    # HYBRID wording without a selected project.
    #
    # The main orchestration will ask for project code.
    # ------------------------------------------------------------------

    if (
        is_hybrid
        and not has_project
    ):
        return HYBRID_QUERY

    # ------------------------------------------------------------------
    # RAG
    # ------------------------------------------------------------------

    if is_rag:
        return RAG_QUERY

    # ------------------------------------------------------------------
    # ML fallback
    # ------------------------------------------------------------------

    if has_project and is_ml:
        return ML_QUERY

    # ------------------------------------------------------------------
    # FACT fallback
    # ------------------------------------------------------------------

    # ------------------------------------------------------------------
    # FACT fallback
    # ------------------------------------------------------------------

    if has_project and is_fact:
        return FACT_QUERY

    # ------------------------------------------------------------------
    # SAFETY FALLBACK FOR EXPLICIT PROJECT QUESTIONS
    #
    # If the user explicitly refers to a project and a verified project
    # code is available, never send the question to unrestricted Gemini.
    #
    # Examples:
    #
    #   "tell me about project 400005"
    #   "tell me about this project"
    #   "400005?"
    #
    # These are handled from PostgreSQL project context.
    # ------------------------------------------------------------------

    if (
        has_project
        and explicit_project_reference
    ):
        # A bare project code should still open the project facts.
        # Other ambiguous project questions should go through Gemini
        # query understanding before choosing FACT / ML / HYBRID.
        if normalized.strip() == str(resolved_project_code).strip():
            return FACT_QUERY

        return GENERAL_QUERY

    # ------------------------------------------------------------------
    # PROJECT-SPECIFIC FACT QUESTION WITHOUT PROJECT CODE
    #
    # Do not send ambiguous project questions to Gemini.
    # The orchestration will ask for the project code deterministically.
    # ------------------------------------------------------------------

    if is_fact and not has_project:
        return FACT_QUERY    

    # ------------------------------------------------------------------
    # GENERAL
    # ------------------------------------------------------------------

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

    except (
        TypeError,
        ValueError,
    ):
        return str(value)

    return f"{number:,.{decimals}f}"


def _format_probability(
    value: Any,
) -> str:
    if value is None:
        return "unavailable"

    try:
        number = float(value)

    except (
        TypeError,
        ValueError,
    ):
        return str(value)

    return f"{number:.1f}%"


def _json_compact(
    value: Any,
) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        separators=(
            ",",
            ":",
        ),
        default=str,
    )


def _trim_text(
    value: Any,
    max_chars: int,
) -> str:
    text = str(
        value or ""
    ).strip()

    if len(text) <= max_chars:
        return text

    return text[:max_chars].rstrip() + "…"


def _compact_list_items(
    items: Any,
    limit: int,
    max_chars: int = HYBRID_MAX_RECORD_CHARS,
) -> list[str]:
    """
    Convert history/progress/indicator records into short strings.

    This reduces prompt size while preserving the useful record information.
    """

    if not isinstance(
        items,
        list,
    ):
        return []

    compact: list[str] = []

    for item in items[-limit:]:

        if isinstance(
            item,
            dict,
        ):

            cleaned = {
                str(key): value
                for key, value in item.items()
                if value not in (
                    None,
                    "",
                    [],
                    {},
                )
            }

            value = _json_compact(
                cleaned
            )

        else:
            value = str(item)

        value = _trim_text(
            value,
            max_chars,
        )

        if value:
            compact.append(
                value
            )

    return compact


def _compact_project_for_prompt(
    project: dict[str, Any],
) -> dict[str, Any]:
    """
    Keep only project fields useful for reasoning.
    """

    keys = (
        "project_code",
        "project_name",
        "ministry",
        "sector",
        "state",
        "implementing_agency",
        "original_completion",
        "revised_completion",
        "schedule_status",
        "cost_status",
        "original_cost_cr",
        "expenditure_cr",
        "physical_progress_pct",
        "delay_days",
    )

    return {
        key: project[key]
        for key in keys
        if (
            key in project
            and project[key] not in (
                None,
                "",
                [],
                {},
            )
        )
    }


def _compact_predictions_for_prompt(
    predictions: dict[str, Any],
) -> dict[str, Any]:
    """
    Keep only prediction fields useful for the hybrid answer.
    """

    keys = (
        "overall_risk",
        "risk_level",
        "future_delay_probability",
        "progress_stall_probability",
        "predicted_cost_overrun",
        "cost_risk",
    )

    return {
        key: predictions[key]
        for key in keys
        if (
            key in predictions
            and predictions[key] not in (
                None,
                "",
                [],
                {},
            )
        )
    }

def _multi_project_response(
    question: str,
    project_codes: list[str],
) -> dict[str, Any]:
    """
    Build a deterministic response for questions involving
    multiple explicitly referenced projects.

    PostgreSQL remains the source of truth.
    Gemini is not required for these fact/comparison requests.
    """

    contexts: list[dict[str, Any]] = []

    for code in project_codes:
        context = get_project_context(
            code
        )

        if context:
            contexts.append(
                context
            )

    if not contexts:
        return {
            "text": (
                "I could not find the requested projects "
                "in the NIRMAAN project database."
            ),
            "query_type": FACT_QUERY,
            "project_code": ", ".join(
                project_codes
            ),
            "citations": [],
            "retrieved_chunks": [],
            "model_used": False,
            "source": "postgresql",
        }

    normalized = _normalise_query(
        question
    )

    compare_requested = bool(
        re.search(
            r"\b(?:compare|comparison|versus|vs)\b",
            normalized,
        )
    )

    lines: list[str] = []

    if compare_requested:
        lines.append(
            "Project comparison"
        )
    else:
        lines.append(
            "Project overviews"
        )

    lines.append("")

    for index, context in enumerate(
        contexts
    ):
        project = (
            context.get("project")
            or {}
        )

        predictions = (
            context.get("predictions")
            or {}
        )

        if index > 0:
            lines.append("")
            lines.append(
                "----------------------------------------"
            )
            lines.append("")

        code = project.get(
            "project_code"
        )

        lines.append(
            f"Project {code}"
        )

        lines.append(
            f"Name: "
            f"{project.get('project_name') or 'unavailable'}"
        )

        lines.append(
            f"Ministry: "
            f"{project.get('ministry') or 'unavailable'}"
        )

        lines.append(
            f"Sector: "
            f"{project.get('sector') or 'unavailable'}"
        )

        lines.append(
            f"State: "
            f"{project.get('state') or 'unavailable'}"
        )

        lines.append(
            f"Implementing agency: "
            f"{project.get('implementing_agency') or 'unavailable'}"
        )

        lines.append(
            f"Schedule status: "
            f"{project.get('schedule_status') or 'unavailable'}"
        )

        lines.append(
            f"Cost status: "
            f"{project.get('cost_status') or 'unavailable'}"
        )

        lines.append(
            f"Original completion: "
            f"{project.get('original_completion') or 'unavailable'}"
        )

        lines.append(
            f"Revised completion: "
            f"{project.get('revised_completion') or 'unavailable'}"
        )

        delay_days = project.get(
            "delay_days"
        )

        lines.append(
            "Recorded delay: "
            + (
                f"{_format_number(delay_days, 0)} days"
                if delay_days is not None
                else "unavailable"
            )
        )

        physical_progress = project.get(
            "physical_progress_pct"
        )

        lines.append(
            "Physical progress: "
            + (
                f"{_format_number(physical_progress, 1)}%"
                if physical_progress is not None
                else "unavailable"
            )
        )

        original_cost = project.get(
            "original_cost_cr"
        )

        lines.append(
            "Original cost: "
            + (
                f"₹{_format_number(original_cost)} Cr"
                if original_cost is not None
                else "unavailable"
            )
        )

        expenditure = project.get(
            "expenditure_cr"
        )

        lines.append(
            "Expenditure: "
            + (
                f"₹{_format_number(expenditure)} Cr"
                if expenditure is not None
                else "unavailable"
            )
        )

        overall_risk = predictions.get(
            "overall_risk"
        )

        risk_level = predictions.get(
            "risk_level"
        )

        if (
            overall_risk is not None
            or risk_level
        ):
            lines.append(
                "Overall risk: "
                + (
                    _format_number(
                        overall_risk,
                        2,
                    )
                    if overall_risk is not None
                    else "unavailable"
                )
                + (
                    f" ({risk_level})"
                    if risk_level
                    else ""
                )
            )

        future_delay = predictions.get(
            "future_delay_probability"
        )

        if future_delay is not None:
            lines.append(
                "Future delay probability: "
                f"{_format_probability(future_delay)}"
            )

        stall_probability = predictions.get(
            "progress_stall_probability"
        )

        if stall_probability is not None:
            lines.append(
                "Progress stall probability: "
                f"{_format_probability(stall_probability)}"
            )

        cost_risk = predictions.get(
            "cost_risk"
        )

        if cost_risk is not None:
            lines.append(
                "Cost risk: "
                f"{_format_number(cost_risk, 1)}%"
            )

    return {
        "text": "\n".join(
            lines
        ),
        "query_type": FACT_QUERY,
        "project_code": ", ".join(
            project_codes
        ),
        "citations": [],
        "retrieved_chunks": [],
        "model_used": False,
        "source": "postgresql",
    }

def _multi_project_ml_response(
    question: str,
    project_codes: list[str],
) -> dict[str, Any]:
    """
    Return ML/prediction information for multiple projects.

    PostgreSQL + existing NIRMAAN ML engine remain the source of truth.
    """

    lines = [
        "Project risk comparison",
        "",
    ]

    found_any = False

    for index, code in enumerate(project_codes):
        context = get_project_context(
            code
        )

        if not context:
            continue

        found_any = True

        project = (
            context.get("project")
            or {}
        )

        predictions = (
            context.get("predictions")
            or {}
        )

        if index > 0 and found_any:
            lines.append(
                "----------------------------------------"
            )
            lines.append("")

        lines.append(
            f"Project {project.get('project_code', code)}"
        )

        lines.append(
            f"Name: "
            f"{project.get('project_name') or 'unavailable'}"
        )

        lines.append(
            "Overall risk score: "
            + (
                _format_number(
                    predictions.get(
                        "overall_risk"
                    ),
                    2,
                )
                if predictions.get(
                    "overall_risk"
                ) is not None
                else "unavailable"
            )
        )

        lines.append(
            "Risk level: "
            f"{predictions.get('risk_level') or 'unavailable'}"
        )

        lines.append(
            "Future delay probability: "
            + (
                _format_probability(
                    predictions.get(
                        "future_delay_probability"
                    )
                )
                if predictions.get(
                    "future_delay_probability"
                ) is not None
                else "unavailable"
            )
        )

        lines.append(
            "Progress stall probability: "
            + (
                _format_probability(
                    predictions.get(
                        "progress_stall_probability"
                    )
                )
                if predictions.get(
                    "progress_stall_probability"
                ) is not None
                else "unavailable"
            )
        )

        lines.append(
            "Cost risk: "
            + (
                f"{_format_number(predictions.get('cost_risk'), 1)}%"
                if predictions.get(
                    "cost_risk"
                ) is not None
                else "unavailable"
            )
        )

    if not found_any:
        return {
            "text": (
                "I could not find the requested projects "
                "in the NIRMAAN project database."
            ),
            "query_type": ML_QUERY,
            "project_code": ", ".join(
                project_codes
            ),
            "citations": [],
            "retrieved_chunks": [],
            "model_used": False,
            "source": "postgresql",
        }

    return {
        "text": "\n".join(lines),
        "query_type": ML_QUERY,
        "project_code": ", ".join(
            project_codes
        ),
        "citations": [],
        "retrieved_chunks": [],
        "model_used": False,
        "source": "postgresql",
    }


def _multi_project_hybrid_response(
    question: str,
    project_codes: list[str],
    query_embedding: list[float] | None = None,
) -> dict[str, Any]:
    """
    Answer a multi-project reasoning question using:

        PostgreSQL project context
        +
        ML predictions
        +
        local RAG
        +
        one final Gemini call
    """

    project_contexts: list[dict[str, Any]] = []

    for code in project_codes:
        context = get_project_context(
            code
        )

        if context:
            project_contexts.append(
                context
            )

    if not project_contexts:
        return {
            "text": (
                "I could not find the requested projects "
                "in the NIRMAAN project database."
            ),
            "query_type": HYBRID_QUERY,
            "project_code": ", ".join(
                project_codes
            ),
            "citations": [],
            "retrieved_chunks": [],
            "model_used": False,
            "source": "postgresql",
        }

    # ---------------------------------------------------------------
    # Local RAG retrieval.
    # ---------------------------------------------------------------

    rag_chunks = retrieve_knowledge(
        question,
        top_k=RAG_TOP_K,
        query_embedding=query_embedding,
    )

    # ---------------------------------------------------------------
    # Build compact multi-project context.
    # ---------------------------------------------------------------

    project_sections: list[str] = []

    for context in project_contexts:
        compact = _compact_project_context(
            context
        )

        project_sections.append(
            _json_compact(
                {
                    "project": compact["project"],
                    "predicted": compact["predicted"],
                    "indicators": compact["indicators"],
                    "history": compact["history"],
                    "progress": compact["progress"],
                }
            )
        )

    serialized_projects = "\n\n".join(
        project_sections
    )

    rag_parts: list[str] = []

    for index, chunk in enumerate(
        rag_chunks,
        start=1,
    ):
        content = str(
            chunk.get(
                "chunk_text"
            )
            or ""
        ).strip()

        if not content:
            continue

        rag_parts.append(
            f"[Source {index}]\n{content}"
        )

    rag_text = (
        "\n\n".join(
            rag_parts
        )
        if rag_parts
        else
        "No RAG passages were retrieved."
    )

    prompt = f"""
USER QUESTION:

{question}


==================================================
OBSERVED PROJECTS
==================================================

{serialized_projects}


==================================================
GENERAL KNOWLEDGE
==================================================

{rag_text}


==================================================
ANSWERING RULES
==================================================

1. Use the supplied PostgreSQL project context for observed facts.

2. Use the supplied ML values exactly as provided.

3. Use retrieved RAG passages only for general knowledge,
   explanations, and mitigation guidance.

4. Do not invent project-specific causes.

5. Do not treat a general cause as a confirmed cause of either
   project unless the supplied project evidence supports it.

6. Clearly distinguish observed facts, predicted values,
   and general knowledge.

7. When using RAG knowledge, cite it as [Source N].

8. Answer the user's comparison/reasoning question directly.

9. Keep the answer concise and practical.
""".strip()

    response = generate_grounded_response(
        prompt,
        system_instruction=(
            HYBRID_SYSTEM_INSTRUCTION
        ),
    )

    return {
        "text": response.get(
            "text",
            "",
        ),
        "query_type": HYBRID_QUERY,
        "project_code": ", ".join(
            project_codes
        ),
        "citations": _build_rag_citations(
            rag_chunks
        ),
        "retrieved_chunks": [
            {
                "id": chunk.get("id"),
                "document_name": chunk.get(
                    "document_name"
                ),
                "document_type": chunk.get(
                    "document_type"
                ),
                "source": chunk.get(
                    "source"
                ),
                "page_number": chunk.get(
                    "page_number"
                ),
                "section_title": chunk.get(
                    "section_title"
                ),
                "topic": chunk.get(
                    "topic"
                ),
                "country": chunk.get(
                    "country"
                ),
                "document_year": chunk.get(
                    "document_year"
                ),
                "vector_score": chunk.get(
                    "vector_score"
                ),
                "keyword_score": chunk.get(
                    "keyword_score"
                ),
                "rrf_score": chunk.get(
                    "rrf_score"
                ),
                "vector_rank": chunk.get(
                    "vector_rank"
                ),
                "keyword_rank": chunk.get(
                    "keyword_rank"
                ),
            }
            for chunk in rag_chunks
        ],
        "model_used": bool(
            response.get(
                "model"
            )
        ),
        "model": response.get(
            "model"
        ),
        "usage": response.get(
            "usage",
            {},
        ),
        "source": "postgresql_pgvector",
    }    

# ============================================================================
# DETERMINISTIC FACT RESPONSE
# ============================================================================

def _fact_response(
    context: dict[str, Any],
    question: str,
) -> dict[str, Any]:

    project = context.get(
        "project"
    ) or {}

    normalized = _normalise_query(
        question
    )

    ministry_requested = bool(
        re.search(
            r"\b(?:ministry|minstry|mantralaya)\b",
            normalized,
        )
    )

    fields: list[
        tuple[str, Any]
    ] = []

    if "name" in normalized:
        fields.append(
            (
                "Project name",
                _get_value(
                    project,
                    "project_name",
                ),
            )
        )

    if ministry_requested:
        fields.append(
            (
                "Ministry",
                _get_value(
                    project,
                    "ministry",
                ),
            )
        )

    if "sector" in normalized:
        fields.append(
            (
                "Sector",
                _get_value(
                    project,
                    "sector",
                ),
            )
        )

    if "state" in normalized:
        fields.append(
            (
                "State",
                _get_value(
                    project,
                    "state",
                ),
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
        value = (
            (
                f"₹{_format_number(project.get('original_cost_cr'))} Cr"
            )
            if project.get(
                "original_cost_cr"
            ) is not None
            else "unavailable"
        )

        fields.append(
            (
                "Original cost",
                value,
            )
        )

    if (
        "expenditure" in normalized
        or "spent" in normalized
        or "spending" in normalized
    ):
        value = (
            (
                f"₹{_format_number(project.get('expenditure_cr'))} Cr"
            )
            if project.get(
                "expenditure_cr"
            ) is not None
            else "unavailable"
        )

        fields.append(
            (
                "Expenditure",
                value,
            )
        )

    if (
        "progress" in normalized
        or "physical progress" in normalized
    ):
        value = (
            (
                f"{_format_number(project.get('physical_progress_pct'), 1)}%"
            )
            if project.get(
                "physical_progress_pct"
            ) is not None
            else "unavailable"
        )

        fields.append(
            (
                "Physical progress",
                value,
            )
        )

    if (
        "delay days" in normalized
        or "how late" in normalized
        or "delay" in normalized
    ):
        value = (
            (
                f"{_format_number(project.get('delay_days'), 0)} days"
            )
            if project.get(
                "delay_days"
            ) is not None
            else "unavailable"
        )

        fields.append(
            (
                "Recorded delay",
                value,
            )
        )

    if not fields:
            fields = [
                (
                    "Project name",
                    project.get(
                        "project_name"
                    ),
                ),
                (
                    "Ministry",
                    project.get(
                        "ministry"
                    ),
                ),
                (
                    "Sector",
                    project.get(
                        "sector"
                    ),
                ),
                (
                    "State",
                    project.get(
                        "state"
                    ),
                ),
                (
                    "Implementing agency",
                    project.get(
                        "implementing_agency"
                    ),
                ),
                (
                    "Original completion",
                    project.get(
                        "original_completion"
                    ),
                ),
                (
                    "Revised completion",
                    project.get(
                        "revised_completion"
                    ),
                ),
                (
                    "Schedule status",
                    project.get(
                        "schedule_status"
                    ),
                ),
                (
                    "Cost status",
                    project.get(
                        "cost_status"
                    ),
                ),
                (
                    "Original cost",
                    (
                        f"₹{_format_number(project.get('original_cost_cr'))} Cr"
                        if project.get("original_cost_cr") is not None
                        else "unavailable"
                    ),
                ),
                (
                    "Expenditure",
                    (
                        f"₹{_format_number(project.get('expenditure_cr'))} Cr"
                        if project.get("expenditure_cr") is not None
                        else "unavailable"
                    ),
                ),
                (
                    "Physical progress",
                    (
                        f"{_format_number(project.get('physical_progress_pct'), 1)}%"
                        if project.get("physical_progress_pct") is not None
                        else "unavailable"
                    ),
                ),
                (
                    "Recorded delay",
                    (
                        f"{_format_number(project.get('delay_days'), 0)} days"
                        if project.get("delay_days") is not None
                        else "unavailable"
                    ),
                ),
            ]

    # ---------------------------------------------------------------
    # SINGLE-FIELD RESPONSE
    # ---------------------------------------------------------------

    if len(fields) == 1:
        label, value = fields[0]

        display_value = (
            "unavailable"
            if value is None
            else str(value)
        )

        if label == "Ministry":
            response_text = (
                f"Project "
                f"{project.get('project_code', 'unknown')} "
                f"is under {display_value}."
            )

        elif label == "Sector":
            response_text = (
                f"Project "
                f"{project.get('project_code', 'unknown')} "
                f"is in the {display_value} sector."
            )

        elif label == "State":
            response_text = (
                f"Project "
                f"{project.get('project_code', 'unknown')} "
                f"is in {display_value}."
            )

        else:
            response_text = (
                f"Project "
                f"{project.get('project_code', 'unknown')} — "
                f"{label}: {display_value}"
            )

        return {
            "text": response_text,
            "query_type": FACT_QUERY,
            "project_code": project.get(
                "project_code"
            ),
            "citations": [],
            "model_used": False,
            "source": "postgresql",
        }        

    lines = [
        (
            f"Project: "
            f"{project.get('project_code', 'unknown')}"
        )
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
        "source": "postgresql",
    }


# ============================================================================
# DETERMINISTIC ML RESPONSE
# ============================================================================

def _ml_response(
    context: dict[str, Any],
) -> dict[str, Any]:

    project = context.get(
        "project"
    ) or {}

    predictions = context.get(
        "predictions"
    ) or {}

    lines = [
        (
            f"Project: "
            f"{project.get('project_code', 'unknown')}"
        ),
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
                (
                    f"₹{_format_number(predictions.get('predicted_cost_overrun'))} Cr"
                )
                if predictions.get(
                    "predicted_cost_overrun"
                ) is not None
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
        "source": "ml_engine",
    }


# ============================================================================
# COMPACT PROJECT CONTEXT
# ============================================================================

def _compact_project_context(
    context: dict[str, Any],
) -> dict[str, Any]:
    """
    Select only high-value fields and a small number of records
    for the hybrid Gemini prompt.

    PostgreSQL remains the source of truth.
    """

    project = context.get(
        "project"
    ) or {}

    predictions = context.get(
        "predictions"
    ) or {}

    return {
        "project": _compact_project_for_prompt(
            project
        ),
        "predicted": _compact_predictions_for_prompt(
            predictions
        ),
        "indicators": _compact_list_items(
            context.get(
                "observed_indicators",
                [],
            ),
            HYBRID_MAX_INDICATOR_ITEMS,
        ),
        "history": _compact_list_items(
            context.get(
                "recent_history",
                [],
            ),
            HYBRID_MAX_HISTORY_ITEMS,
        ),
        "progress": _compact_list_items(
            context.get(
                "recent_progress",
                [],
            ),
            HYBRID_MAX_PROGRESS_ITEMS,
        ),
    }


# ============================================================================
# RAG CITATIONS
# ============================================================================

def _build_rag_citations(
    chunks: list[dict[str, Any]],
) -> list[dict[str, Any]]:

    citations: list[
        dict[str, Any]
    ] = []

    for index, chunk in enumerate(
        chunks,
        start=1,
    ):

        citations.append(
            {
                "type": "rag_source",
                "source_number": index,
                "document_name": chunk.get(
                    "document_name"
                ),
                "document_type": chunk.get(
                    "document_type"
                ),
                "source": chunk.get(
                    "source"
                ),
                "page_number": chunk.get(
                    "page_number"
                ),
                "section_title": chunk.get(
                    "section_title"
                ),
                "topic": chunk.get(
                    "topic"
                ),
                "country": chunk.get(
                    "country"
                ),
                "document_year": chunk.get(
                    "document_year"
                ),
                "chunk_index": chunk.get(
                    "chunk_index"
                ),
            }
        )

    return citations


# ============================================================================
# COMPACT HYBRID PROMPT
# ============================================================================

def _build_project_prompt(
    question: str,
    context: dict[str, Any],
    rag_chunks: list[dict[str, Any]],
) -> str:
    """
    Build a compact hybrid prompt.

    Gemini receives:
        - selected PostgreSQL project facts
        - selected ML outputs
        - limited project records
        - three local RAG passages

    Gemini performs no retrieval.
    """

    compact = _compact_project_context(
        context
    )

    project_text = _json_compact(
        compact["project"]
    )

    predicted_text = _json_compact(
        compact["predicted"]
    )

    indicator_text = "\n".join(
        f"- {item}"
        for item in compact[
            "indicators"
        ]
    ) or "- none supplied"

    history_text = "\n".join(
        f"- {item}"
        for item in compact[
            "history"
        ]
    ) or "- none supplied"

    progress_text = "\n".join(
        f"- {item}"
        for item in compact[
            "progress"
        ]
    ) or "- none supplied"

    # ------------------------------------------------------------------
    # RAG context
    # ------------------------------------------------------------------

    rag_parts: list[str] = []

    remaining = (
        HYBRID_MAX_RAG_CONTEXT_CHARS
    )

    for index, chunk in enumerate(
        rag_chunks,
        start=1,
    ):

        content = _trim_text(
            chunk.get(
                "chunk_text"
            ),
            min(
                HYBRID_MAX_RAG_CHARS_PER_SOURCE,
                remaining,
            ),
        )

        if not content:
            continue

        document = str(
            chunk.get(
                "document_name"
            )
            or "Unknown document"
        )

        page = chunk.get(
            "page_number"
        )

        label = (
            f"[Source {index}] "
            f"{document}"
        )

        if page is not None:
            label += f", p.{page}"

        part = (
            f"{label}\n"
            f"{content}"
        )

        if len(part) > remaining:
            part = (
                part[:remaining]
                .rstrip()
                + "…"
            )

        rag_parts.append(
            part
        )

        remaining -= (
            len(part)
            + 2
        )

        if remaining <= 0:
            break

    rag_text = (
        "\n\n".join(rag_parts)
        if rag_parts
        else "No RAG passages were retrieved."
    )

    # ------------------------------------------------------------------
    # Compact prompt
    # ------------------------------------------------------------------

    return (
        "QUESTION\n"
        f"{question}\n\n"

        "OBSERVED PROJECT\n"
        f"{project_text}\n\n"

        "PREDICTED\n"
        f"{predicted_text}\n\n"

        "OBSERVED INDICATORS\n"
        f"{indicator_text}\n\n"

        "RECENT HISTORY\n"
        f"{history_text}\n\n"

        "RECENT PROGRESS\n"
        f"{progress_text}\n\n"

        "GENERAL KNOWLEDGE\n"
        f"{rag_text}\n\n"

        "ANSWER\n"
        "Separate observed facts, ML predictions, and general RAG guidance. "
        "Do not claim an unproven project-specific cause. "
        "Use [Source N] for relevant RAG evidence. "
        "Keep the answer concise and practical."
    )


# ============================================================================
# GENERAL PROMPT
# ============================================================================

def _general_prompt(
    question: str,
) -> str:

    return (
        "QUESTION\n"
        f"{question}\n\n"
        "Answer as NIRMAAN AI. "
        "Be concise, accurate, professional, and practical."
    )

# ============================================================================
# PORTFOLIO STATE NORMALIZATION
# ============================================================================

INDIA_STATES_AND_UTS = [
    "Andaman & Nicobar",
    "Andhra Pradesh",
    "Arunachal Pradesh",
    "Assam",
    "Bihar",
    "Chandigarh",
    "Chhattisgarh",
    "Dadra & Nagar Haveli and Daman & Diu",
    "Delhi",
    "Goa",
    "Gujarat",
    "Haryana",
    "Himachal Pradesh",
    "Jammu and Kashmir",
    "Jharkhand",
    "Karnataka",
    "Kerala",
    "Ladakh",
    "Madhya Pradesh",
    "Maharashtra",
    "Manipur",
    "Meghalaya",
    "Mizoram",
    "Nagaland",
    "Odisha",
    "Puducherry",
    "Punjab",
    "Rajasthan",
    "Sikkim",
    "Tamil Nadu",
    "Telangana",
    "Tripura",
    "Uttar Pradesh",
    "Uttarakhand",
    "West Bengal",
]

def _extract_project_states(
    raw_value: Any,
) -> list[str]:
    """
    Convert the project's raw flash_state value into canonical
    Indian state/UT names.
    """

    if raw_value is None:
        return []

    raw = str(raw_value).strip()

    if not raw:
        return []

    normalized_raw = raw.lower()

    # These are geographic categories, not individual states/UTs.
    if normalized_raw in {
        "pan india",
        "offshore",
    }:
        return []

    found: list[str] = []

    # Match longer names first so compound names are handled correctly.
    canonical_states = sorted(
        INDIA_STATES_AND_UTS,
        key=len,
        reverse=True,
    )

    for state_name in canonical_states:
        if state_name.lower() in normalized_raw:
            found.append(
                state_name
            )

    # Handle truncated source values.
    if normalized_raw.strip(" (),") == "uttar":
        found.append(
            "Uttar Pradesh"
        )

    if normalized_raw.strip(" (),") == "west":
        found.append(
            "West Bengal"
        )

    if normalized_raw.strip(" (),") == "jammu and":
        found.append(
            "Jammu and Kashmir"
        )

    return list(
        dict.fromkeys(found)
    )

def _iter_latest_ml_scores(
    batch_size: int = 256,
):
    """
    Stream the latest ML snapshot for every project and score
    only one small batch at a time.

    This replaces the old:

        load_ml_ready()
        -> entire paimana_ml_ready table
        -> sort
        -> deduplicate
        -> score everything

    with:

        PostgreSQL latest-row selection
        -> 256 rows
        -> ML scoring
        -> next 256 rows
    """

    query = text(
        """
        SELECT
            ml.*,

            pm.project_name AS master_project_name,
            pm.sector AS master_sector,
            pm.ministry AS master_ministry

        FROM (
            SELECT DISTINCT ON (
                CAST(project_code AS TEXT)
            ) *

            FROM "paimana_ml_ready"

            WHERE project_code IS NOT NULL

            ORDER BY
                CAST(project_code AS TEXT),
                snapshot_year DESC,
                snapshot_month_num DESC
        ) ml

        LEFT JOIN "project_master" pm
            ON CAST(
                pm.project_code AS TEXT
            )
            =
            CAST(
                ml.project_code AS TEXT
            )

        ORDER BY
            CAST(
                ml.project_code AS TEXT
            )
        """
    )

    with db.engine.connect() as connection:

        chunks = pd.read_sql(
            query,
            connection,
            chunksize=batch_size,
        )

        for chunk in chunks:

            if chunk.empty:
                continue

            chunk = chunk.loc[
                :,
                ~chunk.columns.duplicated(),
            ].copy()

            chunk["project_code"] = (
                chunk["project_code"]
                .astype(str)
                .str.strip()
            )

            scores = (
                model_scores_from_features_batch(
                    chunk,
                    batch_size=batch_size,
                )
            )

            if scores.empty:
                continue

            scores = scores.loc[
                :,
                ~scores.columns.duplicated(),
            ].copy()

            scores["project_code"] = (
                scores["project_code"]
                .astype(str)
                .str.strip()
            )

            # --------------------------------------------------------
            # Attach only the descriptive fields required by the
            # analytics responses.
            # --------------------------------------------------------

            descriptive = chunk[
                [
                    column
                    for column in [
                        "project_code",
                        "project_name",
                        "sector",
                        "ministry",
                    ]
                    if column in chunk.columns
                ]
            ].copy()

            descriptive = descriptive.drop_duplicates(
                "project_code",
                keep="last",
            )

            scores = scores.merge(
                descriptive,
                on="project_code",
                how="left",
                suffixes=(
                    "",
                    "_source",
                ),
            )

            # Prefer project_master values.
            if "project_name_source" in scores.columns:
                if "project_name" not in scores.columns:
                    scores["project_name"] = (
                        scores["project_name_source"]
                    )
                else:
                    scores["project_name"] = (
                        scores["project_name"]
                        .fillna(
                            scores[
                                "project_name_source"
                            ]
                        )
                    )

                scores.drop(
                    columns=[
                        "project_name_source"
                    ],
                    inplace=True,
                )

            if "sector_source" in scores.columns:
                if "sector" not in scores.columns:
                    scores["sector"] = (
                        scores["sector_source"]
                    )
                else:
                    scores["sector"] = (
                        scores["sector"]
                        .fillna(
                            scores[
                                "sector_source"
                            ]
                        )
                    )

                scores.drop(
                    columns=[
                        "sector_source"
                    ],
                    inplace=True,
                )

            if "ministry_source" in scores.columns:
                if "ministry" not in scores.columns:
                    scores["ministry"] = (
                        scores["ministry_source"]
                    )
                else:
                    scores["ministry"] = (
                        scores["ministry"]
                        .fillna(
                            scores[
                                "ministry_source"
                            ]
                        )
                    )

                scores.drop(
                    columns=[
                        "ministry_source"
                    ],
                    inplace=True,
                )

            yield scores

def _analytics_response(
    question: str,
) -> dict[str, Any]:
    """
    Answer portfolio-level analytics questions directly from PostgreSQL.

    This path never calls Gemini.
    """

    normalized = _normalise_query(
        question
    )

        # ---------------------------------------------------------------
    # HIGHEST-RISK SECTOR
    # ---------------------------------------------------------------

        # ---------------------------------------------------------------
    # HIGHEST-RISK SECTOR
    # ---------------------------------------------------------------

    highest_risk_sector_requested = (
        re.search(
            r"\b(?:which|what)\b.*"
            r"\bsectors?\b.*"
            r"\b(?:highest|most|greatest)\b.*"
            r"\brisk\b",
            normalized,
        )
        is not None
        or re.search(
            r"\b(?:highest|most|greatest)\s+risk\b.*"
            r"\bsectors?\b",
            normalized,
        )
        is not None
    )

    if highest_risk_sector_requested:

        sector_totals: dict[str, dict[str, float]] = {}

        for scores in _iter_latest_ml_scores():

            if (
                "sector" not in scores.columns
                or
                "overall_risk_score"
                not in scores.columns
            ):
                continue

            work = scores[
                [
                    "sector",
                    "overall_risk_score",
                ]
            ].copy()

            work["sector"] = (
                work["sector"]
                .fillna("")
                .astype(str)
                .str.strip()
            )

            work["overall_risk_score"] = pd.to_numeric(
                work[
                    "overall_risk_score"
                ],
                errors="coerce",
            )

            work = work[
                work["sector"].ne("")
                &
                work[
                    "overall_risk_score"
                ].notna()
            ]

            for _, row in work.iterrows():

                sector_name = str(
                    row["sector"]
                )

                score = float(
                    row[
                        "overall_risk_score"
                    ]
                )

                bucket = sector_totals.setdefault(
                    sector_name,
                    {
                        "sum": 0.0,
                        "count": 0.0,
                    },
                )

                bucket["sum"] += score
                bucket["count"] += 1

        if not sector_totals:

            return {
                "text": (
                    "No sector risk data is available."
                ),
                "query_type": ANALYTICS_QUERY,
                "project_code": None,
                "citations": [],
                "retrieved_chunks": [],
                "model_used": False,
                "source": "postgresql",
            }

        sector_rows = [
            {
                "sector": sector,
                "average_risk_score":
                    values["sum"]
                    /
                    values["count"],
                "project_count":
                    int(values["count"]),
            }
            for sector, values
            in sector_totals.items()
            if values["count"] > 0
        ]

        sector_rows.sort(
            key=lambda row: (
                -row["average_risk_score"],
                row["sector"],
            )
        )

        row = sector_rows[0]

        return {
            "text": (
                "Sector with highest average risk score: "
                f"{row['sector']}\n"
                "Average risk score: "
                f"{row['average_risk_score']:.2f}\n"
                "Projects in sector: "
                f"{row['project_count']}"
            ),
            "query_type": ANALYTICS_QUERY,
            "project_code": None,
            "citations": [],
            "retrieved_chunks": [],
            "model_used": False,
            "source": "postgresql",
        }
        # ---------------------------------------------------------------
    # HIGHEST-RISK MINISTRY
    # ---------------------------------------------------------------

    highest_risk_ministry_requested = (
        re.search(
            r"\b(?:which|what)\b.*"
            r"\bministr(?:y|ies)\b.*"
            r"\b(?:highest|most|greatest)\b.*"
            r"\brisk\b",
            normalized,
        )
        is not None
        or re.search(
            r"\b(?:highest|most|greatest)\s+risk\b.*"
            r"\bministr(?:y|ies)\b",
            normalized,
        )
        is not None
    )

    if highest_risk_ministry_requested:

        ministry_totals: dict[
            str,
            dict[str, float],
        ] = {}

        for scores in _iter_latest_ml_scores():

            if (
                "ministry" not in scores.columns
                or
                "overall_risk_score"
                not in scores.columns
            ):
                continue

            work = scores[
                [
                    "ministry",
                    "overall_risk_score",
                ]
            ].copy()

            work["ministry"] = (
                work["ministry"]
                .fillna("")
                .astype(str)
                .str.strip()
            )

            work["overall_risk_score"] = pd.to_numeric(
                work[
                    "overall_risk_score"
                ],
                errors="coerce",
            )

            work = work[
                work["ministry"].ne("")
                &
                work[
                    "overall_risk_score"
                ].notna()
            ]

            for _, row in work.iterrows():

                ministry_name = str(
                    row["ministry"]
                )

                score = float(
                    row[
                        "overall_risk_score"
                    ]
                )

                bucket = ministry_totals.setdefault(
                    ministry_name,
                    {
                        "sum": 0.0,
                        "count": 0.0,
                    },
                )

                bucket["sum"] += score
                bucket["count"] += 1

        if not ministry_totals:

            return {
                "text": (
                    "No ministry risk data is available."
                ),
                "query_type": ANALYTICS_QUERY,
                "project_code": None,
                "citations": [],
                "retrieved_chunks": [],
                "model_used": False,
                "source": "postgresql",
            }

        ministry_rows = [
            {
                "ministry": ministry,
                "average_risk_score":
                    values["sum"]
                    /
                    values["count"],
                "project_count":
                    int(values["count"]),
            }
            for ministry, values
            in ministry_totals.items()
            if values["count"] > 0
        ]

        ministry_rows.sort(
            key=lambda row: (
                -row["average_risk_score"],
                row["ministry"],
            )
        )

        row = ministry_rows[0]

        return {
            "text": (
                "Ministry with highest average risk score: "
                f"{row['ministry']}\n"
                "Average risk score: "
                f"{row['average_risk_score']:.2f}\n"
                "Projects in ministry: "
                f"{row['project_count']}"
            ),
            "query_type": ANALYTICS_QUERY,
            "project_code": None,
            "citations": [],
            "retrieved_chunks": [],
            "model_used": False,
            "source": "postgresql",
        }  


    # ---------------------------------------------------------------
    # LIST PROJECTS BY MINISTRY
    # ---------------------------------------------------------------

    project_ministry_match = re.search(
        r"\bprojects?\b.*"
        r"\b(?:of|under|from)\s+"
        r"((?:ministry|department)\b.+?)\s*$",
        normalized,
    )

    if project_ministry_match:
        requested_ministry = (
            project_ministry_match
            .group(1)
            .strip()
        )

        result = db.session.execute(
            text(
                """
                SELECT
                    project_code,
                    project_name,
                    ministry,
                    sector,
                    flash_state
                FROM project_master
                WHERE LOWER(TRIM(ministry))
                      = LOWER(:ministry)
                ORDER BY project_code
                """
            ),
            {
                "ministry": requested_ministry,
            },
        )

        projects = [
            dict(row)
            for row in result.mappings()
        ]

        if not projects:
            return {
                "text": (
                    f"No projects were found under "
                    f"{requested_ministry}."
                ),
                "query_type": ANALYTICS_QUERY,
                "project_code": None,
                "citations": [],
                "retrieved_chunks": [],
                "model_used": False,
                "source": "postgresql",
            }

        lines = [
            (
                f"Projects under {requested_ministry}: "
                f"{len(projects)}"
            )
        ]

        for project in projects:
            lines.append(
                f"- {project['project_code']}: "
                f"{project['project_name']}"
            )

        return {
            "text": "\n".join(lines),
            "query_type": ANALYTICS_QUERY,
            "project_code": None,
            "citations": [],
            "retrieved_chunks": [],
            "model_used": False,
            "source": "postgresql",
        }


    # ---------------------------------------------------------------
    # COUNT CRITICAL PROJECTS
    # ---------------------------------------------------------------

        # ---------------------------------------------------------------
    # COUNT CRITICAL PROJECTS
    # ---------------------------------------------------------------

    critical_project_requested = (
        re.search(
            r"\b(?:how many|how much|number of|count of|total)\b.*"
            r"\bprojects?\b.*\bcritical\b",
            normalized,
        )
        is not None
    )

    if critical_project_requested:

        critical_count = 0

        for scores in _iter_latest_ml_scores():

            if "risk_level" not in scores.columns:
                continue

            critical_count += int(
                scores[
                    "risk_level"
                ]
                .astype(str)
                .str.upper()
                .eq("CRITICAL")
                .sum()
            )

        return {
            "text": (
                f"Critical projects: "
                f"{critical_count}"
            ),
            "query_type": ANALYTICS_QUERY,
            "project_code": None,
            "citations": [],
            "retrieved_chunks": [],
            "model_used": False,
            "source": "postgresql",
        }

    # ---------------------------------------------------------------
    # LIST CRITICAL PROJECTS
    # ---------------------------------------------------------------

    critical_project_list_requested = (
        "critical" in normalized
        and "projects" in normalized
        and re.search(
            r"\b(?:list|show|give|tell|which|what|name|top)\b",
            normalized,
        )
        is not None
    )

    if critical_project_list_requested:

        critical_projects: list[
            dict[str, Any]
        ] = []

        for scores in _iter_latest_ml_scores():

            required = {
                "project_code",
                "risk_level",
                "overall_risk_score",
            }

            if not required.issubset(
                scores.columns
            ):
                continue

            critical = scores[
                scores[
                    "risk_level"
                ]
                .astype(str)
                .str.upper()
                .eq("CRITICAL")
            ].copy()

            if critical.empty:
                continue

            for _, project in critical.iterrows():

                critical_projects.append(
                    {
                        "project_code":
                            str(
                                project[
                                    "project_code"
                                ]
                            ),

                        "project_name":
                            (
                                project.get(
                                    "project_name"
                                )
                                if pd.notna(
                                    project.get(
                                        "project_name"
                                    )
                                )
                                else "unavailable"
                            ),

                        "overall_risk_score":
                            float(
                                project[
                                    "overall_risk_score"
                                ]
                            ),
                    }
                )

        critical_projects.sort(
            key=lambda project: (
                -project[
                    "overall_risk_score"
                ],
                project[
                    "project_code"
                ],
            )
        )

        if not critical_projects:

            return {
                "text": (
                    "No critical projects were found."
                ),
                "query_type": ANALYTICS_QUERY,
                "project_code": None,
                "citations": [],
                "retrieved_chunks": [],
                "model_used": False,
                "source": "postgresql",
            }

        lines = [
            f"Critical projects: "
            f"{len(critical_projects)}"
        ]

        for project in critical_projects:

            lines.append(
                f"- {project['project_code']}: "
                f"{project['project_name']} "
                f"(Risk score: "
                f"{project['overall_risk_score']:.2f})"
            )

        return {
            "text": "\n".join(lines),
            "query_type": ANALYTICS_QUERY,
            "project_code": None,
            "citations": [],
            "retrieved_chunks": [],
            "model_used": False,
            "source": "postgresql",
        }  


    # ---------------------------------------------------------------
    # LIST PROJECTS BY STATE
    # ---------------------------------------------------------------

    project_list_requested = bool(
        re.search(
            r"\b(?:give|show|list|get|which|what)\b",
            normalized,
        )
    ) and "projects" in normalized

    requested_state = None

    if project_list_requested and "delayed" not in normalized:
        canonical_states = sorted(
            INDIA_STATES_AND_UTS,
            key=len,
            reverse=True,
        )

        for state_name in canonical_states:
            if re.search(
                rf"(?<!\w){re.escape(state_name.lower())}(?!\w)",
                normalized,
            ):
                requested_state = state_name
                break

        if requested_state:
            result = db.session.execute(
                text(
                    """
                    SELECT
                        project_code,
                        project_name,
                        ministry,
                        sector,
                        flash_state
                    FROM project_master
                    WHERE flash_state IS NOT NULL
                    """
                )
            )

            projects = []

            for row in result.mappings():
                project_states = _extract_project_states(
                    row["flash_state"]
                )

                if requested_state in project_states:
                    projects.append(
                        {
                            "project_code": row["project_code"],
                            "project_name": row["project_name"],
                        }
                    )

            if not projects:
                return {
                    "text": (
                        f"No projects were found in "
                        f"{requested_state}."
                    ),
                    "query_type": ANALYTICS_QUERY,
                    "project_code": None,
                    "citations": [],
                    "retrieved_chunks": [],
                    "model_used": False,
                    "source": "postgresql",
                }

            lines = [
                (
                    f"Projects in {requested_state}: "
                    f"{len(projects)}"
                )
            ]

            for project in projects:
                lines.append(
                    f"- {project['project_code']}: "
                    f"{project['project_name']}"
                )

            return {
                "text": "\n".join(lines),
                "query_type": ANALYTICS_QUERY,
                "project_code": None,
                "citations": [],
                "retrieved_chunks": [],
                "model_used": False,
                "source": "postgresql",
            }

        # ---------------------------------------------------------------
    # LIST ALL MINISTRIES / SECTORS
    # ---------------------------------------------------------------

    asks_ministry = bool(
        re.search(
            r"\b(?:all|which|list|show)\b.*\bministr(?:y|ies)\b",
            normalized,
        )
    )

    asks_sector = bool(
        re.search(
            r"\b(?:all|which|list|show)\b.*\bsectors?\b",
            normalized,
        )
    )

    if asks_ministry or asks_sector:
        response_parts: list[str] = []

        if asks_ministry:
            ministry_result = db.session.execute(
                text(
                    """
                    SELECT DISTINCT
                        TRIM(ministry) AS ministry
                    FROM project_master
                    WHERE ministry IS NOT NULL
                      AND TRIM(ministry) <> ''
                    ORDER BY TRIM(ministry)
                    """
                )
            )

            ministries = sorted(
                {
                    str(row["ministry"]).strip()
                    for row in ministry_result.mappings()
                    if row["ministry"]
                },
                key=str.lower,
            )

            if ministries:
                response_parts.append(
                    "Project ministries:\n"
                    + "\n".join(
                        f"- {ministry}"
                        for ministry in ministries
                    )
                )
            else:
                response_parts.append(
                    "No ministry information is available."
                )

        if asks_sector:
            sector_result = db.session.execute(
                text(
                    """
                    SELECT DISTINCT
                        TRIM(sector) AS sector
                    FROM project_master
                    WHERE sector IS NOT NULL
                      AND TRIM(sector) <> ''
                    ORDER BY TRIM(sector)
                    """
                )
            )

            sectors = sorted(
                {
                    str(row["sector"]).strip()
                    for row in sector_result.mappings()
                    if row["sector"]
                },
                key=str.lower,
            )

            if sectors:
                response_parts.append(
                    "Project sectors:\n"
                    + "\n".join(
                        f"- {sector}"
                        for sector in sectors
                    )
                )
            else:
                response_parts.append(
                    "No sector information is available."
                )

        return {
            "text": "\n\n".join(
                response_parts
            ),
            "query_type": ANALYTICS_QUERY,
            "project_code": None,
            "citations": [],
            "retrieved_chunks": [],
            "model_used": False,
            "source": "postgresql",
        }

        # ---------------------------------------------------------------
    # LIST ALL STATES
    # ---------------------------------------------------------------

    if (
        "all the states" in normalized
        or "all states" in normalized
        or (
            "which states" in normalized
            and "projects" in normalized
        )
        or "states where the projects are" in normalized
    ):
        result = db.session.execute(
            text(
                """
                SELECT DISTINCT
                    flash_state
                FROM project_master
                WHERE flash_state IS NOT NULL
                """
            )
        )

        states: set[str] = set()

        for row in result:
            states.update(
                _extract_project_states(
                    row[0]
                )
            )

        ordered_states = sorted(
            states,
            key=str.lower,
        )

        if not ordered_states:
            return {
                "text": "No project state information is available.",
                "query_type": ANALYTICS_QUERY,
                "project_code": None,
                "citations": [],
                "retrieved_chunks": [],
                "model_used": False,
                "source": "postgresql",
            }

        return {
            "text": (
                "Project states/UTs:\n"
                + "\n".join(
                    f"- {state}"
                    for state in ordered_states
                )
            ),
            "query_type": ANALYTICS_QUERY,
            "project_code": None,
            "citations": [],
            "retrieved_chunks": [],
            "model_used": False,
            "source": "postgresql",
        }

        # ---------------------------------------------------------------
    # LIST DELAYED PROJECTS BY STATE
    # ---------------------------------------------------------------

    delayed_project_match = (
        re.search(
            r"\b(?:which|what)\b.*"
            r"\bprojects?\b.*"
            r"\bdelayed\b.*"
            r"\b(?:in|from)\s+(.+?)\s*$",
            normalized,
        )
        or
        re.search(
            r"\b(?:list|show)\b.*"
            r"\bdelayed\s+projects?\b.*"
            r"\b(?:in|from)\s+(.+?)\s*$",
            normalized,
        )
    )

    if delayed_project_match:

        requested_location = (
            delayed_project_match
            .group(1)
            .strip()
        )

        # Match the requested location against our canonical
        # state/UT names.
        canonical_states = sorted(
            INDIA_STATES_AND_UTS,
            key=len,
            reverse=True,
        )

        requested_state = None

        for state_name in canonical_states:
            if state_name.lower() in requested_location.lower():
                requested_state = state_name
                break

        # Common abbreviation.
        if (
            requested_state is None
            and requested_location.lower() == "up"
        ):
            requested_state = "Uttar Pradesh"

        if requested_state is None:
            return {
                "text": (
                    "Please specify a valid Indian state or UT."
                ),
                "query_type": ANALYTICS_QUERY,
                "project_code": None,
                "citations": [],
                "retrieved_chunks": [],
                "model_used": False,
                "source": "routing",
            }

        result = db.session.execute(
            text(
                """
                SELECT
                    project_code,
                    project_name,
                    ministry,
                    sector,
                    flash_state,
                    schedule_status
                FROM project_master
                WHERE LOWER(
                    TRIM(
                        COALESCE(
                            schedule_status,
                            ''
                        )
                    )
                ) = 'delayed'
                """
            )
        )

        delayed_projects: list[dict[str, Any]] = []

        for row in result.mappings():

            project_states = _extract_project_states(
                row["flash_state"]
            )

            if requested_state in project_states:
                delayed_projects.append(
                    {
                        "project_code": row["project_code"],
                        "project_name": row["project_name"],
                        "ministry": row["ministry"],
                        "sector": row["sector"],
                    }
                )

        if not delayed_projects:
            return {
                "text": (
                    f"No delayed projects were found in "
                    f"{requested_state}."
                ),
                "query_type": ANALYTICS_QUERY,
                "project_code": None,
                "citations": [],
                "retrieved_chunks": [],
                "model_used": False,
                "source": "postgresql",
            }

        lines = [
            (
                f"Delayed projects in {requested_state}: "
                f"{len(delayed_projects)}"
            )
        ]

        for project in delayed_projects:
            lines.append(
                f"- {project['project_code']}: "
                f"{project['project_name']}"
            )

        return {
            "text": "\n".join(lines),
            "query_type": ANALYTICS_QUERY,
            "project_code": None,
            "citations": [],
            "retrieved_chunks": [],
            "model_used": False,
            "source": "postgresql",
        }    

        # ---------------------------------------------------------------
    # PROJECT COUNT BY STATE
    # ---------------------------------------------------------------

    count_by_state = bool(
        re.search(
            r"\b(?:how many|number of|count of|total)\b.*"
            r"\bprojects?\b.*"
            r"\b(?:each|every)\s+states?\b",
            normalized,
        )
        or re.search(
            r"\bprojects?\b.*\b(?:by|across)\s+states?\b",
            normalized,
        )
    )

    if count_by_state:
        result = db.session.execute(
            text(
                """
                SELECT flash_state
                FROM project_master
                WHERE flash_state IS NOT NULL
                """
            )
        )

        state_counts: dict[str, int] = {}

        for row in result:
            project_states = _extract_project_states(
                row[0]
            )

            for state in project_states:
                state_counts[state] = (
                    state_counts.get(state, 0) + 1
                )

        ordered_counts = sorted(
            state_counts.items(),
            key=lambda item: (
                -item[1],
                item[0].lower(),
            ),
        )

        lines = [
            "Project count by state/UT:"
        ]

        lines.extend(
            f"- {state}: {count}"
            for state, count in ordered_counts
        )

        return {
            "text": "\n".join(lines),
            "query_type": ANALYTICS_QUERY,
            "project_code": None,
            "citations": [],
            "retrieved_chunks": [],
            "model_used": False,
            "source": "postgresql",
        }   

        # ---------------------------------------------------------------
    # PROJECT COUNT BY MINISTRY
    # ---------------------------------------------------------------

    count_by_ministry = bool(
        re.search(
            r"\b(?:how many|number of|count of|total)\b.*"
            r"\bprojects?\b.*"
            r"\b(?:each|every)\s+ministr(?:y|ies)\b",
            normalized,
        )
        or re.search(
            r"\bprojects?\b.*\bby\s+ministr(?:y|ies)\b",
            normalized,
        )
    )

    if count_by_ministry:
        result = db.session.execute(
            text(
                """
                SELECT
                    TRIM(ministry) AS ministry,
                    COUNT(*) AS project_count
                FROM project_master
                WHERE ministry IS NOT NULL
                  AND TRIM(ministry) <> ''
                GROUP BY TRIM(ministry)
                ORDER BY project_count DESC, TRIM(ministry)
                """
            )
        )

        lines = [
            "Project count by ministry:"
        ]

        for row in result.mappings():
            lines.append(
                f"- {row['ministry']}: {int(row['project_count'])}"
            )

        return {
            "text": "\n".join(lines),
            "query_type": ANALYTICS_QUERY,
            "project_code": None,
            "citations": [],
            "retrieved_chunks": [],
            "model_used": False,
            "source": "postgresql",
        }

    # ---------------------------------------------------------------
    # PROJECT COUNT BY SECTOR
    # ---------------------------------------------------------------

    count_by_sector = bool(
        re.search(
            r"\b(?:how many|number of|count of|total)\b.*"
            r"\bprojects?\b.*"
            r"\b(?:each|every)\s+sectors?\b",
            normalized,
        )
        or re.search(
            r"\bprojects?\b.*\bby\s+sectors?\b",
            normalized,
        )
    )

    if count_by_sector:
        result = db.session.execute(
            text(
                """
                SELECT
                    TRIM(sector) AS sector,
                    COUNT(*) AS project_count
                FROM project_master
                WHERE sector IS NOT NULL
                  AND TRIM(sector) <> ''
                GROUP BY TRIM(sector)
                ORDER BY project_count DESC, TRIM(sector)
                """
            )
        )

        lines = [
            "Project count by sector:"
        ]

        for row in result.mappings():
            lines.append(
                f"- {row['sector']}: {int(row['project_count'])}"
            )

        return {
            "text": "\n".join(lines),
            "query_type": ANALYTICS_QUERY,
            "project_code": None,
            "citations": [],
            "retrieved_chunks": [],
            "model_used": False,
            "source": "postgresql",
        }     

    # ---------------------------------------------------------------
    # HOW MANY PROJECTS IN <STATE>
    # ---------------------------------------------------------------

    state_match = re.search(
        r"\b(?:how many|number of|count of|total number of)"
        r"\s+projects?\s+(?:are\s+)?in\s+(.+?)\s*$",
        normalized,
    )

    if state_match:
        state = state_match.group(1).strip()

        # Keep the user-supplied state as a parameter.
        result = db.session.execute(
            text(
                """
                SELECT COUNT(*) AS project_count
                FROM project_master
                WHERE LOWER(
                    COALESCE(
                        flash_state,
                        ''
                    )
                ) LIKE :state_pattern
                """
            ),
            {
                "state_pattern": f"%{state.lower()}%",
            },
        )

        row = result.mappings().first()

        count = int(
            row["project_count"]
            if row and row["project_count"] is not None
            else 0
        )

        return {
            "text": (
                f"Projects in {state.title()}: {count}"
            ),
            "query_type": ANALYTICS_QUERY,
            "project_code": None,
            "citations": [],
            "retrieved_chunks": [],
            "model_used": False,
            "source": "postgresql",
        }

    # ---------------------------------------------------------------
    # FALLBACK
    # ---------------------------------------------------------------

    return {
        "text": (
            "I can currently answer portfolio-level project count "
            "questions directly from the NIRMAAN project database."
        ),
        "query_type": ANALYTICS_QUERY,
        "project_code": None,
        "citations": [],
        "retrieved_chunks": [],
        "model_used": False,
        "source": "postgresql",
    }    

def _query_from_understanding_plan(
    original_query,
    plan,
):
    """
    Convert Gemini's structured query-understanding result into a
    deterministic backend query that existing handlers can process.
    """

    if not plan:
        return original_query

    intent = str(
        plan.get("intent") or ""
    ).upper()

    operation = str(
        plan.get("operation") or ""
    ).upper()

    filters = plan.get(
        "filters"
    ) or {}

    retrieval_query = (
        plan.get("retrieval_query")
        or ""
    ).strip()

    state = filters.get(
        "state"
    )

    schedule_status = filters.get(
        "schedule_status"
    )

    risk_level = filters.get(
        "risk_level"
    )

    dimension = str(
        plan.get("dimension") or ""
    ).strip().lower()

    metric = str(
        plan.get("metric") or ""
    ).strip().lower()

    # ---------------------------------------------------------------
    # LIST PROJECTS BY STATE + SCHEDULE STATUS
    # ---------------------------------------------------------------

    if (
        intent == "ANALYTICS"
        and operation == "LIST_PROJECTS"
        and state
        and schedule_status
    ):
        return (
            f"which projects are "
            f"{schedule_status.lower()} "
            f"in {state}"
        )

    # ---------------------------------------------------------------
    # COUNT PROJECTS IN STATE
    # ---------------------------------------------------------------

    if (
        intent == "ANALYTICS"
        and operation == "COUNT_PROJECTS"
        and state
    ):
        return (
            f"how many projects are in "
            f"{state}"
        )

    # ---------------------------------------------------------------
    # LIST CRITICAL PROJECTS
    # ---------------------------------------------------------------

    if (
        intent == "ANALYTICS"
        and operation == "LIST_PROJECTS"
        and dimension == "project"
        and risk_level
    ):
        return (
            f"list {risk_level.lower()} projects"
        )

    # ---------------------------------------------------------------
    # HIGHEST-RISK MINISTRY
    # ---------------------------------------------------------------

    if (
        intent == "ANALYTICS"
        and operation == "HIGHEST_RISK"
        and dimension == "ministry"
        and metric == "risk"
    ):
        return (
            "which ministry has highest project risk"
        )

    # ---------------------------------------------------------------
    # HIGHEST-RISK SECTOR
    # ---------------------------------------------------------------

    if (
        intent == "ANALYTICS"
        and operation == "HIGHEST_RISK"
        and dimension == "sector"
        and metric == "risk"
    ):
        return (
            "which sector has highest project risk"
        )

    # ---------------------------------------------------------------
    # RAG
    # ---------------------------------------------------------------

    if (
        intent == "RAG"
        and retrieval_query
    ):
        return retrieval_query

    return original_query

# ============================================================================
# MAIN ORCHESTRATION
# ============================================================================

def answer_query(
    question: str,
    project_code: str | None = None,
    query_embedding: list[float] | None = None,
) -> dict[str, Any]:
    """
    Main assistant entry point.

    Routing is deterministic and happens before any Gemini call.
    """

    query = str(
        question
    ).strip()

    if not query:
        raise ValueError(
            "question is required."
        )

    # ---------------------------------------------------------------
    # MULTI-PROJECT REQUEST
    # ---------------------------------------------------------------

    project_codes = extract_project_codes(query)
    if len(project_codes) >= 2:
        normalized = _normalise_query(query)

        # Deterministic routing for multi-project questions.
        # Do this before Gemini understanding so obvious intents
        # are not incorrectly promoted to HYBRID.
        if _contains_any(
            normalized,
            (
                "why",
                "cause",
                "caused",
                "causing",
                "reason",
                "mitigate",
                "mitigation",
                "recommend",
                "solution",
                "fix",
                "what should we do",
            ),
        ):
            return _multi_project_hybrid_response(
                query,
                project_codes,
                query_embedding=query_embedding,
            )

        if _contains_any(normalized, ML_KEYWORDS):
            return _multi_project_ml_response(query, project_codes)

        return _multi_project_response(query, project_codes)

    # ------------------------------------------------------------------
    # Resolve project code.
    # ------------------------------------------------------------------

    resolved_project_code = (
        str(project_code).strip()
        if project_code
        else extract_project_code(
            query
        )
    )

    # ------------------------------------------------------------------
    # Classify query.
    # ------------------------------------------------------------------

    query_type = classify_query(
        query,
        resolved_project_code,
    )

        # ---------------------------------------------------------------
    # Gemini query understanding fallback.
    #
    # We do NOT call Gemini for confidently handled FACT, ML, or
    # ANALYTICS requests.
    #
    # RAG, HYBRID, and previously-GENERAL requests may benefit from
    # natural-language understanding, Hinglish normalization,
    # spelling correction, and retrieval-query rewriting.
    # ---------------------------------------------------------------

    understanding_plan: dict[str, Any] | None = None

    if query_type in {
        RAG_QUERY,
        GENERAL_QUERY,
    }:
        try:
            understanding_plan = (
                understand_query(
                    query
                )
            )
        except Exception as exc:
            print(
                "QUERY UNDERSTANDING ERROR:",
                repr(exc),
            )
            understanding_plan = None

        if understanding_plan:
            understood_intent = str(
                understanding_plan.get(
                    "intent"
                )
                or ""
            ).upper()

            understood_project_code = (
                understanding_plan.get(
                    "project_code"
                )
            )

            if (
                understood_project_code
                and not resolved_project_code
            ):
                resolved_project_code = str(
                    understood_project_code
                )

            # Gemini may identify a previously-unrecognized
            # project/portfolio intent.
            if understood_intent == "FACT":
                query_type = FACT_QUERY

            elif understood_intent == "ML":
                query_type = ML_QUERY

            elif understood_intent == "ANALYTICS":
                query_type = ANALYTICS_QUERY

            elif understood_intent == "RAG":
                query_type = RAG_QUERY

            elif understood_intent == "HYBRID":
                query_type = HYBRID_QUERY

            elif understood_intent == "GENERAL":
                query_type = GENERAL_QUERY

            query = _query_from_understanding_plan(
                query,
                understanding_plan,
            )

    # ------------------------------------------------------------------
    # Load project context only for:
    #
    # FACT
    # ML
    # HYBRID
    # ------------------------------------------------------------------

    context: dict[
        str,
        Any,
    ] | None = None

    if query_type in {
        FACT_QUERY,
        ML_QUERY,
        HYBRID_QUERY,
    }:

        if not resolved_project_code:
            return {
                "text": (
                    "Please provide the project code for "
                    "a project-specific answer."
                ),
                "query_type": query_type,
                "project_code": None,
                "citations": [],
                "retrieved_chunks": [],
                "model_used": False,
                "source": "routing",
            }

        context = get_project_context(
            resolved_project_code
        )

        if not context:
            return {
                "text": (
                    f"I could not find project "
                    f"{resolved_project_code} "
                    "in the NIRMAAN project database."
                ),
                "query_type": query_type,
                "project_code": resolved_project_code,
                "citations": [],
                "retrieved_chunks": [],
                "model_used": False,
                "source": "postgresql",
            }

    # ------------------------------------------------------------------
    # ANALYTICS QUERY
    # ------------------------------------------------------------------

    if query_type == ANALYTICS_QUERY:
        return _analytics_response(
            query
        )        

    # ------------------------------------------------------------------
    # FACT QUERY
    # ------------------------------------------------------------------

    if query_type == FACT_QUERY:

        assert context is not None

        return _fact_response(
            context,
            query,
        )

    # ------------------------------------------------------------------
    # ML QUERY
    # ------------------------------------------------------------------

    if query_type == ML_QUERY:

        assert context is not None

        return _ml_response(
            context
        )

    # ------------------------------------------------------------------
    # RAG QUERY
    #
    # Retrieval is local.
    # answer_from_knowledge_base performs one Gemini call.
    # ------------------------------------------------------------------

    if query_type == RAG_QUERY:

        result = answer_from_knowledge_base(
            query,
            top_k=RAG_TOP_K,
            query_embedding=query_embedding,
        )

        return {
            "text": result.get(
                "text",
                "",
            ),
            "query_type": RAG_QUERY,
            "project_code": None,
            "citations": result.get(
                "citations",
                [],
            ),
            "retrieved_chunks": result.get(
                "retrieved_chunks",
                [],
            ),
            "model_used": bool(
                result.get(
                    "model"
                )
            ),
            "model": result.get(
                "model"
            ),
            "usage": result.get(
                "usage",
                {},
            ),
            "source": result.get(
                "source",
                "postgresql_pgvector",
            ),
        }

    # ------------------------------------------------------------------
    # HYBRID QUERY
    #
    # PostgreSQL project data
    # +
    # ML predictions
    # +
    # local RAG
    # +
    # one Gemini call
    # ------------------------------------------------------------------

    if query_type == HYBRID_QUERY:

        assert context is not None

        # --------------------------------------------------------------
        # Local RAG retrieval.
        # --------------------------------------------------------------

        rag_chunks = retrieve_knowledge(
            query,
            top_k=RAG_TOP_K,
            query_embedding=query_embedding,
        )

        # --------------------------------------------------------------
        # Compact combined prompt.
        # --------------------------------------------------------------

        prompt = _build_project_prompt(
            query,
            context,
            rag_chunks,
        )

        # --------------------------------------------------------------
        # Exactly ONE Gemini generation call.
        # --------------------------------------------------------------

        response = generate_grounded_response(
            prompt,
            system_instruction=(
                HYBRID_SYSTEM_INSTRUCTION
            ),
        )

        return {
            "text": response.get(
                "text",
                "",
            ),
            "query_type": HYBRID_QUERY,
            "project_code": resolved_project_code,
            "citations": _build_rag_citations(
                rag_chunks
            ),
            "retrieved_chunks": [
                {
                    "id": chunk.get(
                        "id"
                    ),
                    "document_name": chunk.get(
                        "document_name"
                    ),
                    "document_type": chunk.get(
                        "document_type"
                    ),
                    "source": chunk.get(
                        "source"
                    ),
                    "page_number": chunk.get(
                        "page_number"
                    ),
                    "section_title": chunk.get(
                        "section_title"
                    ),
                    "topic": chunk.get(
                        "topic"
                    ),
                    "country": chunk.get(
                        "country"
                    ),
                    "document_year": chunk.get(
                        "document_year"
                    ),
                    "vector_score": chunk.get(
                        "vector_score"
                    ),
                    "keyword_score": chunk.get(
                        "keyword_score"
                    ),
                    "rrf_score": chunk.get(
                        "rrf_score"
                    ),
                    "vector_rank": chunk.get(
                        "vector_rank"
                    ),
                    "keyword_rank": chunk.get(
                        "keyword_rank"
                    ),
                }
                for chunk in rag_chunks
            ],
            "model_used": bool(
                response.get(
                    "model"
                )
            ),
            "model": response.get(
                "model"
            ),
            "usage": response.get(
                "usage",
                {},
            ),
            "source": "postgresql_pgvector",
        }

    # ------------------------------------------------------------------
    # GENERAL QUERY
    # ------------------------------------------------------------------

    response = generate_grounded_response(
        _general_prompt(
            query
        ),
        system_instruction=(
            GENERAL_SYSTEM_INSTRUCTION
        ),
    )

    return {
        "text": response.get(
            "text",
            "",
        ),
        "query_type": GENERAL_QUERY,
        "project_code": None,
        "citations": [],
        "retrieved_chunks": [],
        "model_used": bool(
            response.get(
                "model"
            )
        ),
        "model": response.get(
            "model"
        ),
        "usage": response.get(
            "usage",
            {},
        ),
        "source": "gemini",
    }