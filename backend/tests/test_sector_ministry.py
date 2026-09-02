import json
import math

import numpy as np
import pandas as pd

from app.services.sector_ministry_service import (
    _portfolio_summary,
    _temporal_metrics_frame,
    calculate_project_health_v1,
    financial_year,
    generate_analytics,
    load_data,
)


def test_financial_year_apr_to_mar():
    assert financial_year(pd.Timestamp("2025-04-01")) == "2025-26"
    assert financial_year(pd.Timestamp("2026-03-31")) == "2025-26"
    assert financial_year(pd.Timestamp("2026-04-01")) == "2026-27"


def test_health_score_v1_and_band():
    row = {
        "is_delayed": 1,
        "has_cost_overrun": 1,
        "extreme_schedule_change_flag": 0,
        "extreme_cost_overrun_flag": 0,
        "flash_progress_stagnation_flag": 1,
        "flash_low_progress_flag": 0,
        "data_quality_flag": "OK",
    }
    result = calculate_project_health_v1(row)
    assert result["health_score"] == 65
    assert result["health_band"] == "High Risk"
    assert "Delayed" in result["drivers"]
    assert "Cost overrun" in result["drivers"]
    assert "Progress stagnation" in result["drivers"]


def test_portfolio_summary_delay_and_safe_cost_exposure():
    df = pd.DataFrame([
        {
            "project_code": "fixture-1", "sector": "Sector A", "ministry": "Ministry A",
            "original_cost_cr": 100.0, "revised_cost_cr": 110.0, "analytics_cost_cr": 110.0,
            "final_expenditure_cr": 50.0, "is_delayed": 1, "has_cost_overrun": 1,
            "delay_days": 120.0, "delay_months": 4.0, "cost_overrun_pct": 10.0,
            "final_cost_overrun_pct": 10.0, "data_quality_flag": "OK", "health_score_v1": 55,
        },
        {
            "project_code": "fixture-2", "sector": "Sector A", "ministry": "Ministry A",
            "original_cost_cr": 200.0, "revised_cost_cr": 150.0, "analytics_cost_cr": 200.0,
            "final_expenditure_cr": 100.0, "is_delayed": 0, "has_cost_overrun": 0,
            "delay_days": 0.0, "delay_months": 0.0, "cost_overrun_pct": 0.0,
            "final_cost_overrun_pct": 0.0, "data_quality_flag": "OK", "health_score_v1": 0,
        },
    ])
    result = _portfolio_summary(df, "sector").iloc[0]
    assert result["total_projects"] == 2
    assert result["delayed_projects"] == 1
    assert result["cost_overrun_projects"] == 1
    assert result["delay_rate_pct"] == 50
    assert result["cost_overrun_rate_pct"] == 50
    assert result["avg_delay_months"] == 2
    assert result["total_cost_change_exposure_cr"] == 10
    assert result["total_cost_increase_cr"] == 10


def _latest_temporal_frame(master, monthly, **kwargs):
    selected = master.copy()
    if kwargs.get("sector"):
        selected = selected[selected["sector"].astype(str) == str(kwargs["sector"])]
    if kwargs.get("ministry"):
        selected = selected[selected["ministry"].astype(str) == str(kwargs["ministry"])]
    if kwargs.get("state"):
        selected = selected[selected["flash_state"].astype(str) == str(kwargs["state"])]

    h = monthly.copy()
    h["_fy"] = h["snapshot_month"].apply(financial_year)
    if kwargs.get("snapshot_month"):
        month = pd.to_datetime(kwargs["snapshot_month"]).to_period("M")
        h = h[h["snapshot_month"].dt.to_period("M") == month]
    if kwargs.get("financial_year_filter"):
        h = h[h["_fy"] == str(kwargs["financial_year_filter"])]
    codes = set(h["project_code"].astype(str))
    selected = selected[selected["project_code"].astype(str).isin(codes)]
    h = h[h["project_code"].astype(str).isin(set(selected["project_code"].astype(str)))]
    h = h.sort_values(["project_code", "snapshot_month"]).drop_duplicates("project_code", keep="last")
    return selected, h


def _expected_temporal(master, monthly, **kwargs):
    selected, temporal = _latest_temporal_frame(master, monthly, **kwargs)
    frame = _temporal_metrics_frame(selected, temporal)
    n = frame["project_code"].nunique()
    delayed = int(frame["is_delayed"].sum())
    overrun = int(frame["has_cost_overrun"].sum())
    return {
        "total_projects": n,
        "delayed_projects": delayed,
        "delay_rate_pct": round(delayed / n * 100, 2) if n else 0,
        "cost_overrun_projects": overrun,
        "cost_overrun_rate_pct": round(overrun / n * 100, 2) if n else 0,
        "avg_delay_months": round(float(frame["delay_months"].mean()), 2) if n else 0,
        "avg_cost_overrun_pct": round(float(frame["cost_overrun_pct"].mean()), 2) if n else 0,
        "total_expenditure_cr": round(float(frame["final_expenditure_cr"].sum()), 2),
    }


def test_actual_v1_sources_load():
    master, monthly, flash = load_data()
    assert len(master) == 2155
    assert not monthly.empty
    assert not flash.empty
    assert "09_PAIMANA_ML_READY_WITH_PROJECT_CODE.csv" not in {"01_PROJECT_MASTER_CLEANED.csv", "02_PAIMANA_MONTHLY_HISTORY_CLEAN.csv", "03_FLASH_MODERN_HISTORY_CLEAN.csv"}


