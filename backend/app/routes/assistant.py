from __future__ import annotations

from typing import Any

from flask import Blueprint, current_app, jsonify, request
from sqlalchemy import text

from app.extensions import db
from app.services.assistant_service import answer_query

from app.services.query_understanding_service import (
    understand_query,
)

assistant_bp = Blueprint(
    "assistant",
    __name__,
)


# ============================================================
# ASSISTANT QUERY
# ============================================================

@assistant_bp.route(
    "/query",
    methods=["POST"],
)
def assistant_query():
    """
    Main AI assistant endpoint.

    Expected JSON:

    {
        "question": "What is the physical progress?",
        "project_code": "400005"
    }
    """

    data: dict[str, Any] = request.get_json(
        silent=True
    ) or {}

    question = data.get("question")
    project_code = data.get("project_code")

    # --------------------------------------------------------
    # Validate question
    # --------------------------------------------------------

    if not isinstance(question, str) or not question.strip():
        return jsonify(
            {
                "success": False,
                "error": "Question is required.",
            }
        ), 400

    question = question.strip()

    # --------------------------------------------------------
    # Normalize project code
    # --------------------------------------------------------

    if project_code is not None:
        project_code = str(project_code).strip()

        if not project_code:
            project_code = None

    def _query_from_understanding_plan(
        original_query: str,
        plan: dict[str, Any],
    ) -> str:
        """
        Convert Gemini's structured query plan into a canonical query
        understood by the existing deterministic backend.

        Gemini decides WHAT the user wants.
        The existing backend decides HOW to retrieve the data.
        """

        intent = str(
            plan.get("intent")
            or ""
        ).upper()

        operation = str(
            plan.get("operation")
            or ""
        ).upper()

        filters = plan.get(
            "filters"
        ) or {}

        # ---------------------------------------------------------------
        # ANALYTICS
        # ---------------------------------------------------------------

        if intent == "ANALYTICS":

            state = str(
                filters.get("state")
                or ""
            ).strip()

            schedule_status = str(
                filters.get("schedule_status")
                or ""
            ).strip()

            if (
                operation == "LIST_PROJECTS"
                and state
                and schedule_status
            ):
                return (
                    f"list {schedule_status.lower()} "
                    f"projects in {state}"
                )

            if (
                operation == "COUNT_PROJECTS"
                and state
            ):
                return (
                    f"how many projects are in {state}"
                )

        # ---------------------------------------------------------------
        # RAG
        # ---------------------------------------------------------------

        if intent == "RAG":

            retrieval_query = str(
                plan.get(
                    "retrieval_query"
                )
                or ""
            ).strip()

            if retrieval_query:
                return retrieval_query

        return original_query        

    # --------------------------------------------------------
    # Run assistant
    # --------------------------------------------------------

    try:

        result = answer_query(
            question=question,
            project_code=project_code,
        )

        return jsonify(
            {
                "success": True,
                "data": result,
            }
        ), 200

    except ValueError as exc:

        return jsonify(
            {
                "success": False,
                "error": str(exc),
            }
        ), 400

    except Exception:

        current_app.logger.exception(
            "Assistant query failed"
        )

        return jsonify(
            {
                "success": False,
                "error": (
                    "Assistant service failed. "
                    "Please check the backend logs."
                ),
            }
        ), 500


# ============================================================
# ASSISTANT HEALTH
# ============================================================

@assistant_bp.route(
    "/health",
    methods=["GET"],
)
def assistant_health():
    """
    Lightweight assistant health endpoint.
    """

    return jsonify(
        {
            "success": True,
            "service": "assistant",
            "status": "ok",
        }
    ), 200


# ============================================================
# PROJECT OPTIONS
# ============================================================

@assistant_bp.route(
    "/projects",
    methods=["GET"],
)
def assistant_projects():
    """
    Return all projects available to the AI assistant
    project selector.

    Data source:
        project_master

    Response:

    {
        "success": true,
        "count": 2155,
        "projects": [
            {
                "project_code": "400001",
                "project_name": "..."
            }
        ]
    }
    """

    try:

        query = text(
            """
            SELECT
                project_code,
                project_name
            FROM project_master
            WHERE project_code IS NOT NULL
            ORDER BY project_code ASC
            """
        )

        with db.engine.connect() as connection:

            rows = connection.execute(
                query
            ).mappings().all()

        projects = []

        for row in rows:

            project_code = row.get(
                "project_code"
            )

            project_name = row.get(
                "project_name"
            )

            if project_code is None:
                continue

            projects.append(
                {
                    "project_code": str(
                        project_code
                    ).strip(),
                    "project_name": (
                        str(project_name).strip()
                        if project_name is not None
                        else None
                    ),
                }
            )

        return jsonify(
            {
                "success": True,
                "count": len(projects),
                "projects": projects,
            }
        ), 200

    except Exception:

        current_app.logger.exception(
            "Assistant project list failed"
        )

        return jsonify(
            {
                "success": False,
                "error": (
                    "Unable to load assistant projects."
                ),
            }
        ), 500