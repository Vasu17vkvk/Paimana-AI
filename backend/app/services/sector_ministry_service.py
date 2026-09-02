"""PAIMANA AI Sector / Ministry Analytics V1 service.

The V7 Colab notebook is the business-rule reference. This production module
implements those rules as reusable backend functions; it never executes the
notebook and never imports the V2 ML engine.
"""
from __future__ import annotations

import math
from pathlib import Path
from typing import Any, Optional

import numpy as np
import pandas as pd

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
HEALTH_BANDS = ["Low Risk", "Moderate Risk", "High Risk", "Very High Risk"]
HEALTH_WEIGHTS = {
    "is_delayed": 30,
    "has_cost_overrun": 25,
    "extreme_schedule_change_flag": 10,
    "extreme_cost_overrun_flag": 10,
    "flash_progress_stagnation_flag": 10,
    "flash_low_progress_flag": 10,
    "data_quality_issue": 5,
}


def _require_columns(df: pd.DataFrame, required: set[str], source: str) -> None:
    missing = sorted(required - set(df.columns))
    if missing:
        raise ValueError(f"{source} is missing required columns: {', '.join(missing)}")


def _read_csv(path: Path) -> pd.DataFrame:
    return pd.read_csv(path, low_memory=False)


def load_data(data_dir: Optional[str | Path] = None) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    base = Path(data_dir) if data_dir else DEFAULT_DATA_DIR
    paths = [base / MASTER_FILE, base / MONTHLY_FILE, base / FLASH_FILE]
    missing = [str(p) for p in paths if not p.exists()]
    if missing:
        raise FileNotFoundError("Sector/Ministry V1 requires: " + "; ".join(missing))

    master, monthly, flash = (_read_csv(p) for p in paths)
    master = master.loc[:, ~master.columns.duplicated()].copy()
    monthly = monthly.loc[:, ~monthly.columns.duplicated()].copy()
    flash = flash.loc[:, ~flash.columns.duplicated()].copy()
    _require_columns(master, REQUIRED_MASTER_COLUMNS, MASTER_FILE)
    _require_columns(monthly, REQUIRED_MONTHLY_COLUMNS, MONTHLY_FILE)
    _require_columns(flash, REQUIRED_FLASH_COLUMNS, FLASH_FILE)

    for col in ["original_end_date", "revised_end_date", "first_snapshot", "last_snapshot"]:
        if col in master.columns:
            master[col] = pd.to_datetime(master[col], errors="coerce")
    monthly["snapshot_month"] = pd.to_datetime(monthly["snapshot_month"], errors="coerce")
    flash["snapshot_month"] = pd.to_datetime(flash["snapshot_month"], errors="coerce")

    master_numeric = [
        "original_cost_cr", "revised_cost_cr", "revised_cost_analytical_cr",
        "expenditure_cr", "final_expenditure_cr", "cost_overrun_cr",
        "cost_overrun_pct", "final_cost_overrun_pct", "delay_days", "delay_months",
        "final_schedule_change_days", "flash_latest_physical_progress", "expenditure_pct",
    ]
    for col in master_numeric:
        if col in master.columns:
            master[col] = pd.to_numeric(master[col], errors="coerce")
    for col in [
        "is_delayed", "has_cost_overrun", "extreme_cost_overrun_flag",
        "extreme_schedule_change_flag", "flash_progress_stagnation_flag", "flash_low_progress_flag",
    ]:
        master[col] = pd.to_numeric(master[col], errors="coerce").fillna(0).astype(int)
    for col in [
        "revised_cost_cr", "expenditure_cr", "delay_days", "cost_overrun_pct",
        "expenditure_change_cr", "cost_overrun_cr", "schedule_change_days",
    ]:
        if col in monthly.columns:
            monthly[col] = pd.to_numeric(monthly[col], errors="coerce")
    for col in [
        "physical_progress_pct", "expenditure_change_cr", "physical_progress_change_pct",
        "revised_cost_change_cr",
    ]:
        if col in flash.columns:
            flash[col] = pd.to_numeric(flash[col], errors="coerce")

    master["analytics_cost_cr"] = master["revised_cost_analytical_cr"].fillna(master["original_cost_cr"])
    monthly["delay_flag"] = (monthly["delay_days"].fillna(0) > 0).astype(int)
    monthly["cost_overrun_flag"] = (monthly["cost_overrun_pct"].fillna(0) > 0).astype(int)
    monthly = monthly.dropna(subset=["project_code", "snapshot_month"]).copy()
    flash = flash.dropna(subset=["project_code", "snapshot_month"]).copy()
    master["project_code"] = master["project_code"].astype(str)
    monthly["project_code"] = monthly["project_code"].astype(str)
    flash["project_code"] = flash["project_code"].astype(str)
    return master, monthly, flash


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


