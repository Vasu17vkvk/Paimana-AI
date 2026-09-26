"""PAIMANA AI Sector / Ministry Analytics production service.

Uses PostgreSQL project and monitoring data together with the existing
production PAIMANA ML engine for predictive risk analytics.
"""
from __future__ import annotations

import math
import re
from pathlib import Path
from typing import Any, Optional

import numpy as np
import pandas as pd

from sqlalchemy import bindparam, text

from app.extensions import db

from app.ml import engine

ML_RISK_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]

ML_WARNING_PRIORITIES = ["NONE", "HIGH", "IMMEDIATE"]

DEFAULT_DATA_DIR = Path(__file__).resolve().parents[2] / "data"
MASTER_FILE = "01_PROJECT_MASTER_CLEANED.csv"
MONTHLY_FILE = "02_PAIMANA_MONTHLY_HISTORY_CLEAN.csv"


REQUIRED_MASTER_COLUMNS = {
    "project_code", "sector", "ministry", "original_cost_cr", "revised_cost_cr",
    "revised_cost_analytical_cr", "expenditure_cr", "final_expenditure_cr",
    "cost_overrun_pct", "final_cost_overrun_pct", "delay_days", "delay_months",
    "is_delayed", "has_cost_overrun", "data_quality_flag",
    "extreme_cost_overrun_flag", "extreme_schedule_change_flag",
    "flash_progress_stagnation_flag", "flash_low_progress_flag",
}
REQUIRED_MONTHLY_COLUMNS = {
    "project_code", "snapshot_month", "sector", "ministry", "revised_cost_cr",
    "expenditure_cr", "delay_days", "cost_overrun_pct",
}




def _require_columns(df: pd.DataFrame, required: set[str], source: str) -> None:
    missing = sorted(required - set(df.columns))
    if missing:
        raise ValueError(f"{source} is missing required columns: {', '.join(missing)}")


def _read_csv(path: Path) -> pd.DataFrame:
    return pd.read_csv(path, low_memory=False)


def load_data(
    data_dir: Optional[str | Path] = None,
    *,
    ministry: Optional[str] = None,
    sector: Optional[str] = None,
    state: Optional[str] = None,
    snapshot_month: Optional[str] = None,
    financial_year_filter: Optional[str] = None,
) -> tuple[
    pd.DataFrame,
    pd.DataFrame,
]:
    """
    Load only the project and monthly rows required by the
    current Sector / Ministry Analytics request.

    Filtering is performed in PostgreSQL before Pandas receives
    the data.

    This is intentionally designed to reduce Flask worker memory
    usage on constrained deployments such as Render free tier.
    """

    # ========================================================
    # NORMALIZE FILTERS
    # ========================================================

    ministry = (
        str(ministry).strip()
        if ministry
        else None
    )

    sector = (
        str(sector).strip()
        if sector
        else None
    )

    state = (
        str(state).strip()
        if state
        else None
    )

    if ministry in {
        "",
        "All Ministries",
    }:
        ministry = None

    if sector in {
        "",
        "All Sectors",
    }:
        sector = None

    if state in {
        "",
        "All States",
    }:
        state = None

    if financial_year_filter in {
        "",
        "All Years",
    }:
        financial_year_filter = None

    if snapshot_month in {
        "",
        "All Months",
    }:
        snapshot_month = None

    # ========================================================
    # MASTER QUERY
    # ========================================================

    master_sql = """
        SELECT
            TRIM(
                CAST(project_code AS TEXT)
            ) AS project_code,
            project_name,
            sector,
            ministry,

            original_cost_cr,
            revised_cost_cr,
            revised_cost_analytical_cr,
            expenditure_cr,
            final_expenditure_cr,

            cost_overrun_cr,
            cost_overrun_pct,
            final_cost_overrun_pct,

            delay_days,
            delay_months,

            is_delayed,
            has_cost_overrun,

            data_quality_flag,

            extreme_cost_overrun_flag,
            extreme_schedule_change_flag,

            flash_progress_stagnation_flag,
            flash_low_progress_flag,

            flash_latest_physical_progress,
            flash_state,

            expenditure_pct

        FROM "project_master"

        WHERE project_code IS NOT NULL
    """

    master_params: dict[str, Any] = {}

    # --------------------------------------------------------
    # MINISTRY
    # --------------------------------------------------------

    if ministry:

        master_sql += """
            AND ministry = :ministry
        """

        master_params[
            "ministry"
        ] = ministry

    # --------------------------------------------------------
    # SECTOR
    # --------------------------------------------------------

    if sector:

        master_sql += """
            AND sector = :sector
        """

        master_params[
            "sector"
        ] = sector

    # --------------------------------------------------------
    # STATE / UT
    # --------------------------------------------------------

    if state:

        master_sql += """
            AND flash_state = :state
        """

        master_params[
            "state"
        ] = state

    # --------------------------------------------------------
    # PERIOD MEMBERSHIP
    #
    # A project remains eligible only when it has at least one
    # monthly-history record matching the requested period.
    # --------------------------------------------------------

    period_conditions: list[str] = []
    period_params: dict[str, Any] = {}

    # --------------------------------------------------------
    # SNAPSHOT MONTH
    # --------------------------------------------------------

    if snapshot_month:

        target_month = pd.to_datetime(
            snapshot_month,
            errors="coerce",
        )

        if pd.isna(target_month):

            raise ValueError(
                "snapshot_month must be "
                "YYYY-MM or YYYY-MM-DD."
            )

        period_start = (
            target_month
            .to_period("M")
            .to_timestamp()
        )

        period_end = (
            period_start
            + pd.offsets.MonthBegin(1)
        )

        period_conditions.append(
            """
            CAST(
                mh.snapshot_month
                AS DATE
            ) >= :period_start

            AND CAST(
                mh.snapshot_month
                AS DATE
            ) < :period_end
            """
        )

        period_params[
            "period_start"
        ] = period_start.to_pydatetime()

        period_params[
            "period_end"
        ] = period_end.to_pydatetime()

    # --------------------------------------------------------
    # FINANCIAL YEAR
    # --------------------------------------------------------

    elif financial_year_filter:

        fy_match = re.search(
            r"(20\d{2})\s*-\s*(\d{2,4})",
            str(
                financial_year_filter
            ),
        )

        if not fy_match:

            raise ValueError(
                "financial_year_filter must "
                "use YYYY-YY or YYYY-YYYY format."
            )

        fy_start = int(
            fy_match.group(1)
        )

        fy_end_part = (
            fy_match.group(2)
        )

        fy_end = (
            int(
                f"20{fy_end_part}"
            )
            if len(fy_end_part) == 2
            else int(fy_end_part)
        )

        period_conditions.append(
            """
            (
                (
                    EXTRACT(
                        YEAR
                        FROM CAST(
                            mh.snapshot_month
                            AS DATE
                        )
                    ) = :fy_start

                    AND EXTRACT(
                        MONTH
                        FROM CAST(
                            mh.snapshot_month
                            AS DATE
                        )
                    ) >= 4
                )

                OR

                (
                    EXTRACT(
                        YEAR
                        FROM CAST(
                            mh.snapshot_month
                            AS DATE
                        )
                    ) = :fy_end

                    AND EXTRACT(
                        MONTH
                        FROM CAST(
                            mh.snapshot_month
                            AS DATE
                        )
                    ) <= 3
                )
            )
            """
        )

        period_params[
            "fy_start"
        ] = fy_start

        period_params[
            "fy_end"
        ] = fy_end

    # --------------------------------------------------------
    # ADD EXISTS ONLY WHEN A TEMPORAL FILTER IS ACTIVE
    # --------------------------------------------------------

    if period_conditions:

        master_sql += """
            AND EXISTS (
                SELECT 1

                FROM "paimana_monthly_history" mh

                WHERE TRIM(
                    CAST(
                        mh.project_code
                        AS TEXT
                    )
                )
                =
                TRIM(
                    CAST(
                        project_master.project_code
                        AS TEXT
                    )
)

                AND mh.snapshot_month IS NOT NULL

                AND (
        """

        master_sql += "\n".join(
            period_conditions
        )

        master_sql += """
                )
            )
        """

    master_sql += """
        ORDER BY project_code
    """

    master_params.update(
        period_params
    )

    master_query = text(
        master_sql
    )

    with db.engine.connect() as connection:

        master = pd.read_sql(
            master_query,
            connection,
            params=master_params,
        )

    if master.empty:

        raise ValueError(
            "No projects match the selected "
            "Sector / Ministry Analytics filters."
        )

    # SQL projection already guarantees unique columns.

    # ========================================================
    # BASIC MASTER NORMALIZATION
    # ========================================================

    _require_columns(
        master,
        REQUIRED_MASTER_COLUMNS,
        "project_master",
    )

    

    master_numeric = [
        "original_cost_cr",
        "revised_cost_cr",
        "revised_cost_analytical_cr",
        "expenditure_cr",
        "final_expenditure_cr",
        "cost_overrun_cr",
        "cost_overrun_pct",
        "final_cost_overrun_pct",
        "delay_days",
        "delay_months",
        "flash_latest_physical_progress",
        "expenditure_pct",
    ]

    for column in master_numeric:

        if column in master.columns:

            master[column] = pd.to_numeric(
                master[column],
                errors="coerce",
            )

    for column in [
        "is_delayed",
        "has_cost_overrun",
        "extreme_cost_overrun_flag",
        "extreme_schedule_change_flag",
        "flash_progress_stagnation_flag",
        "flash_low_progress_flag",
    ]:

        if column in master.columns:

            master[column] = (
                pd.to_numeric(
                    master[column],
                    errors="coerce",
                )
                .fillna(0)
                .astype(int)
            )

    # ========================================================
    # MONTHLY QUERY
    #
    # Only load monthly history belonging to the already
    # filtered project population.
    # ========================================================

    project_codes = [
        str(code).strip()
        for code
        in master[
            "project_code"
        ].unique()
        if str(code).strip()
    ]

    if not project_codes:

        monthly = pd.DataFrame(
            columns=[
                "project_code",
                "snapshot_month",
                "sector",
                "ministry",
                "revised_cost_cr",
                "expenditure_cr",
                "delay_days",
                "cost_overrun_pct",
            ]
        )

    else:

        monthly_sql = """
            SELECT
                TRIM(
                    CAST(project_code AS TEXT)
                ) AS project_code,
                snapshot_month,

                sector,
                ministry,

                revised_cost_cr,
                expenditure_cr,
                delay_days,
                cost_overrun_pct

            FROM "paimana_monthly_history" mh

            WHERE project_code IS NOT NULL

              AND snapshot_month IS NOT NULL

              AND TRIM(
                    CAST(project_code AS TEXT)
                    ) IN :project_codes
        """

        monthly_params: dict[
            str,
            Any,
        ] = {
            "project_codes":
                project_codes,
        }

        # ----------------------------------------------------
        # Apply the same temporal restriction in SQL.
        # ----------------------------------------------------

        if period_conditions:

            monthly_sql += """
                AND (
            """

            monthly_sql += "\n".join(
                period_conditions
            )

            monthly_sql += """
                )
            """

            monthly_params.update(
                period_params
            )

        monthly_sql += """
            ORDER BY
                TRIM(
                    CAST(project_code AS TEXT)
                ),
                CAST(snapshot_month AS DATE)
        """

        monthly_query = (
            text(monthly_sql)
            .bindparams(
                bindparam(
                    "project_codes",
                    expanding=True,
                )
            )
        )

        with db.engine.connect() as connection:

            monthly = pd.read_sql(
                monthly_query,
                connection,
                params=monthly_params,
            )

    # SQL projection already guarantees unique columns.

    # ========================================================
    # VALIDATE MONTHLY DATA
    # ========================================================

    _require_columns(
        monthly,
        REQUIRED_MONTHLY_COLUMNS,
        "paimana_monthly_history",
    )

    # ========================================================
    # DATE / NUMERIC NORMALIZATION
    # ========================================================

    monthly[
        "snapshot_month"
    ] = pd.to_datetime(
        monthly[
            "snapshot_month"
        ],
        errors="coerce",
    )

    monthly = monthly.dropna(
        subset=[
            "project_code",
            "snapshot_month",
        ]
    )

    

    monthly_numeric = [
        "revised_cost_cr",
        "expenditure_cr",
        "delay_days",
        "cost_overrun_pct",
    ]

    for column in monthly_numeric:

        if column in monthly.columns:

            monthly[column] = pd.to_numeric(
                monthly[column],
                errors="coerce",
            )

    return master, monthly

