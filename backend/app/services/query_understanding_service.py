"""
NIRMAAN AI Query Understanding Service.

Purpose
-------
Use Gemini as the semantic routing layer for EVERY assistant query.
Gemini does not answer the user's project/data question here. It converts
natural language (English, Hinglish, mixed language, spelling variations,
follow-ups, and combined requests) into a validated structured execution plan.

Execution authority remains in the deterministic NIRMAAN backend:
    FACT       -> PostgreSQL project facts
    ML         -> existing NIRMAAN ML engine / predictions
    ANALYTICS  -> PostgreSQL portfolio analytics
    RAG        -> local pgvector/keyword retrieval + final Gemini answer
    HYBRID     -> PostgreSQL + ML + RAG + final Gemini answer
    GENERAL    -> final Gemini conversational answer

Important:
The query-understanding model selects the semantic layer. It must never invent
facts, project values, project codes, or database content.
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

PROJECT_CODE_PATTERN = re.compile(r"\b\d{5,8}\b")


# ============================================================================
# SYSTEM INSTRUCTION
# ============================================================================

QUERY_UNDERSTANDING_INSTRUCTION = """
You are the semantic query-understanding layer for NIRMAAN AI.

Your ONLY task is to understand the user's message and return one structured
JSON execution plan.

You must NOT answer the user's question.
You must NOT invent facts.
You must NOT invent project codes.
You must NOT invent project names, ministries, sectors, states, dates, costs,
risk values, predictions, or statuses.

The backend will execute your plan using authoritative NIRMAAN sources.

==========================================================================
AVAILABLE EXECUTION LAYERS
==========================================================================

FACT
    Specific observed information about one project from PostgreSQL.

ML
    Existing NIRMAAN predictions and model outputs for a project.
    Examples include risk score, risk level, delay probability, stall
    probability, predicted cost overrun, cost risk, warnings and priority.

RAG
    General infrastructure/project-management knowledge from the NIRMAAN
    curated knowledge base. Use for research, guidance, causes, practices,
    mitigation knowledge, recommendations, procurement, contract management,
    schedule management, and other general domain knowledge.

HYBRID
    A project-specific reasoning request that needs project facts and/or ML
    outputs together with general knowledge. Use this when the user asks
    WHY, CAUSE, REASON, MITIGATION, RECOMMENDATION, or similar reasoning about
    a specific project, or explicitly combines observed project information
    with predictions/general guidance.

ANALYTICS
    Portfolio-level questions across multiple projects: counts, lists,
    grouping, ranking, highest/lowest risk, delayed projects, summaries by
    state/ministry/sector, and other portfolio analysis.

GENERAL
    Greetings, acknowledgements, casual conversation, capability questions,
    ordinary small talk, or requests that do not need NIRMAAN project/ML/RAG/
    analytics data.

==========================================================================
CORE RULES
==========================================================================

1. EVERY user message must be classified into exactly one primary intent.

2. The selected project code supplied by the UI is CONTEXT ONLY.
   Never assume a question is project-specific merely because a project is
   selected in the UI.

3. Explicit project references in the user's message are authoritative for
   identifying the subject, but the project code itself must be copied exactly
   from the message or from the supplied SELECTED PROJECT CODE when the user
   clearly uses follow-up wording referring to that selected project.

4. Understand English, Hinglish, mixed English/Hindi, common typos,
   transliteration, and natural conversational phrasing.

5. Do not require formal English.
   Examples such as:
       "goa me kitne projects hain"
       "project 400005 ka risk kya hai"
       "400005 kis ministry ke under hai"
       "project 400005 ke bare me batao"
   must be understood by meaning.

6. Simple conversation MUST be GENERAL.
   Examples:
       "hi"
       "hello"
       "hey"
       "good morning"
       "good afternoon"
       "good evening"
       "thanks"
       "thank you"
       "thanks a lot"
       "okay"
       "ok"
       "cool"
       "great"
       "nice"
       "who are you?"
       "what are you?"
       "what can you do?"
       "help"
       "help me"
       "how are you?"
       "what's up?"

