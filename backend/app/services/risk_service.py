from __future__ import annotations

import pandas as pd
from sqlalchemy import text

from app.extensions import db
from app.ml import engine


def load_ml_data() -> pd.DataFrame:
    """
    Load ML-ready project data from PostgreSQL.

    PostgreSQL table:
        paimana_ml_ready
    """

    query = text(
        """
        SELECT *
        FROM "paimana_ml_ready"
        """
    )

    with db.engine.connect() as connection:
        df = pd.read_sql(
            query,
            connection,
        )

    if df.empty:
        raise FileNotFoundError(
            "ML dataset table 'paimana_ml_ready' is empty"
        )

    df = df.loc[
        :,
        ~df.columns.duplicated(),
    ].copy()

    return df


def get_project_risk(
    project_code: str,
) -> dict:
    """
    Get the latest ML-based risk result for a project.
    """

    df = load_ml_data()

    rows = df[
        df["project_code"]
        .astype(str)
        .eq(str(project_code))
    ]

    if rows.empty:
        raise ValueError(
            f"Project not found: {project_code}"
        )

    rows = rows.sort_values(
        [
            "snapshot_year",
            "snapshot_month_num",
        ]
    )

    latest_row = rows.iloc[-1]

    return engine.predict_row(
        latest_row,
        project_code,
    )