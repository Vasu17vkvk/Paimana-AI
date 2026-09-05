"""PAIMANA AI Sector / Ministry Analytics production service.

Uses PostgreSQL project and monitoring data together with the existing
production PAIMANA ML engine for predictive risk analytics.
"""
from __future__ import annotations

import math
from pathlib import Path
from typing import Any, Optional

import numpy as np
import pandas as pd

from sqlalchemy import text

from app.extensions import db

from app.ml import engine

ML_RISK_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]

ML_WARNING_PRIORITIES = ["NONE", "HIGH", "IMMEDIATE"]

DEFAULT_DATA_DIR = Path(__file__).resolve().parents[2] / "data"
MASTER_FILE = "01_PROJECT_MASTER_CLEANED.csv"
MONTHLY_FILE = "02_PAIMANA_MONTHLY_HISTORY_CLEAN.csv"
FLASH_FILE = "03_FLASH_MODERN_HISTORY_CLEAN.csv"

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
REQUIRED_FLASH_COLUMNS = {"project_code", "snapshot_month", "physical_progress_pct"}



def _require_columns(df: pd.DataFrame, required: set[str], source: str) -> None:
    missing = sorted(required - set(df.columns))
    if missing:
        raise ValueError(f"{source} is missing required columns: {', '.join(missing)}")


def _read_csv(path: Path) -> pd.DataFrame:
    return pd.read_csv(path, low_memory=False)


