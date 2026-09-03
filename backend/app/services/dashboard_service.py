from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from sqlalchemy import text

from app.extensions import db

from app.services.project_analytics_service import (
    load_ml_ready,
    model_scores_from_features_batch,
)


def _to_project_code(value: Any) -> str:
    if value is None or pd.isna(value):
        return ""

    try:
        number = float(value)

        if number.is_integer():
            return str(int(number))

    except (TypeError, ValueError):
        pass

    return str(value).strip()


def _clean_string(value: Any) -> str:
    if value is None or pd.isna(value):
        return ""

    return str(value).strip()


def _safe_number(value: Any, default: float = 0.0) -> float:
    if value is None or pd.isna(value):
        return default

    try:
        number = float(value)

        if not np.isfinite(number):
            return default

        return number

    except (TypeError, ValueError):
        return default


def _risk_level_from_score(score: float | None) -> str:
    if score is None:
        return "Low"

    if score >= 85:
        return "Critical"

    if score >= 70:
        return "High"

    if score >= 40:
        return "Elevated"

    if score >= 20:
        return "Moderate"

    return "Low"


def _risk_level_normalized(score: float | None) -> str | None:
    if score is None:
        return None

    if score >= 85:
        return "CRITICAL"

    if score >= 70:
        return "HIGH"

    if score >= 40:
        return "MEDIUM"

    return "LOW"


def _load_table(table_name: str) -> pd.DataFrame:
    query = text(
        f'''
        SELECT *
        FROM "{table_name}"
        '''
    )

    with db.engine.connect() as connection:
        df = pd.read_sql(
            query,
            connection,
        )

    if df.empty:
        raise ValueError(
            f"PostgreSQL table '{table_name}' is empty."
        )

    return df.loc[
        :,
        ~df.columns.duplicated(),
    ].copy()


def _load_dashboard_data() -> pd.DataFrame:
    master = _load_table("project_master")

    # These columns are already part of the real project-master dataset.
    master["project_code"] = (
        master["project_code"]
        .apply(_to_project_code)
    )

    numeric_columns = [
        "original_cost_cr",
        "revised_cost_cr",
        "revised_cost_analytical_cr",
        "expenditure_cr",
        "delay_days",
        "delay_months",
        "is_delayed",
        "has_cost_overrun",
        "flash_latest_physical_progress",
    ]

    for column in numeric_columns:
        if column in master.columns:
            master[column] = pd.to_numeric(
                master[column],
                errors="coerce",
            )

    # ---------------------------------------------------------
    # FLASH state/progress fallback
    # ---------------------------------------------------------

    if "flash_state" not in master.columns:
        master["flash_state"] = ""

    if "flash_latest_physical_progress" not in master.columns:
        master["flash_latest_physical_progress"] = np.nan

    master["flash_state"] = (
        master["flash_state"]
        .fillna("")
        .astype(str)
        .str.strip()
    )

    return master


