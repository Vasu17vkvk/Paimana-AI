from __future__ import annotations

import pandas as pd
from sqlalchemy import text

from app.extensions import db
from app.ml import engine


def project_exists(project_code: str) -> bool:
    query = text("""
        SELECT 1
        FROM "project_master"
        WHERE CAST(project_code AS TEXT) = :project_code
        LIMIT 1
    """)

    with db.engine.connect() as connection:
        result = connection.execute(
            query,
            {
                "project_code": str(project_code),
            },
        ).first()

    return result is not None


def get_project_risk(project_code: str) -> dict:
    project_code = str(project_code)

    # --------------------------------------------------------
    # First distinguish:
    # 1. project does not exist
    # 2. project exists but has no ML snapshot
    # --------------------------------------------------------

    if not project_exists(project_code):
        raise ValueError(
            f"Project not found: {project_code}"
        )

    # --------------------------------------------------------
    # Fetch ONLY the latest ML snapshot for this project.
    #
    # Previously this endpoint loaded the entire
    # paimana_ml_ready table into Pandas and then filtered it.
    # This query lets PostgreSQL do the filtering and sorting.
    # --------------------------------------------------------

    query = text("""
        SELECT *
        FROM "paimana_ml_ready"
        WHERE CAST(project_code AS TEXT) = :project_code
        ORDER BY
            snapshot_year DESC,
            snapshot_month_num DESC
        LIMIT 1
    """)

    with db.engine.connect() as connection:
        row = connection.execute(
            query,
            {
                "project_code": project_code,
            },
        ).mappings().first()

    # --------------------------------------------------------
    # Project exists, but ML prediction is unavailable.
    # --------------------------------------------------------

    if row is None:
        return {
            "project_code": project_code,
            "snapshot_year": None,
            "snapshot_month": None,
            "predicted_cost_overrun_pct": None,
            "future_delay_probability": None,
            "future_progress_stall_probability": None,
            "cost_risk_score": None,
            "overall_risk_score": None,
            "risk_level": None,
            "early_warning_active": False,
            "early_warning_priority": "NONE",
            "early_warning_reasons": [],
            "ml_available": False,
            "ml_unavailable_reason": (
                "No ML snapshot is available for this project."
            ),
        }

    # --------------------------------------------------------
    # The existing ML engine expects a pandas row.
    # Convert ONLY this single database row to a Series.
    #
    # This preserves the existing prediction logic while
    # avoiding the huge full-table DataFrame allocation.
    # --------------------------------------------------------

    latest_row = pd.Series(row)

    result = engine.predict_row(
        latest_row,
        project_code,
    )

    # Explicit availability metadata
    result["ml_available"] = True
    result["ml_unavailable_reason"] = None

    return result