def load_data(
    data_dir: Optional[str | Path] = None,
) -> tuple[
    pd.DataFrame,
    pd.DataFrame,
    pd.DataFrame,
    pd.DataFrame,
]:
    """
    Load Sector / Ministry Analytics data from PostgreSQL.

    PostgreSQL tables:
        project_master
        paimana_monthly_history
        flash_modern_history
        paimana_ml_ready

    The data_dir argument is retained for compatibility with
    the existing function signature, but production data is
    loaded from PostgreSQL.
    """

    def load_table(
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

    master = load_table(
        "project_master"
    )

    monthly = load_table(
        "paimana_monthly_history"
    )

    flash = load_table(
        "flash_modern_history"
    )

    ml_ready = load_table(
        "paimana_ml_ready"
    )

    # ------------------------------------------------------------------
    # Validate required columns
    # ------------------------------------------------------------------

    _require_columns(
        master,
        REQUIRED_MASTER_COLUMNS,
        "project_master",
    )

    _require_columns(
        monthly,
        REQUIRED_MONTHLY_COLUMNS,
        "paimana_monthly_history",
    )

    _require_columns(
        flash,
        REQUIRED_FLASH_COLUMNS,
        "flash_modern_history",
    )

    _require_columns(
        ml_ready,
        {
            "project_code",
            "snapshot_year",
            "snapshot_month_num",
        },
        "paimana_ml_ready",
    )

    # ------------------------------------------------------------------
    # Date conversions
    # ------------------------------------------------------------------

    for col in [
        "original_end_date",
        "revised_end_date",
        "first_snapshot",
        "last_snapshot",
    ]:
        if col in master.columns:
            master[col] = pd.to_datetime(
                master[col],
                errors="coerce",
            )

    monthly["snapshot_month"] = pd.to_datetime(
        monthly["snapshot_month"],
        errors="coerce",
    )

    flash["snapshot_month"] = pd.to_datetime(
        flash["snapshot_month"],
        errors="coerce",
    )

    # ------------------------------------------------------------------
    # Numeric conversions for master
    # ------------------------------------------------------------------

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
        "final_schedule_change_days",
        "flash_latest_physical_progress",
        "expenditure_pct",
    ]

    for col in master_numeric:
        if col in master.columns:
            master[col] = pd.to_numeric(
                master[col],
                errors="coerce",
            )

    # ------------------------------------------------------------------
    # Integer flags for master
    # ------------------------------------------------------------------

    for col in [
        "is_delayed",
        "has_cost_overrun",
        "extreme_cost_overrun_flag",
        "extreme_schedule_change_flag",
        "flash_progress_stagnation_flag",
        "flash_low_progress_flag",
    ]:
        if col in master.columns:
            master[col] = (
                pd.to_numeric(
                    master[col],
                    errors="coerce",
                )
                .fillna(0)
                .astype(int)
            )

    # ------------------------------------------------------------------
    # Monthly numeric columns
    # ------------------------------------------------------------------

    for col in [
        "revised_cost_cr",
        "expenditure_cr",
        "delay_days",
        "cost_overrun_pct",
        "expenditure_change_cr",
        "cost_overrun_cr",
        "schedule_change_days",
    ]:
        if col in monthly.columns:
            monthly[col] = pd.to_numeric(
                monthly[col],
                errors="coerce",
            )

    # ------------------------------------------------------------------
    # FLASH numeric columns
    # ------------------------------------------------------------------

    for col in [
        "physical_progress_pct",
        "expenditure_change_cr",
        "physical_progress_change_pct",
        "revised_cost_change_cr",
    ]:
        if col in flash.columns:
            flash[col] = pd.to_numeric(
                flash[col],
                errors="coerce",
            )

    # ------------------------------------------------------------------
    # ML-ready numeric columns
    # ------------------------------------------------------------------

    ml_numeric = [
        "original_cost_cr",
        "revised_cost_cr",
        "expenditure_cr",
        "cost_overrun_cr",
        "cost_overrun_pct",
        "delay_days",
        "schedule_change_days",
        "expenditure_change_cr_paimana",
        "revision_cost_change_cr",
        "original_cost",
        "revised_cost",
        "cumulative_expenditure",
        "physical_progress_pct",
        "expenditure_change_cr_flash",
        "progress_change_pct",
        "previous_expenditure_cr",
        "previous_progress_pct",
        "flash_history_count",
        "future_delay_flag",
        "snapshot_year",
        "snapshot_month_num",
        "original_end_year",
        "original_end_month",
        "revised_end_year",
        "revised_end_month",
        "sector_freq",
        "ministry_freq",
        "state_freq",
        "implementing_agency_freq",
    ]

    for col in ml_numeric:
        if col in ml_ready.columns:
            ml_ready[col] = pd.to_numeric(
                ml_ready[col],
                errors="coerce",
            )

    # ------------------------------------------------------------------
    # Clean invalid records
    # ------------------------------------------------------------------

    monthly = monthly.dropna(
        subset=[
            "project_code",
            "snapshot_month",
        ]
    ).copy()

    flash = flash.dropna(
        subset=[
            "project_code",
            "snapshot_month",
        ]
    ).copy()

    ml_ready = ml_ready.dropna(
        subset=[
            "project_code",
        ]
    ).copy()

    # ------------------------------------------------------------------
    # Normalize project codes
    # ------------------------------------------------------------------

    master["project_code"] = (
        master["project_code"]
        .astype(str)
        .str.strip()
    )

    monthly["project_code"] = (
        monthly["project_code"]
        .astype(str)
        .str.strip()
    )

    flash["project_code"] = (
        flash["project_code"]
        .astype(str)
        .str.strip()
    )

    ml_ready["project_code"] = (
        ml_ready["project_code"]
        .astype(str)
        .str.strip()
    )

    return master, monthly, flash, ml_ready

