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

    # --------------------------------------------------------
    # Fetch ONLY the latest ML snapshot for this project.
    #
    # Previously:
    #   SELECT * FROM paimana_ml_ready
    #   -> load entire table into Pandas
    #   -> filter project
    #   -> sort
    #
    # Now PostgreSQL performs the filtering and sorting.
    # --------------------------------------------------------

    query = text(
        """
        SELECT *
        FROM "paimana_ml_ready"
        WHERE CAST(project_code AS TEXT) = :project_code
        ORDER BY
            snapshot_year DESC,
            snapshot_month_num DESC
        LIMIT 1
        """
    )

    with db.engine.connect() as connection:
        row = connection.execute(
            query,
            {
                "project_code": project_code,
            },
        ).mappings().first()

    if row is None:
        raise ValueError(
            f"Project not found: {project_code}"
        )

    # --------------------------------------------------------
    # The existing ML engine expects a pandas Series.
    #
    # Only ONE row is converted to pandas instead of loading
    # the entire paimana_ml_ready table.
    # --------------------------------------------------------

    latest_row = pd.Series(row)

    # --------------------------------------------------------
    # Existing ML prediction logic remains unchanged.
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

    IMPORTANT:
    This function deliberately processes data in small
    batches rather than loading the entire ML dataset into RAM.

    PostgreSQL first selects the latest snapshot for each
    project. Pandas then receives only 256 rows at a time.
    """

    # --------------------------------------------------------
    # PostgreSQL selects ONLY the latest snapshot per project.
    #
    # DISTINCT ON is PostgreSQL-specific and is appropriate
    # here because this application already depends on
    # PostgreSQL / pgvector.
    # --------------------------------------------------------

    query = text(
        """
        SELECT DISTINCT ON (project_code) *
        FROM "paimana_ml_ready"
        WHERE project_code IS NOT NULL
        ORDER BY
            project_code,
            snapshot_year DESC,
            snapshot_month_num DESC
        """
    )

    warnings: list[dict] = []

    # --------------------------------------------------------
    # Process only 256 rows at a time.
    #
    # This avoids creating one huge DataFrame containing
    # every project's latest snapshot.
    # --------------------------------------------------------

    with db.engine.connect() as connection:

        chunks = pd.read_sql(
            query,
            connection,
            chunksize=256,
        )

        for latest_df in chunks:

            if latest_df.empty:
                continue

            # ------------------------------------------------
            # Remove duplicate DataFrame columns if any are
            # introduced by the SQL/result layer.
            # ------------------------------------------------

            latest_df = latest_df.loc[
                :,
                ~latest_df.columns.duplicated(),
            ].copy()

            # ------------------------------------------------
            # Validate project_code.
            # ------------------------------------------------

            if "project_code" not in latest_df.columns:
                raise ValueError(
                    "PostgreSQL table 'paimana_ml_ready' "
                    "does not contain 'project_code'."
                )

            latest_df["project_code"] = (
                latest_df["project_code"]
                .apply(_to_project_code)
            )

            latest_df = latest_df[
                latest_df["project_code"].ne("")
            ].copy()

            if latest_df.empty:
                continue

            # ------------------------------------------------
            # Run the EXISTING ML engine on this small batch.
            #
            # We are keeping the model logic unchanged.
            # Only the amount of data held in memory changes.
            # ------------------------------------------------

            predictions = engine.predict_batch(
                latest_df,
                batch_size=256,
            )

            if predictions.empty:
                continue

            # ------------------------------------------------
            # Keep only active warnings.
            # ------------------------------------------------

            active_predictions = predictions[
                predictions[
                    "early_warning_active"
                ].fillna(False)
            ].copy()

            if active_predictions.empty:
                continue

            # ------------------------------------------------
            # Convert predictions to API response objects.
            # ------------------------------------------------

            for _, prediction in (
                active_predictions.iterrows()
            ):

                project_code = _to_project_code(
                    prediction.get(
                        "project_code"
                    )
                )

                if not project_code:
                    continue

                warnings.append(
                    {
                        "project_code": project_code,

                        "snapshot_year": _safe_number(
                            prediction.get(
                                "snapshot_year"
                            ),
                            None,
                        ),

                        "snapshot_month": _safe_number(
                            prediction.get(
                                "snapshot_month"
                            ),
                            None,
                        ),

                        "risk_level": (
                            prediction.get(
                                "risk_level",
                                "LOW",
                            )
                        ),

                        "overall_risk_score": float(
                            _safe_number(
                                prediction.get(
                                    "overall_risk_score",
                                    0,
                                ),
                                0,
                            )
                        ),

                        "early_warning_priority": (
                            prediction.get(
                                "early_warning_priority",
                                "NONE",
                            )
                        ),

                        "early_warning_reasons": list(
                            prediction.get(
                                "early_warning_reasons",
                                [],
                            )
                            or []
                        ),
                    }
                )

    # --------------------------------------------------------
    # Sort highest priority first.
    #
    # This preserves the behavior of the previous
    # implementation.
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