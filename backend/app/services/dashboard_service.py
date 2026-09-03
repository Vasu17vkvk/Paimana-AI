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


# ============================================================
# BASIC HELPERS
# ============================================================

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


def _safe_number(
    value: Any,
    default: float = 0.0,
) -> float:
    if value is None or pd.isna(value):
        return default

    try:
        number = float(value)

        if not np.isfinite(number):
            return default

        return number

    except (TypeError, ValueError):
        return default


# ============================================================
# RISK HELPERS
# ============================================================

def _risk_level_from_score(
    score: float | None,
) -> str:
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


def _load_table(
    table_name: str,
) -> pd.DataFrame:

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


# ============================================================
# LOAD MASTER DATA
# ============================================================

def _load_dashboard_data() -> pd.DataFrame:
    master = _load_table(
        "project_master"
    )

    if "project_code" not in master.columns:
        raise ValueError(
            "project_master is missing project_code."
        )

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

    if "flash_state" not in master.columns:
        master["flash_state"] = ""

    master["flash_state"] = (
        master["flash_state"]
        .fillna("")
        .astype(str)
        .str.strip()
    )

    return master


# ============================================================
# PERIOD HELPERS
# ============================================================

def _period_to_month(
    period: str | None,
) -> pd.Timestamp | None:

    if not period:
        return None

    value = str(
        period
    ).strip()

    if not value:
        return None

    try:
        parsed = pd.to_datetime(
            value,
            format="%B %Y",
            errors="coerce",
        )

        if pd.notna(parsed):
            return parsed.to_period(
                "M"
            ).to_timestamp()

    except Exception:
        pass

    return None


def _filter_projects_by_period(
    projects: pd.DataFrame,
    period: str | None,
) -> pd.DataFrame:

    target_month = _period_to_month(
        period
    )

    if target_month is None:
        return projects

    monthly = _load_table(
        "paimana_monthly_history"
    )

    if (
        "project_code" not in monthly.columns
        or "snapshot_month" not in monthly.columns
    ):
        return projects.iloc[0:0].copy()

    monthly["project_code"] = (
        monthly["project_code"]
        .apply(_to_project_code)
    )

    monthly["snapshot_month"] = pd.to_datetime(
        monthly["snapshot_month"],
        errors="coerce",
    )

    monthly = monthly.dropna(
        subset=[
            "project_code",
            "snapshot_month",
        ]
    ).copy()

    monthly["snapshot_period"] = (
        monthly["snapshot_month"]
        .dt.to_period("M")
        .dt.to_timestamp()
    )

    matching_codes = set(
        monthly.loc[
            monthly["snapshot_period"].eq(
                target_month
            ),
            "project_code",
        ]
    )

    if not matching_codes:
        return projects.iloc[0:0].copy()

    return projects[
        projects["project_code"]
        .isin(matching_codes)
    ].copy()


# ============================================================
# MODEL RISK
# ============================================================

