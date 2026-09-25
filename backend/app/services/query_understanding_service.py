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
    "HIGHEST_RISK",
    "SEARCH_KNOWLEDGE",
}

VALID_ANALYTICS_DIMENSIONS = {
    "state",
    "ministry",
    "sector",
    "project",
}

VALID_ANALYTICS_METRICS = {
    "project_count",
    "risk",
    "delay",
    "progress",
    "cost",
}

VALID_SORT_ORDERS = {
    "ascending",
    "descending",
}


# ============================================================================
# SYSTEM INSTRUCTION
# ============================================================================

QUERY_UNDERSTANDING_INSTRUCTION = """
You are NIRMAAN AI's query-understanding layer.

Your ONLY job is to understand the user's message and return
a structured query plan.

You must NOT answer the user's question.

You must decide which NIRMAAN execution layer should handle
the request.

VALID INTENTS:

FACT
    A specific project fact that comes from PostgreSQL.

ML
    A project prediction, risk, probability, warning, priority,
    or other existing NIRMAAN ML output.

RAG
    General infrastructure/project-management knowledge that should
    be answered from the NIRMAAN knowledge base.

HYBRID
    A project-specific question requiring:
        PostgreSQL project facts
        + existing ML predictions
        + general RAG knowledge

ANALYTICS
    Portfolio-level questions involving multiple projects,
    counts, lists, grouping, ranking, states, ministries,
    sectors, or portfolio risk/delay/progress/cost analysis.

GENERAL
    Conversation, greetings, acknowledgements, capability questions,
    casual questions, or anything that does not require the
    NIRMAAN project/analytics/RAG/ML data layers.

IMPORTANT DECISION RULES:

1. ALWAYS classify the user's actual message.
   Do not assume an intent merely because a project is selected
   in the UI.

2. A selected project is context, not proof that the user is asking
   about that project.

3. Greetings and conversational messages are GENERAL.
   Examples:
       "hi"
       "hello"
       "hey"
       "good morning"
       "good evening"
       "thanks"
       "thank you"
       "okay"
       "cool"
       "who are you?"
       "what can you do?"
       "help me"

4. Never classify a simple greeting or acknowledgement as ANALYTICS,
   ML, FACT, RAG, or HYBRID.

5. Understand English, Hinglish, mixed English/Hindi, common spelling
   mistakes, and natural conversational wording.

6. Translate the meaning internally when needed.
   Do not require the user to write formal English.

7. Hinglish examples:

   "goa me kitne projects hain"
       -> ANALYTICS / COUNT_PROJECTS / state / project_count

   "gujrat me kitne project hai"
       -> ANALYTICS / COUNT_PROJECTS / state / project_count
       with state="Gujarat"

   "UP me kaun se projects delayed hain"
       -> ANALYTICS / LIST_PROJECTS / state
       with state="Uttar Pradesh"
       and schedule_status="Delayed"

   "sabse risky ministry kaunsi hai"
       -> ANALYTICS / HIGHEST_RISK / ministry / risk

   "project 400005 ka risk kya hai"
       -> ML / GET_PREDICTION / project_code=400005

   "project 400005 delay kyu ho raha hai"
       -> HYBRID / ANSWER / project_code=400005

   "infrastructure projects me delay ke common causes kya hain"
       -> RAG / SEARCH_KNOWLEDGE

8. FACT means the user wants an observed project value.
   Examples:
       project name
       ministry
       sector
       state
       agency
       completion date
       schedule status
       cost
       expenditure
       physical progress
       recorded delay

9. ML means the user wants an existing prediction or risk output.
   Examples:
       risk score
       risk level
       delay probability
       stall probability
       predicted cost overrun
       cost risk
       early warning
       priority
       prediction

10. RAG means the user asks for general knowledge, research,
    causes, guidance, best practices, mitigation knowledge,
    recommendations, or infrastructure knowledge that is not
    itself a project observation or project prediction.

11. HYBRID means the question is specifically about a project
    AND requires reasoning/explanation using project evidence
    together with ML and/or general knowledge.

    Examples:
       "why is project 400005 delayed?"
       "what is causing this project risk?"
       "how can we mitigate project 400005's delay?"
       "project 400005 risky kyu hai?"

12. ANALYTICS means the user is asking about the portfolio rather
    than one project.

    Examples:
       "how many projects are in Goa?"
       "Goa me kitne projects hain?"
       "which projects are delayed in Uttar Pradesh?"
       "how many projects are in each state?"
       "which ministry has the highest project risk?"
       "list critical projects"

13. When a project code is explicitly present, extract it exactly.
    Never invent or guess a project code.

14. When the user uses follow-up wording such as:
       "it"
       "this project"
       "that project"
       "its risk"
       "its delay"
       "tell me more about it"
    and a SELECTED PROJECT CODE is supplied, use that selected
    project code as the project context.

15. A follow-up question is still GENERAL when it is clearly
    conversational and does not ask for project/domain data.

16. For ANALYTICS identify:
       operation
       dimension
       metric
       sort_order
       limit
       filters

17. COUNT_PROJECTS means the user wants a count.

18. LIST_PROJECTS means the user wants the actual project records.

19. LIST_DIMENSIONS means grouped portfolio counts, such as:
       project count by state
       project count by ministry
       project count by sector

20. HIGHEST_RISK means the user asks which entity has the highest,
    greatest, or most project risk.
    Set:
       metric="risk"
       sort_order="descending"
       limit=1
    unless the user explicitly requests another limit.

21. For RAG, create a concise retrieval_query and useful
    retrieval_keywords.

22. Do not create factual values, dates, project names, scores,
    ministries, sectors, states, or statuses that the user did
    not provide.

23. Return ONLY valid JSON.

DECISION PRIORITY:

Use this reasoning order:

A. Is this ordinary conversation or small talk?
   -> GENERAL

B. Is this clearly a portfolio-level question?
   -> ANALYTICS

C. Is this clearly a project prediction/risk question?
   -> ML

D. Is this clearly a project fact question?
   -> FACT

E. Is this clearly a general knowledge question?
   -> RAG

F. Is this project-specific reasoning that combines project context
   with prediction/general knowledge?
   -> HYBRID

G. Otherwise:
   -> GENERAL

IMPORTANT:
The words alone do not determine the intent.
Understand the complete meaning of the user's message.

Return ONLY the structured JSON plan.
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
        filters["project_code"] = project_code

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
    retrieval_keywords = retrieval_keywords[:10]

    needs_generation = bool(
        plan.get(
            "needs_generation",
            False,
        )
    )

    dimension = str(
        plan.get(
            "dimension"
        ) or ""
    ).strip().lower()

    if dimension not in {
        "",
        "state",
        "ministry",
        "sector",
        "project",
    }:
        dimension = ""

    metric = str(
        plan.get(
            "metric"
        ) or ""
    ).strip().lower()

    if metric not in {
        "",
        "project_count",
        "risk",
        "delay",
        "progress",
        "cost",
    }:
        metric = ""

    sort_order = str(
        plan.get(
            "sort_order"
        ) or ""
    ).strip().lower()

    if sort_order not in {
        "",
        "ascending",
        "descending",
    }:
        sort_order = ""

    limit_value = plan.get(
        "limit"
    )

    try:
        limit_value = (
            int(limit_value)
            if limit_value is not None
            else None
        )
    except (
        TypeError,
        ValueError,
    ):
        limit_value = None

    if limit_value is not None:
        limit_value = max(
            1,
            min(
                limit_value,
                100,
            ),
        )

    # Keep the structured plan internally consistent for common analytics
    # operations even when Gemini omits a field.
    if operation == "HIGHEST_RISK":
        if not metric:
            metric = "risk"

        if not sort_order:
            sort_order = "descending"

        if limit_value is None:
            limit_value = 1

    if operation == "COUNT_PROJECTS" and not metric:
        metric = "project_count"

    return {
        "intent": intent,
        "operation": operation,
        "project_code": project_code,
        "dimension": dimension,
        "metric": metric,
        "sort_order": sort_order,
        "limit": limit_value,
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
    project_code: str | None = None,
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

        selected_project = (
            str(project_code).strip()
            if project_code
            else "NONE"
        )

        prompt = f"""
    SELECTED PROJECT CODE:
    {selected_project}

    USER QUESTION:

    {query}


