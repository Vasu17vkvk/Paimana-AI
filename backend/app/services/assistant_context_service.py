"""
NIRMAAN AI Assistant Context Service.

Builds a compact, authoritative context object for the AI assistant.

Sources:
    Project facts:
        PostgreSQL-backed project_master data.

    Predictions:
        Existing canonical NIRMAAN ML engine.

    RAG knowledge:
        Handled separately by rag_service.py.

    Gemini:
        Receives the compact context and explains/synthesizes it.

Memory strategy:
    - Never load the entire project_master table for one project.
    - Never load the entire paimana_ml_ready table.
    - Monthly history is project-scoped.
    - FLASH history is project-scoped.
    - ML history is project-scoped.
"""

from __future__ import annotations

from typing import Any

import pandas as pd
from sqlalchemy import text

from app.extensions import db

from app.services.project_analytics_service import (
    delay_reasons,
    latest_ml_row,
    model_score_from_features,
    project_flash_history,
    project_history,
    solution_for_reason,
    _load_project_ml_history,
)


# ============================================================================
# CONFIGURATION
# ============================================================================

MAX_HISTORY_ROWS = 6
MAX_PROGRESS_ROWS = 8
MAX_DELAY_INDICATORS = 6


# ============================================================================
# HELPERS
# ============================================================================

def _clean_text(
    value: Any,
) -> str | None:
    """
    Convert a value to a compact JSON-safe string.
    """

    if value is None:
        return None

    if isinstance(
        value,
        pd.Timestamp,
    ):
        if pd.isna(value):
            return None

        return value.strftime(
            "%Y-%m-%d"
        )

    text_value = str(
        value
    ).strip()

    return text_value or None


def _clean_number(
    value: Any,
) -> float | None:
    """
    Convert numeric values safely.
    """

    if value is None:
        return None

    try:
        if pd.isna(value):
            return None

    except (
        TypeError,
        ValueError,
    ):
        pass

    try:
        return float(
            value
        )

    except (
        TypeError,
        ValueError,
    ):
        return None


def _clean_value(
    value: Any,
) -> Any:
    """
    Convert pandas/numpy scalar values into JSON-safe values.
    """

    if value is None:
        return None

    if isinstance(
        value,
        pd.Timestamp,
    ):
        if pd.isna(value):
            return None

        return value.strftime(
            "%Y-%m-%d"
        )

    try:
        if pd.isna(value):
            return None

    except (
        TypeError,
        ValueError,
    ):
        pass

    try:
        if hasattr(
            value,
            "item",
        ):
            value = value.item()

    except Exception:
        pass

    return value


def _compact_record(
    record: dict[str, Any],
    allowed_keys: list[str],
) -> dict[str, Any]:
    """
    Keep only fields required by the Assistant.
    """

    result: dict[str, Any] = {}

    for key in allowed_keys:

        if key not in record:
            continue

        value = _clean_value(
            record[key]
        )

        if value is None:
            continue

        result[key] = value

    return result


# ============================================================================
# PROJECT MASTER LOOKUP
# ============================================================================

def _load_project_master_row(
    project_code: str,
) -> pd.Series | None:
    """
    Load ONLY the requested project from project_master.

    This replaces the previous pattern:

        load_master()
            -> entire project_master table
            -> filter one project

    with:

        PostgreSQL
            -> WHERE project_code = ?
            -> one row
    """

    code = str(
        project_code
    ).strip()

    if not code:
        return None

    query = text(
        """
        SELECT *
        FROM "project_master"

        WHERE CAST(
            project_code AS TEXT
        ) = :project_code

        LIMIT 1
        """
    )

    with db.engine.connect() as connection:

        row = (
            connection.execute(
                query,
                {
                    "project_code": code,
                },
            )
            .mappings()
            .first()
        )

    if row is None:
        return None

    return pd.Series(
        row
    )


# ============================================================================
# PROJECT CONTEXT
# ============================================================================