def get_filter_options(
    data_dir: Optional[str | Path] = None,
) -> dict[str, list[str]]:
    """
    Return stable filter options from the full PostgreSQL dataset.

    These options are intentionally independent of the currently
    selected filters so dropdowns do not disappear after filtering.
    """

    master, monthly, _flash, _ml_ready = load_data(data_dir)

    def clean_values(
        series: pd.Series,
    ) -> list[str]:
        values = (
            series
            .dropna()
            .astype(str)
            .str.strip()
        )

        values = values[
            values.ne("")
            & values.ne("nan")
            & values.ne("None")
        ]

        return sorted(
            values.unique().tolist(),
            key=lambda value: value.lower(),
        )

    # --------------------------------------------------------
    # Financial years from monthly history
    # --------------------------------------------------------

    financial_years = (
        monthly["snapshot_month"]
        .dropna()
        .apply(financial_year)
        .dropna()
        .unique()
        .tolist()
    )

    financial_years = sorted(
        financial_years,
        reverse=True,
    )

    # --------------------------------------------------------
    # Snapshot months from monthly history
    # --------------------------------------------------------

    snapshot_months = (
        monthly["snapshot_month"]
        .dropna()
        .dt.to_period("M")
        .astype(str)
        .unique()
        .tolist()
    )

    snapshot_months = sorted(
        snapshot_months,
        reverse=True,
    )

    return {
        "ministries": clean_values(
            master["ministry"]
        ),
        "sectors": clean_values(
            master["sector"]
        ),
        "states": clean_values(
            master["flash_state"]
        ),
        "financial_years": financial_years,
        "snapshot_months": snapshot_months,
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



def _master_membership(master, monthly, *, ministry, sector, state, snapshot_month, financial_year_filter):
    result = master.copy()
    if ministry:
        result = result[result["ministry"].astype(str) == ministry]
    if sector:
        result = result[result["sector"].astype(str) == sector]
    if state:
        if "flash_state" not in result.columns:
            raise ValueError("State filter requested but master has no 'flash_state' column.")
        result = result[result["flash_state"].astype(str) == state]
    if snapshot_month or financial_year_filter:
        history = monthly.copy()
        history["_fy"] = history["snapshot_month"].apply(financial_year)
        if snapshot_month:
            month = normalize_snapshot_month(snapshot_month)
            history = history[history["snapshot_month"].dt.to_period("M") == month]
        if financial_year_filter:
            history = history[history["_fy"] == str(financial_year_filter)]
        codes = set(history["project_code"].astype(str))
        result = result[result["project_code"].astype(str).isin(codes)]
    return result


def _temporal_snapshot(monthly, *, snapshot_month, financial_year_filter):
    if not snapshot_month and not financial_year_filter:
        return None
    history = monthly.copy()
    history["_fy"] = history["snapshot_month"].apply(financial_year)
    if snapshot_month:
        month = normalize_snapshot_month(snapshot_month)
        history = history[history["snapshot_month"].dt.to_period("M") == month]
    if financial_year_filter:
        history = history[history["_fy"] == str(financial_year_filter)]
    if history.empty:
        return history
    return history.sort_values(["project_code", "snapshot_month"]).drop_duplicates("project_code", keep="last")


def _temporal_metrics_frame(master_df: pd.DataFrame, temporal_snapshot: Optional[pd.DataFrame]) -> pd.DataFrame:
    if temporal_snapshot is None:
        return master_df.copy()
    if temporal_snapshot.empty:
        return master_df.iloc[0:0].copy()

    t = temporal_snapshot.sort_values(["project_code", "snapshot_month"]).drop_duplicates("project_code", keep="last").copy()
    base_cols = [
        "project_code", "project_name", "sector", "ministry", "original_cost_cr",
        "analytics_cost_cr", "data_quality_flag", "health_score_v1", "health_band_v1",
        "health_drivers_v1", "flash_progress_stagnation_flag", "flash_low_progress_flag",
        "extreme_schedule_change_flag", "extreme_cost_overrun_flag", "expenditure_pct",
        "flash_latest_physical_progress", "flash_state", "final_expenditure_cr", "delay_months",
    ]
    base = master_df[[c for c in base_cols if c in master_df.columns]].copy()
    frame = base.merge(
        t[["project_code", "snapshot_month", "revised_cost_cr", "expenditure_cr", "delay_days", "cost_overrun_pct", "sector", "ministry"]],
        on="project_code", how="inner", suffixes=("_master", "_temporal"),
    )
    for col in ["sector", "ministry"]:
        frame[col] = frame[f"{col}_master"].combine_first(frame[f"{col}_temporal"])
        frame.drop(columns=[f"{col}_master", f"{col}_temporal"], inplace=True)

    for col in ["original_cost_cr", "revised_cost_cr", "expenditure_cr", "delay_days", "cost_overrun_pct"]:
        frame[col] = pd.to_numeric(frame[col], errors="coerce")
    frame["is_delayed"] = (frame["delay_days"].fillna(0) > 0).astype(int)
    frame["has_cost_overrun"] = (frame["cost_overrun_pct"].fillna(0) > 0).astype(int)

    # V1 source monthly history has delay_days rather than delay_months.
    # Preserve a master delay_months only where the temporal source provides it;
    # otherwise use the notebook's documented 30-day fallback.
    if "delay_months" in t.columns:
        lookup = t[["project_code", "delay_months"]].drop_duplicates("project_code", keep="last")
        frame = frame.merge(lookup, on="project_code", how="left", suffixes=("", "_temporal_source"))
        frame["delay_months"] = frame["delay_months_temporal_source"]
        frame.drop(columns=["delay_months_temporal_source"], inplace=True)
    else:
        frame["delay_months"] = frame["delay_days"] / 30.0

    original = frame["original_cost_cr"]
    revised = frame["revised_cost_cr"]
    valid = original.notna() & revised.notna() & (original > 0) & (revised > 0) & (revised >= original)
    frame["analytics_cost_cr"] = np.where(valid, revised, original)
    frame["final_expenditure_cr"] = frame["expenditure_cr"]
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


def _portfolio_kpis(metrics_df: pd.DataFrame) -> dict[str, Any]:
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

    metrics_df = metrics_df.copy()

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

    def sum_col(name: str) -> float:
        return float(
            metrics_df[name].sum(
                min_count=1
            )
        )

    def mean_col(name: str) -> float:
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
        _temporal_metrics_frame(df, temporal)
        if temporal is not None
        else df.copy()
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
        return pd.DataFrame(columns=cols)

    metrics_df = metrics_df.copy()

    # ------------------------------------------------------------
    # Normalize required descriptive fields.
    # These are descriptive portfolio metrics, not ML risk rules.
    # ------------------------------------------------------------

    if "analytics_cost_cr" not in metrics_df.columns:
        analytical = pd.to_numeric(
            metrics_df.get("revised_cost_analytical_cr"),
            errors="coerce",
        )

        original = pd.to_numeric(
            metrics_df.get("original_cost_cr"),
            errors="coerce",
        )

        metrics_df["analytics_cost_cr"] = (
            analytical
            if analytical is not None
            else original
        )

        if (
            "revised_cost_analytical_cr" in metrics_df.columns
        ):
            metrics_df["analytics_cost_cr"] = (
                analytical.fillna(original)
            )
        else:
            metrics_df["analytics_cost_cr"] = original

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
        "is_delayed",
        "has_cost_overrun",
        "delay_months",
        "delay_days",
        "cost_overrun_pct",
    ]:
        if column in metrics_df.columns:
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
        summary["delayed_projects"]
        / summary["total_projects"]
        * 100,
        0.0,
    )

    summary["cost_overrun_rate_pct"] = np.where(
        summary["total_projects"] > 0,
        summary["cost_overrun_projects"]
        / summary["total_projects"]
        * 100,
        0.0,
    )

    summary["data_quality_rate_pct"] = np.where(
        summary["total_projects"] > 0,
        summary["data_quality_flagged_projects"]
        / summary["total_projects"]
        * 100,
        0.0,
    )

    summary["total_cost_increase_cr"] = (
        summary["total_cost_change_exposure_cr"]
    )

    summary["expenditure_to_analytical_cost_pct"] = np.where(
        summary["total_analytical_cost_cr"] > 0,
        summary["total_expenditure_cr"]
        / summary["total_analytical_cost_cr"]
        * 100,
        0.0,
    )

    return (
        summary
        .sort_values(
            "total_projects",
            ascending=False,
        )
        .reset_index(drop=True)
    )