def calculate_project_health_v1(row: pd.Series | dict[str, Any]) -> dict[str, Any]:
    r = row if isinstance(row, dict) else row.to_dict()

    def flag(name: str) -> int:
        try:
            return int(float(r.get(name, 0) or 0))
        except (TypeError, ValueError):
            return 0

    data_issue = 0 if str(r.get("data_quality_flag", "OK")) == "OK" else 1
    score = min(100, max(0, sum(flag(k) * v for k, v in HEALTH_WEIGHTS.items() if k != "data_quality_issue") + data_issue * 5))
    if score < 25:
        band = "Low Risk"
    elif score < 50:
        band = "Moderate Risk"
    elif score < 75:
        band = "High Risk"
    else:
        band = "Very High Risk"

    drivers = []
    for field, label in [
        ("is_delayed", "Delayed"), ("has_cost_overrun", "Cost overrun"),
        ("extreme_schedule_change_flag", "Extreme schedule change"),
        ("extreme_cost_overrun_flag", "Extreme cost overrun"),
        ("flash_progress_stagnation_flag", "Progress stagnation"),
        ("flash_low_progress_flag", "Low physical progress"),
    ]:
        if flag(field):
            drivers.append(label)
    if data_issue:
        drivers.append("Data quality issue")
    return {"health_score": int(score), "health_band": band, "drivers": drivers}


def _add_health(master: pd.DataFrame) -> pd.DataFrame:
    result = master.copy()
    values = result.apply(calculate_project_health_v1, axis=1)
    result["health_score_v1"] = values.apply(lambda x: x["health_score"])
    result["health_band_v1"] = values.apply(lambda x: x["health_band"])
    result["health_drivers_v1"] = values.apply(lambda x: x["drivers"])
    return result


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
    n = int(metrics_df["project_code"].nunique()) if not metrics_df.empty else 0
    delayed = int(metrics_df["is_delayed"].fillna(0).sum()) if not metrics_df.empty else 0
    overrun = int(metrics_df["has_cost_overrun"].fillna(0).sum()) if not metrics_df.empty else 0
    data_issues = int(metrics_df["data_quality_flag"].fillna("OK").ne("OK").sum()) if not metrics_df.empty else 0

    def sum_col(name):
        return float(metrics_df[name].sum(min_count=1)) if not metrics_df.empty else 0.0
    def mean_col(name):
        return float(metrics_df[name].mean()) if not metrics_df.empty else 0.0

    exposure = validated_cost_change_exposure(metrics_df)
    return {
        "total_projects": n,
        "total_original_cost_cr": round(sum_col("original_cost_cr"), 2),
        "total_revised_cost_cr": round(sum_col("revised_cost_cr"), 2),
        "total_analytical_cost_cr": round(sum_col("analytics_cost_cr"), 2),
        "total_expenditure_cr": round(sum_col("final_expenditure_cr"), 2),
        "total_cost_change_exposure_cr": round(exposure, 2),
        "total_cost_increase_cr": round(exposure, 2),
        "cost_overrun_projects": overrun,
        "projects_with_cost_overrun": overrun,
        "cost_overrun_rate_pct": round(safe_divide(overrun, n) * 100, 2),
        "avg_cost_overrun_pct": round(mean_col("cost_overrun_pct"), 2),
        "delayed_projects": delayed,
        "delay_rate_pct": round(safe_divide(delayed, n) * 100, 2),
        "avg_delay_months": round(mean_col("delay_months"), 2),
        "data_quality": {
            "projects_flagged": data_issues,
            "rate_pct": round(safe_divide(data_issues, n) * 100, 2),
            "definition": "Projects where master data_quality_flag is non-OK; this is not a count of all missing fields.",
        },
    }


