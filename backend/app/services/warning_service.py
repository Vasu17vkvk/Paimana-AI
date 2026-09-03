from __future__ import annotations

import pandas as pd
from sqlalchemy import text

from app.extensions import db
from app.ml import engine


# ============================================================
# HELPERS
# ============================================================

def _to_project_code(value) -> str:
    """
    Normalize project codes so DB values are handled consistently.
    """
    if value is None:
        return ""

    try:
        if pd.isna(value):
            return ""
    except Exception:
        pass

    if isinstance(value, float) and value.is_integer():
        return str(int(value))

    return str(value).strip()


def _safe_number(value, default=0):
    """
    Convert numpy/pandas values to normal Python numbers.
    """
    try:
        if pd.isna(value):
            return default

        return value.item() if hasattr(value, "item") else value

    except Exception:
        return default


# ============================================================
# LOAD ML DATA FROM POSTGRESQL
# ============================================================

def load_ml_data() -> pd.DataFrame:
    """
    Load the ML-ready dataset from PostgreSQL.

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
        raise ValueError(
            "PostgreSQL table 'paimana_ml_ready' is empty."
        )

    df = df.loc[
        :,
        ~df.columns.duplicated(),
    ].copy()

    # Normalize project code
    if "project_code" not in df.columns:
        raise ValueError(
            "PostgreSQL table 'paimana_ml_ready' "
            "does not contain 'project_code'."
        )

    df["project_code"] = (
        df["project_code"]
        .apply(_to_project_code)
    )

    # Remove invalid project codes
    df = df[
        df["project_code"].ne("")
    ].copy()

    return df


# ============================================================
# PROJECT WARNING
# ============================================================

def get_project_warnings(
    project_code: str,
) -> dict:

    project_code = _to_project_code(
        project_code
    )

    if not project_code:
        raise ValueError(
            "Invalid project code."
        )

    # Load the project ML data directly from PostgreSQL
    df = load_ml_data()

    rows = df[
        df["project_code"].eq(
            project_code
        )
    ].copy()

    if rows.empty:
        raise ValueError(
            f"Project not found: {project_code}"
        )

    # --------------------------------------------------------
    # Latest snapshot
    # --------------------------------------------------------

    sort_columns = []

    if "snapshot_year" in rows.columns:
        sort_columns.append(
            "snapshot_year"
        )

    if "snapshot_month_num" in rows.columns:
        sort_columns.append(
            "snapshot_month_num"
        )

    if sort_columns:
        rows = rows.sort_values(
            sort_columns
        )

    latest_row = rows.iloc[-1]

    # --------------------------------------------------------
    # ML prediction
    # --------------------------------------------------------

    risk = engine.predict_row(
        latest_row,
        project_code,
    )

    return {
        "project_code": _to_project_code(
            risk.get(
                "project_code",
                project_code,
            )
        ),
        "snapshot_year": _safe_number(
            risk.get(
                "snapshot_year"
            ),
            None,
        ),
        "snapshot_month": _safe_number(
            risk.get(
                "snapshot_month"
            ),
            None,
        ),
        "early_warning_active": bool(
            risk.get(
                "early_warning_active",
                False,
            )
        ),
        "early_warning_priority": risk.get(
            "early_warning_priority",
            "NONE",
        ),
        "early_warning_reasons": list(
            risk.get(
                "early_warning_reasons",
                [],
            )
            or []
        ),
        "risk_level": risk.get(
            "risk_level",
            "LOW",
        ),
        "overall_risk_score": float(
            _safe_number(
                risk.get(
                    "overall_risk_score",
                    0,
                ),
                0,
            )
        ),
    }


# ============================================================
# ACTIVE WARNINGS
# ============================================================

def get_active_warnings() -> list[dict]:
    """
    Return all currently active ML-generated warnings.

    Data source:
        PostgreSQL -> paimana_ml_ready

    The latest snapshot of each project is evaluated using
    the same supplied ML engine used by Risk Analysis.
    """

    df = load_ml_data()

    # --------------------------------------------------------
    # Latest snapshot per project
    # --------------------------------------------------------

    sort_columns = [
        column
        for column in [
            "snapshot_year",
            "snapshot_month_num",
        ]
        if column in df.columns
    ]

    if sort_columns:
        df = df.sort_values(
            sort_columns
        )

    latest_df = (
        df
        .drop_duplicates(
            subset=["project_code"],
            keep="last",
        )
        .copy()
    )

    warnings: list[dict] = []

    # --------------------------------------------------------
    # Evaluate latest row of each project
    # --------------------------------------------------------

    for _, latest_row in latest_df.iterrows():

        project_code = _to_project_code(
            latest_row["project_code"]
        )

        if not project_code:
            continue

        try:

            risk = engine.predict_row(
                latest_row,
                project_code,
            )

        except Exception:
            # One bad project must not break the complete
            # early-warning portfolio.
            continue

        if not risk.get(
            "early_warning_active",
            False,
        ):
            continue

        warnings.append(
            {
                "project_code": project_code,

                "snapshot_year": _safe_number(
                    risk.get(
                        "snapshot_year",
                        latest_row.get(
                            "snapshot_year"
                        ),
                    ),
                    None,
                ),

                "snapshot_month": _safe_number(
                    risk.get(
                        "snapshot_month",
                        latest_row.get(
                            "snapshot_month_num"
                        ),
                    ),
                    None,
                ),

                "risk_level": risk.get(
                    "risk_level",
                    "LOW",
                ),

                "overall_risk_score": float(
                    _safe_number(
                        risk.get(
                            "overall_risk_score",
                            0,
                        ),
                        0,
                    )
                ),

                "early_warning_priority": risk.get(
                    "early_warning_priority",
                    "NONE",
                ),

                "early_warning_reasons": list(
                    risk.get(
                        "early_warning_reasons",
                        [],
                    )
                    or []
                ),
            }
        )

    # --------------------------------------------------------
    # Sort highest priority first
    # --------------------------------------------------------

    priority_order = {
        "IMMEDIATE": 0,
        "HIGH": 1,
        "NONE": 2,
    }

    warnings.sort(
        key=lambda warning: (
            priority_order.get(
                warning[
                    "early_warning_priority"
                ],
                99,
            ),
            -float(
                warning[
                    "overall_risk_score"
                ]
            ),
        )
    )

    return warnings