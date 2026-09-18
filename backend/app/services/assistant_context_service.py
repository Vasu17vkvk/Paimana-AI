"""
NIRMAAN AI Assistant Context Service.

This service prepares a compact, authoritative context object for the AI
assistant.

SOURCE OF TRUTH RULES
---------------------
Observed project facts:
    Existing PostgreSQL-backed Project Analytics service

Predictions:
    Existing NIRMAAN ML models

RAG knowledge:
    Handled separately by rag_service.py

Gemini:
    Explains and synthesizes supplied context.
    Gemini must not recalculate or invent project-specific metrics.
"""

from __future__ import annotations

from typing import Any


# Existing Project Analytics service.
#
# IMPORTANT:
# This is the same service that currently exposes get_project_detail().
#
# If your existing file has a different module name, change ONLY this import.
from app.services.project_analytics_service import (
    get_project_detail,
)


# Keep the assistant context intentionally small.
# This reduces Gemini input tokens later.
MAX_HISTORY_ROWS = 6
MAX_PROGRESS_ROWS = 8
MAX_DELAY_INDICATORS = 6


# ============================================================
# HELPERS
# ============================================================

def _clean_text(value: Any) -> str | None:
    """
    Convert a value into a compact string representation.
    """
    if value is None:
        return None

    text = str(value).strip()

    return text or None


def _clean_number(value: Any) -> float | None:
    """
    Convert numeric values safely.
    """
    if value is None:
        return None

    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _compact_record(
    record: dict[str, Any],
    allowed_keys: list[str],
) -> dict[str, Any]:
    """
    Keep only fields needed by the assistant.
    """
    result: dict[str, Any] = {}

    for key in allowed_keys:
        if key not in record:
            continue

        value = record[key]

        if value is None:
            continue

        result[key] = value

    return result


# ============================================================
# PROJECT CONTEXT
# ============================================================

