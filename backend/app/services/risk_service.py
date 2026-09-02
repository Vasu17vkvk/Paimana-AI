from __future__ import annotations

from pathlib import Path

import pandas as pd

from app.ml import engine


DATA_PATH = (
    Path(__file__).resolve().parents[2]
    / "data"
    / "PAIMANA_ML_READY_WITH_PROJECT_CODE.csv"
)


def load_ml_data() -> pd.DataFrame:
    if not DATA_PATH.exists():
        raise FileNotFoundError(
            f"ML dataset not found: {DATA_PATH}"
        )

    df = pd.read_csv(
        DATA_PATH
    )

    df = df.loc[
        :,
        ~df.columns.duplicated(),
    ].copy()

    return df


def get_project_risk(
    project_code: str,
) -> dict:
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