def _attach_ml_risk_scores(
    projects: pd.DataFrame,
) -> pd.DataFrame:

    result = projects.copy()

    result["overall_risk_score"] = np.nan
    result["risk_level_ml"] = None

    ml = load_ml_ready()

    if ml.empty:
        return result

    ml = ml.copy()

    ml["project_code"] = (
        ml["project_code"]
        .apply(_to_project_code)
    )

    sort_columns = [
        column
        for column in [
            "snapshot_year",
            "snapshot_month_num",
        ]
        if column in ml.columns
    ]

    if sort_columns:
        ml = ml.sort_values(sort_columns)

    latest_rows = (
        ml.drop_duplicates(
            "project_code",
            keep="last",
        )
    )

    selected_codes = set(
        result["project_code"]
        .astype(str)
    )

    latest_rows = latest_rows[
        latest_rows["project_code"]
        .isin(selected_codes)
    ].copy()

    if latest_rows.empty:
        return result

    # Use the same batched model inference already introduced
    # for Project Analytics, avoiding one predict_proba call
    # per project.
    try:
        scores = model_scores_from_features_batch(
            latest_rows,
            batch_size=256,
        )
    except Exception:
        return result

    if scores.empty:
        return result

    scores = scores.copy()

    if "project_code" not in scores.columns:
        scores["project_code"] = latest_rows[
            "project_code"
        ].values

    scores["project_code"] = (
        scores["project_code"]
        .apply(_to_project_code)
    )

    score_columns = [
        "project_code",
        "overall_risk",
        "risk_level",
    ]

    score_columns = [
        column
        for column in score_columns
        if column in scores.columns
    ]

    scores = scores[score_columns].copy()

    scores = scores.rename(
        columns={
            "overall_risk": "overall_risk_score",
            "risk_level": "risk_level_ml",
        }
    )

    result = result.merge(
        scores,
        on="project_code",
        how="left",
        suffixes=(
            "",
            "_score",
        ),
    )

    if "overall_risk_score_score" in result.columns:
        result["overall_risk_score"] = (
            result[
                "overall_risk_score_score"
            ]
        )

        result = result.drop(
            columns=[
                "overall_risk_score_score"
            ]
        )

    if "risk_level_ml_score" in result.columns:
        result["risk_level_ml"] = (
            result[
                "risk_level_ml_score"
            ]
        )

        result = result.drop(
            columns=[
                "risk_level_ml_score"
            ]
        )

    return result


def _schedule_status(row: pd.Series) -> str:
    existing = _clean_string(
        row.get("schedule_status")
    )

    if existing:
        return existing

    if (
        _safe_number(
            row.get("is_accelerated"),
            0,
        )
        == 1
    ):
        return "Accelerated"

    if (
        _safe_number(
            row.get("is_delayed"),
            0,
        )
        == 1
    ):
        return "Delayed"

    if pd.isna(
        row.get("revised_end_date")
    ) or not _clean_string(
        row.get("revised_end_date")
    ):
        return "No Revised Date"

    return "On Schedule"


def _build_project_records(
    frame: pd.DataFrame,
) -> list[dict[str, Any]]:

    records: list[dict[str, Any]] = []

    for _, row in frame.iterrows():

        risk_score = row.get(
            "overall_risk_score"
        )

        if pd.isna(risk_score):
            risk_score_value = None
            risk_level = "Low"
        else:
            risk_score_value = round(
                _safe_number(
                    risk_score
                ),
                2,
            )

            risk_level = _risk_level_from_score(
                risk_score_value
            )

        cost_status = _clean_string(
            row.get("cost_status")
        )

        if not cost_status:
            has_cost_overrun = (
                _safe_number(
                    row.get(
                        "has_cost_overrun"
                    )
                )
                > 0
            )

            cost_status = (
                "High"
                if has_cost_overrun
                else "Low"
            )

        delay_days = _safe_number(
            row.get("delay_days")
        )

        delay_months = _safe_number(
            row.get("delay_months")
        )

        if delay_months == 0 and delay_days > 0:
            delay_months = delay_days / 30.4375

        revised_cost = _safe_number(
            row.get("revised_cost_cr")
        )

        original_cost = _safe_number(
            row.get("original_cost_cr")
        )

        if revised_cost == 0:
            analytical_cost = _safe_number(
                row.get(
                    "revised_cost_analytical_cr"
                )
            )

            if analytical_cost > 0:
                revised_cost = analytical_cost

        status = _schedule_status(row)

        progress = _safe_number(
            row.get(
                "flash_latest_physical_progress"
            )
        )

        records.append(
            {
                "id": _to_project_code(
                    row.get("project_code")
                ),
                "name": _clean_string(
                    row.get("project_name")
                ),
                "ministry": _clean_string(
                    row.get("ministry")
                ),
                "sector": _clean_string(
                    row.get("sector")
                ),
                "state": _clean_string(
                    row.get("flash_state")
                ),
                "originalCost": round(
                    original_cost,
                    2,
                ),
                "revisedCost": round(
                    revised_cost,
                    2,
                ),
                "riskScore": risk_score_value,
                "riskLevel": risk_level,
                "costRisk": cost_status,
                "delayRisk": risk_level,
                "delayMonths": round(
                    max(
                        delay_months,
                        0,
                    ),
                    1,
                ),
                "physicalProgress": round(
                    min(
                        max(
                            progress,
                            0,
                        ),
                        100,
                    ),
                    1,
                ),
                "status": status,
            }
        )

    return records


