from __future__ import annotations

import pandas as pd
from sqlalchemy import text

from app.extensions import db
from app.ml import engine


def load_ml_data() -> pd.DataFrame:
    query = text("""
        SELECT *
        FROM "paimana_ml_ready"
    """)

    with db.engine.connect() as connection:
        df = pd.read_sql(query, connection)

    if df.empty:
        raise FileNotFoundError(
            "ML dataset table 'paimana_ml_ready' is empty"
        )

    df = df.loc[:, ~df.columns.duplicated()].copy()

    return df


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

    df = load_ml_data()

    rows = df[
        df["project_code"]
        .astype(str)
        .eq(project_code)
    ]

    # --------------------------------------------------------
    # Project exists, but ML prediction is unavailable.
    # --------------------------------------------------------

    if rows.empty:
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
    # Latest ML snapshot
    # --------------------------------------------------------

    rows = rows.sort_values(
        [
            "snapshot_year",
            "snapshot_month_num",
        ]
    )

    latest_row = rows.iloc[-1]

    result = engine.predict_row(
        latest_row,
        project_code,
    )

    # Explicit availability metadata
    result["ml_available"] = True
    result["ml_unavailable_reason"] = None

    return result