def _delay_analysis(summary, group_column):
    return summary[[group_column, "total_projects", "delayed_projects", "delay_rate_pct", "avg_delay_months", "avg_delay_days"]].sort_values("delay_rate_pct", ascending=False).reset_index(drop=True)


def _cost_analysis(summary, group_column):
    return summary[[group_column, "total_projects", "cost_overrun_projects", "cost_overrun_rate_pct", "avg_cost_overrun_pct", "total_cost_change_exposure_cr"]].sort_values("cost_overrun_rate_pct", ascending=False).reset_index(drop=True)


def _ml_risk_analysis(df: pd.DataFrame, group_column: str) -> pd.DataFrame:
    """
    Aggregate canonical ML risk levels by sector/ministry.

    Expected ML columns:
        overall_risk_score
        risk_level

    Risk levels come directly from the existing PAIMANA ML engine.
    No V1 health score or hand-written risk thresholds are used here.
    """

    levels = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]

    if df is None or df.empty:
        return pd.DataFrame(
            columns=[group_column] + levels
        )

    required = {
        group_column,
        "risk_level",
    }

    missing = required - set(df.columns)
    if missing:
        raise ValueError(
            "ML risk analysis missing columns: "
            + ", ".join(sorted(missing))
        )

    work = df[
        [group_column, "risk_level"]
    ].copy()

    work[group_column] = (
        work[group_column]
        .fillna("Unknown")
        .astype(str)
        .str.strip()
    )

    work["risk_level"] = (
        work["risk_level"]
        .fillna("LOW")
        .astype(str)
        .str.upper()
        .str.strip()
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

    return result[
        [group_column] + levels
    ].sort_values(
        levels,
        ascending=False,
    ).reset_index(drop=True)


def _monthly_trends(monthly, *, ministry, sector, state_projects, financial_year_filter, snapshot_month):
    history = monthly.copy()
    history["_fy"] = history["snapshot_month"].apply(financial_year)
    if ministry:
        history = history[history["ministry"].astype(str) == ministry]
    if sector:
        history = history[history["sector"].astype(str) == sector]
    if state_projects is not None:
        history = history[history["project_code"].astype(str).isin(state_projects)]
    if financial_year_filter:
        history = history[history["_fy"] == str(financial_year_filter)]
    if snapshot_month:
        month = normalize_snapshot_month(snapshot_month)
        history = history[history["snapshot_month"].dt.to_period("M") == month]

    def build(group_column):
        if history.empty:
            return []
        h = history.sort_values(["project_code", "snapshot_month"]).drop_duplicates(["project_code", "snapshot_month"], keep="last").copy()
        h["delay_flag"] = (h["delay_days"].fillna(0) > 0).astype(int)
        h["cost_overrun_flag"] = (h["cost_overrun_pct"].fillna(0) > 0).astype(int)
        out = h.groupby(["snapshot_month", group_column], dropna=False).agg(
            project_count=("project_code", "nunique"),
            expenditure_cr=("expenditure_cr", "sum"),
            revised_cost_cr=("revised_cost_cr", "sum"),
            delayed_projects=("delay_flag", "sum"),
            cost_overrun_projects=("cost_overrun_flag", "sum"),
            avg_delay_days=("delay_days", "mean"),
            avg_cost_overrun_pct=("cost_overrun_pct", "mean"),
        ).reset_index()
        out["avg_delay_months"] = out["avg_delay_days"] / 30.0
        out["delay_rate_pct"] = np.where(out["project_count"] > 0, out["delayed_projects"] / out["project_count"] * 100, 0)
        out["cost_overrun_rate_pct"] = np.where(out["project_count"] > 0, out["cost_overrun_projects"] / out["project_count"] * 100, 0)
        return out.sort_values(["snapshot_month", group_column])
    return {"sector": build("sector"), "ministry": build("ministry")}


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
    Return highest-risk projects using the canonical ML outputs.

    Priority is based on:
        overall_risk_score DESC
        cost_risk_score DESC
        project_code ASC

    No V1 health score is used.
    """

    if df is None or df.empty:
        return pd.DataFrame()

    columns = [
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
        for column in columns
        if column in df.columns
    ]

    if "overall_risk_score" not in available_columns:
        raise ValueError(
            "ML priority analysis requires 'overall_risk_score'."
        )

    result = df[
        available_columns
    ].copy()

    result["overall_risk_score"] = pd.to_numeric(
        result["overall_risk_score"],
        errors="coerce",
    ).fillna(0.0)

    if "cost_risk_score" in result.columns:
        result["cost_risk_score"] = pd.to_numeric(
            result["cost_risk_score"],
            errors="coerce",
        ).fillna(0.0)

    sort_columns = ["overall_risk_score"]

    ascending = [False]

    if "cost_risk_score" in result.columns:
        sort_columns.append("cost_risk_score")
        ascending.append(False)

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

    if "flash_state" in result.columns:
        result["state"] = result["flash_state"]
        result.drop(
            columns=["flash_state"],
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

    The production ML engine is the source of truth for:
        early_warning_active
        early_warning_priority
        early_warning_reasons
        overall_risk_score
    """

    if df is None or df.empty:
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

    if missing:
        raise ValueError(
            "ML early-warning analysis missing columns: "
            + ", ".join(sorted(missing))
        )

    work = df.copy()

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

    def normalize_priority(value: Any) -> str:
        if pd.isna(value):
            return "NONE"

        return str(value).strip().upper()

    def normalize_reasons(value: Any) -> list[str]:
        if value is None:
            return []

        if isinstance(value, list):
            return [
                str(item).strip()
                for item in value
                if str(item).strip()
            ]

        if isinstance(value, tuple):
            return [
                str(item).strip()
                for item in value
                if str(item).strip()
            ]

        if isinstance(value, str):
            value = value.strip()

            if not value:
                return []

            return [value]

        return [str(value).strip()]

    active["early_warning_priority"] = (
        active["early_warning_priority"]
        .apply(normalize_priority)
    )

    active["early_warning_reasons"] = (
        active["early_warning_reasons"]
        .apply(normalize_reasons)
    )

    warnings: list[dict[str, Any]] = []

    for group, group_df in active.groupby(
        group_column,
        dropna=False,
    ):
        project_count = int(
            group_df["project_code"].nunique()
        )

        max_risk_value = pd.to_numeric(
            group_df["overall_risk_score"],
            errors="coerce",
        ).max()

        max_risk = (
            float(max_risk_value)
            if pd.notna(max_risk_value)
            else 0.0
        )

        priority_counts = (
            group_df["early_warning_priority"]
            .value_counts()
            .to_dict()
        )

        # Use the highest priority actually emitted by the ML engine.
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

        # Combine the actual ML reason outputs for the group.
        reasons: list[str] = []

        for reason_list in group_df[
            "early_warning_reasons"
        ]:
            for reason in reason_list:
                if reason not in reasons:
                    reasons.append(reason)

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
                "severity": severity,
                "message": (
                    f"{project_count:,} projects in "
                    f"{group} have an active ML early warning "
                    f"(maximum risk score {max_risk:.2f})."
                ),
                "metric": "early_warning_active",
                "value": project_count,
                "affected_projects": project_count,
                "source_field": "early_warning_active",
                "reason": reason_text,
                "group": str(group),
                "priority": priority,
            }
        )

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
                item.get("priority", "NONE"),
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