7. A greeting or acknowledgement must NEVER become ANALYTICS, FACT, ML,
   RAG, or HYBRID merely because a project is selected.

8. FACT is for OBSERVED project information, not predictions.

   Typical FACT requests:
       name
       project name
       ministry
       sector
       state
       location
       implementing agency
       agency
       original completion
       original completion date
       revised completion
       revised completion date
       schedule status
       cost status
       original cost
       approved cost
       expenditure
       spending
       physical progress
       progress
       recorded delay
       delay days
       project details
       project information

   A general request for the details of ONE specific project is also FACT.

   Examples:
       "tell me about project 400005"
       "tell me about project 400005?"
       "give me details of project 400005"
       "project 400005 ke bare me batao"
       "project 400005 ke baare mein details do"
       "400005 ki information do"

9. ML is for EXISTING NIRMAAN predictions or derived model outputs.

   Typical ML requests:
       risk score
       risk level
       overall risk
       future delay probability
       delay probability
       delay prediction
       progress stall probability
       stall prediction
       predicted cost
       predicted cost overrun
       cost risk
       early warning
       warning
       priority
       model prediction
       prediction
       predict

10. RAG is for GENERAL KNOWLEDGE, even when a project is selected.

    Typical RAG requests:
       research
       study
       studies
       guideline
       guidelines
       government guidance
       best practice
       best practices
       procurement practices
       contract management
       schedule management
       project management practices
       common causes
       root causes
       mitigation strategies
       recommendations
       infrastructure knowledge

    Examples:
       "what are common causes of infrastructure delays?"
       "infrastructure projects me delay kyun hota hai?"
       "what are best practices for contract management?"
       "procurement delays kaise reduce karein?"
       "according to research what causes schedule overruns?"
       "project delays ke common reasons kya hote hain?"

11. HYBRID is for PROJECT-SPECIFIC REASONING or explicit combined evidence.

    Use HYBRID when the question requires the project facts and/or ML outputs
    plus general knowledge, explanation, cause analysis, mitigation, or
    recommendations.

    Examples:
       "why is project 400005 delayed?"
       "project 400005 risky kyu hai?"
       "what is causing this project's delay?"
       "how can project 400005 be mitigated?"
       "project 400005 ka risk aur uske reasons batao"
       "tell me about project 400005 and explain its risk"
       "project 400005 ki details aur prediction dono batao"
       "project 400005 ke delay ke causes kya hain?"
       "project 400005 ke liye mitigation kya honi chahiye?"

12. ANALYTICS is for PORTFOLIO-level questions, not one project's facts.

    Typical ANALYTICS requests:
       counts
       project lists
       grouped counts
       projects by state
       projects by ministry
       projects by sector
       delayed projects
       critical projects
       highest risk ministry
       highest risk sector
       risk ranking
       portfolio summaries
       portfolio comparisons

    Examples:
       "how many projects are in Goa?"
       "Goa me kitne projects hain?"
       "Gujarat me kitne projects hai?"
       "UP me kaun se projects delayed hain?"
       "how many projects are in each state?"
       "project count by ministry"
       "project count by sector"
       "which ministry has the highest project risk?"
       "sabse risky ministry kaunsi hai?"
       "list critical projects"
       "top 10 critical projects"
       "kaun se projects delayed hain?"

13. A request mentioning one project can still be FACT, ML, or HYBRID.

    Examples:
       "tell me about project 400005"
           -> FACT

       "project 400005 ka risk kya hai"
           -> ML

       "project 400005 delay kyu hai"
           -> HYBRID

       "project 400005 details and risk"
           -> HYBRID

       "project 400005 ke causes of delay"
           -> HYBRID

14. Combined questions:

    - If several requested elements belong naturally to the same project and
      require facts + predictions + general reasoning, use HYBRID.

    - If the question is about a portfolio and asks for count/list/group/rank,
      use ANALYTICS.

    - If the question only asks for observed facts of one project, use FACT.

    - If the question only asks for predictions of one project, use ML.

    - Never select a more complex layer merely because multiple keywords appear.