def get_filter_options() -> dict[str, list[str]]:
    """
    Return current Sector / Ministry Analytics filter options
    directly from PostgreSQL.

    No complete Pandas tables are loaded just to populate the
    filter dropdowns.
    """

    def clean_values(
        values,
    ) -> list[str]:
        result: list[str] = []

        for value in values:
            if value is None:
                continue

            text_value = str(
                value
            ).strip()

            if not text_value:
                continue

            result.append(
                text_value
            )

        return list(
            dict.fromkeys(
                result
            )
        )

    # ========================================================
    # DISTINCT MASTER DIMENSIONS
    # ========================================================

    def get_distinct_values(
        column: str,
    ) -> list[str]:

        allowed_columns = {
            "ministry",
            "sector",
            "flash_state",
        }

        if column not in allowed_columns:
            raise ValueError(
                f"Unsupported filter column: {column}"
            )

        query = text(
            f"""
            SELECT DISTINCT
                TRIM(
                    CAST(
                        "{column}"
                        AS TEXT
                    )
                ) AS value

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

        return clean_values(
            rows
        )

    # ========================================================
    # MINISTRIES
    # ========================================================

    ministries = get_distinct_values(
        "ministry"
    )

    # ========================================================
    # SECTORS
    # ========================================================

    sectors = get_distinct_values(
        "sector"
    )

    # ========================================================
    # STATES / UTs
    # ========================================================

    states = get_distinct_values(
        "flash_state"
    )

    # ========================================================
    # FINANCIAL YEARS
    #
    # snapshot_month is TEXT in PostgreSQL, so explicitly cast
    # it before extracting year/month.
    # ========================================================

    financial_year_query = text(
        """
        SELECT DISTINCT
            EXTRACT(
                YEAR
                FROM CAST(
                    snapshot_month
                    AS DATE
                )
            ) AS snapshot_year,

            EXTRACT(
                MONTH
                FROM CAST(
                    snapshot_month
                    AS DATE
                )
            ) AS snapshot_month

        FROM "paimana_monthly_history" mh

        WHERE snapshot_month IS NOT NULL

          AND TRIM(
                CAST(
                    snapshot_month
                    AS TEXT
                )
              ) <> ''

        ORDER BY
            snapshot_year DESC,
            snapshot_month DESC
        """
    )

    with db.engine.connect() as connection:

        financial_rows = (
            connection.execute(
                financial_year_query
            )
            .mappings()
            .all()
        )

    financial_years: list[str] = []

    for row in financial_rows:

        year_value = row[
            "snapshot_year"
        ]

        month_value = row[
            "snapshot_month"
        ]

        if (
            year_value is None
            or month_value is None
        ):
            continue

        year = int(
            year_value
        )

        month = int(
            month_value
        )

        # Indian financial year:
        # April -> March
        start_year = (
            year
            if month >= 4
            else year - 1
        )

        financial_years.append(
            f"{start_year}-{str(start_year + 1)[-2:]}"
        )

    financial_years = sorted(
        set(
            financial_years
        ),
        reverse=True,
    )

    # ========================================================
    # SNAPSHOT MONTHS
    # ========================================================

    snapshot_month_query = text(
        """
        SELECT
            TO_CHAR(
                date_trunc(
                    'month',
                    CAST(
                        snapshot_month
                        AS DATE
                    )
                ),
                'YYYY-MM'
            ) AS snapshot_month

        FROM "paimana_monthly_history"

        WHERE snapshot_month IS NOT NULL

        AND TRIM(
                CAST(
                    snapshot_month
                    AS TEXT
                )
            ) <> ''

        GROUP BY
            date_trunc(
                'month',
                CAST(
                    snapshot_month
                    AS DATE
                )
            )

        ORDER BY
            date_trunc(
                'month',
                CAST(
                    snapshot_month
                    AS DATE
                )
            ) DESC
        """
    )

    with db.engine.connect() as connection:

        snapshot_rows = (
            connection.execute(
                snapshot_month_query
            )
            .mappings()
            .all()
        )

    snapshot_months = clean_values(
        [
            row["snapshot_month"]
            for row in snapshot_rows
        ]
    )

    # ========================================================
    # RETURN
    # ========================================================

    return {
        "ministries":
            ministries,

        "sectors":
            sectors,

        "states":
            states,

        "financial_years":
            financial_years,

        "snapshot_months":
            snapshot_months,
    }


def financial_year(value: pd.Timestamp) -> Optional[str]:
    if pd.isna(value):
        return None
    year = int(value.year)
    start_year = year if int(value.month) >= 4 else year - 1
    return f"{start_year}-{str(start_year + 1)[-2:]}"


def normalize_snapshot_month(value: Optional[str]) -> Optional[pd.Period]:
    if value is None:
        return None
    value = str(value).strip()
    if not value or value in {"All Months", "all", "All"}:
        return None
    parsed = pd.to_datetime(value, errors="coerce")
    if pd.isna(parsed):
        raise ValueError("snapshot_month must be YYYY-MM or YYYY-MM-DD.")
    return parsed.to_period("M")


def _normalize_filter(value: Optional[str], all_value: str) -> Optional[str]:
    if value is None:
        return None
    value = str(value).strip()
    return None if not value or value == all_value else value



def _master_membership(
    master: pd.DataFrame,
    monthly: pd.DataFrame,
    *,
    ministry,
    sector,
    state,
    snapshot_month,
    financial_year_filter,
) -> pd.DataFrame:
    """
    Return the already-filtered project-master DataFrame.

    All membership filters are now applied by load_data()
    in PostgreSQL before the DataFrame is created.

    The parameters are retained for compatibility with the
    existing generate_analytics() call.
    """

    return master


def _temporal_snapshot(
    monthly: pd.DataFrame,
    *,
    snapshot_month,
    financial_year_filter,
) -> Optional[pd.DataFrame]:
    """
    Return the latest monthly observation for each selected
    project when a temporal filter is active.

    load_data() already applies the requested temporal filters
    in PostgreSQL and orders monthly rows by project_code and
    snapshot_month.

    Therefore no additional full DataFrame sort is required here.
    """

    if (
        not snapshot_month
        and not financial_year_filter
    ):
        return None

    if monthly.empty:
        return monthly

    return monthly.drop_duplicates(
        "project_code",
        keep="last",
    )


def _temporal_metrics_frame(
    master_df: pd.DataFrame,
    temporal_snapshot: Optional[pd.DataFrame],
) -> pd.DataFrame:
    """
    Combine the selected project-master population with the
    already-deduplicated temporal snapshot.

    temporal_snapshot is expected to contain at most one row
    per project_code because _temporal_snapshot() performs the
    project-level reduction first.

    Keep the working frame narrow to reduce Pandas memory usage.
    """

    if temporal_snapshot is None:
        return master_df.copy()

    if temporal_snapshot.empty:
        return master_df.iloc[0:0].copy()

    # ========================================================
    # TEMPORAL SIDE
    # ========================================================

    temporal_columns = [
        "project_code",
        "snapshot_month",
        "revised_cost_cr",
        "expenditure_cr",
        "delay_days",
        "cost_overrun_pct",
        "sector",
        "ministry",
    ]

    temporal_available = [
        column
        for column in temporal_columns
        if column in temporal_snapshot.columns
    ]

    temporal = temporal_snapshot[
        temporal_available
    ]

    # ========================================================
    # MASTER SIDE
    # ========================================================

    master_columns = [
        "project_code",
        "project_name",
        "sector",
        "ministry",
        "original_cost_cr",
        "revised_cost_analytical_cr",
        "data_quality_flag",
        "flash_progress_stagnation_flag",
        "flash_low_progress_flag",
        "extreme_schedule_change_flag",
        "extreme_cost_overrun_flag",
        "expenditure_pct",
        "flash_latest_physical_progress",
        "flash_state",
        "delay_months",
    ]

    master_available = [
        column
        for column in master_columns
        if column in master_df.columns
    ]

    base = master_df[
        master_available
    ]

    # ========================================================
    # MERGE
    # ========================================================

    frame = base.merge(
        temporal,
        on="project_code",
        how="inner",
        suffixes=(
            "_master",
            "_temporal",
        ),
    )

    if frame.empty:
        return frame

    # ========================================================
    # GROUPING DIMENSIONS
    #
    # Preserve the existing behavior:
    # master value wins when present, temporal value is fallback.
    # ========================================================

    for column in [
        "sector",
        "ministry",
    ]:

        master_column = (
            f"{column}_master"
        )

        temporal_column = (
            f"{column}_temporal"
        )

        if (
            master_column in frame.columns
            and temporal_column in frame.columns
        ):

            frame[column] = (
                frame[master_column]
                .combine_first(
                    frame[temporal_column]
                )
            )

            frame.drop(
                columns=[
                    master_column,
                    temporal_column,
                ],
                inplace=True,
            )

        elif master_column in frame.columns:

            frame.rename(
                columns={
                    master_column:
                        column,
                },
                inplace=True,
            )

        elif temporal_column in frame.columns:

            frame.rename(
                columns={
                    temporal_column:
                        column,
                },
                inplace=True,
            )

    # ========================================================
    # NUMERIC COLUMNS
    # ========================================================

    for column in [
        "original_cost_cr",
        "revised_cost_cr",
        "expenditure_cr",
        "delay_days",
        "cost_overrun_pct",
    ]:

        if column in frame.columns:

            frame[column] = pd.to_numeric(
                frame[column],
                errors="coerce",
            )

    # ========================================================
    # TEMPORAL FLAGS
    # ========================================================

    if "delay_days" in frame.columns:

        frame["is_delayed"] = (
            frame[
                "delay_days"
            ]
            .fillna(0)
            .gt(0)
            .astype(int)
        )

    else:

        frame["is_delayed"] = 0

    if "cost_overrun_pct" in frame.columns:

        frame["has_cost_overrun"] = (
            frame[
                "cost_overrun_pct"
            ]
            .fillna(0)
            .gt(0)
            .astype(int)
        )

    else:

        frame["has_cost_overrun"] = 0

    # ========================================================
    # DELAY MONTHS
    #
    # paimana_monthly_history currently supplies delay_days,
    # so use the documented 30-day fallback.
    # ========================================================

    frame["delay_months"] = (
        frame["delay_days"]
        / 30.0
    )

    # ========================================================
    # ANALYTICAL COST
    # ========================================================

    original = pd.to_numeric(
        frame.get(
            "original_cost_cr",
            pd.Series(
                np.nan,
                index=frame.index,
            ),
        ),
        errors="coerce",
    )

    revised = pd.to_numeric(
        frame.get(
            "revised_cost_cr",
            pd.Series(
                np.nan,
                index=frame.index,
            ),
        ),
        errors="coerce",
    )

    valid = (
        original.notna()
        & revised.notna()
        & (original > 0)
        & (revised > 0)
        & (revised >= original)
    )

    frame["analytics_cost_cr"] = np.where(
        valid,
        revised,
        original,
    )

    frame["final_expenditure_cr"] = (
        frame["expenditure_cr"]
    )

    return frame


def validated_cost_change_exposure(df: pd.DataFrame) -> float:
    if df is None or df.empty:
        return 0.0
    original = pd.to_numeric(df["original_cost_cr"], errors="coerce")
    revised = pd.to_numeric(df["revised_cost_cr"], errors="coerce")
    valid = original.notna() & revised.notna() & (original > 0) & (revised > 0) & (revised >= original)
    return float((revised[valid] - original[valid]).sum())


def safe_divide(numerator, denominator) -> float:
    if denominator in (0, None) or pd.isna(denominator):
        return 0.0
    return float(numerator) / float(denominator)


def _portfolio_kpis(
    metrics_df: pd.DataFrame,
) -> dict[str, Any]:

    if metrics_df.empty:
        return {
            "total_projects": 0,
            "total_original_cost_cr": 0.0,
            "total_revised_cost_cr": 0.0,
            "total_analytical_cost_cr": 0.0,
            "total_expenditure_cr": 0.0,
            "total_cost_change_exposure_cr": 0.0,
            "total_cost_increase_cr": 0.0,
            "cost_overrun_projects": 0,
            "projects_with_cost_overrun": 0,
            "cost_overrun_rate_pct": 0.0,
            "avg_cost_overrun_pct": 0.0,
            "delayed_projects": 0,
            "delay_rate_pct": 0.0,
            "avg_delay_months": 0.0,
            "data_quality": {
                "projects_flagged": 0,
                "rate_pct": 0.0,
                "definition": (
                    "Projects where master data_quality_flag is non-OK; "
                    "this is not a count of all missing fields."
                ),
            },
        }

    # ------------------------------------------------------------
    # Descriptive portfolio fields
    # ------------------------------------------------------------

    if "analytics_cost_cr" not in metrics_df.columns:

        if "revised_cost_analytical_cr" in metrics_df.columns:
            analytical = pd.to_numeric(
                metrics_df["revised_cost_analytical_cr"],
                errors="coerce",
            )
        else:
            analytical = pd.Series(
                np.nan,
                index=metrics_df.index,
            )

        if "original_cost_cr" in metrics_df.columns:
            original = pd.to_numeric(
                metrics_df["original_cost_cr"],
                errors="coerce",
            )
        else:
            original = pd.Series(
                np.nan,
                index=metrics_df.index,
            )

        metrics_df["analytics_cost_cr"] = (
            analytical.fillna(original)
        )

    if "final_expenditure_cr" not in metrics_df.columns:

        if "expenditure_cr" in metrics_df.columns:
            metrics_df["final_expenditure_cr"] = pd.to_numeric(
                metrics_df["expenditure_cr"],
                errors="coerce",
            )
        else:
            metrics_df["final_expenditure_cr"] = 0.0

    for column in [
        "original_cost_cr",
        "revised_cost_cr",
        "analytics_cost_cr",
        "final_expenditure_cr",
        "cost_overrun_pct",
        "delay_months",
        "is_delayed",
        "has_cost_overrun",
    ]:

        if column not in metrics_df.columns:
            metrics_df[column] = 0.0

        metrics_df[column] = pd.to_numeric(
            metrics_df[column],
            errors="coerce",
        )

    if "data_quality_flag" not in metrics_df.columns:
        metrics_df["data_quality_flag"] = "OK"

    n = int(
        metrics_df["project_code"].nunique()
    )

    delayed = int(
        metrics_df["is_delayed"]
        .fillna(0)
        .sum()
    )

    overrun = int(
        metrics_df["has_cost_overrun"]
        .fillna(0)
        .sum()
    )

    data_issues = int(
        metrics_df["data_quality_flag"]
        .fillna("OK")
        .ne("OK")
        .sum()
    )

    def sum_col(
        name: str,
    ) -> float:
        return float(
            metrics_df[name].sum(
                min_count=1
            )
        )

    def mean_col(
        name: str,
    ) -> float:

        value = metrics_df[name].mean()

        return (
            float(value)
            if pd.notna(value)
            else 0.0
        )

    exposure = validated_cost_change_exposure(
        metrics_df
    )

    return {
        "total_projects": n,

        "total_original_cost_cr": round(
            sum_col("original_cost_cr"),
            2,
        ),

        "total_revised_cost_cr": round(
            sum_col("revised_cost_cr"),
            2,
        ),

        "total_analytical_cost_cr": round(
            sum_col("analytics_cost_cr"),
            2,
        ),

        "total_expenditure_cr": round(
            sum_col("final_expenditure_cr"),
            2,
        ),

        "total_cost_change_exposure_cr": round(
            exposure,
            2,
        ),

        "total_cost_increase_cr": round(
            exposure,
            2,
        ),

        "cost_overrun_projects": overrun,

        "projects_with_cost_overrun": overrun,

        "cost_overrun_rate_pct": round(
            safe_divide(
                overrun,
                n,
            )
            * 100,
            2,
        ),

        "avg_cost_overrun_pct": round(
            mean_col("cost_overrun_pct"),
            2,
        ),

        "delayed_projects": delayed,

        "delay_rate_pct": round(
            safe_divide(
                delayed,
                n,
            )
            * 100,
            2,
        ),

        "avg_delay_months": round(
            mean_col("delay_months"),
            2,
        ),

        "data_quality": {
            "projects_flagged": data_issues,

            "rate_pct": round(
                safe_divide(
                    data_issues,
                    n,
                )
                * 100,
                2,
            ),

            "definition": (
                "Projects where master data_quality_flag "
                "is non-OK; this is not a count of all "
                "missing fields."
            ),
        },
    }


def _portfolio_summary(
    df: pd.DataFrame,
    group_column: str,
    temporal: Optional[pd.DataFrame] = None,
) -> pd.DataFrame:

    metrics_df = (
        _temporal_metrics_frame(
            df,
            temporal,
        )
        if temporal is not None
        else df
    )

    cols = [
        group_column,
        "total_projects",
        "total_original_cost_cr",
        "total_revised_cost_cr",
        "total_analytical_cost_cr",
        "total_expenditure_cr",
        "delayed_projects",
        "cost_overrun_projects",
        "avg_delay_months",
        "avg_delay_days",
        "avg_cost_overrun_pct",
        "data_quality_flagged_projects",
        "delay_rate_pct",
        "cost_overrun_rate_pct",
        "data_quality_rate_pct",
        "total_cost_change_exposure_cr",
        "total_cost_increase_cr",
        "expenditure_to_analytical_cost_pct",
    ]

    if metrics_df.empty:
        return pd.DataFrame(
            columns=cols
        )

    # ------------------------------------------------------------
    # Keep only columns needed for descriptive portfolio
    # summaries. ML prediction columns are not required here.
    # This avoids copying the full ML-enriched DataFrame.
    # ------------------------------------------------------------

    summary_columns = [
        "project_code",
        group_column,
        "original_cost_cr",
        "revised_cost_cr",
        "revised_cost_analytical_cr",
        "analytics_cost_cr",
        "final_expenditure_cr",
        "expenditure_cr",
        "cost_overrun_pct",
        "delay_months",
        "delay_days",
        "is_delayed",
        "has_cost_overrun",
        "data_quality_flag",
    ]

    summary_columns = [
        column
        for column in summary_columns
        if column in metrics_df.columns
    ]

    metrics_df = metrics_df[
        summary_columns
    ].copy()

    # ------------------------------------------------------------
    # Normalize required descriptive fields.
    # These are descriptive portfolio metrics, not ML risk rules.
    # ------------------------------------------------------------

    if "analytics_cost_cr" not in metrics_df.columns:

        analytical = pd.to_numeric(
            metrics_df.get(
                "revised_cost_analytical_cr"
            ),
            errors="coerce",
        )

        original = pd.to_numeric(
            metrics_df.get(
                "original_cost_cr"
            ),
            errors="coerce",
        )

        metrics_df["analytics_cost_cr"] = (
            analytical.fillna(original)
        )

    if "final_expenditure_cr" not in metrics_df.columns:

        if "expenditure_cr" in metrics_df.columns:
            metrics_df["final_expenditure_cr"] = (
                pd.to_numeric(
                    metrics_df["expenditure_cr"],
                    errors="coerce",
                )
            )
        else:
            metrics_df["final_expenditure_cr"] = 0.0

    for column in [
        "original_cost_cr",
        "revised_cost_cr",
        "analytics_cost_cr",
        "final_expenditure_cr",
        "is_delayed",
        "has_cost_overrun",
        "delay_months",
        "delay_days",
        "cost_overrun_pct",
    ]:

        if column not in metrics_df.columns:
            metrics_df[column] = 0.0

        metrics_df[column] = pd.to_numeric(
            metrics_df[column],
            errors="coerce",
        )

    if "data_quality_flag" not in metrics_df.columns:
        metrics_df["data_quality_flag"] = "OK"

    original = pd.to_numeric(
        metrics_df["original_cost_cr"],
        errors="coerce",
    )

    revised = pd.to_numeric(
        metrics_df["revised_cost_cr"],
        errors="coerce",
    )

    valid = (
        original.notna()
        & revised.notna()
        & (original > 0)
        & (revised > 0)
        & (revised >= original)
    )

    metrics_df["_cost_change_exposure_cr"] = 0.0

    metrics_df.loc[
        valid,
        "_cost_change_exposure_cr",
    ] = (
        revised.loc[valid]
        - original.loc[valid]
    )

    summary = (
        metrics_df
        .groupby(
            group_column,
            dropna=False,
        )
        .agg(
            total_projects=(
                "project_code",
                "nunique",
            ),

            total_original_cost_cr=(
                "original_cost_cr",
                "sum",
            ),

            total_revised_cost_cr=(
                "revised_cost_cr",
                "sum",
            ),

            total_analytical_cost_cr=(
                "analytics_cost_cr",
                "sum",
            ),

            total_expenditure_cr=(
                "final_expenditure_cr",
                "sum",
            ),

            delayed_projects=(
                "is_delayed",
                "sum",
            ),

            cost_overrun_projects=(
                "has_cost_overrun",
                "sum",
            ),

            avg_delay_months=(
                "delay_months",
                "mean",
            ),

            avg_delay_days=(
                "delay_days",
                "mean",
            ),

            avg_cost_overrun_pct=(
                "cost_overrun_pct",
                "mean",
            ),

            data_quality_flagged_projects=(
                "data_quality_flag",
                lambda x: (
                    x.fillna("OK")
                    .ne("OK")
                    .sum()
                ),
            ),

            total_cost_change_exposure_cr=(
                "_cost_change_exposure_cr",
                "sum",
            ),
        )
        .reset_index()
    )

    summary["delay_rate_pct"] = np.where(
        summary["total_projects"] > 0,
        (
            summary["delayed_projects"]
            / summary["total_projects"]
            * 100
        ),
        0.0,
    )

    summary["cost_overrun_rate_pct"] = np.where(
        summary["total_projects"] > 0,
        (
            summary["cost_overrun_projects"]
            / summary["total_projects"]
            * 100
        ),
        0.0,
    )

    summary["data_quality_rate_pct"] = np.where(
        summary["total_projects"] > 0,
        (
            summary["data_quality_flagged_projects"]
            / summary["total_projects"]
            * 100
        ),
        0.0,
    )

    summary["total_cost_increase_cr"] = (
        summary["total_cost_change_exposure_cr"]
    )

    summary["expenditure_to_analytical_cost_pct"] = np.where(
        summary["total_analytical_cost_cr"] > 0,
        (
            summary["total_expenditure_cr"]
            / summary["total_analytical_cost_cr"]
            * 100
        ),
        0.0,
    )

    return (
        summary
        .sort_values(
            "total_projects",
            ascending=False,
        )
        .reset_index(
            drop=True
        )
    )


def _delay_analysis(summary, group_column):
    return summary[[group_column, "total_projects", "delayed_projects", "delay_rate_pct", "avg_delay_months", "avg_delay_days"]].sort_values("delay_rate_pct", ascending=False).reset_index(drop=True)


def _cost_analysis(summary, group_column):
    return summary[[group_column, "total_projects", "cost_overrun_projects", "cost_overrun_rate_pct", "avg_cost_overrun_pct", "total_cost_change_exposure_cr"]].sort_values("cost_overrun_rate_pct", ascending=False).reset_index(drop=True)


def _ml_risk_analysis(
    df: pd.DataFrame,
    group_column: str,
) -> pd.DataFrame:
    """
    Aggregate canonical ML risk levels by sector/ministry.

    If the selected portfolio has no ML prediction rows for the
    requested filters/period, return an empty ML analysis rather
    than failing the entire descriptive analytics request.

    Risk levels come only from the canonical PAIMANA ML engine.
    """

    levels = [
        "LOW",
        "MEDIUM",
        "HIGH",
        "CRITICAL",
    ]

    empty_columns = [
        group_column,
        *levels,
    ]

    if df is None or df.empty:
        return pd.DataFrame(
            columns=empty_columns
        )

    if group_column not in df.columns:
        return pd.DataFrame(
            columns=empty_columns
        )

    # --------------------------------------------------------
    # No ML prediction column means this selection currently
    # has no ML results. Do not fabricate LOW-risk values.
    # --------------------------------------------------------

    if "risk_level" not in df.columns:
        return pd.DataFrame(
            columns=empty_columns
        )

    work = df[
        [
            group_column,
            "risk_level",
        ]
    ].copy()

    # --------------------------------------------------------
    # Keep only rows where the ML engine actually produced a
    # risk level.
    # --------------------------------------------------------

    work["risk_level"] = (
        work["risk_level"]
        .where(
            work["risk_level"].notna(),
            None,
        )
    )

    work = work[
        work["risk_level"].notna()
    ].copy()

    if work.empty:
        return pd.DataFrame(
            columns=empty_columns
        )

    work[group_column] = (
        work[group_column]
        .fillna("Unknown")
        .astype(str)
        .str.strip()
    )

    work["risk_level"] = (
        work["risk_level"]
        .astype(str)
        .str.upper()
        .str.strip()
    )

    # --------------------------------------------------------
    # Ignore unexpected values instead of converting them
    # into LOW.
    # --------------------------------------------------------

    work = work[
        work["risk_level"].isin(
            levels
        )
    ].copy()

    if work.empty:
        return pd.DataFrame(
            columns=empty_columns
        )

    result = (
        pd.crosstab(
            work[group_column],
            work["risk_level"],
            normalize="index",
        )
        * 100.0
    ).reset_index()

    for level in levels:

        if level not in result.columns:

            result[level] = 0.0

    return (
        result[
            [
                group_column,
                *levels,
            ]
        ]
        .sort_values(
            levels,
            ascending=False,
        )
        .reset_index(
            drop=True
        )
    )


def _monthly_trends(
    monthly: pd.DataFrame,
    *,
    ministry,
    sector,
    state_projects,
    financial_year_filter,
    snapshot_month,
) -> dict[str, list[dict[str, Any]]]:
    """
    Build monthly sector/ministry trends from the already-filtered
    monthly DataFrame.

    Filtering is performed by load_data() before this function is
    called. The current function therefore only performs the minimum
    transformation required for aggregation.

    Important:
        load_data() already normalizes:
            - snapshot_month
            - revised_cost_cr
            - expenditure_cr
            - delay_days
            - cost_overrun_pct

        Therefore no second numeric-normalization pass is required.
    """

    if monthly is None or monthly.empty:
        return {
            "sector": [],
            "ministry": [],
        }

    required_columns = [
        "project_code",
        "snapshot_month",
        "sector",
        "ministry",
        "revised_cost_cr",
        "expenditure_cr",
        "delay_days",
        "cost_overrun_pct",
    ]

    missing_columns = [
        column
        for column in required_columns
        if column not in monthly.columns
    ]

    if missing_columns:
        raise ValueError(
            "Monthly trends missing required columns: "
            + ", ".join(
                missing_columns
            )
        )

    # --------------------------------------------------------
    # load_data() already guarantees:
    #   - project_code
    #   - snapshot_month
    # are valid for the selected portfolio.
    #
    # The SQL query also orders the rows by project_code and
    # snapshot_month, so there is no need for another full
    # sort here.
    # --------------------------------------------------------

    history = monthly.drop_duplicates(
        [
            "project_code",
            "snapshot_month",
        ],
        keep="last",
    )

    if history.empty:
        return {
            "sector": [],
            "ministry": [],
        }

    def build(
        group_column: str,
    ) -> list[dict[str, Any]]:
        """
        Aggregate monthly metrics for one grouping dimension.
        """

        if group_column not in history.columns:
            return []

        grouped = (
            history
            .groupby(
                [
                    "snapshot_month",
                    group_column,
                ],
                dropna=False,
            )
            .agg(
                project_count=(
                    "project_code",
                    "nunique",
                ),

                expenditure_cr=(
                    "expenditure_cr",
                    "sum",
                ),

                revised_cost_cr=(
                    "revised_cost_cr",
                    "sum",
                ),

                delayed_projects=(
                    "delay_days",
                    lambda values: int(
                        (
                            values
                            .fillna(0)
                            .gt(0)
                        ).sum()
                    ),
                ),

                cost_overrun_projects=(
                    "cost_overrun_pct",
                    lambda values: int(
                        (
                            values
                            .fillna(0)
                            .gt(0)
                        ).sum()
                    ),
                ),

                avg_delay_days=(
                    "delay_days",
                    "mean",
                ),

                avg_cost_overrun_pct=(
                    "cost_overrun_pct",
                    "mean",
                ),
            )
            .reset_index()
        )

        if grouped.empty:
            return []

        # ----------------------------------------------------
        # Derived metrics.
        # ----------------------------------------------------

        grouped[
            "avg_delay_months"
        ] = (
            grouped[
                "avg_delay_days"
            ]
            / 30.0
        )

        grouped[
            "delay_rate_pct"
        ] = np.where(
            grouped[
                "project_count"
            ] > 0,

            (
                grouped[
                    "delayed_projects"
                ]
                /
                grouped[
                    "project_count"
                ]
                * 100.0
            ),

            0.0,
        )

        grouped[
            "cost_overrun_rate_pct"
        ] = np.where(
            grouped[
                "project_count"
            ] > 0,

            (
                grouped[
                    "cost_overrun_projects"
                ]
                /
                grouped[
                    "project_count"
                ]
                * 100.0
            ),

            0.0,
        )

        # ----------------------------------------------------
        # Stable chronological ordering.
        # ----------------------------------------------------

        grouped = (
            grouped
            .sort_values(
                [
                    "snapshot_month",
                    group_column,
                ],
                kind="stable",
            )
            .reset_index(
                drop=True
            )
        )

        return grouped.to_dict(
            orient="records"
        )

    return {
        "sector": build(
            "sector"
        ),

        "ministry": build(
            "ministry"
        ),
    }

def _safe_number(value: Any) -> Optional[float | int]:
    if value is None:
        return None
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(v):
        return None
    return int(v) if v.is_integer() else v


def _json_safe(value):
    if value is None:
        return None
    if value is pd.NaT or (isinstance(value, (pd.Timestamp,)) and pd.isna(value)):
        return None
    if isinstance(value, pd.Timestamp):
        return value.strftime("%Y-%m-%d")
    if isinstance(value, pd.Period):
        return str(value)
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating, float)):
        return _safe_number(value)
    if isinstance(value, np.ndarray):
        return [_json_safe(x) for x in value.tolist()]
    if isinstance(value, dict):
        return {k: _json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(x) for x in value]
    return value


def _records(value):
    if value is None:
        return []
    if isinstance(value, list):
        return [_json_safe(x) for x in value]
    if isinstance(value, pd.DataFrame):
        if value.empty:
            return []
        return [{k: _json_safe(v) for k, v in row.items()} for row in value.replace({np.nan: None}).to_dict("records")]
    return _json_safe(value)


def _priority_projects(
    df: pd.DataFrame,
    limit: int = 20,
) -> pd.DataFrame:
    """
    Return the highest-risk projects when canonical ML outputs
    are available.

    If the selected portfolio has no ML predictions, return an
    empty DataFrame instead of failing the entire analytics request.
    """

    if df is None or df.empty:
        return pd.DataFrame()

    # --------------------------------------------------------
    # ML is optional for a particular filtered period.
    # --------------------------------------------------------

    if "overall_risk_score" not in df.columns:
        return pd.DataFrame()

    required_columns = [
        "project_code",
        "project_name",
        "sector",
        "ministry",
        "flash_state",
        "analytics_cost_cr",
        "final_expenditure_cr",
        "delay_days",
        "delay_months",
        "cost_overrun_pct",
        "final_cost_overrun_pct",
        "flash_latest_physical_progress",
        "future_delay_probability",
        "future_progress_stall_probability",
        "predicted_cost_overrun_pct",
        "cost_risk_score",
        "overall_risk_score",
        "risk_level",
        "early_warning_active",
        "warning_priority",
    ]

    available_columns = [
        column
        for column in required_columns
        if column in df.columns
    ]

    result = df[
        available_columns
    ].copy()

    if result.empty:
        return pd.DataFrame()

    # --------------------------------------------------------
    # Normalize ML score columns.
    # --------------------------------------------------------

    result["overall_risk_score"] = (
        pd.to_numeric(
            result["overall_risk_score"],
            errors="coerce",
        )
        .fillna(0.0)
    )

    if "cost_risk_score" in result.columns:

        result["cost_risk_score"] = (
            pd.to_numeric(
                result["cost_risk_score"],
                errors="coerce",
            )
            .fillna(0.0)
        )

    # --------------------------------------------------------
    # Remove rows where there is no actual ML prediction.
    #
    # A missing prediction should not become an artificial
    # zero-risk priority project.
    # --------------------------------------------------------

    if "risk_level" in result.columns:

        result = result[
            result["risk_level"].notna()
        ].copy()

        if result.empty:
            return pd.DataFrame()

    # --------------------------------------------------------
    # Highest overall risk first, then cost risk.
    # --------------------------------------------------------

    sort_columns = [
        "overall_risk_score"
    ]

    ascending = [
        False
    ]

    if "cost_risk_score" in result.columns:

        sort_columns.append(
            "cost_risk_score"
        )

        ascending.append(
            False
        )

    result = (
        result
        .sort_values(
            sort_columns,
            ascending=ascending,
            kind="stable",
        )
        .head(limit)
        .copy()
    )

    # --------------------------------------------------------
    # Frontend-friendly state field.
    # --------------------------------------------------------

    if "flash_state" in result.columns:

        result["state"] = (
            result["flash_state"]
        )

        result.drop(
            columns=[
                "flash_state"
            ],
            inplace=True,
        )

    return result


def generate_key_insights(selected_df, selected_summary, group_column):
    if selected_summary.empty:
        return []
    top_projects = selected_summary.sort_values("total_projects", ascending=False).iloc[0]
    top_delay = selected_summary.sort_values(["delay_rate_pct", "total_projects"], ascending=[False, False]).iloc[0]
    top_overrun = selected_summary.sort_values(["cost_overrun_rate_pct", "total_projects"], ascending=[False, False]).iloc[0]
    top_exposure = selected_summary.sort_values("total_cost_change_exposure_cr", ascending=False).iloc[0]
    insights = [
        {"type": "project_count", "title": "Highest project concentration", "message": f"{top_projects[group_column]} has the highest project count at {int(top_projects['total_projects']):,}.", "metric": "total_projects", "value": int(top_projects["total_projects"]), "group": str(top_projects[group_column])},
        {"type": "delay", "title": "Highest delay rate", "message": f"{top_delay[group_column]} has the highest delay rate at {top_delay['delay_rate_pct']:.2f}%.", "metric": "delay_rate_pct", "value": round(float(top_delay["delay_rate_pct"]), 2), "group": str(top_delay[group_column])},
        {"type": "cost_overrun", "title": "Highest cost-overrun rate", "message": f"{top_overrun[group_column]} has the highest cost-overrun rate at {top_overrun['cost_overrun_rate_pct']:.2f}%.", "metric": "cost_overrun_rate_pct", "value": round(float(top_overrun["cost_overrun_rate_pct"]), 2), "group": str(top_overrun[group_column])},
        {"type": "cost_exposure", "title": "Largest validated cost-change exposure", "message": f"{top_exposure[group_column]} has the largest validated positive cost-change exposure at ₹{top_exposure['total_cost_change_exposure_cr']:.2f} Cr.", "metric": "total_cost_change_exposure_cr", "value": round(float(top_exposure["total_cost_change_exposure_cr"]), 2), "group": str(top_exposure[group_column])},
    ]
    flagged = int(selected_df["data_quality_flag"].fillna("OK").ne("OK").sum())
    if flagged:
        insights.append({"type": "data_quality", "title": "Data-quality concern", "message": f"{flagged:,} selected projects have a non-OK data_quality_flag.", "metric": "projects_flagged", "value": flagged})
    return insights


def _ml_early_warnings(
    df: pd.DataFrame,
    group_column: str,
) -> list[dict[str, Any]]:
    """
    Aggregate canonical ML early-warning outputs.

    If the selected portfolio has no ML prediction data,
    return an empty warning list instead of failing the entire
    descriptive analytics request.

    ML fields are used only when they were actually produced
    by the canonical PAIMANA ML engine.
    """

    if df is None or df.empty:
        return []

    if group_column not in df.columns:
        return []

    required = {
        "project_code",
        group_column,
        "early_warning_active",
        "early_warning_priority",
        "early_warning_reasons",
        "overall_risk_score",
    }

    missing = required - set(df.columns)

    # --------------------------------------------------------
    # No ML data for this selection.
    #
    # This is a valid state, not a server error.
    # --------------------------------------------------------

    if missing:
        return []

    work = df[
        [
            "project_code",
            group_column,
            "early_warning_active",
            "early_warning_priority",
            "early_warning_reasons",
            "overall_risk_score",
        ]
    ].copy()

    # --------------------------------------------------------
    # Normalize warning active flag.
    # --------------------------------------------------------

    work["early_warning_active"] = (
        work["early_warning_active"]
        .fillna(False)
        .astype(bool)
    )

    active = work[
        work["early_warning_active"]
    ].copy()

    if active.empty:
        return []

    # --------------------------------------------------------
    # Normalize priority.
    # --------------------------------------------------------

    def normalize_priority(
        value: Any,
    ) -> str:

        if value is None:
            return "NONE"

        try:
            if pd.isna(value):
                return "NONE"
        except (
            TypeError,
            ValueError,
        ):
            pass

        return (
            str(value)
            .strip()
            .upper()
        )

    active[
        "early_warning_priority"
    ] = (
        active[
            "early_warning_priority"
        ]
        .apply(
            normalize_priority
        )
    )

    # --------------------------------------------------------
    # Normalize reason payload.
    # --------------------------------------------------------

    def normalize_reasons(
        value: Any,
    ) -> list[str]:

        if value is None:
            return []

        if isinstance(
            value,
            list,
        ):
            return [
                str(item).strip()
                for item in value
                if str(item).strip()
            ]

        if isinstance(
            value,
            tuple,
        ):
            return [
                str(item).strip()
                for item in value
                if str(item).strip()
            ]

        if isinstance(
            value,
            str,
        ):

            value = value.strip()

            if not value:
                return []

            return [value]

        return [
            str(value).strip()
        ]

    active[
        "early_warning_reasons"
    ] = (
        active[
            "early_warning_reasons"
        ]
        .apply(
            normalize_reasons
        )
    )

    warnings: list[
        dict[str, Any]
    ] = []

    # --------------------------------------------------------
    # Aggregate by sector/ministry.
    # --------------------------------------------------------

    for group, group_df in active.groupby(
        group_column,
        dropna=False,
    ):

        project_count = int(
            group_df[
                "project_code"
            ].nunique()
        )

        max_risk_value = pd.to_numeric(
            group_df[
                "overall_risk_score"
            ],
            errors="coerce",
        ).max()

        max_risk = (
            float(max_risk_value)
            if pd.notna(
                max_risk_value
            )
            else 0.0
        )

        priority_counts = (
            group_df[
                "early_warning_priority"
            ]
            .value_counts()
            .to_dict()
        )

        # ----------------------------------------------------
        # Highest priority actually emitted by ML.
        # ----------------------------------------------------

        priority = "NONE"

        for candidate in (
            "IMMEDIATE",
            "HIGH",
            "MEDIUM",
            "LOW",
            "NONE",
        ):

            if int(
                priority_counts.get(
                    candidate,
                    0,
                )
            ) > 0:

                priority = candidate
                break

        priority_label = {
            "IMMEDIATE": "Immediate",
            "HIGH": "High",
            "MEDIUM": "Medium",
            "LOW": "Low",
            "NONE": "None",
        }.get(
            priority,
            priority.title(),
        )

        severity = {
            "IMMEDIATE": "immediate",
            "HIGH": "high",
            "MEDIUM": "moderate",
            "LOW": "low",
            "NONE": "low",
        }.get(
            priority,
            "low",
        )

        # ----------------------------------------------------
        # Combine actual ML reasons.
        # ----------------------------------------------------

        reasons: list[str] = []

        for reason_list in group_df[
            "early_warning_reasons"
        ]:

            if not reason_list:
                continue

            for reason in reason_list:

                if (
                    reason
                    and
                    reason not in reasons
                ):
                    reasons.append(
                        reason
                    )

        reason_text = (
            ", ".join(reasons)
            if reasons
            else "canonical_ml_early_warning"
        )

        warnings.append(
            {
                "title": (
                    f"{priority_label} ML early warning"
                ),

                "severity":
                    severity,

                "message": (
                    f"{project_count:,} projects in "
                    f"{group} have an active ML early warning "
                    f"(maximum risk score {max_risk:.2f})."
                ),

                "metric":
                    "early_warning_active",

                "value":
                    project_count,

                "affected_projects":
                    project_count,

                "source_field":
                    "early_warning_active",

                "reason":
                    reason_text,

                "group":
                    str(group),

                "priority":
                    priority,
            }
        )

    # --------------------------------------------------------
    # Stable priority ordering.
    # --------------------------------------------------------

    priority_order = {
        "IMMEDIATE": 0,
        "HIGH": 1,
        "MEDIUM": 2,
        "LOW": 3,
        "NONE": 4,
    }

    warnings.sort(
        key=lambda item: (
            priority_order.get(
                item.get(
                    "priority",
                    "NONE",
                ),
                9,
            ),

            -float(
                item.get(
                    "value",
                    0,
                )
            ),
        )
    )

    return warnings

def _load_ml_scope(
    project_codes: set[str],
    *,
    snapshot_month: Optional[str] = None,
    financial_year_filter: Optional[str] = None,
) -> pd.DataFrame:
    """
    Load only the ML-ready data required for the selected
    Project Analytics portfolio.

    PostgreSQL performs:
        - project filtering
        - period filtering
        - latest-snapshot selection
        - column projection

    Only model-contract features that actually exist in
    paimana_ml_ready are selected.

    The canonical ML engine fills any missing contract features
    with zero, preserving the existing prediction behavior.
    """

    if not project_codes:
        return pd.DataFrame()

    codes = [
        str(code).strip()
        for code in project_codes
        if str(code).strip()
    ]

    if not codes:
        return pd.DataFrame()

    # ========================================================
    # DETERMINE AVAILABLE DATABASE COLUMNS
    # ========================================================

    with db.engine.connect() as connection:

        column_rows = connection.execute(
            text(
                """
                SELECT
                    column_name

                FROM information_schema.columns

                WHERE table_schema = current_schema()

                  AND table_name = 'paimana_ml_ready'
                """
            )
        ).scalars().all()

    available_db_columns = {
        str(column).strip()
        for column in column_rows
    }

    if not available_db_columns:
        raise ValueError(
            "Could not determine columns for "
            "'paimana_ml_ready'."
        )

    # ========================================================
    # MODEL FEATURE CONTRACT
    # ========================================================

    contract = getattr(
        engine,
        "contract",
        {},
    )

    contract_features = contract.get(
        "features",
        [],
    )

    if not isinstance(
        contract_features,
        (list, tuple),
    ):
        contract_features = []

    contract_features = [
        str(feature).strip()
        for feature in contract_features
        if str(feature).strip()
    ]

    # --------------------------------------------------------
    # Select only features that actually exist in PostgreSQL.
    #
    # Any missing model feature is intentionally left out;
    # the canonical engine will supply the documented default.
    # --------------------------------------------------------

    selected_features = [
        feature
        for feature in contract_features
        if feature in available_db_columns
        and feature not in {
            "project_code",
            "snapshot_year",
            "snapshot_month_num",
        }
    ]

    # ========================================================
    # REQUIRED ML METADATA COLUMNS
    # ========================================================

    required_columns = [
        "project_code",
        "snapshot_year",
        "snapshot_month_num",
    ]

    missing_required = [
        column
        for column in required_columns
        if column not in available_db_columns
    ]

    if missing_required:
        raise ValueError(
            "paimana_ml_ready is missing required columns: "
            + ", ".join(
                missing_required
            )
        )

    # ========================================================
    # SAFE SQL IDENTIFIER QUOTING
    # ========================================================

    def quote_identifier(
        identifier: str,
    ) -> str:
        return (
            '"'
            + identifier.replace(
                '"',
                '""',
            )
            + '"'
        )

    select_columns = [
        quote_identifier(
            column
        )
        for column in required_columns
    ]

    select_columns.extend(
        quote_identifier(
            column
        )
        for column in selected_features
    )

    # Remove accidental duplicates while preserving order.
    select_columns = list(
        dict.fromkeys(
            select_columns
        )
    )

    # ========================================================
    # BASE QUERY
    # ========================================================

    query_sql = f"""
        SELECT DISTINCT ON (
            TRIM(CAST(project_code AS TEXT))
        )
            {", ".join(select_columns)}

        FROM "paimana_ml_ready"

        WHERE project_code IS NOT NULL

          AND TRIM(
                    CAST(project_code AS TEXT)
                  ) IN :project_codes
    """

    params: dict[str, Any] = {
        "project_codes": codes,
    }

    # ========================================================
    # SNAPSHOT MONTH
    #
    # Select the latest ML snapshot available on or before
    # the requested month.
    # ========================================================

    if snapshot_month:

        target_month = pd.to_datetime(
            snapshot_month,
            errors="coerce",
        )

        if pd.isna(target_month):

            raise ValueError(
                "snapshot_month must be "
                "YYYY-MM or YYYY-MM-DD."
            )

        target_period = (
            int(
                target_month.year
            )
            * 12
            +
            int(
                target_month.month
            )
        )

        query_sql += """
            AND (
                CAST(
                    snapshot_year
                    AS INTEGER
                ) * 12

                +

                CAST(
                    snapshot_month_num
                    AS INTEGER
                )
            ) <= :target_period
        """

        params[
            "target_period"
        ] = target_period

    # ========================================================
    # FINANCIAL YEAR
    # ========================================================

    elif financial_year_filter:

        fy_match = re.search(
            r"(20\d{2})\s*-\s*(\d{2,4})",
            str(
                financial_year_filter
            ),
        )

        if fy_match:

            fy_start = int(
                fy_match.group(1)
            )

            fy_end_part = (
                fy_match.group(2)
            )

            fy_end = (
                int(
                    f"20{fy_end_part}"
                )
                if len(fy_end_part) == 2
                else int(
                    fy_end_part
                )
            )

            query_sql += """
                AND (
                    (
                        CAST(
                            snapshot_year
                            AS INTEGER
                        ) = :fy_start

                        AND CAST(
                            snapshot_month_num
                            AS INTEGER
                        ) >= 4
                    )

                    OR

                    (
                        CAST(
                            snapshot_year
                            AS INTEGER
                        ) = :fy_end

                        AND CAST(
                            snapshot_month_num
                            AS INTEGER
                        ) <= 3
                    )
                )
            """

            params[
                "fy_start"
            ] = fy_start

            params[
                "fy_end"
            ] = fy_end

    # ========================================================
    # LATEST SNAPSHOT PER PROJECT
    # ========================================================

    query_sql += """
        ORDER BY
            TRIM(CAST(project_code AS TEXT)),
            CAST(snapshot_year AS INTEGER) DESC,
            CAST(snapshot_month_num AS INTEGER) DESC
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

    # ========================================================
    # LOAD ONLY THE PROJECTED ML DATA
    # ========================================================

    with db.engine.connect() as connection:

        ml_scope = pd.read_sql(
            query,
            connection,
            params=params,
        )

    if ml_scope.empty:
        return ml_scope

    ml_scope = ml_scope.loc[
        :,
        ~ml_scope.columns.duplicated(),
    ]

    ml_scope[
        "project_code"
    ] = (
        ml_scope[
            "project_code"
        ]
        .astype(str)
        .str.strip()
    )

    # ========================================================
    # NUMERIC NORMALIZATION
    # ========================================================

    for column in [
        "snapshot_year",
        "snapshot_month_num",
        *selected_features,
    ]:

        if column in ml_scope.columns:

            ml_scope[column] = pd.to_numeric(
                ml_scope[column],
                errors="coerce",
            )

    return ml_scope

def generate_analytics(*, view_by="sector", ministry=None, sector=None, state=None, financial_year_filter=None, snapshot_month=None, data_dir=None):
    view_by = str(view_by).lower().strip()
    if view_by not in {"sector", "ministry"}:
        raise ValueError("view_by must be 'sector' or 'ministry'.")
    ministry = _normalize_filter(ministry, "All Ministries")
    sector = _normalize_filter(sector, "All Sectors")
    state = _normalize_filter(state, "All States")
    if financial_year_filter in {None, "", "All Years"}: financial_year_filter = None
    if snapshot_month in {None, "", "All Months"}: snapshot_month = None

    master, monthly = load_data(
        data_dir,
        ministry=ministry,
        sector=sector,
        state=state,
        snapshot_month=snapshot_month,
        financial_year_filter=financial_year_filter,
    )

    selected = _master_membership(
        master,
        monthly,
        ministry=ministry,
        sector=sector,
        state=state,
        snapshot_month=snapshot_month,
        financial_year_filter=financial_year_filter,
    )
    temporal = _temporal_snapshot(
        monthly,
        snapshot_month=snapshot_month,
        financial_year_filter=financial_year_filter,
    )

    if temporal is not None:
        metrics_df = _temporal_metrics_frame(
            selected,
            temporal,
        )
    else:
        metrics_df = selected

    del temporal

    trends = _monthly_trends(
        monthly,
        ministry=ministry,
        sector=sector,
        state_projects=None,
        financial_year_filter=financial_year_filter,
        snapshot_month=snapshot_month,
    )

    del monthly

    # --------------------------------------------------------
    # --------------------------------------------------------
    # REAL ML PREDICTIONS
    #
    # PostgreSQL now selects ONLY:
    #   - projects currently selected by the filters
    #   - the relevant ML period
    #   - the latest snapshot for each project
    #
    # We no longer load the complete paimana_ml_ready table.
    # --------------------------------------------------------

    selected_project_codes = set(
        selected["project_code"]
        .astype(str)
        .str.strip()
    )

    del selected
    del master

    ml_scope = _load_ml_scope(
        selected_project_codes,
        snapshot_month=snapshot_month,
        financial_year_filter=financial_year_filter,
    )

    del selected_project_codes

    if not ml_scope.empty:

            # ----------------------------------------------------
            # Run the existing production ML engine only against
            # the small, already-filtered ML dataset.
            # ----------------------------------------------------

            ml_predictions_df = engine.predict_batch(
                ml_scope,
                batch_size=256,
            )

            del ml_scope

            if not ml_predictions_df.empty:

                ml_predictions_df["project_code"] = (
                    ml_predictions_df["project_code"]
                    .astype(str)
                    .str.strip()
                )

                metrics_df["project_code"] = (
                    metrics_df["project_code"]
                    .astype(str)
                    .str.strip()
                )

                # ------------------------------------------------
                # Attach ML predictions without constructing a
                # second full-width merged DataFrame.
                # ------------------------------------------------

                ml_predictions_indexed = (
                    ml_predictions_df
                    .set_index("project_code")
                )

                prediction_columns = [
                    column
                    for column in ml_predictions_indexed.columns
                    if column != "project_code"
                ]

                for column in prediction_columns:

                    target_column = (
                        column
                        if column not in metrics_df.columns
                        else f"{column}_ml"
                    )

                    metrics_df[target_column] = (
                        metrics_df["project_code"]
                        .map(
                            ml_predictions_indexed[column]
                        )
                    )

                del ml_predictions_indexed
                del ml_predictions_df

    else:
            del ml_scope

        
                

    group_column = "sector" if view_by == "sector" else "ministry"

    sector_summary = _portfolio_summary(
        metrics_df,
        "sector",
    )

    ministry_summary = _portfolio_summary(
        metrics_df,
        "ministry",
    )

    selected_summary = (
        sector_summary
        if group_column == "sector"
        else ministry_summary
    )
    
    kpis = _portfolio_kpis(metrics_df)

    return {
        "metadata": {
        "version": "ML",
        "analytics_type": "descriptive_diagnostic_ml",
        "ml_predictions_included": True,
        "source_datasets": [
            "project_master",
            "paimana_monthly_history",
            "flash_modern_history",
            "paimana_ml_ready",
        ],
        "risk_score_label": "PAIMANA ML Overall Risk",
        "risk_levels": [
            "LOW",
            "MEDIUM",
            "HIGH",
            "CRITICAL",
        ],
        "financial_year_definition": "Indian Apr-Mar financial year; FY 2025-26 = 2025-04-01 through 2026-03-31.",
        "snapshot_month_definition": "Monthly observation month from paimana_monthly_history.",
        "temporal_metric_definition": "When a financial year or snapshot month is active, time-varying KPI metrics use the latest monthly-history observation per project within the selected period.",
        "risk_definition": "Canonical PAIMANA ML risk output from the existing delay, progress-stall and cost models.",
    },
        "filters": {"view_by": view_by, "ministry": ministry or "All Ministries", "sector": sector or "All Sectors", "state": state or "All States", "financial_year": financial_year_filter or "All Years", "snapshot_month": snapshot_month or "All Months"},
        "portfolio_summary": {"selected_view": view_by, "kpis": kpis, "rows": _records(selected_summary)},
        "sector_summary": _records(sector_summary),
        "ministry_summary": _records(ministry_summary),
        "cost_analysis": {"sector": _records(_cost_analysis(sector_summary, "sector")), "ministry": _records(_cost_analysis(ministry_summary, "ministry"))},
        "delay_analysis": {"sector": _records(_delay_analysis(sector_summary, "sector")), "ministry": _records(_delay_analysis(ministry_summary, "ministry"))},
        "risk_analysis": {
        "sector": _records(
            _ml_risk_analysis(
                metrics_df,
                "sector",
            )
        ),
        "ministry": _records(
            _ml_risk_analysis(
                metrics_df,
                "ministry",
            )
        ),
    },
        "monthly_trends": {"sector": _records(trends["sector"]), "ministry": _records(trends["ministry"])},
        "key_insights": generate_key_insights(metrics_df, selected_summary, group_column),
        "early_warnings": _ml_early_warnings(
        metrics_df,
        group_column,
    ),
        "priority_projects": _records(_priority_projects(metrics_df)),
        "data_quality": kpis["data_quality"],
    }