def generate_analytics(*, view_by="sector", ministry=None, sector=None, state=None, financial_year_filter=None, snapshot_month=None, data_dir=None):
    view_by = str(view_by).lower().strip()
    if view_by not in {"sector", "ministry"}:
        raise ValueError("view_by must be 'sector' or 'ministry'.")
    ministry = _normalize_filter(ministry, "All Ministries")
    sector = _normalize_filter(sector, "All Sectors")
    state = _normalize_filter(state, "All States")
    if financial_year_filter in {None, "", "All Years"}: financial_year_filter = None
    if snapshot_month in {None, "", "All Months"}: snapshot_month = None

    master, monthly, flash, ml_ready = load_data(data_dir)

    selected = _master_membership(
        master,
        monthly,
        ministry=ministry,
        sector=sector,
        state=state,
        snapshot_month=snapshot_month,
        financial_year_filter=financial_year_filter,
    )
    temporal = _temporal_snapshot(monthly, snapshot_month=snapshot_month, financial_year_filter=financial_year_filter)
    if temporal is not None:
        temporal = temporal[temporal["project_code"].isin(set(selected["project_code"]))].copy()
    metrics_df = _temporal_metrics_frame(selected, temporal) if temporal is not None else selected.copy()

    # --------------------------------------------------------
    # REAL ML PREDICTIONS
    # Uses the canonical paimana_ml_ready feature table.
    # --------------------------------------------------------

    ml_ready["project_code"] = (
        ml_ready["project_code"]
        .astype(str)
        .str.strip()
    )

    selected_project_codes = set(
        selected["project_code"]
        .astype(str)
        .str.strip()
    )

    ml_scope = ml_ready[
        ml_ready["project_code"].isin(selected_project_codes)
    ].copy()

    # Match the selected temporal snapshot where applicable.
    if snapshot_month is not None:
            try:
                target_month = pd.to_datetime(
                    snapshot_month,
                    errors="coerce",
                )

                if pd.notna(target_month) and not ml_scope.empty:
                    ml_year = pd.to_numeric(
                        ml_scope["snapshot_year"],
                        errors="coerce",
                    )

                    ml_month = pd.to_numeric(
                        ml_scope["snapshot_month_num"],
                        errors="coerce",
                    )

                    ml_period = (
                        ml_year * 12
                        + ml_month
                    )

                    target_period = (
                        target_month.year * 12
                        + target_month.month
                    )

                    # Use the latest ML-ready snapshot that is
                    # available on or before the selected month.
                    eligible = ml_scope[
                        ml_period <= target_period
                    ].copy()

                    if not eligible.empty:
                        latest_period = (
                            pd.to_numeric(
                                eligible["snapshot_year"],
                                errors="coerce",
                            )
                            * 12
                            + pd.to_numeric(
                                eligible["snapshot_month_num"],
                                errors="coerce",
                            )
                        ).max()

                        ml_scope = eligible[
                            (
                                pd.to_numeric(
                                    eligible["snapshot_year"],
                                    errors="coerce",
                                )
                                * 12
                                + pd.to_numeric(
                                    eligible["snapshot_month_num"],
                                    errors="coerce",
                                )
                            )
                            == latest_period
                        ].copy()
                    else:
                        # No ML-ready snapshot exists on or before
                        # the selected month.
                        ml_scope = pd.DataFrame(
                            columns=ml_scope.columns
                        )

            except Exception:
                ml_scope = pd.DataFrame(
                    columns=ml_scope.columns
                )

    elif financial_year_filter:
        fy_match = re.search(
            r"(20\d{2})\s*-\s*(\d{2,4})",
            str(financial_year_filter),
        )

        if fy_match:
            fy_start = int(fy_match.group(1))
            fy_end = (
                int(f"20{fy_match.group(2)}")
                if len(fy_match.group(2)) == 2
                else int(fy_match.group(2))
            )

            ml_year = pd.to_numeric(
                ml_scope["snapshot_year"],
                errors="coerce",
            )

            ml_month = pd.to_numeric(
                ml_scope["snapshot_month_num"],
                errors="coerce",
            )

            ml_scope = ml_scope[
                (
                    (
                        (ml_year == fy_start)
                        & (ml_month >= 4)
                    )
                    |
                    (
                        (ml_year == fy_end)
                        & (ml_month <= 3)
                    )
                )
            ].copy()

    # Keep the latest ML snapshot per project.
    if not ml_scope.empty:
        ml_scope = (
            ml_scope.sort_values(
                [
                    "project_code",
                    "snapshot_year",
                    "snapshot_month_num",
                ]
            )
            .drop_duplicates(
                subset=["project_code"],
                keep="last",
            )
            .copy()
        )

    # Run the production ML engine only on canonical ML-ready features.
    ml_predictions_df = engine.predict_batch(
        ml_scope,
        batch_size=256,
    )

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

        metrics_df = metrics_df.merge(
            ml_predictions_df,
            on="project_code",
            how="left",
            suffixes=("", "_ml"),
        )

    group_column = "sector" if view_by == "sector" else "ministry"
    sector_summary = _portfolio_summary(selected, "sector", temporal)
    ministry_summary = _portfolio_summary(selected, "ministry", temporal)
    selected_summary = sector_summary if group_column == "sector" else ministry_summary
    state_projects = set(selected["project_code"]) if state else None
    trends = _monthly_trends(monthly, ministry=ministry, sector=sector, state_projects=state_projects, financial_year_filter=financial_year_filter, snapshot_month=snapshot_month)
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