15. Multi-project requests:

    "compare project 400005 and 400006"
        -> FACT / ANSWER

    "compare the risk of project 400005 and 400006"
        -> ML / GET_PREDICTION

    "400005 aur 400006 me kis project ka risk zyada hai?"
        -> ML / GET_PREDICTION

    "why is 400005 riskier than 400006?"
        -> HYBRID / ANSWER

    "compare both projects and explain why one is delayed"
        -> HYBRID / ANSWER

16. Follow-up wording:

       "it"
       "this project"
       "that project"
       "this one"
       "that one"
       "its risk"
       "its delay"
       "its progress"
       "its cost"
       "its schedule"
       "tell me more about it"
       "tell me about it"
       "give me details about it"
       "iske bare me batao"
       "iske baare mein batao"
       "iska risk kya hai"
       "iska delay kya hai"
       "iska cost kya hai"

    If SELECTED PROJECT CODE is supplied and the wording clearly refers to
    that project, use the selected project code as project context.

17. Do NOT use SELECTED PROJECT CODE for unrelated questions such as:

       "hi"
       "what are common causes of delay?"
       "how many projects are in Goa?"
       "what can you do?"

18. If the user explicitly names a numeric project code, extract it exactly.
    Valid project-code shape is 5 to 8 digits.

19. Never invent a missing project code.

20. ANALYTICS operations:

       COUNT_PROJECTS
           User wants a count of projects.

       LIST_PROJECTS
           User wants the actual project records matching filters.

       LIST_DIMENSIONS
           User wants grouped counts such as:
               project count by state
               project count by ministry
               project count by sector

       HIGHEST_RISK
           User wants the entity with highest project risk, normally a
           ministry or sector.

21. ANALYTICS details:

       COUNT_PROJECTS
           dimension should normally be:
               state
               ministry
               sector
           metric should be:
               project_count

       LIST_PROJECTS
           dimension should normally be:
               project
           use filters such as:
               risk_level
               schedule_status
               state
               ministry
               sector
               search

       LIST_DIMENSIONS
           dimension should be:
               state
               ministry
               sector
           metric should be:
               project_count

       HIGHEST_RISK
           dimension should normally be:
               ministry
               sector
           metric must be:
               risk
           sort_order should be:
               descending
           limit should normally be:
               1
           unless user explicitly requests another limit.

22. RAG retrieval:

    Create:
        retrieval_query
            concise semantic query suitable for retrieval

        retrieval_keywords
            useful keyword phrases

    Do not put the factual answer in these fields.

23. For RAG, preserve the semantic meaning of the original question.
    The retrieval query may be reformulated for better semantic/keyword
    retrieval, but must not introduce facts not present in the question.

24. For GENERAL, do not attach project filters or project codes unless they
    are explicitly needed for conversation context.

25. For FACT, ML, and HYBRID, project_code is required for deterministic
    project execution.

26. If a project-specific intent is selected but no project code is available,
    do not invent one. Keep project_code null so the backend can request the
    project code instead of fabricating project data.

27. If intent is genuinely unclear, choose GENERAL instead of guessing.

28. Return ONLY valid JSON.

==========================================================================
OUTPUT SHAPE
==========================================================================

{
  "intent": "FACT | ML | RAG | HYBRID | ANALYTICS | GENERAL",
  "operation": "ANSWER | GET_FACT | GET_PREDICTION | COUNT_PROJECTS | LIST_PROJECTS | LIST_DIMENSIONS | HIGHEST_RISK | SEARCH_KNOWLEDGE",
  "project_code": null,
  "dimension": null,
  "metric": null,
  "sort_order": null,
  "limit": null,
  "filters": {},
  "retrieval_query": "",
  "retrieval_keywords": [],
  "normalized_query": "",
  "needs_generation": false
}

==========================================================================
DECISION EXAMPLES
==========================================================================

"hi"
-> GENERAL / ANSWER

"hello"
-> GENERAL / ANSWER