def test_temporal_kpis_match_latest_monthly_observation():
    master, monthly, _ = load_data()
    cases = [
        {},
        {"snapshot_month": monthly["snapshot_month"].dt.to_period("M").astype(str).iloc[0]},
        {"financial_year_filter": monthly["snapshot_month"].apply(financial_year).dropna().iloc[0]},
        {"sector": master["sector"].dropna().astype(str).iloc[0], "snapshot_month": monthly["snapshot_month"].dt.to_period("M").astype(str).iloc[0]},
        {"ministry": master["ministry"].dropna().astype(str).iloc[0], "snapshot_month": monthly["snapshot_month"].dt.to_period("M").astype(str).iloc[0]},
    ]
    for kwargs in cases[1:]:
        result = generate_analytics(**kwargs)
        got = result["portfolio_summary"]["kpis"]
        expected = _expected_temporal(master, monthly, **kwargs)
        for metric, value in expected.items():
            assert got[metric] == value, (kwargs, metric, got[metric], value)


def test_temporal_filter_changes_more_than_expenditure():
    master, monthly, _ = load_data()
    base = generate_analytics()
    month = monthly["snapshot_month"].dt.to_period("M").astype(str).iloc[0]
    snap = generate_analytics(snapshot_month=month)
    metrics = [
        "total_projects", "delayed_projects", "delay_rate_pct", "cost_overrun_projects",
        "cost_overrun_rate_pct", "avg_delay_months", "avg_cost_overrun_pct", "total_expenditure_cr",
    ]
    changed = [m for m in metrics if base["portfolio_summary"]["kpis"][m] != snap["portfolio_summary"]["kpis"][m]]
    assert changed
    assert any(m != "total_expenditure_cr" for m in changed)


def test_temporal_group_summaries_are_consistent():
    master, monthly, _ = load_data()
    month = monthly["snapshot_month"].dt.to_period("M").astype(str).iloc[0]
    result = generate_analytics(snapshot_month=month)
    selected, temporal = _latest_temporal_frame(master, monthly, snapshot_month=month)
    frame = _temporal_metrics_frame(selected, temporal)
    for group in ["sector", "ministry"]:
        expected = frame.groupby(group).agg(
            total_projects=("project_code", "nunique"),
            delayed_projects=("is_delayed", "sum"),
            cost_overrun_projects=("has_cost_overrun", "sum"),
            avg_delay_months=("delay_months", "mean"),
            avg_cost_overrun_pct=("cost_overrun_pct", "mean"),
            total_expenditure_cr=("final_expenditure_cr", "sum"),
        )
        actual = {r[group]: r for r in result[f"{group}_summary"]}
        for name, row in expected.iterrows():
            assert actual[name]["total_projects"] == int(row["total_projects"])
            assert actual[name]["delayed_projects"] == int(row["delayed_projects"])
            assert actual[name]["cost_overrun_projects"] == int(row["cost_overrun_projects"])
            if pd.isna(row["avg_delay_months"]):
                assert actual[name]["avg_delay_months"] is None
            else:
                assert round(float(actual[name]["avg_delay_months"]), 2) == round(float(row["avg_delay_months"]), 2)
            if pd.isna(row["avg_cost_overrun_pct"]):
                assert actual[name]["avg_cost_overrun_pct"] is None
            else:
                assert round(float(actual[name]["avg_cost_overrun_pct"]), 2) == round(float(row["avg_cost_overrun_pct"]), 2)
            assert np.isclose(actual[name]["total_expenditure_cr"], row["total_expenditure_cr"])


def test_warning_categories_and_schema():
    master, monthly, _ = load_data()
    month = monthly["snapshot_month"].dt.to_period("M").astype(str).iloc[0]
    warnings = generate_analytics(snapshot_month=month)["early_warnings"]
    titles = {w["title"] for w in warnings}
    expected = {
        "High delay exposure", "Cost-overrun exposure", "Progress stagnation",
        "Low physical progress", "Extreme schedule change", "Extreme cost overrun",
        "Financial/physical divergence", "Data quality concern",
    }
    assert expected.issubset(titles)
    for warning in warnings:
        assert {"title", "severity", "message", "metric", "value", "affected_projects", "reason", "source_field"} <= set(warning)
        assert isinstance(warning["affected_projects"], int)


def test_response_contract_and_json_safety():
    result = generate_analytics()
    expected_top = {"metadata", "filters", "portfolio_summary", "sector_summary", "ministry_summary", "cost_analysis", "delay_analysis", "health_analysis", "monthly_trends", "key_insights", "early_warnings", "priority_projects", "data_quality"}
    assert expected_top <= set(result)
    assert "kpis" in result["portfolio_summary"]
    assert result["metadata"]["ml_predictions_included"] is False
    payload = json.dumps(result, allow_nan=False)
    assert payload


def test_empty_result():
    result = generate_analytics(sector="__NO_SUCH_SECTOR__")
    assert result["portfolio_summary"]["kpis"]["total_projects"] == 0
    assert result["sector_summary"] == []
    assert result["ministry_summary"] == []
    assert result["early_warnings"] == []
    assert result["priority_projects"] == []


def test_health_analysis_and_priority_projects():
    result = generate_analytics(snapshot_month="2026-04")
    assert "sector" in result["health_analysis"] and "ministry" in result["health_analysis"]
    for row in result["priority_projects"]:
        assert "project_code" in row
        assert "state" in row
        assert "health_score_v1" in row
        assert "health_band_v1" in row
        assert "health_drivers_v1" in row