def _portfolio_summary(df: pd.DataFrame, group_column: str, temporal: Optional[pd.DataFrame] = None) -> pd.DataFrame:
    metrics_df = _temporal_metrics_frame(df, temporal) if temporal is not None else df.copy()
    cols = [group_column, "total_projects", "total_original_cost_cr", "total_revised_cost_cr", "total_analytical_cost_cr", "total_expenditure_cr", "delayed_projects", "cost_overrun_projects", "avg_delay_months", "avg_delay_days", "avg_cost_overrun_pct", "data_quality_flagged_projects", "avg_health_score_v1", "delay_rate_pct", "cost_overrun_rate_pct", "data_quality_rate_pct", "total_cost_change_exposure_cr", "total_cost_increase_cr", "expenditure_to_analytical_cost_pct"]
    if metrics_df.empty:
        return pd.DataFrame(columns=cols)

    metrics_df = metrics_df.copy()
    original = pd.to_numeric(metrics_df["original_cost_cr"], errors="coerce")
    revised = pd.to_numeric(metrics_df["revised_cost_cr"], errors="coerce")
    valid = original.notna() & revised.notna() & (original > 0) & (revised > 0) & (revised >= original)
    metrics_df["_cost_change_exposure_cr"] = 0.0
    metrics_df.loc[valid, "_cost_change_exposure_cr"] = revised[valid] - original[valid]

    summary = metrics_df.groupby(group_column, dropna=False).agg(
        total_projects=("project_code", "nunique"),
        total_original_cost_cr=("original_cost_cr", "sum"),
        total_revised_cost_cr=("revised_cost_cr", "sum"),
        total_analytical_cost_cr=("analytics_cost_cr", "sum"),
        total_expenditure_cr=("final_expenditure_cr", "sum"),
        delayed_projects=("is_delayed", "sum"),
        cost_overrun_projects=("has_cost_overrun", "sum"),
        avg_delay_months=("delay_months", "mean"),
        avg_delay_days=("delay_days", "mean"),
        avg_cost_overrun_pct=("cost_overrun_pct", "mean"),
        data_quality_flagged_projects=("data_quality_flag", lambda x: x.fillna("OK").ne("OK").sum()),
        avg_health_score_v1=("health_score_v1", "mean"),
        total_cost_change_exposure_cr=("_cost_change_exposure_cr", "sum"),
    ).reset_index()
    summary["delay_rate_pct"] = np.where(summary["total_projects"] > 0, summary["delayed_projects"] / summary["total_projects"] * 100, 0)
    summary["cost_overrun_rate_pct"] = np.where(summary["total_projects"] > 0, summary["cost_overrun_projects"] / summary["total_projects"] * 100, 0)
    summary["data_quality_rate_pct"] = np.where(summary["total_projects"] > 0, summary["data_quality_flagged_projects"] / summary["total_projects"] * 100, 0)
    summary["total_cost_increase_cr"] = summary["total_cost_change_exposure_cr"]
    summary["expenditure_to_analytical_cost_pct"] = np.where(summary["total_analytical_cost_cr"] > 0, summary["total_expenditure_cr"] / summary["total_analytical_cost_cr"] * 100, 0.0)
    return summary.sort_values("total_projects", ascending=False).reset_index(drop=True)


def _delay_analysis(summary, group_column):
    return summary[[group_column, "total_projects", "delayed_projects", "delay_rate_pct", "avg_delay_months", "avg_delay_days"]].sort_values("delay_rate_pct", ascending=False).reset_index(drop=True)


def _cost_analysis(summary, group_column):
    return summary[[group_column, "total_projects", "cost_overrun_projects", "cost_overrun_rate_pct", "avg_cost_overrun_pct", "total_cost_change_exposure_cr"]].sort_values("cost_overrun_rate_pct", ascending=False).reset_index(drop=True)