"hello, how are you?"
-> GENERAL / ANSWER

"what can you do?"
-> GENERAL / ANSWER

"thanks"
-> GENERAL / ANSWER

"help me"
-> GENERAL / ANSWER

"tell me about project 400005"
-> FACT / GET_FACT / project_code=400005

"tell me about project 400005?"
-> FACT / GET_FACT / project_code=400005

"give me details of project 400005"
-> FACT / GET_FACT / project_code=400005

"project 400005 ke bare me batao"
-> FACT / GET_FACT / project_code=400005

"project 400005 ke baare mein details do"
-> FACT / GET_FACT / project_code=400005

"400005 kis ministry ke under hai?"
-> FACT / GET_FACT / project_code=400005

"what is the state of project 400005?"
-> FACT / GET_FACT / project_code=400005

"project 400005 ka status kya hai?"
-> FACT / GET_FACT / project_code=400005

"what is the risk score for project 400005?"
-> ML / GET_PREDICTION / project_code=400005 / metric=risk

"project 400005 ka risk kya hai?"
-> ML / GET_PREDICTION / project_code=400005 / metric=risk

"project 400005 ki delay probability kya hai?"
-> ML / GET_PREDICTION / project_code=400005 / metric=delay

"project 400005 ka predicted cost overrun kya hai?"
-> ML / GET_PREDICTION / project_code=400005 / metric=cost

"why is project 400005 delayed?"
-> HYBRID / ANSWER / project_code=400005

"project 400005 delay kyu ho raha hai?"
-> HYBRID / ANSWER / project_code=400005

"project 400005 risky kyu hai?"
-> HYBRID / ANSWER / project_code=400005

"project 400005 ka risk aur reasons batao"
-> HYBRID / ANSWER / project_code=400005

"how can project 400005's delay be mitigated?"
-> HYBRID / ANSWER / project_code=400005

"what are common causes of infrastructure delays?"
-> RAG / SEARCH_KNOWLEDGE

"infrastructure projects me delay ke common causes kya hain?"
-> RAG / SEARCH_KNOWLEDGE

"project delays ke common reasons kya hote hain?"
-> RAG / SEARCH_KNOWLEDGE

"what are best practices for contract management?"
-> RAG / SEARCH_KNOWLEDGE

"procurement delays kaise reduce karein?"
-> RAG / SEARCH_KNOWLEDGE

"goa me kitne projects hain?"
-> ANALYTICS / COUNT_PROJECTS / dimension=state / metric=project_count / state=Goa

"gujrat me kitne projects hain?"
-> ANALYTICS / COUNT_PROJECTS / dimension=state / metric=project_count / state=Gujarat

"UP me kaun se projects delayed hain?"
-> ANALYTICS / LIST_PROJECTS / dimension=state / state=Uttar Pradesh / schedule_status=Delayed

"sabse risky ministry kaunsi hai?"
-> ANALYTICS / HIGHEST_RISK / dimension=ministry / metric=risk / descending / limit=1

"which sector has the highest risk?"
-> ANALYTICS / HIGHEST_RISK / dimension=sector / metric=risk / descending / limit=1

"top 10 critical projects"
-> ANALYTICS / LIST_PROJECTS / dimension=project / metric=risk / descending / limit=10 / risk_level=Critical

"critical projects name"
-> ANALYTICS / LIST_PROJECTS / dimension=project / metric=risk / descending / risk_level=Critical

"how many projects are in each state?"
-> ANALYTICS / LIST_DIMENSIONS / dimension=state / metric=project_count

"how many projects are in each ministry?"
-> ANALYTICS / LIST_DIMENSIONS / dimension=ministry / metric=project_count

"project count by sector"
-> ANALYTICS / LIST_DIMENSIONS / dimension=sector / metric=project_count

"compare project 400005 and 400006"
-> FACT / ANSWER

"compare risk of project 400005 and 400006"
-> ML / GET_PREDICTION

"400005 aur 400006 me kis project ka risk zyada hai?"
-> ML / GET_PREDICTION