RETURN ONLY THIS JSON SHAPE:

{{
  "intent": "FACT | ML | RAG | HYBRID | ANALYTICS | GENERAL",
  "operation": "ANSWER | GET_FACT | GET_PREDICTION | COUNT_PROJECTS | LIST_PROJECTS | LIST_DIMENSIONS | HIGHEST_RISK | SEARCH_KNOWLEDGE",
  "project_code": null,

  "dimension": "state | ministry | sector | project | null",
  "metric": "project_count | risk | delay | progress | cost | null",
  "sort_order": "ascending | descending | null",
  "limit": null,

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

Expected:
{{
  "intent": "FACT",
  "operation": "GET_FACT",
  "project_code": "400006",
  "dimension": null,
  "metric": null,
  "sort_order": null,
  "limit": null,
  "filters": {{"project_code": "400006"}}
}}


Question:
"uttar pradesh me kon se projects delayed hai"

Expected:
{{
  "intent": "ANALYTICS",
  "operation": "LIST_PROJECTS",
  "project_code": null,
  "dimension": "state",
  "metric": null,
  "sort_order": null,
  "limit": null,
  "filters": {{
    "state": "Uttar Pradesh",
    "schedule_status": "Delayed"
  }}
}}


Question:
"gujrat me kitne project hai"

Expected:
{{
  "intent": "ANALYTICS",
  "operation": "COUNT_PROJECTS",
  "project_code": null,
  "dimension": "state",
  "metric": "project_count",
  "sort_order": null,
  "limit": null,
  "filters": {{
    "state": "Gujarat"
  }}
}}


Question:
"how many projects are there in goa"

Expected:
{{
  "intent": "ANALYTICS",
  "operation": "COUNT_PROJECTS",
  "project_code": null,
  "dimension": "state",
  "metric": "project_count",
  "sort_order": null,
  "limit": null,
  "filters": {{
    "state": "Goa"
  }}
}}


Question:
"goa me kitne projects hain"

Expected:
{{
  "intent": "ANALYTICS",
  "operation": "COUNT_PROJECTS",
  "project_code": null,
  "dimension": "state",
  "metric": "project_count",
  "sort_order": null,
  "limit": null,
  "filters": {{
    "state": "Goa"
  }}
}}


Question:
"how many projects does Goa have"

Expected:
{{
  "intent": "ANALYTICS",
  "operation": "COUNT_PROJECTS",
  "project_code": null,
  "dimension": "state",
  "metric": "project_count",
  "sort_order": null,
  "limit": null,
  "filters": {{
    "state": "Goa"
  }}
}}


Question:
"tell me the total project count for Gujarat"

Expected:
{{
  "intent": "ANALYTICS",
  "operation": "COUNT_PROJECTS",
  "project_code": null,
  "dimension": "state",
  "metric": "project_count",
  "sort_order": null,
  "limit": null,
  "filters": {{
    "state": "Gujarat"
  }}
}}


Question:
"which ministry has highest project risk"

Expected:
{{
  "intent": "ANALYTICS",
  "operation": "HIGHEST_RISK",
  "project_code": null,
  "dimension": "ministry",
  "metric": "risk",
  "sort_order": "descending",
  "limit": 1,
  "filters": {{}}
}}


Question:
"what ministry has the highest average risk"

Expected:
{{
  "intent": "ANALYTICS",
  "operation": "HIGHEST_RISK",
  "project_code": null,
  "dimension": "ministry",
  "metric": "risk",
  "sort_order": "descending",
  "limit": 1,
  "filters": {{}}
}}


Question:
"which ministry has the most risky projects"

Expected:
{{
  "intent": "ANALYTICS",
  "operation": "HIGHEST_RISK",
  "project_code": null,
  "dimension": "ministry",
  "metric": "risk",
  "sort_order": "descending",
  "limit": 1,
  "filters": {{}}
}}


Question:
"which sector has the highest risk"

Expected:
{{
  "intent": "ANALYTICS",
  "operation": "HIGHEST_RISK",
  "project_code": null,
  "dimension": "sector",
  "metric": "risk",
  "sort_order": "descending",
  "limit": 1,
  "filters": {{}}
}}


Question:
"which sector is most risky"

Expected:
{{
  "intent": "ANALYTICS",
  "operation": "HIGHEST_RISK",
  "project_code": null,
  "dimension": "sector",
  "metric": "risk",
  "sort_order": "descending",
  "limit": 1,
  "filters": {{}}
}}


Question:
"how many projects are in each state"

Expected:
{{
  "intent": "ANALYTICS",
  "operation": "LIST_DIMENSIONS",
  "project_code": null,
  "dimension": "state",
  "metric": "project_count",
  "sort_order": "descending",
  "limit": null,
  "filters": {{}}
}}


Question:
"how many projects are in each ministry"

Expected:
{{
  "intent": "ANALYTICS",
  "operation": "LIST_DIMENSIONS",
  "project_code": null,
  "dimension": "ministry",
  "metric": "project_count",
  "sort_order": "descending",
  "limit": null,
  "filters": {{}}
}}


Question:
"project count by sector"

Expected:
{{
  "intent": "ANALYTICS",
  "operation": "LIST_DIMENSIONS",
  "project_code": null,
  "dimension": "sector",
  "metric": "project_count",
  "sort_order": "descending",
  "limit": null,
  "filters": {{}}
}}


Question:
"what are common causes of infrastructure delays?"

Expected:
{{
  "intent": "RAG",
  "operation": "SEARCH_KNOWLEDGE",
  "project_code": null,
  "dimension": null,
  "metric": null,
  "sort_order": null,
  "limit": null,
  "filters": {{}},
  "retrieval_query": "common causes of delays in infrastructure projects",
  "retrieval_keywords": [
    "infrastructure project delays",
    "causes of delay",
    "schedule delay",
    "project delivery"
  ]
}}


Question:
"why is project 400005 delayed?"

Expected:
{{
  "intent": "HYBRID",
  "operation": "ANSWER",
  "project_code": "400005",
  "dimension": null,
  "metric": null,
  "sort_order": null,
  "limit": null,
  "filters": {{"project_code": "400005"}}
}}


Question:
"what is the risk score for project 400005?"

Expected:
{{
  "intent": "ML",
  "operation": "GET_PREDICTION",
  "project_code": "400005",
  "dimension": null,
  "metric": "risk",
  "sort_order": null,
  "limit": null,
  "filters": {{"project_code": "400005"}}
}}

Question:
"tell me the top critical projects"

Expected:
{
  "intent": "ANALYTICS",
  "operation": "LIST_PROJECTS",
  "project_code": null,
  "dimension": "project",
  "metric": "risk",
  "sort_order": "descending",
  "limit": 10,
  "filters": {
    "risk_level": "Critical"
  }
}

Question:
"critical projects name"

Expected:
{
  "intent": "ANALYTICS",
  "operation": "LIST_PROJECTS",
  "project_code": null,
  "dimension": "project",
  "metric": "risk",
  "sort_order": "descending",
  "limit": null,
  "filters": {
    "risk_level": "Critical"
  }
}

Now classify the user's question according to the rules and examples above.

Return ONLY valid JSON.
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