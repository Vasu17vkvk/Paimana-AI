from __future__ import annotations

from typing import Any

import pandas as pd
from sqlalchemy import text

from app.extensions import db
from app.services.project_analytics_service import (
    model_scores_from_features_batch,
)


def _clean_state_name(value: Any) -> str | None:
    if value is None:
        return None

    value = str(value).strip()

    if not value or value.lower() in {"nan", "none", "null"}:
        return None

    return value


def _to_python(value: Any) -> Any:
    if pd.isna(value):
        return None

    if hasattr(value, "item"):
        try:
            return value.item()
        except Exception:
            pass

    return value


def _build_base_projects(state: str | None = None) -> pd.DataFrame:
    query = """
        SELECT
            pm.project_code,
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
            pm.flash_state
        FROM project_master pm
        WHERE pm.project_code IS NOT NULL
    """

    params: dict[str, Any] = {}

    if state:
        query += """
            AND LOWER(TRIM(pm.flash_state)) = LOWER(TRIM(:state))
        """
        params["state"] = state

    query += """
        ORDER BY pm.project_code
    """

    return pd.read_sql(
        text(query),
        db.engine,
        params=params,
    )


def _build_ml_rows(project_codes: list[str]) -> pd.DataFrame:
    if not project_codes:
        return pd.DataFrame()

    query = """
        SELECT *
        FROM paimana_ml_ready
        WHERE project_code = ANY(:project_codes)
    """

    return pd.read_sql(
        text(query),
        db.engine,
        params={
            "project_codes": project_codes,
        },
    )


def get_geographic_projects(state: str | None = None) -> dict[str, Any]:
    base_df = _build_base_projects(state)

    if base_df.empty:
        return {
            "count": 0,
            "projects": [],
        }

    base_df["project_code"] = (
        base_df["project_code"]
        .astype(str)
        .str.strip()
    )

    project_codes = base_df["project_code"].tolist()

    ml_df = _build_ml_rows(project_codes)

    score_df = pd.DataFrame()

    if not ml_df.empty:
        score_input = ml_df.copy()

        try:
            score_df = model_scores_from_features_batch(
                score_input,
                batch_size=256,
            )
        except Exception:
            score_df = pd.DataFrame()

    if not score_df.empty and "project_code" in score_df.columns:
        score_df["project_code"] = (
            score_df["project_code"]
            .astype(str)
            .str.strip()
        )

        score_columns = [
            column
            for column in [
                "project_code",
                "overall_risk_score",
                "risk_level",
            ]
            if column in score_df.columns
        ]

        score_df = score_df[score_columns].drop_duplicates(
            subset=["project_code"],
            keep="last",
        )

        base_df = base_df.merge(
            score_df,
            on="project_code",
            how="left",
        )
    else:
        base_df["overall_risk_score"] = None
        base_df["risk_level"] = None

    # Re-derive risk level from the actual overall score
    # so Geographic View stays consistent with the existing
    # PAIMANA risk thresholds.
    def derive_risk_level(score: Any) -> str | None:
        if score is None or pd.isna(score):
            return None

        score = float(score)

        if score >= 85:
            return "CRITICAL"

        if score >= 70:
            return "HIGH"

        if score >= 40:
            return "MEDIUM"

        return "LOW"

    base_df["risk_level"] = base_df["overall_risk_score"].apply(
        derive_risk_level
    )

    projects: list[dict[str, Any]] = []

    for _, row in base_df.iterrows():
        project = {
            "project_code": _to_python(row.get("project_code")),
            "project_name": _to_python(row.get("project_name")),
            "state": _clean_state_name(row.get("flash_state")),
            "sector": _to_python(row.get("sector")),
            "ministry": _to_python(row.get("ministry")),
            "physical_progress_pct": _to_python(
                row.get("flash_latest_physical_progress")
            ),
            "delay_days": _to_python(row.get("delay_days")),
            "cost_overrun_pct": _to_python(
                row.get("cost_overrun_pct")
            ),
            "risk_score": _to_python(
                row.get("overall_risk_score")
            ),
            "risk_level": _to_python(
                row.get("risk_level")
            ),
        }

        projects.append(project)

    return {
        "count": len(projects),
        "projects": projects,
    }