def get_dashboard_filter_options() -> dict[str, Any]:
    master = _load_dashboard_data()

    def unique_values(column: str) -> list[str]:
        if column not in master.columns:
            return []

        values = (
            master[column]
            .dropna()
            .astype(str)
            .str.strip()
        )

        return sorted(
            [
                value
                for value in values.unique()
                if value
            ]
        )

    monthly = _load_table(
        "paimana_monthly_history"
    )

    periods: list[str] = []

    if "snapshot_month" in monthly.columns:
        dates = pd.to_datetime(
            monthly["snapshot_month"],
            errors="coerce",
        ).dropna()

        periods = sorted(
            {
                date.strftime("%B %Y")
                for date in dates
            },
            key=lambda value: pd.to_datetime(
                value,
                format="%B %Y",
            ),
            reverse=True,
        )

    return {
        "periods": periods,
        "ministries": unique_values(
            "ministry"
        ),
        "sectors": unique_values(
            "sector"
        ),
        "states": unique_values(
            "flash_state"
        ),
        "risk_levels": [
            "Critical",
            "High",
            "Elevated",
            "Moderate",
            "Low",
        ],
        "statuses": [
            "Ongoing",
            "Delayed",
            "Completed",
            "On Schedule",
            "Accelerated",
            "No Revised Date",
        ],
    }