def _attach_ml_risk_scores(
    projects: pd.DataFrame,
    period: str | None = None,
) -> pd.DataFrame:

    result = projects.copy()

    result[
        "predicted_cost_overrun_pct"
    ] = np.nan

    result[
        "future_delay_probability"
    ] = np.nan

    result[
        "future_progress_stall_probability"
    ] = np.nan

    result[
        "cost_risk_score"
    ] = np.nan

    result[
        "overall_risk_score"
    ] = np.nan

    result[
        "risk_level_ml"
    ] = None

    ml = load_ml_ready()

    if ml.empty:
        return result

    ml = ml.copy()

    ml["project_code"] = (
        ml["project_code"]
        .apply(_to_project_code)
    )

    if (
        "snapshot_year" in ml.columns
        and "snapshot_month_num" in ml.columns
    ):
        ml["snapshot_date"] = pd.to_datetime(
            ml["snapshot_year"].astype("Int64").astype(str)
            + "-"
            + ml["snapshot_month_num"]
            .astype("Int64")
            .astype(str)
            .str.zfill(2)
            + "-01",
            errors="coerce",
        )

    target_month = _period_to_month(
        period
    )

    # --------------------------------------------------------
    # Select ML snapshot
    # --------------------------------------------------------

    if (
        target_month is not None
        and "snapshot_date" in ml.columns
    ):
        eligible = ml[
            ml["snapshot_date"]
            .le(target_month)
        ].copy()

        if not eligible.empty:
            ml = eligible

    sort_columns = [
        column
        for column in [
            "snapshot_year",
            "snapshot_month_num",
        ]
        if column in ml.columns
    ]

    if sort_columns:
        ml = ml.sort_values(
            sort_columns
        )

    latest_rows = (
        ml
        .drop_duplicates(
            "project_code",
            keep="last",
        )
        .copy()
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

    # --------------------------------------------------------
    # BATCH MODEL SCORING
    # --------------------------------------------------------

    scores = model_scores_from_features_batch(
        latest_rows,
        batch_size=256,
    )

    if scores.empty:
        return result

    scores = scores.copy()

    scores["project_code"] = (
        scores["project_code"]
        .apply(_to_project_code)
    )

    scores = scores.drop_duplicates(
        "project_code",
        keep="last",
    )

    # IMPORTANT:
    # model_scores_from_features_batch returns
    # overall_risk_score, not overall_risk.
    # --------------------------------------------------------

    risk_columns = [
        "project_code",
        "predicted_cost_overrun_pct",
        "future_delay_probability",
        "future_progress_stall_probability",
        "cost_risk_score",
        "overall_risk_score",
        "risk_level",
    ]

    available_columns = [
        column
        for column in risk_columns
        if column in scores.columns
    ]

    scores = scores[
        available_columns
    ].copy()

    scores = scores.rename(
        columns={
            "risk_level":
                "risk_level_ml",
        }
    )

    result["project_code"] = (
        result["project_code"]
        .apply(_to_project_code)
    )

    result = result.merge(
        scores,
        on="project_code",
        how="left",
        suffixes=(
            "",
            "_risk",
        ),
    )

    # --------------------------------------------------------
    # Resolve merged columns correctly
    # --------------------------------------------------------

    risk_columns_to_apply = [
        "predicted_cost_overrun_pct",
        "future_delay_probability",
        "future_progress_stall_probability",
        "cost_risk_score",
        "overall_risk_score",
        "risk_level_ml",
    ]

    for column in risk_columns_to_apply:

        risk_column = (
            f"{column}_risk"
        )

        if risk_column in result.columns:

            result[column] = (
                result[risk_column]
            )

            result.drop(
                columns=[
                    risk_column
                ],
                inplace=True,
            )

    return result


# ============================================================
# SCHEDULE STATUS
# ============================================================

def _schedule_status(
    row: pd.Series,
) -> str:

    existing = _clean_string(
        row.get("schedule_status")
    )

    if existing:
        return existing

    if (
        _safe_number(
            row.get(
                "is_accelerated"
            ),
            0,
        )
        == 1
    ):
        return "Accelerated"

    if (
        _safe_number(
            row.get(
                "is_delayed"
            ),
            0,
        )
        == 1
    ):
        return "Delayed"

    revised_date = row.get(
        "revised_end_date"
    )

    if (
        revised_date is None
        or pd.isna(revised_date)
        or not _clean_string(
            revised_date
        )
    ):
        return "No Revised Date"

    return "On Schedule"


# ============================================================
# COST STATUS
# ============================================================

def _cost_status(
    row: pd.Series,
) -> str:

    existing = _clean_string(
        row.get("cost_status")
    )

    if existing:
        return existing

    has_cost_overrun = (
        _safe_number(
            row.get(
                "has_cost_overrun"
            ),
            0,
        )
        > 0
    )

    if has_cost_overrun:
        return "Cost Overrun"

    revised_cost = row.get(
        "revised_cost_cr"
    )

    if (
        revised_cost is None
        or pd.isna(revised_cost)
    ):
        return "Revised Cost Not Reported"

    return "No Cost Change"


# ============================================================
# PROJECT RECORDS
# ============================================================

def _build_project_records(
    frame: pd.DataFrame,
) -> list[dict[str, Any]]:

    records: list[
        dict[str, Any]
    ] = []

    for _, row in frame.iterrows():

        score_value = row.get(
            "overall_risk_score"
        )

        if (
            score_value is None
            or pd.isna(score_value)
        ):
            risk_score = None
            risk_level = "Low"

        else:
            risk_score = round(
                _safe_number(
                    score_value
                ),
                2,
            )

            risk_level = (
                _risk_level_from_score(
                    risk_score
                )
            )

        original_cost = _safe_number(
            row.get(
                "original_cost_cr"
            )
        )

        revised_cost_raw = row.get(
            "revised_cost_cr"
        )

        revised_cost = _safe_number(
            revised_cost_raw,
            0.0,
        )

        # Analytical fallback for missing revised cost.
        if (
            revised_cost <= 0
            and "revised_cost_analytical_cr"
            in row.index
        ):
            analytical_cost = _safe_number(
                row.get(
                    "revised_cost_analytical_cr"
                ),
                0.0,
            )

            if analytical_cost > 0:
                revised_cost = (
                    analytical_cost
                )

        # If there is genuinely no revised cost,
        # use original cost for portfolio comparison.
        if revised_cost <= 0:
            revised_cost = (
                original_cost
            )

        delay_days = _safe_number(
            row.get(
                "delay_days"
            )
        )

        delay_months = _safe_number(
            row.get(
                "delay_months"
            )
        )

        if (
            delay_months <= 0
            and delay_days > 0
        ):
            delay_months = (
                delay_days / 30.4375
            )

        progress = _safe_number(
            row.get(
                "flash_latest_physical_progress"
            )
        )

        records.append(
            {
                "id":
                    _to_project_code(
                        row.get(
                            "project_code"
                        )
                    ),

                "name":
                    _clean_string(
                        row.get(
                            "project_name"
                        )
                    ),

                "ministry":
                    _clean_string(
                        row.get(
                            "ministry"
                        )
                    ),

                "sector":
                    _clean_string(
                        row.get(
                            "sector"
                        )
                    ),

                "state":
                    _clean_string(
                        row.get(
                            "flash_state"
                        )
                    ),

                "originalCost":
                    round(
                        original_cost,
                        2,
                    ),

                "revisedCost":
                    round(
                        revised_cost,
                        2,
                    ),

                "riskScore":
                    risk_score,

                "riskLevel":
                    risk_level,

                "costRisk":
                    _cost_status(
                        row
                    ),

                "delayRisk":
                    risk_level,

                "delayMonths":
                    round(
                        max(
                            delay_months,
                            0,
                        ),
                        1,
                    ),

                "physicalProgress":
                    round(
                        min(
                            max(
                                progress,
                                0,
                            ),
                            100,
                        ),
                        1,
                    ),

                "status":
                    _schedule_status(
                        row
                    ),
            }
        )

    return records


# ============================================================
# FILTER OPTIONS
# ============================================================

def get_dashboard_filter_options() -> dict[str, Any]:

    master = _load_dashboard_data()

    def unique_values(
        column: str,
    ) -> list[str]:

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
                date.strftime(
                    "%B %Y"
                )
                for date in dates
            },
            key=lambda value:
                pd.to_datetime(
                    value,
                    format="%B %Y",
                ),
            reverse=True,
        )

    return {
        "periods": periods,

        "ministries":
            unique_values(
                "ministry"
            ),

        "sectors":
            unique_values(
                "sector"
            ),

        "states":
            unique_values(
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


# ============================================================
# DASHBOARD
# ============================================================

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

    # --------------------------------------------------------
    # PERIOD
    # --------------------------------------------------------

    projects = _filter_projects_by_period(
        projects,
        period,
    )

    # --------------------------------------------------------
    # MINISTRY
    # --------------------------------------------------------

    if (
        ministry
        and ministry != "All Ministries"
    ):
        projects = projects[
            projects[
                "ministry"
            ]
            .astype(str)
            .eq(ministry)
        ]

    # --------------------------------------------------------
    # SECTOR
    # --------------------------------------------------------

    if (
        sector
        and sector != "All Sectors"
    ):
        projects = projects[
            projects[
                "sector"
            ]
            .astype(str)
            .eq(sector)
        ]

    # --------------------------------------------------------
    # STATE
    # --------------------------------------------------------

    if (
        state
        and state != "All States"
    ):
        projects = projects[
            projects[
                "flash_state"
            ]
            .astype(str)
            .eq(state)
        ]

    # --------------------------------------------------------
    # SEARCH
    # --------------------------------------------------------

    if search:

        search_value = str(
            search
        ).strip().lower()

        if search_value:

            mask = (
                projects[
                    "project_name"
                ]
                .astype(str)
                .str.lower()
                .str.contains(
                    search_value,
                    na=False,
                    regex=False,
                )
                |
                projects[
                    "project_code"
                ]
                .astype(str)
                .str.lower()
                .str.contains(
                    search_value,
                    na=False,
                    regex=False,
                )
                |
                projects[
                    "ministry"
                ]
                .astype(str)
                .str.lower()
                .str.contains(
                    search_value,
                    na=False,
                    regex=False,
                )
                |
                projects[
                    "sector"
                ]
                .astype(str)
                .str.lower()
                .str.contains(
                    search_value,
                    na=False,
                    regex=False,
                )
            )

            projects = projects[
                mask
            ]

    # --------------------------------------------------------
    # ML RISK
    # --------------------------------------------------------

    projects = _attach_ml_risk_scores(
        projects,
        period=period,
    )

    projects["risk_level_ui"] = (
        projects[
            "overall_risk_score"
        ]
        .apply(
            lambda value:
                _risk_level_from_score(
                    value
                    if pd.notna(value)
                    else None
                )
        )
    )

    # --------------------------------------------------------
    # RISK FILTER
    # --------------------------------------------------------

    if (
        risk
        and risk != "All Risk Levels"
    ):
        projects = projects[
            projects[
                "risk_level_ui"
            ].eq(risk)
        ]

    # --------------------------------------------------------
    # STATUS FILTER
    # --------------------------------------------------------

    if (
        status
        and status != "All Statuses"
    ):

        statuses = projects.apply(
            _schedule_status,
            axis=1,
        )

        projects = projects[
            statuses.eq(status)
        ]

    # --------------------------------------------------------
    # BUILD RECORDS
    # --------------------------------------------------------

    records = _build_project_records(
        projects
    )

    # --------------------------------------------------------
    # KPI METRICS
    # --------------------------------------------------------

    total_projects = len(
        records
    )

    high_risk_projects = sum(
        1
        for item in records
        if item["riskLevel"]
        in {
            "Critical",
            "High",
        }
    )

    # Use curated master flag,
    # not revised > original.
    if "has_cost_overrun" in projects.columns:

        cost_risk_projects = int(
            pd.to_numeric(
                projects[
                    "has_cost_overrun"
                ],
                errors="coerce",
            )
            .fillna(0)
            .gt(0)
            .sum()
        )

    else:

        cost_risk_projects = sum(
            1
            for item in records
            if item["revisedCost"]
            > item["originalCost"]
        )

    # Use curated delay flag.
    if "is_delayed" in projects.columns:

        delayed_projects = int(
            pd.to_numeric(
                projects[
                    "is_delayed"
                ],
                errors="coerce",
            )
            .fillna(0)
            .gt(0)
            .sum()
        )

    else:

        delayed_projects = sum(
            1
            for item in records
            if item["status"]
            == "Delayed"
        )

    # --------------------------------------------------------
    # RISK DISTRIBUTION
    # --------------------------------------------------------

    risk_distribution = {
        "Critical": 0,
        "High": 0,
        "Elevated": 0,
        "Moderate": 0,
        "Low": 0,
    }

    for item in records:

        level = item["riskLevel"]

        if level not in risk_distribution:
            level = "Low"

        risk_distribution[
            level
        ] += 1

    # --------------------------------------------------------
    # EARLY WARNING CENTER
    #
    # Active warning = risk >= 70
    # Immediate warning = risk >= 85
    # Same thresholds as ML warning engine.
    # --------------------------------------------------------

    immediate_warnings = sum(
        1
        for item in records
        if (
            item["riskScore"] is not None
            and item["riskScore"] >= 85
        )
    )

    high_priority_warnings = sum(
        1
        for item in records
        if (
            item["riskScore"] is not None
            and 70 <= item["riskScore"] < 85
        )
    )

    active_warnings = (
        immediate_warnings
        + high_priority_warnings
    )

    early_warning_center = {
        "immediate":
            immediate_warnings,

        "high":
            high_priority_warnings,

        "active":
            active_warnings,
    }

    # --------------------------------------------------------
    # HIGHEST RISK PROJECTS
    # --------------------------------------------------------

    highest_risk_projects = sorted(
        records,
        key=lambda item: (
            item["riskScore"]
            if item["riskScore"]
            is not None
            else -1
        ),
        reverse=True,
    )[:8]

    # --------------------------------------------------------
    # FINANCIALS
    # --------------------------------------------------------

    original_cost = sum(
        item["originalCost"]
        for item in records
    )

    revised_cost = sum(
        item["revisedCost"]
        for item in records
    )

    # --------------------------------------------------------
    # MONTHLY TREND
    #
    # This respects the selected portfolio filters.
    # --------------------------------------------------------

    monthly = _load_table(
        "paimana_monthly_history"
    )

    monthly["project_code"] = (
        monthly[
            "project_code"
        ]
        .apply(_to_project_code)
    )

    monthly["snapshot_month"] = (
        pd.to_datetime(
            monthly[
                "snapshot_month"
            ],
            errors="coerce",
        )
    )

    monthly["delay_days"] = pd.to_numeric(
        monthly.get(
            "delay_days",
            0,
        ),
        errors="coerce",
    ).fillna(0)

    monthly["cost_overrun_pct"] = pd.to_numeric(
        monthly.get(
            "cost_overrun_pct",
            0,
        ),
        errors="coerce",
    ).fillna(0)

    monthly = monthly.dropna(
        subset=[
            "project_code",
            "snapshot_month",
        ]
    )

    # Only include currently filtered project codes.
    selected_codes = set(
        projects[
            "project_code"
        ].astype(str)
    )

    if selected_codes:
        monthly = monthly[
            monthly[
                "project_code"
            ].isin(
                selected_codes
            )
        ]

    trend_rows: list[
        dict[str, Any]
    ] = []

    grouped = monthly.groupby(
        "snapshot_month"
    )

    for (
        snapshot_month,
        frame,
    ) in grouped:

        total = int(
            frame[
                "project_code"
            ].nunique()
        )

        delayed = int(
            frame[
                "delay_days"
            ]
            .gt(0)
            .groupby(
                frame[
                    "project_code"
                ]
            )
            .max()
            .sum()
        )

        cost_risk = int(
            frame[
                "cost_overrun_pct"
            ]
            .gt(0)
            .groupby(
                frame[
                    "project_code"
                ]
            )
            .max()
            .sum()
        )

        trend_rows.append(
            {
                "month":
                    snapshot_month.strftime(
                        "%b"
                    ),

                "year":
                    int(
                        snapshot_month.year
                    ),

                "label":
                    snapshot_month.strftime(
                        "%b %Y"
                    ),

                "projects":
                    total,

                "highRisk":
                    0,

                "delayed":
                    delayed,

                "delayRate":
                    round(
                        (
                            delayed
                            / total
                            * 100
                        )
                        if total
                        else 0,
                        2,
                    ),

                "costRisk":
                    cost_risk,
            }
        )

    trend_rows = sorted(
        trend_rows,
        key=lambda item: (
            item["year"],
            pd.to_datetime(
                item["label"],
                format="%b %Y",
            ),
        ),
    )[-12:]

    latest_period = (
        trend_rows[-1]["label"]
        if trend_rows
        else None
    )

    # --------------------------------------------------------
    # RESPONSE
    # --------------------------------------------------------

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
            "totalProjects":
                total_projects,

            "highRiskProjects":
                high_risk_projects,

            "costRiskProjects":
                cost_risk_projects,

            "delayedProjects":
                delayed_projects,
        },

        "riskDistribution":
            risk_distribution,

        "earlyWarningCenter":
            early_warning_center,

        "financials": {
            "originalCost":
                round(
                    original_cost,
                    2,
                ),

            "revisedCost":
                round(
                    revised_cost,
                    2,
                ),
        },

        "projects":
            records,

        "highestRiskProjects":
            highest_risk_projects,

        "monthlyPortfolioData":
            trend_rows,

        "latestPeriod":
            latest_period,
    }