def get_project_context(
    project_code: str,
) -> dict[str, Any]:
    """
    Build the authoritative assistant context for one project.

    The returned object intentionally separates:

        observed
        predictions
        indicators

    so Gemini can distinguish actual project records from ML outputs
    and rule-based evidence.
    """

    code = str(
        project_code
    ).strip()

    if not code:
        raise ValueError(
            "project_code is required."
        )

    detail = get_project_detail(
        code
    )

    if not isinstance(detail, dict):
        raise ValueError(
            f"Invalid project detail response for project {code}."
        )

    project = detail.get(
        "project"
    ) or {}

    key_facts = detail.get(
        "key_facts"
    ) or {}

    risk = detail.get(
        "risk"
    ) or {}

    delay_reasons = detail.get(
        "delay_reasons"
    ) or []

    history = detail.get(
        "history"
    ) or []

    progress_trajectory = detail.get(
        "progress_trajectory"
    ) or []

    # --------------------------------------------------------
    # Authoritative observed project facts
    # --------------------------------------------------------

    observed = {
        "project_code": project.get(
            "project_code",
            code,
        ),
        "project_name": _clean_text(
            project.get("project_name")
        ),
        "ministry": _clean_text(
            project.get("ministry")
        ),
        "sector": _clean_text(
            project.get("sector")
        ),
        "state": _clean_text(
            project.get("state")
        ),
        "implementing_agency": _clean_text(
            project.get("implementing_agency")
        ),
        "schedule_status": _clean_text(
            project.get("schedule_status")
        ),
        "cost_status": _clean_text(
            project.get("cost_status")
        ),
        "original_completion": _clean_text(
            project.get("original_completion")
        ),
        "revised_completion": _clean_text(
            project.get("revised_completion")
        ),
        "data_quality_flag": _clean_text(
            project.get("data_quality_flag")
        ),
        "data_completeness_score": _clean_number(
            project.get("data_completeness_score")
        ),
        "delay_days": _clean_number(
            key_facts.get("delay_days")
        ),
        "physical_progress_pct": _clean_number(
            key_facts.get("physical_progress_pct")
        ),
        "original_cost_cr": _clean_number(
            key_facts.get("original_cost_cr")
        ),
        "expenditure_cr": _clean_number(
            key_facts.get("expenditure_cr")
        ),
        "alert_priority": _clean_text(
            key_facts.get("alert_priority")
        ),
    }

    # --------------------------------------------------------
    # Authoritative ML predictions
    # --------------------------------------------------------

    predictions = {
        "future_delay_probability": _clean_number(
            risk.get("future_delay")
        ),
        "progress_stall_probability": _clean_number(
            risk.get("progress_stall")
        ),
        "predicted_cost_overrun": _clean_number(
            risk.get("predicted_cost_overrun")
        ),
        "cost_risk": _clean_number(
            risk.get("cost_risk")
        ),
        "overall_risk": _clean_number(
            risk.get("overall_risk")
        ),
        "risk_level": _clean_text(
            risk.get("risk_level")
        ),
    }

    # --------------------------------------------------------
    # Rule-based / record-based indicators
    #
    # IMPORTANT:
    # These are indicators, not causal findings.
    # --------------------------------------------------------

    observed_indicators: list[dict[str, Any]] = []

    for item in delay_reasons[
        :MAX_DELAY_INDICATORS
    ]:

        if not isinstance(item, dict):
            continue

        observed_indicators.append(
            {
                "title": _clean_text(
                    item.get("title")
                ),
                "explanation": _clean_text(
                    item.get("explanation")
                ),
                "recommended_solution": _clean_text(
                    item.get(
                        "recommended_solution"
                    )
                ),
            }
        )

    # --------------------------------------------------------
    # Recent historical observations
    #
    # Keep only the latest rows to avoid sending the entire
    # project history to Gemini.
    # --------------------------------------------------------

    recent_history: list[dict[str, Any]] = []

    if isinstance(history, list):

        for row in history[
            -MAX_HISTORY_ROWS:
        ]:

            if not isinstance(row, dict):
                continue

            recent_history.append(
                _compact_record(
                    row,
                    [
                        "snapshot_month",
                        "expenditure_cr",
                        "expenditure_change_cr",
                        "expenditure_growth_pct",
                        "revised_cost_cr",
                        "revised_cost_change_cr",
                        "cost_overrun_cr",
                        "cost_overrun_pct",
                        "schedule_change_days",
                        "delay_days",
                    ],
                )
            )

    # --------------------------------------------------------
    # Recent progress trajectory
    # --------------------------------------------------------

    recent_progress: list[dict[str, Any]] = []

    if isinstance(
        progress_trajectory,
        list,
    ):

        for row in progress_trajectory[
            -MAX_PROGRESS_ROWS:
        ]:

            if not isinstance(row, dict):
                continue

            recent_progress.append(
                _compact_record(
                    row,
                    [
                        "snapshot_date",
                        "physical_progress_pct",
                        "progress_change_pct",
                        "expenditure_cr",
                        "revised_cost_cr",
                    ],
                )
            )

    # --------------------------------------------------------
    # Final context
    # --------------------------------------------------------

    return {
        "project": observed,

        "predictions": predictions,

        "observed_indicators": observed_indicators,

        "recent_history": recent_history,

        "recent_progress": recent_progress,

        "metadata": {
            "project_code": code,
            "has_ml_snapshot": bool(
                detail.get(
                    "has_ml_snapshot",
                    False,
                )
            ),
            "sources": {
                "project_facts": (
                    "NIRMAAN PostgreSQL / "
                    "Project Analytics"
                ),
                "predictions": (
                    "NIRMAAN existing ML models"
                ),
                "observed_indicators": (
                    "NIRMAAN project records"
                ),
            },
            "rules": {
                "project_specific_numbers_must_not_be_generated_by_gemini": True,
                "observed_indicators_are_not_proven_causes": True,
                "rag_is_not_the_source_of_project_specific_metrics": True,
            },
        },
    }


# ============================================================
# PORTFOLIO CONTEXT
# ============================================================

def get_project_context_safe(
    project_code: str,
) -> dict[str, Any]:
    """
    Safe wrapper for API/service usage.
    """
    try:
        return get_project_context(
            project_code
        )

    except ValueError:
        raise

    except Exception as exc:
        raise RuntimeError(
            "Failed to build assistant project context."
        ) from exc