"why is 400005 riskier than 400006?"
-> HYBRID / ANSWER

"project 400005 details and risk"
-> HYBRID / ANSWER / project_code=400005

"project 400005 ki details aur prediction dono batao"
-> HYBRID / ANSWER / project_code=400005

"tell me about project 400005 and explain its risk"
-> HYBRID / ANSWER / project_code=400005

"its risk kya hai?"
with SELECTED PROJECT CODE 400005
-> ML / GET_PREDICTION / project_code=400005 / metric=risk

"iska risk kya hai?"
with SELECTED PROJECT CODE 400005
-> ML / GET_PREDICTION / project_code=400005 / metric=risk

"iske bare me batao"
with SELECTED PROJECT CODE 400005
-> FACT / GET_FACT / project_code=400005

"tell me more about it"
with SELECTED PROJECT CODE 400005
-> FACT / GET_FACT / project_code=400005

"what are common causes of delays?"
with SELECTED PROJECT CODE 400005
-> RAG / SEARCH_KNOWLEDGE

"project 400005 ke delay ke reasons kya hain?"
-> HYBRID / ANSWER / project_code=400005

"project 400005 ko improve kaise karein?"
-> HYBRID / ANSWER / project_code=400005

"project 400005 ka cost status kya hai aur risk kitna hai?"
-> HYBRID / ANSWER / project_code=400005

"state wise projects kitne hain?"
-> ANALYTICS / LIST_DIMENSIONS / dimension=state / metric=project_count

"ministry wise project count batao"
-> ANALYTICS / LIST_DIMENSIONS / dimension=ministry / metric=project_count

"sector wise kitne projects hain?"
-> ANALYTICS / LIST_DIMENSIONS / dimension=sector / metric=project_count

"delayed projects in Goa"
-> ANALYTICS / LIST_PROJECTS / dimension=state / state=Goa / schedule_status=Delayed

"critical projects in Maharashtra"
-> ANALYTICS / LIST_PROJECTS / dimension=project / state=Maharashtra / risk_level=Critical

"how many critical projects are there?"
-> ANALYTICS / LIST_PROJECTS / dimension=project / risk_level=Critical

"which projects have high risk?"
-> ANALYTICS / LIST_PROJECTS / dimension=project / risk_level=High

"which ministry has the highest average risk?"
-> ANALYTICS / HIGHEST_RISK / dimension=ministry / metric=risk / descending / limit=1

"which sector is most risky?"
-> ANALYTICS / HIGHEST_RISK / dimension=sector / metric=risk / descending / limit=1

"what is causing project 400005 risk?"
-> HYBRID / ANSWER / project_code=400005

"400005 risky kyu hai aur kya karna chahiye?"
-> HYBRID / ANSWER / project_code=400005

"risk of 400005 and 400006"
-> ML / GET_PREDICTION

"compare 400005 aur 400006 ke details"
-> FACT / ANSWER

"compare 400005 aur 400006 ka risk aur explain karo"
-> HYBRID / ANSWER

Remember:
    Understand the complete meaning of the user's message.
    Do not classify by isolated keywords.
    Do not invent missing information.
    Do not turn general knowledge into project-specific facts.
    Do not turn greetings into analytics.
    Do not treat a selected project as proof of intent.
    Return ONLY valid JSON.