def get_project_context(
    project_code: str,
) -> dict[str, Any]:
    """
    Build the authoritative Assistant context for one project.

    Uses project-scoped PostgreSQL queries and the existing canonical
    PAIMANA ML engine.
    """

    code = str(
        project_code
    ).strip()

    if not code:
        raise ValueError(
            "project_code is required."
        )

    # ------------------------------------------------------------------------
    # MASTER PROJECT DATA
    # ------------------------------------------------------------------------

    row = _load_project_master_row(
        code
    )

    if row is None:
        return {}

    # ------------------------------------------------------------------------
    # PROJECT-SCOPED HISTORY
    # ------------------------------------------------------------------------

    history = project_history(
        code
    )

    flash_history = project_flash_history(
        code
    )

    # ------------------------------------------------------------------------
    # LATEST PROJECT ML SNAPSHOT
    # ------------------------------------------------------------------------

    ml_row = latest_ml_row(
        code
    )

    risk: dict[str, Any] | None = None

    if ml_row is not None:

        try:

            risk = model_score_from_features(
                ml_row
            )

        except Exception:
            # Model failure should not prevent project facts
            # from being available to the Assistant.
            risk = None

    # ------------------------------------------------------------------------
    # FALLBACK RISK VALUES FROM PROJECT MASTER
    # ------------------------------------------------------------------------

    if risk is None:

        stored_overall = row.get(
            "overall_risk_score"
        )

        try:

            stored_overall_missing = (
                pd.isna(
                    stored_overall
                )
            )

        except (
            TypeError,
            ValueError,
        ):

            stored_overall_missing = (
                stored_overall is None
            )

        if not stored_overall_missing:

            score = _clean_number(
                stored_overall
            )

            if score is not None:

                stored_level = _clean_text(
                    row.get(
                        "risk_level"
                    )
                )

                if not stored_level:

                    if score >= 85:
                        stored_level = "CRITICAL"

                    elif score >= 70:
                        stored_level = "HIGH"

                    elif score >= 40:
                        stored_level = "MEDIUM"

                    else:
                        stored_level = "LOW"

                risk = {
                    "delay_probability": (
                        _clean_number(
                            row.get(
                                "future_delay_probability"
                            )
                        )
                    ),

                    "stall_probability": (
                        _clean_number(
                            row.get(
                                "future_progress_stall_probability"
                            )
                        )
                    ),

                    "predicted_cost_overrun": (
                        _clean_number(
                            row.get(
                                "predicted_cost_overrun_pct"
                            )
                        )
                    ),

                    "cost_risk": (
                        _clean_number(
                            row.get(
                                "cost_risk_score"
                            )
                        )
                    ),

                    "overall_risk": score,

                    "risk_level": stored_level,
                }

    # ------------------------------------------------------------------------
    # OBSERVED PROJECT FACTS
    # ------------------------------------------------------------------------

    observed = {
        "project_code": code,

        "project_name": _clean_text(
            row.get(
                "project_name"
            )
        ),

        "ministry": _clean_text(
            row.get(
                "ministry"
            )
        ),

        "sector": _clean_text(
            row.get(
                "sector"
            )
        ),

        "state": _clean_text(
            row.get(
                "flash_state"
            )
        ),

        "implementing_agency": _clean_text(
            row.get(
                "flash_implementing_agency"
            )
        ),

        "schedule_status": _clean_text(
            row.get(
                "schedule_status"
            )
        ),

        "cost_status": _clean_text(
            row.get(
                "cost_status"
            )
        ),

        "original_completion": _clean_text(
            row.get(
                "original_end_date"
            )
        ),

        "revised_completion": _clean_text(
            row.get(
                "revised_end_date"
            )
        ),

        "data_quality_flag": _clean_text(
            row.get(
                "data_quality_flag"
            )
        ),

        "data_completeness_score": (
            _clean_number(
                row.get(
                    "data_completeness_score"
                )
            )
        ),

        "delay_days": _clean_number(
            row.get(
                "delay_days"
            )
        ),

        "physical_progress_pct": _clean_number(
            row.get(
                "flash_latest_physical_progress"
            )
        ),

        "original_cost_cr": _clean_number(
            row.get(
                "original_cost_cr"
            )
        ),

        "expenditure_cr": _clean_number(
            row.get(
                "expenditure_cr"
            )
        ),

        "alert_priority": _clean_text(
            row.get(
                "alert_priority"
            )
        ),
    }

    # ------------------------------------------------------------------------
    # PREDICTIONS
    #
    # Existing internal model values:
    #     delay_probability -> decimal probability
    #     stall_probability -> decimal probability
    #
    # Assistant contract:
    #     percentage points
    # ------------------------------------------------------------------------

    if risk is not None:

        delay_probability = _clean_number(
            risk.get(
                "delay_probability"
            )
        )

        stall_probability = _clean_number(
            risk.get(
                "stall_probability"
            )
        )

        predictions = {
            "future_delay_probability": (
                delay_probability * 100.0
                if delay_probability is not None
                else None
            ),

            "progress_stall_probability": (
                stall_probability * 100.0
                if stall_probability is not None
                else None
            ),

            "predicted_cost_overrun": (
                _clean_number(
                    risk.get(
                        "predicted_cost_overrun"
                    )
                )
            ),

            "cost_risk": (
                _clean_number(
                    risk.get(
                        "cost_risk"
                    )
                )
            ),

            "overall_risk": (
                _clean_number(
                    risk.get(
                        "overall_risk"
                    )
                )
            ),

            "risk_level": _clean_text(
                risk.get(
                    "risk_level"
                )
            ),
        }

    else:

        predictions = {
            "future_delay_probability": None,
            "progress_stall_probability": None,
            "predicted_cost_overrun": None,
            "cost_risk": None,
            "overall_risk": None,
            "risk_level": None,
        }

    # ------------------------------------------------------------------------
    # EVIDENCE-BASED DELAY INDICATORS
    # ------------------------------------------------------------------------

    observed_indicators: list[
        dict[str, Any]
    ] = []

    try:

        reasons = delay_reasons(
            row,
            history,
        )

    except Exception:

        reasons = []

    for (
        title,
        explanation,
    ) in reasons[
        :MAX_DELAY_INDICATORS
    ]:

        observed_indicators.append(
            {
                "title": _clean_text(
                    title
                ),

                "explanation": _clean_text(
                    explanation
                ),

                "recommended_solution": _clean_text(
                    solution_for_reason(
                        title
                    )
                ),
            }
        )

    # ------------------------------------------------------------------------
    # RECENT PAIMANA MONTHLY HISTORY
    # ------------------------------------------------------------------------

    recent_history: list[
        dict[str, Any]
    ] = []

    if (
        history is not None
        and not history.empty
    ):

        history_rows = history.tail(
            MAX_HISTORY_ROWS
        )

        history_columns = [
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
        ]

        history_columns = [
            column
            for column in history_columns
            if column in history_rows.columns
        ]

        if history_columns:

            records = (
                history_rows[
                    history_columns
                ]
                .to_dict(
                    orient="records"
                )
            )

            for record in records:

                compact = _compact_record(
                    record,
                    history_columns,
                )

                if compact:

                    recent_history.append(
                        compact
                    )

    # ------------------------------------------------------------------------
    # RECENT FLASH HISTORY / PROGRESS
    # ------------------------------------------------------------------------

    recent_progress: list[
        dict[str, Any]
    ] = []

    if (
        flash_history is not None
        and not flash_history.empty
    ):

        flash_rows = flash_history.tail(
            MAX_PROGRESS_ROWS
        )

        flash_columns = [
            "snapshot_month",
            "implementing_agency",
            "state",
            "original_cost",
            "revised_cost",
            "anticipated_cost",
            "cumulative_expenditure",
            "physical_progress_pct",
            "expenditure_change_cr",
            "physical_progress_change_pct",
            "revised_cost_change_cr",
            "completion_date_change",
        ]

        flash_columns = [
            column
            for column in flash_columns
            if column in flash_rows.columns
        ]

        if flash_columns:

            records = (
                flash_rows[
                    flash_columns
                ]
                .to_dict(
                    orient="records"
                )
            )

            for record in records:

                compact = _compact_record(
                    record,
                    flash_columns,
                )

                if compact:

                    recent_progress.append(
                        compact
                    )

    # ------------------------------------------------------------------------
    # PHYSICAL PROGRESS TRAJECTORY
    #
    # IMPORTANT:
    # _load_project_ml_history() queries PostgreSQL for ONE project.
    #
    # We no longer call load_ml_ready(), because that old full-table
    # loader has been removed.
    # ------------------------------------------------------------------------

    progress_trajectory: list[
        dict[str, Any]
    ] = []

    if ml_row is not None:

        try:

            ml_project = _load_project_ml_history(
                code
            )

            if (
                ml_project is not None
                and not ml_project.empty
                and "project_code"
                in ml_project.columns
            ):

                if (
                    "snapshot_year"
                    in ml_project.columns
                    and
                    "snapshot_month_num"
                    in ml_project.columns
                ):

                    valid_dates = (
                        ml_project[
                            "snapshot_year"
                        ].notna()
                        &
                        ml_project[
                            "snapshot_month_num"
                        ].notna()
                    )

                    ml_project = (
                        ml_project[
                            valid_dates
                        ]
                        .copy()
                    )

                    if not ml_project.empty:

                        ml_project[
                            "snapshot_date"
                        ] = pd.to_datetime(
                            ml_project[
                                "snapshot_year"
                            ]
                            .astype(int)
                            .astype(str)
                            + "-"
                            + ml_project[
                                "snapshot_month_num"
                            ]
                            .astype(int)
                            .astype(str)
                            .str.zfill(2)
                            + "-01",
                            errors="coerce",
                        )

                progress_columns = [
                    "snapshot_date",
                    "physical_progress_pct",
                    "progress_change_pct",
                    "expenditure_cr",
                    "revised_cost_cr",
                ]

                progress_columns = [
                    column
                    for column in progress_columns
                    if column
                    in ml_project.columns
                ]

                if progress_columns:

                    rows_for_progress = (
                        ml_project[
                            progress_columns
                        ]
                        .sort_values(
                            "snapshot_date"
                        )
                        .tail(
                            MAX_PROGRESS_ROWS
                        )
                    )

                    for record in (
                        rows_for_progress
                        .to_dict(
                            orient="records"
                        )
                    ):

                        compact = (
                            _compact_record(
                                record,
                                progress_columns,
                            )
                        )

                        if compact:

                            progress_trajectory.append(
                                compact
                            )

        except Exception:

            progress_trajectory = []

    # ------------------------------------------------------------------------
    # FINAL CONTEXT
    # ------------------------------------------------------------------------

    return {
        "project": observed,

        "predictions": predictions,

        "observed_indicators": (
            observed_indicators
        ),

        "recent_history": (
            recent_history
        ),

        "recent_progress": (
            recent_progress
        ),

        "metadata": {
            "project_code": code,

            "has_ml_snapshot": (
                ml_row is not None
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


# ============================================================================
# SAFE WRAPPER
# ============================================================================

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