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


# ============================================================================
# QUERY CLASSES
# ============================================================================

FACT_QUERY = "FACT_QUERY"
ML_QUERY = "ML_QUERY"
RAG_QUERY = "RAG_QUERY"
HYBRID_QUERY = "HYBRID_QUERY"
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


PROJECT_CODE_PATTERN = re.compile(
    r"\b\d{5,8}\b"
)


# ============================================================================
# RAG CONFIGURATION
# ============================================================================

# Keep this aligned with rag_service.py.
RAG_TOP_K = 3

# These limits are specifically for the hybrid prompt.
HYBRID_MAX_HISTORY_ITEMS = 3
HYBRID_MAX_PROGRESS_ITEMS = 3
HYBRID_MAX_INDICATOR_ITEMS = 5


# ============================================================================
# SYSTEM INSTRUCTIONS
# ============================================================================

RAG_SYSTEM_INSTRUCTION = """
You are NIRMAAN AI's infrastructure knowledge assistant.

Answer questions using the retrieved knowledge passages supplied by the
NIRMAAN application.

SOURCE RULES:

1. Retrieved RAG passages are the authoritative source for general
   infrastructure knowledge, research, standards, guidelines, best
   practices, mitigation practices, procurement practices, contract
   management, risk management, and schedule management.

2. Do not invent facts, statistics, standards, citations, or sources.

3. Do not create project-specific metrics.

4. Do not claim that a general documented cause is definitely the cause
   of a particular project unless project-specific evidence is supplied
   separately.

5. Clearly distinguish general knowledge from project observations.

6. Preserve important conditions, qualifications, limitations, and
   uncertainty from the retrieved sources.

7. Prefer concise and practical explanations.

8. If the retrieved knowledge does not contain sufficient evidence,
   clearly state that the available knowledge base is insufficient.

9. Do not pretend that a source says something that it does not say.

10. When relevant, cite retrieved knowledge using [Source N].
""".strip()


HYBRID_SYSTEM_INSTRUCTION = """
You are NIRMAAN AI's infrastructure project intelligence assistant.

You have three evidence categories:

OBSERVED
    Facts directly reported by the NIRMAAN project database.

PREDICTED
    Outputs generated by the existing NIRMAAN ML models.

GENERAL KNOWLEDGE
    Retrieved passages from the NIRMAAN local RAG knowledge base.

Rules:

1. Never invent project values.

2. Never modify or recalculate supplied ML predictions.

3. Never present a prediction as an observed fact.

4. Never present an observed indicator as a proven causal factor unless
   the supplied evidence explicitly establishes that relationship.

5. General knowledge may explain possible causes, industry practices,
   mitigation options, or recommendations, but must not be presented as
   a confirmed cause of the project unless project-specific evidence
   supports that conclusion.

6. Use the retrieved RAG passages as the source for general guidance.

7. Cite retrieved knowledge using [Source N] when relevant.

8. Clearly distinguish:
       OBSERVED
       PREDICTED
       GENERAL KNOWLEDGE

9. If evidence is insufficient, say so.

10. Do not say that no RAG knowledge was retrieved when RAG passages are
    explicitly supplied.

11. Keep answers practical, concise, and evidence-based.
""".strip()


GENERAL_SYSTEM_INSTRUCTION = """
You are NIRMAAN AI, an infrastructure project intelligence assistant.

Answer the user's question accurately and concisely.

Do not invent project-specific facts, metrics, predictions, or citations.

When you do not have enough information, say so clearly.

Prefer practical explanations appropriate for infrastructure project
management.
""".strip()


# ============================================================================
# UTILITY HELPERS
# ============================================================================

