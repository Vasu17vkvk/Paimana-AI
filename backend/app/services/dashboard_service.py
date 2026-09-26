from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from sqlalchemy import bindparam, text

from app.extensions import db

from app.services.project_analytics_service import (
    model_scores_from_features_batch,
)


# ============================================================
# BASIC HELPERS
# ============================================================

def _to_project_code(value: Any) -> str:
    if value is None:
        return ""

    try:
        if pd.isna(value):
            return ""
    except (TypeError, ValueError):
        pass

    try:
        number = float(value)

        if number.is_integer():
            return str(int(number))

    except (TypeError, ValueError):
        pass

    return str(value).strip()


def _clean_string(value: Any) -> str:
    if value is None:
        return ""

    try:
        if pd.isna(value):
            return ""
    except (TypeError, ValueError):
        pass

    return str(value).strip()


def _safe_number(
    value: Any,
    default: float = 0.0,
) -> float:
    if value is None:
        return default

    try:
        if pd.isna(value):
            return default
    except (TypeError, ValueError):
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


# ============================================================
# LOAD MASTER DATA
# ============================================================

def _load_dashboard_data(
    *,
    period: str | None = None,
    ministry: str | None = None,
    sector: str | None = None,
    state: str | None = None,
    search: str | None = None,
) -> pd.DataFrame:
    """
    Load only the columns required by the dashboard.

    Filtering is pushed into PostgreSQL instead of loading
    the complete project_master table and filtering in Pandas.
    """

    columns = [
        "project_code",
        "project_name",
        "ministry",
        "sector",
        "flash_state",
        "original_cost_cr",
        "revised_cost_cr",
        "revised_cost_analytical_cr",
        "expenditure_cr",
        "delay_days",
        "delay_months",
        "is_delayed",
        "has_cost_overrun",
        "flash_latest_physical_progress",
        "schedule_status",
        "is_accelerated",
        "revised_end_date",
    ]

    query_parts = [
        "SELECT",
        ",\n            ".join(
            f'pm."{column}"'
            for column in columns
        ),
        'FROM "project_master" pm',
        "WHERE pm.project_code IS NOT NULL",
    ]

    params: dict[str, Any] = {}

    # --------------------------------------------------------
    # MINISTRY FILTER
    # --------------------------------------------------------

    if ministry and ministry != "All Ministries":
        query_parts.append(
            'AND pm."ministry" = :ministry'
        )

        params["ministry"] = ministry

    # --------------------------------------------------------
    # SECTOR FILTER
    # --------------------------------------------------------

    if sector and sector != "All Sectors":
        query_parts.append(
            'AND pm."sector" = :sector'
        )

        params["sector"] = sector

    # --------------------------------------------------------
    # STATE FILTER
    # --------------------------------------------------------

    if state and state != "All States":
        query_parts.append(
            'AND pm."flash_state" = :state'
        )

        params["state"] = state

    # --------------------------------------------------------
    # SEARCH
    # --------------------------------------------------------

    if search:

        search_value = str(
            search
        ).strip()

        if search_value:

            query_parts.append(
                """
                AND (
                    CAST(pm.project_code AS TEXT)
                        ILIKE :search_pattern

                    OR COALESCE(
                        pm.project_name,
                        ''
                    ) ILIKE :search_pattern

                    OR COALESCE(
                        pm.ministry,
                        ''
                    ) ILIKE :search_pattern

                    OR COALESCE(
                        pm.sector,
                        ''
                    ) ILIKE :search_pattern
                )
                """
            )

            params["search_pattern"] = (
                f"%{search_value}%"
            )

    # --------------------------------------------------------
    # PERIOD
    #
    # Preserve the old behavior:
    # a project appears for a selected month only if it has
    # a monthly-history snapshot for that month.
    # --------------------------------------------------------

    target_month = _period_to_month(
        period
    )

    if target_month is not None:

        query_parts.append(
            """
            AND EXISTS (
                SELECT 1
                FROM "paimana_monthly_history" mh

                WHERE CAST(
                    mh.project_code
                    AS TEXT
                )
                =
                CAST(
                    pm.project_code
                    AS TEXT
                )

                AND mh.snapshot_month IS NOT NULL

                AND date_trunc(
                    'month',
                    CAST(mh.snapshot_month AS DATE)
                )
                =
                :target_month
            )
            """
        )

        params["target_month"] = (
            target_month.to_pydatetime()
        )

    query_parts.append(
        "ORDER BY pm.project_code"
    )

    query = text(
        "\n".join(
            query_parts
        )
    )

    with db.engine.connect() as connection:

        frame = pd.read_sql(
            query,
            connection,
            params=params,
        )

    if frame.empty:
        return frame

    frame = frame.loc[
        :,
        ~frame.columns.duplicated(),
    ].copy()

    frame["project_code"] = (
        frame["project_code"]
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
        "is_accelerated",
    ]

    for column in numeric_columns:

        if column in frame.columns:

            frame[column] = pd.to_numeric(
                frame[column],
                errors="coerce",
            )

    return frame


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

    parsed = pd.to_datetime(
        value,
        format="%B %Y",
        errors="coerce",
    )

    if pd.isna(parsed):
        return None

    return parsed.to_period(
        "M"
    ).to_timestamp()


