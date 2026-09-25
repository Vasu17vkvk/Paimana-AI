from __future__ import annotations

from typing import Any

import pandas as pd
from sqlalchemy import text

from app.extensions import db
from app.services.project_analytics_service import (
    model_scores_from_features_batch,
)


# ============================================================
# HELPERS
# ============================================================

def _clean_state_name(value: Any) -> str | None:
    if value is None:
        return None

    value = str(value).strip()

    if not value or value.lower() in {
        "nan",
        "none",
        "null",
    }:
        return None

    return value


def _to_python(value: Any) -> Any:
    if value is None:
        return None

    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass

    if hasattr(value, "item"):
        try:
            return value.item()
        except Exception:
            pass

    return value


def _derive_risk_level(score: Any) -> str | None:
    """
    Keep Geographic View consistent with the existing
    PAIMANA risk thresholds.
    """

    if score is None:
        return None

    try:
        if pd.isna(score):
            return None
    except (TypeError, ValueError):
        return None

    score = float(score)

    if score >= 85:
        return "CRITICAL"

    if score >= 70:
        return "HIGH"

    if score >= 40:
        return "MEDIUM"

    return "LOW"


# ============================================================
# GEOGRAPHIC PROJECTS
# ============================================================

def get_geographic_projects(
    state: str | None = None,
) -> dict[str, Any]:
    """
    Return projects for Geographic View.

    Memory strategy:
        - PostgreSQL selects the project data.
        - PostgreSQL also selects ONLY the latest ML snapshot
          for each project.
        - Results are streamed in batches of 256 rows.
        - ML inference is performed on one small batch at a time.
        - We never create one giant portfolio-wide DataFrame.
    """

    # --------------------------------------------------------
    # Latest ML snapshot for every project.
    #
    # DISTINCT ON is PostgreSQL-specific and is appropriate
    # because this application already uses PostgreSQL.
    # --------------------------------------------------------

    latest_ml_query = """
        SELECT DISTINCT ON (project_code) *
        FROM "paimana_ml_ready"
        WHERE project_code IS NOT NULL
        ORDER BY
            project_code,
            snapshot_year DESC,
            snapshot_month_num DESC
    """

    # --------------------------------------------------------
    # Build the main query.
    #
    # Important:
    # We intentionally select project_master.project_code only
    # through the ML subquery to avoid duplicate project_code
    # columns in the Pandas DataFrame.
    #
    # Projects without an ML snapshot are still returned
    # because this is a LEFT JOIN.
    # --------------------------------------------------------

    query = f"""
        SELECT
            pm.project_code AS project_code,
            pm.project_name,
            pm.sector,
            pm.ministry,
            pm.original_cost_cr,
            pm.revised_cost_cr,
            pm.expenditure_cr,
            pm.delay_days,
            pm.delay_months,
            pm.cost_overrun_pct,
            pm.flash_latest_physical_progress,
            pm.flash_state,

            ml.*

        FROM "project_master" pm

        LEFT JOIN (
            {latest_ml_query}
        ) ml
            ON CAST(pm.project_code AS TEXT)
             = CAST(ml.project_code AS TEXT)

        WHERE pm.project_code IS NOT NULL
    """

    params: dict[str, Any] = {}

    if state:
        query += """
            AND LOWER(TRIM(pm.flash_state))
                = LOWER(TRIM(:state))
        """

        params["state"] = state

    query += """
        ORDER BY pm.project_code
    """

    projects: list[dict[str, Any]] = []

    # ========================================================
    # STREAM THE DATABASE RESULT IN SMALL BATCHES
    # ========================================================

    with db.engine.connect() as connection:

        chunks = pd.read_sql(
            text(query),
            connection,
            params=params,
            chunksize=256,
        )

        for chunk_df in chunks:

            if chunk_df.empty:
                continue

            # ------------------------------------------------
            # Remove accidental duplicate DataFrame columns.
            # ------------------------------------------------

            chunk_df = chunk_df.loc[
                :,
                ~chunk_df.columns.duplicated(),
            ].copy()

            if "project_code" not in chunk_df.columns:
                raise ValueError(
                    "Geographic query did not return "
                    "'project_code'."
                )

            # ------------------------------------------------
            # Normalize project codes.
            # ------------------------------------------------

            chunk_df["project_code"] = (
                chunk_df["project_code"]
                .astype(str)
                .str.strip()
            )

            # ------------------------------------------------
            # Separate rows which actually have ML data.
            #
            # A LEFT JOIN means some projects may have no ML
            # snapshot. Those projects still need to appear
            # on the map with no risk score.
            # ------------------------------------------------

            has_ml = (
                "snapshot_year" in chunk_df.columns
                and "snapshot_month_num" in chunk_df.columns
            )

            if has_ml:
                ml_available_mask = (
                    chunk_df["snapshot_year"].notna()
                    & chunk_df["snapshot_month_num"].notna()
                )
            else:
                ml_available_mask = pd.Series(
                    False,
                    index=chunk_df.index,
                )

            score_df = pd.DataFrame()

            # ------------------------------------------------
            # IMPORTANT:
            # Only send ML-capable rows to the model.
            #
            # This keeps the existing model logic intact while
            # limiting memory to one 256-row batch.
            # ------------------------------------------------

            if ml_available_mask.any():

                score_input = chunk_df.loc[
                    ml_available_mask
                ].copy()

                try:
                    score_df = model_scores_from_features_batch(
                        score_input,
                        batch_size=256,
                    )

                except Exception:
                    # Preserve the old behavior:
                    # if ML scoring fails, Geographic View
                    # still returns the underlying projects.
                    score_df = pd.DataFrame()

            # ------------------------------------------------
            # Convert model results into a lightweight lookup.
            #
            # This avoids another large DataFrame merge.
            # ------------------------------------------------

            score_lookup: dict[str, dict[str, Any]] = {}

            if (
                not score_df.empty
                and "project_code" in score_df.columns
            ):
                score_df["project_code"] = (
                    score_df["project_code"]
                    .astype(str)
                    .str.strip()
                )

                for _, score_row in score_df.iterrows():

                    code = str(
                        score_row.get(
                            "project_code",
                            "",
                        )
                    ).strip()

                    if not code:
                        continue

                    score_lookup[code] = {
                        "overall_risk_score": _to_python(
                            score_row.get(
                                "overall_risk_score"
                            )
                        ),
                    }

            # =================================================
            # BUILD LIGHTWEIGHT API OBJECTS
            # =================================================

            for _, row in chunk_df.iterrows():

                project_code = str(
                    row.get(
                        "project_code",
                        "",
                    )
                ).strip()

                if not project_code:
                    continue

                score_info = score_lookup.get(
                    project_code,
                    {},
                )

                overall_risk_score = score_info.get(
                    "overall_risk_score"
                )

                project = {
                    "project_code": _to_python(
                        project_code
                    ),

                    "project_name": _to_python(
                        row.get("project_name")
                    ),

                    "state": _clean_state_name(
                        row.get("flash_state")
                    ),

                    "sector": _to_python(
                        row.get("sector")
                    ),

                    "ministry": _to_python(
                        row.get("ministry")
                    ),

                    "physical_progress_pct": _to_python(
                        row.get(
                            "flash_latest_physical_progress"
                        )
                    ),

                    "delay_days": _to_python(
                        row.get("delay_days")
                    ),

                    "cost_overrun_pct": _to_python(
                        row.get(
                            "cost_overrun_pct"
                        )
                    ),

                    "risk_score": _to_python(
                        overall_risk_score
                    ),

                    "risk_level": _derive_risk_level(
                        overall_risk_score
                    ),
                }

                projects.append(project)

    # ========================================================
    # RESPONSE
    # ========================================================

    return {
        "count": len(projects),
        "projects": projects,
    }