def _health_analysis(df, group_column):
    if df.empty:
        return pd.DataFrame(columns=[group_column] + HEALTH_BANDS)
    result = (pd.crosstab(df[group_column], df["health_band_v1"], normalize="index") * 100).reset_index()
    for band in HEALTH_BANDS:
        if band not in result.columns:
            result[band] = 0.0
    return result[[group_column] + HEALTH_BANDS]


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


def _priority_projects(df, limit=20):
    if df.empty:
        return []
    cols = [
        "project_code", "project_name", "sector", "ministry", "flash_state",
        "analytics_cost_cr", "final_expenditure_cr", "delay_days", "delay_months",
        "final_cost_overrun_pct", "cost_overrun_pct", "flash_latest_physical_progress",
        "health_score_v1", "health_band_v1", "health_drivers_v1",
    ]
    cols = [c for c in cols if c in df.columns]
    result = df.sort_values(["health_score_v1", "analytics_cost_cr"], ascending=[False, False]).head(limit)[cols].copy()
    if "flash_state" in result.columns:
        result["state"] = result["flash_state"]
        result.drop(columns=["flash_state"], inplace=True)
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


def _warning_severity(value):
    try: v = float(value)
    except (TypeError, ValueError): return "moderate"
    if v >= 75: return "immediate"
    if v >= 50: return "high"
    if v >= 25: return "moderate"
    return "low"


def _make_warning(title, severity, message, metric, value, affected_projects, source_field):
    return {"title": title, "severity": severity, "message": message, "metric": metric, "value": _json_safe(value), "affected_projects": int(affected_projects), "source_field": source_field, "reason": source_field}