""".strip()


# ============================================================================
# JSON EXTRACTION
# ============================================================================


def _extract_json(
    text: str,
) -> dict[str, Any]:
    """
    Extract a JSON object from Gemini output.

    Supports:
        - plain JSON
        - markdown JSON fences
        - accidental text surrounding the object
    """

    raw = str(
        text or ""
    ).strip()

    if not raw:
        raise ValueError(
            "Gemini returned an empty query-understanding response."
        )

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
    ).strip()

    try:
        parsed = json.loads(
            raw
        )

    except json.JSONDecodeError:

        start = raw.find(
            "{"
        )

        end = raw.rfind(
            "}"
        )

        if start < 0 or end <= start:
            raise ValueError(
                "Gemini did not return valid query-understanding JSON."
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
# NORMALIZATION HELPERS
# ============================================================================


def _normalize_query(
    query: str,
) -> str:
    return " ".join(
        str(
            query
        ).strip().lower().split()
    )


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

    match = PROJECT_CODE_PATTERN.search(
        text
    )

    return (
        match.group(0)
        if match
        else None
    )


def _extract_project_code_from_query(
    query: str,
) -> str | None:

    match = PROJECT_CODE_PATTERN.search(
        str(
            query
        )
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


def _is_project_followup(
    query: str,
) -> bool:

    normalized = _normalize_query(
        query
    )

    followup_phrases = (
        "it",
        "this",
        "this project",
        "that project",
        "that one",
        "this one",
        "its risk",
        "its delay",
        "its progress",
        "its cost",
        "its schedule",
        "iska",
        "iske",
        "iske bare me",
        "iske bare mein",
        "iske baare me",
        "iske baare mein",
        "iska risk",
        "iska delay",
        "iska cost",
        "iska progress",
        "iska schedule",
        "tell me more about it",
        "tell me about it",
        "give me details about it",
        "give me information about it",
        "about it",
    )

    for phrase in followup_phrases:

        if re.search(
            rf"(?<!\w){re.escape(phrase)}(?!\w)",
            normalized,
        ):
            return True

    return False


def _normalize_query_plan(
    plan: dict[str, Any],
    question: str,
    selected_project_code: str | None,
) -> dict[str, Any]:
    """
    Validate and normalize the Gemini-generated plan.

    This function does not answer the question.
    It makes the semantic plan safe for deterministic backend execution.
    """

    normalized_question = _normalize_query(
        question
    )

    intent = str(
        plan.get(
            "intent"
        )
        or "GENERAL"
    ).strip().upper()

    if intent not in VALID_INTENTS:
        intent = "GENERAL"

    operation = str(
        plan.get(
            "operation"
        )
        or "ANSWER"
    ).strip().upper()

    if operation not in VALID_OPERATIONS:
        operation = "ANSWER"

    explicit_project_code = (
        _extract_project_code_from_query(
            question
        )
    )

    proposed_project_code = (
        _normalize_project_code(
            plan.get(
                "project_code"
            )
        )
    )

    selected_project = (
        _normalize_project_code(
            selected_project_code
        )
        if selected_project_code
        else None
    )

    # Explicit project code in the actual question takes precedence.
    project_code = (
        explicit_project_code
        or proposed_project_code
    )

    # Follow-up wording can inherit the selected project.
    if (
        not project_code
        and selected_project
        and _is_project_followup(
            question
        )
    ):
        project_code = selected_project

    filters = _normalize_filters(
        plan.get(
            "filters"
        )
    )

    # Synchronize project code with filters.
    if explicit_project_code:

        filters[
            "project_code"
        ] = explicit_project_code

    elif (
        project_code
        and intent in {
            "FACT",
            "ML",
            "HYBRID",
        }
    ):

        filters[
            "project_code"
        ] = project_code

    retrieval_query = str(
        plan.get(
            "retrieval_query"
        )
        or ""
    ).strip()

    retrieval_keywords_raw = plan.get(
        "retrieval_keywords"
    )

    if isinstance(
        retrieval_keywords_raw,
        list,
    ):

        retrieval_keywords = [
            str(
                item
            ).strip()
            for item in retrieval_keywords_raw
            if str(
                item
            ).strip()
        ][:10]

    else:
        retrieval_keywords = []

    normalized_query = str(
        plan.get(
            "normalized_query"
        )
        or ""
    ).strip()

    if not normalized_query:
        normalized_query = question.strip()

    dimension = str(
        plan.get(
            "dimension"
        )
        or ""
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
        )
        or ""
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
        )
        or ""
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
            int(
                limit_value
            )
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

    needs_generation = bool(
        plan.get(
            "needs_generation",
            False,
        )
    )

    # ------------------------------------------------------------------
    # INTENT NORMALIZATION
    # ------------------------------------------------------------------

    if intent == "GENERAL":

        operation = "ANSWER"

        # General questions should not carry project filters.
        project_code = None
        filters = {}

        retrieval_query = ""
        retrieval_keywords = []

        needs_generation = True

    elif intent == "FACT":

        operation = "GET_FACT"
        needs_generation = False

        if not project_code:

            # No project = unsafe for the deterministic project-data layer.
            # Fall back to GENERAL rather than inventing a project.
            intent = "GENERAL"
            operation = "ANSWER"
            filters = {}
            project_code = None
            retrieval_query = ""
            retrieval_keywords = []
            needs_generation = True

    elif intent == "ML":

        operation = "GET_PREDICTION"
        needs_generation = False

        if not project_code:

            # A portfolio risk request is analytics.
            if (
                dimension in {
                    "project",
                    "ministry",
                    "sector",
                }
                or metric == "risk"
                or filters.get(
                    "risk_level"
                )
            ):

                intent = "ANALYTICS"

                if dimension in {
                    "ministry",
                    "sector",
                }:

                    operation = "HIGHEST_RISK"

                    metric = "risk"
                    sort_order = "descending"

                    if limit_value is None:
                        limit_value = 1

                else:

                    operation = "LIST_PROJECTS"

                    dimension = "project"

            else:

                intent = "GENERAL"
                operation = "ANSWER"
                project_code = None
                filters = {}
                retrieval_query = ""
                retrieval_keywords = []
                needs_generation = True

    elif intent == "HYBRID":

        operation = "ANSWER"
        needs_generation = True

        if not project_code:

            # Do not invent a project for a project-specific hybrid request.
            if not selected_project:

                intent = "GENERAL"
                operation = "ANSWER"
                project_code = None
                filters = {}
                retrieval_query = ""
                retrieval_keywords = []
                needs_generation = True

            else:

                project_code = selected_project

                filters[
                    "project_code"
                ] = project_code

    elif intent == "RAG":

        operation = "SEARCH_KNOWLEDGE"
        needs_generation = True

        if not retrieval_query:
            retrieval_query = question.strip()

    elif intent == "ANALYTICS":

        # Portfolio analytics must not inherit selected-project context.
        project_code = None

        filters.pop(
            "project_code",
            None,
        )

        needs_generation = False

        # --------------------------------------------------------------
        # COUNT PROJECTS
        # --------------------------------------------------------------

        if operation == "COUNT_PROJECTS":

            if dimension not in {
                "state",
                "ministry",
                "sector",
            }:

                intent = "GENERAL"
                operation = "ANSWER"
                filters = {}
                needs_generation = True

            else:

                metric = "project_count"

        # --------------------------------------------------------------
        # LIST DIMENSIONS
        # --------------------------------------------------------------

        elif operation == "LIST_DIMENSIONS":

            if dimension not in {
                "state",
                "ministry",
                "sector",
            }:

                intent = "GENERAL"
                operation = "ANSWER"
                filters = {}
                needs_generation = True

            else:

                metric = "project_count"

                if not sort_order:
                    sort_order = "descending"

        # --------------------------------------------------------------
        # LIST PROJECTS
        # --------------------------------------------------------------

        elif operation == "LIST_PROJECTS":

            dimension = "project"

        # --------------------------------------------------------------
        # HIGHEST RISK
        # --------------------------------------------------------------

        elif operation == "HIGHEST_RISK":

            if dimension not in {
                "ministry",
                "sector",
                "project",
            }:

                if filters.get(
                    "risk_level"
                ):

                    operation = "LIST_PROJECTS"
                    dimension = "project"
                    metric = metric or "risk"

                else:

                    intent = "GENERAL"
                    operation = "ANSWER"
                    filters = {}
                    needs_generation = True

            elif dimension == "project":

                operation = "LIST_PROJECTS"
                metric = metric or "risk"

            else:

                metric = "risk"
                sort_order = "descending"

                if limit_value is None:
                    limit_value = 1

        # --------------------------------------------------------------
        # UNKNOWN ANALYTICS OPERATION
        # --------------------------------------------------------------

        else:

            intent = "GENERAL"
            operation = "ANSWER"
            filters = {}
            needs_generation = True

    # ------------------------------------------------------------------
    # FINAL NORMALIZATION
    # ------------------------------------------------------------------

    if intent == "GENERAL":

        project_code = None
        operation = "ANSWER"
        filters = {}

        retrieval_query = ""
        retrieval_keywords = []

        needs_generation = True

    elif intent == "FACT":

        operation = "GET_FACT"

        if project_code:
            filters[
                "project_code"
            ] = project_code

    elif intent == "ML":

        operation = "GET_PREDICTION"

        if project_code:
            filters[
                "project_code"
            ] = project_code

    elif intent == "HYBRID":

        operation = "ANSWER"

        if project_code:
            filters[
                "project_code"
            ] = project_code

    elif intent == "RAG":

        operation = "SEARCH_KNOWLEDGE"

        if not retrieval_query:
            retrieval_query = question.strip()

    elif intent == "ANALYTICS":

        project_code = None

        filters.pop(
            "project_code",
            None,
        )

        if operation == "COUNT_PROJECTS":
            metric = "project_count"

        elif operation == "LIST_DIMENSIONS":
            metric = "project_count"

        elif operation == "HIGHEST_RISK":
            metric = "risk"
            sort_order = "descending"

            if limit_value is None:
                limit_value = 1

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
        "normalized_query": normalized_query,
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
    Convert one user message into a normalized NIRMAAN execution plan.

    Every call is sent through Gemini's query-understanding layer.
    Gemini decides the semantic intent; the backend validates and normalizes
    the returned structured plan.
    """

    query = str(
        question
    ).strip()

    if not query:
        raise ValueError(
            "question is required."
        )

    selected_project = (
        _normalize_project_code(
            project_code
        )
        or "NONE"
    )

    prompt = f"""
SELECTED PROJECT CODE:
{selected_project}

USER QUESTION:
{query}

You must classify the user's actual message.

Return ONLY valid JSON using this exact shape:

{{
  "intent": "FACT | ML | RAG | HYBRID | ANALYTICS | GENERAL",
  "operation": "ANSWER | GET_FACT | GET_PREDICTION | COUNT_PROJECTS | LIST_PROJECTS | LIST_DIMENSIONS | HIGHEST_RISK | SEARCH_KNOWLEDGE",
  "project_code": null,
  "dimension": null,
  "metric": null,
  "sort_order": null,
  "limit": null,
  "filters": {{}},
  "retrieval_query": "",
  "retrieval_keywords": [],
  "normalized_query": "",
  "needs_generation": false
}}

The selected project code is context only.

Examples:

"hi"
-> GENERAL

"hello"
-> GENERAL

"tell me about project 400005"
-> FACT / GET_FACT / project_code=400005

"project 400005 ke bare me batao"
-> FACT / GET_FACT / project_code=400005

"project 400005 ka risk kya hai"
-> ML / GET_PREDICTION / project_code=400005

"project 400005 delay kyu ho raha hai"
-> HYBRID / ANSWER / project_code=400005

"goa me kitne projects hain"
-> ANALYTICS / COUNT_PROJECTS / state=Goa

"UP me kaun se projects delayed hain"
-> ANALYTICS / LIST_PROJECTS / state=Uttar Pradesh / schedule_status=Delayed

"common causes of infrastructure delays"
-> RAG / SEARCH_KNOWLEDGE

"iske bare me batao"
with a selected project
-> FACT / GET_FACT using selected project context

"iska risk kya hai"
with a selected project
-> ML / GET_PREDICTION using selected project context

Do not invent project codes or facts.
Do not classify greetings as analytics.
Understand English, Hinglish and mixed-language meaning.
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
        plan,
        question=query,
        selected_project_code=project_code,
    )

    # Keep usage/model information available to the caller for diagnostics.
    normalized["model"] = response.get(
        "model"
    )

    normalized["usage"] = response.get(
        "usage",
        {},
    )

    return normalized