# ============================================================
# MODEL RISK
# ============================================================

def _attach_ml_risk_scores(
    projects: pd.DataFrame,
    period: str | None = None,
) -> pd.DataFrame:
    """
    Attach ML risk scores to dashboard projects.

    Important:
    the old implementation loaded ALL rows from
    paimana_ml_ready and only then filtered them.

    This implementation asks PostgreSQL for only the latest
    eligible snapshot belonging to the projects currently
    visible in the dashboard.
    """

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

    if result.empty:
        return result

    result["project_code"] = (
        result["project_code"]
        .apply(_to_project_code)
    )

    selected_codes = [
        code
        for code
        in result[
            "project_code"
        ].astype(str).unique()
        if code
    ]

    if not selected_codes:
        return result

    # --------------------------------------------------------
    # Select only the latest ML row for each selected project.
    # --------------------------------------------------------

    query_sql = """
        SELECT DISTINCT ON (
            CAST(project_code AS TEXT)
        ) *

        FROM "paimana_ml_ready"

        WHERE project_code IS NOT NULL

          AND CAST(
              project_code
              AS TEXT
          ) IN :project_codes
    """

    params: dict[str, Any] = {
        "project_codes": selected_codes,
    }

    target_month = _period_to_month(
        period
    )

    # --------------------------------------------------------
    # For a selected historical period, use the latest ML
    # snapshot available on or before that month.
    # --------------------------------------------------------

    if target_month is not None:

        query_sql += """
            AND (
                CAST(
                    snapshot_year
                    AS INTEGER
                ) < :target_year

                OR (
                    CAST(
                        snapshot_year
                        AS INTEGER
                    ) = :target_year

                    AND CAST(
                        snapshot_month_num
                        AS INTEGER
                    ) <= :target_month_num
                )
            )
        """

        params["target_year"] = int(
            target_month.year
        )

        params[
            "target_month_num"
        ] = int(
            target_month.month
        )

    query_sql += """
        ORDER BY
            CAST(project_code AS TEXT),
            snapshot_year DESC,
            snapshot_month_num DESC
    """

    query = (
        text(query_sql)
        .bindparams(
            bindparam(
                "project_codes",
                expanding=True,
            )
        )
    )

    with db.engine.connect() as connection:

        ml = pd.read_sql(
            query,
            connection,
            params=params,
        )

    if ml.empty:
        return result

    ml = ml.loc[
        :,
        ~ml.columns.duplicated(),
    ].copy()

    ml["project_code"] = (
        ml["project_code"]
        .apply(_to_project_code)
    )

    # --------------------------------------------------------
    # Keep the existing ML calculation for now.
    #
    # We will remove runtime ML scoring later when the
    # predictions table becomes the primary read model.
    # --------------------------------------------------------

    scores = model_scores_from_features_batch(
        ml,
        batch_size=256,
    )

    if scores.empty:
        return result

    scores = scores.loc[
        :,
        ~scores.columns.duplicated(),
    ].copy()

    scores["project_code"] = (
        scores["project_code"]
        .apply(_to_project_code)
    )

    scores = scores.drop_duplicates(
        "project_code",
        keep="last",
    )

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
            "risk_level": "risk_level_ml",
        }
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

    for column in [
        "predicted_cost_overrun_pct",
        "future_delay_probability",
        "future_progress_stall_probability",
        "cost_risk_score",
        "overall_risk_score",
        "risk_level_ml",
    ]:

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
        row.get(
            "schedule_status"
        )
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

    if revised_date is None:
        return "No Revised Date"

    try:
        if pd.isna(revised_date):
            return "No Revised Date"

    except (
        TypeError,
        ValueError,
    ):
        pass

    if not _clean_string(
        revised_date
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
        row.get(
            "cost_status"
        )
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

    if revised_cost is None:
        return "Revised Cost Not Reported"

    try:
        if pd.isna(revised_cost):
            return "Revised Cost Not Reported"

    except (
        TypeError,
        ValueError,
    ):
        pass

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

        revised_cost = _safe_number(
            row.get(
                "revised_cost_cr"
            ),
            0.0,
        )

        if (
            revised_cost <= 0
            and
            "revised_cost_analytical_cr"
            in row.index
        ):

            analytical_cost = (
                _safe_number(
                    row.get(
                        "revised_cost_analytical_cr"
                    ),
                    0.0,
                )
            )

            if analytical_cost > 0:
                revised_cost = (
                    analytical_cost
                )

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

    def distinct_values(
        column: str,
    ) -> list[str]:

        query = text(
            f"""
            SELECT DISTINCT
                "{column}" AS value

            FROM "project_master"

            WHERE "{column}" IS NOT NULL

              AND TRIM(
                    CAST(
                        "{column}"
                        AS TEXT
                    )
                  ) <> ''

            ORDER BY value
            """
        )

        with db.engine.connect() as connection:

            rows = (
                connection.execute(
                    query
                )
                .scalars()
                .all()
            )

        return [
            str(value).strip()
            for value in rows
            if str(value).strip()
        ]

    # --------------------------------------------------------
    # Period options are generated directly by PostgreSQL.
    # --------------------------------------------------------

    period_query = text(
        """
        SELECT
            TO_CHAR(
                date_trunc(
                    'month',
                    CAST(snapshot_month AS DATE)
                ),
                'FMMonth YYYY'
            ) AS label

        FROM "paimana_monthly_history"

        WHERE snapshot_month IS NOT NULL

        GROUP BY date_trunc(
            'month',
            CAST(snapshot_month AS DATE)
        )

        ORDER BY date_trunc(
            'month',
            CAST(snapshot_month AS DATE)
        ) DESC
        """
    )

    with db.engine.connect() as connection:

        period_rows = (
            connection.execute(
                period_query
            )
            .scalars()
            .all()
        )

    return {
        "periods": [
            str(value)
            for value in period_rows
            if value
        ],

        "ministries":
            distinct_values(
                "ministry"
            ),

        "sectors":
            distinct_values(
                "sector"
            ),

        "states":
            distinct_values(
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
# MONTHLY TREND
# ============================================================

def _get_monthly_trend(
    selected_codes: list[str],
) -> list[dict[str, Any]]:

    if not selected_codes:
        return []

    query = (
        text(
            """
            SELECT
                date_trunc(
                    'month',
                    CAST(snapshot_month AS DATE)
                ) AS snapshot_month,

                COUNT(
                    DISTINCT
                    CAST(
                        project_code
                        AS TEXT
                    )
                ) AS projects,

                COUNT(
                    DISTINCT CASE
                        WHEN COALESCE(
                            delay_days,
                            0
                        ) > 0

                        THEN CAST(
                            project_code
                            AS TEXT
                        )
                    END
                ) AS delayed,

                COUNT(
                    DISTINCT CASE
                        WHEN COALESCE(
                            cost_overrun_pct,
                            0
                        ) > 0

                        THEN CAST(
                            project_code
                            AS TEXT
                        )
                    END
                ) AS cost_risk

            FROM "paimana_monthly_history"

            WHERE project_code IS NOT NULL

              AND snapshot_month IS NOT NULL

              AND CAST(
                    project_code
                    AS TEXT
                  ) IN :project_codes

            GROUP BY date_trunc(
                'month',
                CAST(snapshot_month AS DATE)
            )

            ORDER BY snapshot_month DESC

            LIMIT 12
            """
        )
        .bindparams(
            bindparam(
                "project_codes",
                expanding=True,
            )
        )
    )

    with db.engine.connect() as connection:

        rows = (
            connection.execute(
                query,
                {
                    "project_codes":
                        selected_codes
                },
            )
            .mappings()
            .all()
        )

    rows = list(
        reversed(rows)
    )

    trend_rows: list[
        dict[str, Any]
    ] = []

    for row in rows:

        snapshot_month = (
            row[
                "snapshot_month"
            ]
        )

        total = int(
            row[
                "projects"
            ]
            or 0
        )

        delayed = int(
            row[
                "delayed"
            ]
            or 0
        )

        cost_risk = int(
            row[
                "cost_risk"
            ]
            or 0
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

    return trend_rows


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

    # --------------------------------------------------------
    # Load already-filtered project data from PostgreSQL.
    # --------------------------------------------------------

    projects = _load_dashboard_data(
        period=period,
        ministry=ministry,
        sector=sector,
        state=state,
        search=search,
    )

    # --------------------------------------------------------
    # Add current ML risk.
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
    # BUILD PROJECT RECORDS
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
        if item[
            "riskLevel"
        ]
        in {
            "Critical",
            "High",
        }
    )

    if (
        "has_cost_overrun"
        in projects.columns
    ):

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
            if item[
                "revisedCost"
            ]
            >
            item[
                "originalCost"
            ]
        )

    if (
        "is_delayed"
        in projects.columns
    ):

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
            if item[
                "status"
            ]
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

        level = item[
            "riskLevel"
        ]

        if level not in risk_distribution:
            level = "Low"

        risk_distribution[
            level
        ] += 1

    # --------------------------------------------------------
    # EARLY WARNING CENTER
    # --------------------------------------------------------

    immediate_warnings = sum(
        1
        for item in records
        if (
            item["riskScore"]
            is not None

            and
            item["riskScore"]
            >= 85
        )
    )

    high_priority_warnings = sum(
        1
        for item in records
        if (
            item["riskScore"]
            is not None

            and
            70
            <=
            item["riskScore"]
            <
            85
        )
    )

    active_warnings = (
        immediate_warnings
        +
        high_priority_warnings
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
    # Important:
    # only project codes surviving all dashboard filters
    # are included.
    # --------------------------------------------------------

    selected_codes = [
        str(code)
        for code
        in projects[
            "project_code"
        ].astype(str).unique()
        if str(code).strip()
    ]

    trend_rows = _get_monthly_trend(
        selected_codes
    )

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