def _normalise_query(
    query: str,
) -> str:
    return " ".join(
        str(query)
        .strip()
        .lower()
        .split()
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
    Extract a likely NIRMAAN project code.

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

    Routing priority:

        HYBRID
        ML
        FACT
        RAG
        GENERAL

    Important:
        A project code selected in the UI does not automatically make a
        general knowledge question a HYBRID query.

    Examples:

        Project 400005 + "What are common causes of infrastructure delays?"
            -> RAG_QUERY

        Project 400005 + "Why is this project delayed?"
            -> HYBRID_QUERY

        Project 400005 + "What is the risk score?"
            -> ML_QUERY

        Project 400005 + "What is the physical progress?"
            -> FACT_QUERY
    """

    normalized = _normalise_query(
        query
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

    # ------------------------------------------------------------------
    # Basic intent detection.
    # ------------------------------------------------------------------

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
    # Explicit project reference.
    #
    # A project selected in the UI is intentionally NOT enough.
    #
    # Example:
    #
    #   Selected project: 400005
    #   Question: "What are the common causes of infrastructure delays?"
    #
    # This must remain RAG_QUERY.
    #
    # But:
    #
    #   Selected project: 400005
    #   Question: "Why is this project delayed?"
    #
    # This should be HYBRID_QUERY.
    # ------------------------------------------------------------------

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
            ),
        )
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
        "root causes",
    )

    mitigation_words = (
        "mitigate",
        "mitigation",
        "recommend",
        "recommendation",
        "recommendations",
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
    # ------------------------------------------------------------------

    if has_project and (
        is_hybrid
        or project_reasoning
    ):
        return HYBRID_QUERY

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
    # HYBRID wording without a project code.
    #
    # The main orchestration will request a project code.
    # ------------------------------------------------------------------

    if is_hybrid:
        return HYBRID_QUERY

    # ------------------------------------------------------------------
    # GENERAL RAG
    # ------------------------------------------------------------------

    if is_rag:
        return RAG_QUERY

    # ------------------------------------------------------------------
    # ML fallback.
    # ------------------------------------------------------------------

    if has_project and is_ml:
        return ML_QUERY

    # ------------------------------------------------------------------
    # FACT fallback.
    # ------------------------------------------------------------------

    if has_project and is_fact:
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

        # Existing assistant context stores probabilities as percentages.
        return f"{number:.1f}%"

    except (
        TypeError,
        ValueError,
    ):
        return str(value)


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

    if "ministry" in normalized:
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
        fields.append(
            (
                "Original cost",
                (
                    (
                        f"₹{_format_number(project.get('original_cost_cr'))} Cr"
                    )
                    if project.get(
                        "original_cost_cr"
                    ) is not None
                    else "unavailable"
                ),
            )
        )

    if (
        "expenditure" in normalized
        or "spent" in normalized
        or "spending" in normalized
    ):
        fields.append(
            (
                "Expenditure",
                (
                    (
                        f"₹{_format_number(project.get('expenditure_cr'))} Cr"
                    )
                    if project.get(
                        "expenditure_cr"
                    ) is not None
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
                    (
                        f"{_format_number(project.get('physical_progress_pct'), 1)}%"
                    )
                    if project.get(
                        "physical_progress_pct"
                    ) is not None
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
                    (
                        f"{_format_number(project.get('delay_days'), 0)} days"
                    )
                    if project.get(
                        "delay_days"
                    ) is not None
                    else "unavailable"
                ),
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
                "Schedule status",
                project.get(
                    "schedule_status"
                ),
            ),
        ]

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
    Reduce the amount of project history sent to Gemini.

    PostgreSQL remains the source of truth, but Gemini only needs the
    most relevant recent context for explanation.
    """

    return {
        "project": context.get(
            "project",
            {},
        ),
        "predictions": context.get(
            "predictions",
            {},
        ),
        "observed_indicators": (
            context.get(
                "observed_indicators",
                [],
            )[
                :HYBRID_MAX_INDICATOR_ITEMS
            ]
        ),
        "recent_history": (
            context.get(
                "recent_history",
                [],
            )[
                -HYBRID_MAX_HISTORY_ITEMS:
            ]
        ),
        "recent_progress": (
            context.get(
                "recent_progress",
                [],
            )[
                -HYBRID_MAX_PROGRESS_ITEMS:
            ]
        ),
    }


# ============================================================================
# RAG CITATIONS FOR HYBRID RESPONSE
# ============================================================================

def _build_rag_citations(
    chunks: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    Build citations from the actual PostgreSQL RAG schema.

    Uses:

        document_name
        document_type
        source
        page_number
        section_title
        topic
        country
        document_year
        chunk_index

    Gemini does not generate these citations.
    """

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
# GEMINI PROJECT PROMPT
# ============================================================================

def _build_project_prompt(
    question: str,
    context: dict[str, Any],
    rag_chunks: list[dict[str, Any]],
) -> str:
    """
    Build one compact hybrid prompt.

    Gemini receives:

        PostgreSQL project context
        +
        ML predictions
        +
        local RAG chunks

    Gemini does NOT perform retrieval.
    """

    compact_context = (
        _compact_project_context(
            context
        )
    )

    serialized_project = json.dumps(
        compact_context,
        ensure_ascii=False,
        separators=(
            ",",
            ":",
        ),
        default=str,
    )

    # ---------------------------------------------------------------
    # RAG context.
    # ---------------------------------------------------------------

    rag_parts: list[str] = []

    for index, chunk in enumerate(
        rag_chunks,
        start=1,
    ):

        document_name = str(
            chunk.get(
                "document_name"
            )
            or "Unknown document"
        )

        document_type = str(
            chunk.get(
                "document_type"
            )
            or ""
        )

        source = str(
            chunk.get(
                "source"
            )
            or ""
        )

        page_number = chunk.get(
            "page_number"
        )

        section_title = str(
            chunk.get(
                "section_title"
            )
            or ""
        ).strip()

        topic = str(
            chunk.get(
                "topic"
            )
            or ""
        ).strip()

        country = str(
            chunk.get(
                "country"
            )
            or ""
        ).strip()

        document_year = chunk.get(
            "document_year"
        )

        content = str(
            chunk.get(
                "chunk_text"
            )
            or ""
        ).strip()

        if not content:
            continue

        lines = [
            f"[Source {index}]",
            f"Document: {document_name}",
        ]

        if document_type:
            lines.append(
                f"Document type: {document_type}"
            )

        if source:
            lines.append(
                f"Source: {source}"
            )

        if page_number is not None:
            lines.append(
                f"Page: {page_number}"
            )

        if section_title:
            lines.append(
                f"Section: {section_title}"
            )

        if topic:
            lines.append(
                f"Topic: {topic}"
            )

        if country:
            lines.append(
                f"Country: {country}"
            )

        if document_year is not None:
            lines.append(
                f"Year: {document_year}"
            )

        lines.append(
            "Content:"
        )

        lines.append(
            content
        )

        rag_parts.append(
            "\n".join(lines)
        )

    rag_context = (
        "\n\n".join(
            rag_parts
        )
        if rag_parts
        else
        "No RAG passages were retrieved."
    )

    # ---------------------------------------------------------------
    # Final compact hybrid prompt.
    # ---------------------------------------------------------------

    return f"""
USER QUESTION:

{question}


==================================================
OBSERVED PROJECT CONTEXT
==================================================

{serialized_project}


==================================================
RETRIEVED GENERAL KNOWLEDGE
==================================================

{rag_context}


==================================================
SOURCE DEFINITIONS
==================================================

OBSERVED
Facts directly supplied by the NIRMAAN PostgreSQL project context.

PREDICTED
Outputs supplied by the existing NIRMAAN ML models.

GENERAL KNOWLEDGE
Evidence retrieved from the NIRMAAN local RAG knowledge base.


==================================================
ANSWERING RULES
==================================================

1. Answer the user's question using the relevant supplied evidence.

2. Use OBSERVED for facts from the project database.

3. Use PREDICTED for ML outputs.

4. Use GENERAL KNOWLEDGE for research, guidelines, mitigation practices,
   and infrastructure/project-management knowledge.

5. Never invent project values.

6. Never modify or recalculate ML predictions.

7. Do not present a general RAG statement as a confirmed cause of this
   specific project unless project-specific evidence supports it.

8. When using retrieved RAG knowledge, cite it using [Source N].

9. If RAG passages are present, do not claim that no RAG knowledge was
   retrieved.

10. If the available evidence does not establish a cause, say that it
    is not established by the supplied evidence.

11. Keep the answer concise and practical.
""".strip()


# ============================================================================
# GENERAL PROMPT
# ============================================================================

def _general_prompt(
    question: str,
) -> str:
    return f"""
USER QUESTION:

{question}

Answer as the NIRMAAN AI infrastructure project intelligence assistant.

Do not invent project-specific facts, metrics, predictions, or citations.

Keep the response concise, professional, and practical.
""".strip()


# ============================================================================
# MAIN ORCHESTRATION
# ============================================================================

def answer_query(
    question: str,
    project_code: str | None = None,
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
    # Resolve project code.
    # ---------------------------------------------------------------

    resolved_project_code = (
        str(
            project_code
        ).strip()
        if project_code
        else extract_project_code(
            query
        )
    )

    # ---------------------------------------------------------------
    # Determine query class.
    # ---------------------------------------------------------------

    query_type = classify_query(
        query,
        resolved_project_code,
    )

    # ---------------------------------------------------------------
    # Project context is only loaded for:
    #
    # FACT
    # ML
    # HYBRID
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
                    f"{resolved_project_code} in the "
                    "NIRMAAN project database."
                ),
                "query_type": query_type,
                "project_code": (
                    resolved_project_code
                ),
                "citations": [],
                "retrieved_chunks": [],
                "model_used": False,
                "source": "postgresql",
            }

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
            context
        )

    # ---------------------------------------------------------------
    # RAG QUERY
    #
    # Retrieval and embedding happen locally.
    # answer_from_knowledge_base performs the ONE Gemini call.
    # ---------------------------------------------------------------

    if query_type == RAG_QUERY:

        result = (
            answer_from_knowledge_base(
                query,
                top_k=RAG_TOP_K,
            )
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

    # ---------------------------------------------------------------
    # HYBRID QUERY
    #
    # PostgreSQL project data
    # +
    # ML predictions
    # +
    # local RAG
    # +
    # ONE Gemini call.
    # ---------------------------------------------------------------

    if query_type == HYBRID_QUERY:

        assert context is not None

        # -----------------------------------------------------------
        # Local RAG retrieval.
        # -----------------------------------------------------------

        rag_chunks = retrieve_knowledge(
            query,
            top_k=RAG_TOP_K,
        )

        # -----------------------------------------------------------
        # Build compact combined prompt.
        # -----------------------------------------------------------

        prompt = _build_project_prompt(
            query,
            context,
            rag_chunks,
        )

        # -----------------------------------------------------------
        # Exactly ONE Gemini generation call.
        # -----------------------------------------------------------

        response = (
            generate_grounded_response(
                prompt,
                system_instruction=(
                    HYBRID_SYSTEM_INSTRUCTION
                ),
            )
        )

        citations = _build_rag_citations(
            rag_chunks
        )

        return {
            "text": response.get(
                "text",
                "",
            ),
            "query_type": HYBRID_QUERY,
            "project_code": (
                resolved_project_code
            ),
            "citations": citations,
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

    # ---------------------------------------------------------------
    # GENERAL QUERY
    # ---------------------------------------------------------------

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