def generate_early_warnings(selected_df):
    if selected_df.empty:
        return []
    warnings = []
    n = int(selected_df["project_code"].nunique())
    delayed = selected_df["is_delayed"].fillna(0).astype(int)
    delay_rate = safe_divide(delayed.sum(), n) * 100
    if delayed.sum():
        warnings.append(_make_warning("High delay exposure", _warning_severity(delay_rate), f"{int(delayed.sum()):,} selected projects are delayed ({delay_rate:.2f}% of the selected portfolio).", "delay_rate_pct", round(delay_rate, 2), delayed.sum(), "is_delayed / delay_days"))
    overrun = selected_df["has_cost_overrun"].fillna(0).astype(int)
    overrun_rate = safe_divide(overrun.sum(), n) * 100
    if overrun.sum():
        warnings.append(_make_warning("Cost-overrun exposure", _warning_severity(overrun_rate), f"{int(overrun.sum()):,} selected projects have a cost overrun ({overrun_rate:.2f}% of the selected portfolio).", "cost_overrun_rate_pct", round(overrun_rate, 2), overrun.sum(), "has_cost_overrun / cost_overrun_pct"))

    for field, title, metric in [
        ("flash_progress_stagnation_flag", "Progress stagnation", "progress_stagnation_projects"),
        ("flash_low_progress_flag", "Low physical progress", "low_progress_projects"),
        ("extreme_schedule_change_flag", "Extreme schedule change", "extreme_schedule_change_projects"),
        ("extreme_cost_overrun_flag", "Extreme cost overrun", "extreme_cost_overrun_projects"),
    ]:
        affected = int(pd.to_numeric(selected_df[field], errors="coerce").fillna(0).sum())
        if affected:
            warnings.append(_make_warning(title, "high", f"{affected:,} selected projects are flagged for {title.lower()}.", metric, affected, affected, field))

    if "expenditure_pct" in selected_df.columns and "flash_latest_physical_progress" in selected_df.columns:
        exp_pct = pd.to_numeric(selected_df["expenditure_pct"], errors="coerce")
        phys_pct = pd.to_numeric(selected_df["flash_latest_physical_progress"], errors="coerce")
        gap = exp_pct - phys_pct
        mask = exp_pct.notna() & phys_pct.notna() & (gap >= 25)
        affected = int(mask.sum())
        if affected:
            warnings.append(_make_warning("Financial/physical divergence", "high", f"{affected:,} selected projects have expenditure percentage at least 25 percentage points ahead of physical progress.", "financial_physical_gap_pct_points", round(float(gap[mask].max()), 2), affected, "expenditure_pct - flash_latest_physical_progress"))

    data_issue = selected_df["data_quality_flag"].fillna("OK").ne("OK")
    affected = int(data_issue.sum())
    if affected:
        rate = safe_divide(affected, n) * 100
        warnings.append(_make_warning("Data quality concern", _warning_severity(rate), f"{affected:,} selected projects have a non-OK data-quality flag ({rate:.2f}%).", "data_quality_rate_pct", round(rate, 2), affected, "data_quality_flag"))

    high_health = pd.to_numeric(selected_df["health_score_v1"], errors="coerce") >= 75
    affected = int(high_health.sum())
    if affected:
        warnings.append(_make_warning("High V1 health score exposure", "immediate", f"{affected:,} selected projects have a V1 Project Health Score of at least 75.", "health_score_v1", 75, affected, "health_score_v1"))
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

    master, monthly, flash = load_data(data_dir)
    master = _add_health(master)
    selected = _master_membership(master, monthly, ministry=ministry, sector=sector, state=state, snapshot_month=snapshot_month, financial_year_filter=financial_year_filter)
    temporal = _temporal_snapshot(monthly, snapshot_month=snapshot_month, financial_year_filter=financial_year_filter)
    if temporal is not None:
        temporal = temporal[temporal["project_code"].isin(set(selected["project_code"]))].copy()
    metrics_df = _temporal_metrics_frame(selected, temporal) if temporal is not None else selected.copy()

    group_column = "sector" if view_by == "sector" else "ministry"
    sector_summary = _portfolio_summary(selected, "sector", temporal)
    ministry_summary = _portfolio_summary(selected, "ministry", temporal)
    selected_summary = sector_summary if group_column == "sector" else ministry_summary
    state_projects = set(selected["project_code"]) if state else None
    trends = _monthly_trends(monthly, ministry=ministry, sector=sector, state_projects=state_projects, financial_year_filter=financial_year_filter, snapshot_month=snapshot_month)
    kpis = _portfolio_kpis(metrics_df)

    return {
        "metadata": {
            "version": "V1", "analytics_type": "descriptive_diagnostic_rule_based", "ml_predictions_included": False,
            "source_datasets": [MASTER_FILE, MONTHLY_FILE, FLASH_FILE],
            "health_score_label": "V1 Project Health Score",
            "financial_year_definition": "Indian Apr-Mar financial year; FY 2025-26 = 2025-04-01 through 2026-03-31.",
            "snapshot_month_definition": "Monthly observation month from 02_PAIMANA_MONTHLY_HISTORY_CLEAN.csv.",
            "temporal_metric_definition": "When a financial year or snapshot month is active, time-varying KPI metrics use the latest monthly-history observation per project within the selected period.",
            "health_definition": "Rule-based V1 Project Health Score; not an ML risk score or probability.",
        },
        "filters": {"view_by": view_by, "ministry": ministry or "All Ministries", "sector": sector or "All Sectors", "state": state or "All States", "financial_year": financial_year_filter or "All Years", "snapshot_month": snapshot_month or "All Months"},
        "portfolio_summary": {"selected_view": view_by, "kpis": kpis, "rows": _records(selected_summary)},
        "sector_summary": _records(sector_summary),
        "ministry_summary": _records(ministry_summary),
        "cost_analysis": {"sector": _records(_cost_analysis(sector_summary, "sector")), "ministry": _records(_cost_analysis(ministry_summary, "ministry"))},
        "delay_analysis": {"sector": _records(_delay_analysis(sector_summary, "sector")), "ministry": _records(_delay_analysis(ministry_summary, "ministry"))},
        "health_analysis": {"sector": _records(_health_analysis(metrics_df, "sector")), "ministry": _records(_health_analysis(metrics_df, "ministry"))},
        "monthly_trends": {"sector": _records(trends["sector"]), "ministry": _records(trends["ministry"])},
        "key_insights": generate_key_insights(metrics_df, selected_summary, group_column),
        "early_warnings": generate_early_warnings(metrics_df),
        "priority_projects": _records(_priority_projects(metrics_df)),
        "data_quality": kpis["data_quality"],
    }