def get_dashboard(
    *,
    period: str | None = None,
    ministry: str | None = None,
    sector: str | None = None,
    state: str | None = None,
    risk: str | None = None,
    status: str | None = None,
    search: str | None = None,
) -> dict[str, Any]:

    projects = _load_dashboard_data()

    # ---------------------------------------------------------
    # Filter basic master data first
    # ---------------------------------------------------------

    if ministry and ministry != "All Ministries":
        projects = projects[
            projects["ministry"]
            .astype(str)
            .eq(ministry)
        ]

    if sector and sector != "All Sectors":
        projects = projects[
            projects["sector"]
            .astype(str)
            .eq(sector)
        ]

    if state and state != "All States":
        projects = projects[
            projects["flash_state"]
            .astype(str)
            .eq(state)
        ]

    if search:
        search_value = str(
            search
        ).strip().lower()

        if search_value:
            mask = (
                projects["project_name"]
                .astype(str)
                .str.lower()
                .str.contains(
                    search_value,
                    na=False,
                    regex=False,
                )
                |
                projects["project_code"]
                .astype(str)
                .str.lower()
                .str.contains(
                    search_value,
                    na=False,
                    regex=False,
                )
                |
                projects["ministry"]
                .astype(str)
                .str.lower()
                .str.contains(
                    search_value,
                    na=False,
                    regex=False,
                )
                |
                projects["sector"]
                .astype(str)
                .str.lower()
                .str.contains(
                    search_value,
                    na=False,
                    regex=False,
                )
            )

            projects = projects[mask]

    # ---------------------------------------------------------
    # Risk is model-derived, so attach after basic filtering.
    # ---------------------------------------------------------

    projects = _attach_ml_risk_scores(
        projects
    )

    # Normalize missing scores before filters.
    projects["risk_level_ui"] = projects[
        "overall_risk_score"
    ].apply(
        lambda value: _risk_level_from_score(
            value
            if pd.notna(value)
            else None
        )
    )

    if risk and risk != "All Risk Levels":
        projects = projects[
            projects["risk_level_ui"]
            .eq(risk)
        ]

    if status and status != "All Statuses":
        statuses = projects.apply(
            _schedule_status,
            axis=1,
        )

        projects = projects[
            statuses.eq(status)
        ]

    records = _build_project_records(
        projects
    )

    # ---------------------------------------------------------
    # Current metrics
    # ---------------------------------------------------------

    total_projects = len(records)

    high_risk_projects = sum(
        1
        for item in records
        if item["riskLevel"]
        in {
            "Critical",
            "High",
        }
    )

    cost_risk_projects = sum(
        1
        for item in records
        if item["revisedCost"]
        > item["originalCost"]
    )

    delayed_projects = sum(
        1
        for item in records
        if item["status"]
        == "Delayed"
    )

    risk_distribution = {
        "Critical": 0,
        "High": 0,
        "Elevated": 0,
        "Moderate": 0,
        "Low": 0,
    }

    for item in records:
        risk_distribution[
            item["riskLevel"]
        ] += 1

    highest_risk_projects = sorted(
        records,
        key=lambda item: (
            item["riskScore"]
            if item["riskScore"] is not None
            else -1
        ),
        reverse=True,
    )[:8]

    original_cost = sum(
        item["originalCost"]
        for item in records
    )

    revised_cost = sum(
        item["revisedCost"]
        for item in records
    )

    # ---------------------------------------------------------
    # Monthly portfolio trend
    # ---------------------------------------------------------

    monthly = _load_table(
        "paimana_monthly_history"
    )

    monthly["project_code"] = (
        monthly["project_code"]
        .apply(_to_project_code)
    )

    monthly["snapshot_month"] = (
        pd.to_datetime(
            monthly["snapshot_month"],
            errors="coerce",
        )
    )

    monthly["delay_days"] = pd.to_numeric(
        monthly.get(
            "delay_days",
            pd.Series(dtype=float),
        ),
        errors="coerce",
    )

    monthly["cost_overrun_pct"] = pd.to_numeric(
        monthly.get(
            "cost_overrun_pct",
            pd.Series(dtype=float),
        ),
        errors="coerce",
    )

    monthly = monthly.dropna(
        subset=[
            "project_code",
            "snapshot_month",
        ]
    )

    trend_rows: list[dict[str, Any]] = []

    grouped = (
        monthly
        .groupby("snapshot_month")
    )

    for snapshot_month, frame in grouped:
        total = (
            frame["project_code"]
            .nunique()
        )

        delayed = (
            frame["delay_days"]
            .fillna(0)
            .gt(0)
            .groupby(
                frame["project_code"]
            )
            .max()
            .sum()
        )

        cost_risk = (
            frame["cost_overrun_pct"]
            .fillna(0)
            .gt(0)
            .groupby(
                frame["project_code"]
            )
            .max()
            .sum()
        )

        trend_rows.append(
            {
                "month": snapshot_month.strftime(
                    "%b"
                ),
                "year": snapshot_month.year,
                "label": snapshot_month.strftime(
                    "%b %Y"
                ),
                "projects": int(total),
                "highRisk": 0,
                "delayed": int(delayed),
                "delayRate": round(
                    (
                        delayed / total * 100
                    )
                    if total > 0
                    else 0,
                    2,
                ),
                "costRisk": int(cost_risk),
            }
        )

    trend_rows = sorted(
        trend_rows,
        key=lambda item: (
            item["year"],
            item["month"],
        ),
    )[-12:]

    # ---------------------------------------------------------
    # Period
    # ---------------------------------------------------------

    latest_period = None

    if trend_rows:
        latest_period = trend_rows[-1][
            "label"
        ]

    return {
        "filters": {
            "period": period,
            "ministry": ministry,
            "sector": sector,
            "state": state,
            "risk": risk,
            "status": status,
        },
        "metrics": {
            "totalProjects": total_projects,
            "highRiskProjects": high_risk_projects,
            "costRiskProjects": cost_risk_projects,
            "delayedProjects": delayed_projects,
        },
        "riskDistribution": risk_distribution,
        "financials": {
            "originalCost": round(
                original_cost,
                2,
            ),
            "revisedCost": round(
                revised_cost,
                2,
            ),
        },

        "projects": records,
        
        "highestRiskProjects":
            highest_risk_projects,
        "monthlyPortfolioData":
            trend_rows,
        "latestPeriod":
            latest_period,
    }