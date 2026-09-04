from functools import lru_cache
from pathlib import Path
import math

import numpy as np
import pandas as pd
from flask import Blueprint, jsonify, request
from sqlalchemy import func

from app.extensions import db
from app.models.project import Project
from app.ml.ml_engine import score, simulate


analytics_bp = Blueprint("analytics", __name__)

BASE_DIR = Path(__file__).resolve().parents[2]


# ============================================================
# COMMON HELPERS
# ============================================================

def _safe(value):
    """
    Convert numpy / pandas / datetime values into JSON-safe values.
    """

    if value is None:
        return None

    if isinstance(value, (np.integer,)):
        return int(value)

    if isinstance(value, (np.floating,)):
        value = float(value)

    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return None

        return round(value, 6)

    if isinstance(value, pd.Timestamp):
        if pd.isna(value):
            return None

        return value.strftime("%Y-%m-%d")

    if isinstance(value, (np.bool_,)):
        return bool(value)

    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass

    return value


def _normalise_code(value):
    """
    Normalize project codes so PostgreSQL, ML and CSV
    values match reliably.
    """

    if value is None:
        return None

    try:
        return str(int(float(value)))
    except (ValueError, TypeError):
        return str(value).strip()


def _find_data_file(*names):
    """
    Find a data file in supported backend locations.
    """

    candidates = []

    for name in names:

        candidates.extend(
            [
                BASE_DIR / name,
                BASE_DIR / "data" / name,
                BASE_DIR / "app" / "data" / name,
                BASE_DIR / "app" / "ml" / name,
            ]
        )

    for path in candidates:

        if path.exists():
            return path

    raise FileNotFoundError(
        "Required data file not found: "
        + ", ".join(
            str(path)
            for path in candidates
        )
    )


@lru_cache(maxsize=16)
def _load_csv_cached(filename):

    path = _find_data_file(filename)

    return pd.read_csv(path)


def _load_csv(*names):

    for name in names:

        try:
            return _load_csv_cached(name).copy()

        except FileNotFoundError:
            continue

    raise FileNotFoundError(
        "None of these files were found: "
        + ", ".join(names)
    )


# ============================================================
# BASIC ANALYTICS
# ============================================================

@analytics_bp.get("/analytics/summary")
def analytics_summary():

    total_projects = Project.query.count()

    avg_progress = (
        db.session.query(
            func.avg(
                Project.flash_latest_physical_progress
            )
        )
        .filter(
            Project.flash_latest_physical_progress.isnot(None)
        )
        .scalar()
        or 0
    )

    avg_delay = (
        db.session.query(
            func.avg(Project.delay_days)
        )
        .filter(
            Project.delay_days.isnot(None)
        )
        .scalar()
        or 0
    )

    avg_cost_overrun = (
        db.session.query(
            func.avg(Project.cost_overrun_pct)
        )
        .filter(
            Project.cost_overrun_pct.isnot(None)
        )
        .scalar()
        or 0
    )

    avg_expenditure_pct = (
        db.session.query(
            func.avg(Project.expenditure_pct)
        )
        .filter(
            Project.expenditure_pct.isnot(None)
        )
        .scalar()
        or 0
    )

    return jsonify(
        {
            "total_projects": total_projects,
            "average_physical_progress_pct":
                round(float(avg_progress), 2),
            "average_delay_days":
                round(float(avg_delay), 2),
            "average_cost_overrun_pct":
                round(float(avg_cost_overrun), 2),
            "average_expenditure_pct":
                round(float(avg_expenditure_pct), 2),
        }
    )


@analytics_bp.get("/analytics/sectors")
def sector_analytics():

    data = (
        db.session.query(
            Project.sector,
            func.count(
                Project.project_code
            ).label("projects"),
            func.avg(
                Project.delay_days
            ).label("avg_delay_days"),
            func.avg(
                Project.cost_overrun_pct
            ).label("avg_cost_overrun_pct"),
            func.avg(
                Project.flash_latest_physical_progress
            ).label("avg_progress_pct"),
        )
        .group_by(Project.sector)
        .order_by(
            func.count(
                Project.project_code
            ).desc()
        )
        .all()
    )

    return jsonify(
        [
            {
                "sector":
                    sector or "Unknown",

                "projects":
                    projects,

                "average_delay_days":
                    round(
                        float(avg_delay or 0),
                        2,
                    ),

                "average_cost_overrun_pct":
                    round(
                        float(avg_cost or 0),
                        2,
                    ),

                "average_progress_pct":
                    round(
                        float(progress or 0),
                        2,
                    ),
            }
            for (
                sector,
                projects,
                avg_delay,
                avg_cost,
                progress,
            ) in data
        ]
    )


@analytics_bp.get("/analytics/ministries")
def ministry_analytics():

    data = (
        db.session.query(
            Project.ministry,
            func.count(
                Project.project_code
            ).label("projects"),
            func.avg(
                Project.delay_days
            ).label("avg_delay_days"),
            func.avg(
                Project.cost_overrun_pct
            ).label("avg_cost_overrun_pct"),
            func.avg(
                Project.flash_latest_physical_progress
            ).label("avg_progress_pct"),
        )
        .group_by(Project.ministry)
        .order_by(
            func.count(
                Project.project_code
            ).desc()
        )
        .all()
    )

    return jsonify(
        [
            {
                "ministry":
                    ministry or "Unknown",

                "projects":
                    projects,

                "average_delay_days":
                    round(
                        float(avg_delay or 0),
                        2,
                    ),

                "average_cost_overrun_pct":
                    round(
                        float(avg_cost or 0),
                        2,
                    ),

                "average_progress_pct":
                    round(
                        float(progress or 0),
                        2,
                    ),
            }
            for (
                ministry,
                projects,
                avg_delay,
                avg_cost,
                progress,
            ) in data
        ]
    )


@analytics_bp.get("/analytics/states")
def state_analytics():

    data = (
        db.session.query(
            Project.flash_state,
            func.count(
                Project.project_code
            ).label("projects"),
            func.avg(
                Project.delay_days
            ).label("avg_delay_days"),
            func.avg(
                Project.cost_overrun_pct
            ).label("avg_cost_overrun_pct"),
            func.avg(
                Project.flash_latest_physical_progress
            ).label("avg_progress_pct"),
        )
        .group_by(Project.flash_state)
        .order_by(
            func.count(
                Project.project_code
            ).desc()
        )
        .all()
    )

    return jsonify(
        [
            {
                "state":
                    state or "Unknown",

                "projects":
                    projects,

                "average_delay_days":
                    round(
                        float(avg_delay or 0),
                        2,
                    ),

                "average_cost_overrun_pct":
                    round(
                        float(avg_cost or 0),
                        2,
                    ),

                "average_progress_pct":
                    round(
                        float(progress or 0),
                        2,
                    ),
            }
            for (
                state,
                projects,
                avg_delay,
                avg_cost,
                progress,
            ) in data
        ]
    )


@analytics_bp.get("/analytics/top-delayed")
def top_delayed_projects():

    projects = (
        Project.query
        .filter(
            Project.delay_days.isnot(None)
        )
        .order_by(
            Project.delay_days.desc()
        )
        .limit(20)
        .all()
    )

    return jsonify(
        [
            {
                "project_code":
                    _safe(project.project_code),

                "project_name":
                    _safe(project.project_name),

                "sector":
                    _safe(project.sector),

                "ministry":
                    _safe(project.ministry),

                "state":
                    _safe(project.flash_state),

                "delay_days":
                    _safe(project.delay_days),

                "schedule_status":
                    _safe(project.schedule_status),
            }
            for project in projects
        ]
    )


@analytics_bp.get("/analytics/top-cost-overrun")
def top_cost_overrun_projects():

    projects = (
        Project.query
        .filter(
            Project.cost_overrun_pct.isnot(None)
        )
        .order_by(
            Project.cost_overrun_pct.desc()
        )
        .limit(20)
        .all()
    )

    return jsonify(
        [
            {
                "project_code":
                    _safe(project.project_code),

                "project_name":
                    _safe(project.project_name),

                "sector":
                    _safe(project.sector),

                "ministry":
                    _safe(project.ministry),

                "state":
                    _safe(project.flash_state),

                "cost_overrun_pct":
                    _safe(
                        project.cost_overrun_pct
                    ),

                "cost_overrun_cr":
                    _safe(
                        project.cost_overrun_cr
                    ),

                "cost_status":
                    _safe(
                        project.cost_status
                    ),
            }
            for project in projects
        ]
    )


# ============================================================
# ML RISK CACHE
# ============================================================

@lru_cache(maxsize=1)
def _risk_predictions():
    """
    Load existing ML risk report for portfolio-level
    Project Analytics listing/filtering.

    IMPORTANT:
    We intentionally do NOT call score_all() here.

    Individual project detail uses score(project_code)
    directly, which prevents a single detail request from
    recalculating the complete ML portfolio.
    """

    columns = [
        "project_code",
        "predicted_cost_overrun_pct",
        "future_delay_probability",
        "future_progress_stall_probability",
        "cost_risk_score",
        "overall_risk_score",
        "risk_level",
        "early_warning_active",
        "early_warning_priority",
        "early_warning_reasons",
    ]

    try:

        df = _load_csv(
            "latest_project_risk_scores.csv"
        )

    except FileNotFoundError:

        return pd.DataFrame(
            columns=columns
        )

    if df.empty:

        return pd.DataFrame(
            columns=columns
        )

    if "project_code" not in df.columns:

        return pd.DataFrame(
            columns=columns
        )

    df["project_code"] = (
        df["project_code"]
        .map(_normalise_code)
    )

    # --------------------------------------------------------
    # Support common alternative column names.
    # --------------------------------------------------------

    aliases = {

        "predicted_cost_overrun":
            "predicted_cost_overrun_pct",

        "future_delay":
            "future_delay_probability",

        "delay_probability":
            "future_delay_probability",

        "future_stall":
            "future_progress_stall_probability",

        "stall_probability":
            "future_progress_stall_probability",

        "overall_risk":
            "overall_risk_score",

        "risk_score":
            "overall_risk_score",

        "risk":
            "risk_level",

        "alert_priority":
            "early_warning_priority",
    }

    for old_name, new_name in aliases.items():

        if (
            old_name in df.columns
            and new_name not in df.columns
        ):

            df[new_name] = df[old_name]

    for column in columns:

        if column not in df.columns:

            df[column] = None

    df = df[columns].copy()

    df = df.drop_duplicates(
        subset=["project_code"],
        keep="last",
    )

    return df.reset_index(
        drop=True
    )


def _risk_for_project(project_code):
    """
    Get ML risk for ONE project.

    Primary source:
        current ML engine score()

    Fallback:
        cached ML report.
    """

    code = _normalise_code(
        project_code
    )

    # --------------------------------------------------------
    # Authoritative current ML score
    # --------------------------------------------------------

    try:

        result = score(code)

        if result:
            return result

    except Exception:
        pass

    # --------------------------------------------------------
    # Fallback to existing ML report
    # --------------------------------------------------------

    risk_df = _risk_predictions()

    if risk_df.empty:

        return {}

    matches = risk_df[
        risk_df["project_code"] == code
    ]

    if matches.empty:

        return {}

    row = matches.iloc[0]

    result = {}

    for column in risk_df.columns:

        result[column] = row.get(column)

    return result


# ============================================================
# PROJECT DATAFRAME
# ============================================================

def _project_frame():

    projects = Project.query.all()

    risk_df = _risk_predictions()

    risk_lookup = {}

    if not risk_df.empty:

        for _, risk_row in risk_df.iterrows():

            code = _normalise_code(
                risk_row.get(
                    "project_code"
                )
            )

            if code:

                risk_lookup[code] = (
                    risk_row.to_dict()
                )

    rows = []

    for project in projects:

        code = _normalise_code(
            project.project_code
        )

        risk = risk_lookup.get(
            code,
            {},
        )

        rows.append(
            {
                "project_code":
                    code,

                "project_name":
                    project.project_name,

                "sector":
                    project.sector,

                "ministry":
                    project.ministry,

                "flash_state":
                    project.flash_state,

                "implementing_agency":
                    project.flash_implementing_agency,

                "schedule_status":
                    project.schedule_status,

                "cost_status":
                    project.cost_status,

                "original_cost_cr":
                    project.original_cost_cr,

                "revised_cost_cr":
                    project.revised_cost_cr,

                "expenditure_cr":
                    project.expenditure_cr,

                "original_end_date":
                    project.original_end_date,

                "revised_end_date":
                    project.revised_end_date,

                "delay_days":
                    project.delay_days,

                "delay_months":
                    project.delay_months,

                "cost_overrun_pct":
                    project.cost_overrun_pct,

                "expenditure_pct":
                    project.expenditure_pct,

                "schedule_change_days":
                    project.schedule_change_days,

                "flash_latest_physical_progress":
                    project.flash_latest_physical_progress,

                "flash_max_monthly_expenditure_change":
                    project.flash_max_monthly_expenditure_change,

                "flash_progress_stagnation_flag":
                    project.flash_progress_stagnation_flag,

                "data_completeness_score":
                    project.data_completeness_score,

                "data_quality_flag":
                    project.data_quality_flag,

                # ------------------------------------------------
                # ML values from cached report.
                # ------------------------------------------------

                "predicted_cost_overrun_pct":
                    risk.get(
                        "predicted_cost_overrun_pct"
                    ),

                "future_delay_probability":
                    risk.get(
                        "future_delay_probability"
                    ),

                "future_progress_stall_probability":
                    risk.get(
                        "future_progress_stall_probability"
                    ),

                "cost_risk_score":
                    risk.get(
                        "cost_risk_score"
                    ),

                "overall_risk_score":
                    risk.get(
                        "overall_risk_score"
                    ),

                "risk_level":
                    risk.get(
                        "risk_level"
                    ),

                "early_warning_active":
                    risk.get(
                        "early_warning_active"
                    ),

                "early_warning_priority":
                    risk.get(
                        "early_warning_priority"
                    ),

                "early_warning_reasons":
                    risk.get(
                        "early_warning_reasons",
                        [],
                    ),
            }
        )

    return pd.DataFrame(rows)


# ============================================================
# FILTER HELPERS
# ============================================================

def _apply_multi_filter(
    df,
    query_args,
    column,
    argument,
):

    values = query_args.getlist(
        argument
    )

    if not values:
        return df

    values = {
        str(value)
        .strip()
        .lower()
        for value in values
        if str(value).strip()
    }

    if not values:
        return df

    return df[
        df[column]
        .fillna("")
        .astype(str)
        .str.strip()
        .str.lower()
        .isin(values)
    ]


def _filtered_projects(query_args):

    df = _project_frame()

    df = _apply_multi_filter(
        df,
        query_args,
        "sector",
        "sector",
    )

    df = _apply_multi_filter(
        df,
        query_args,
        "ministry",
        "ministry",
    )

    df = _apply_multi_filter(
        df,
        query_args,
        "flash_state",
        "state",
    )

    df = _apply_multi_filter(
        df,
        query_args,
        "risk_level",
        "risk",
    )

    df = _apply_multi_filter(
        df,
        query_args,
        "schedule_status",
        "status",
    )

    return df


# ============================================================
# PROJECT ANALYTICS FILTER OPTIONS
# ============================================================

@analytics_bp.get(
    "/analytics/project-filters"
)
def project_filter_options():

    df = _project_frame()

    risk_levels = [
        level
        for level in [
            "LOW",
            "MEDIUM",
            "HIGH",
            "CRITICAL",
        ]
        if (
            not df.empty
            and level
            in set(
                df["risk_level"]
                .dropna()
                .astype(str)
                .str.upper()
            )
        )
    ]

    return jsonify(
        {
            "sectors":
                sorted(
                    df["sector"]
                    .dropna()
                    .astype(str)
                    .unique()
                    .tolist()
                ),

            "ministries":
                sorted(
                    df["ministry"]
                    .dropna()
                    .astype(str)
                    .unique()
                    .tolist()
                ),

            "states":
                sorted(
                    df["flash_state"]
                    .dropna()
                    .astype(str)
                    .unique()
                    .tolist()
                ),

            "risk_levels":
                risk_levels,

            "schedule_statuses":
                sorted(
                    df["schedule_status"]
                    .dropna()
                    .astype(str)
                    .unique()
                    .tolist()
                ),
        }
    )


# ============================================================
# PROJECT ANALYTICS PROJECT LIST
# ============================================================

@analytics_bp.get(
    "/analytics/projects"
)
def project_analytics_projects():

    df = _filtered_projects(
        request.args
    )

    if df.empty:

        return jsonify(
            {
                "count": 0,
                "projects": [],
            }
        )

    df = (
        df
        .drop_duplicates(
            subset=["project_code"]
        )
        .sort_values(
            [
                "project_name",
                "project_code",
            ],
            na_position="last",
        )
    )

    projects = []

    for _, row in df.iterrows():

        projects.append(
            {
                "project_code":
                    _safe(
                        row.get(
                            "project_code"
                        )
                    ),

                "project_name":
                    _safe(
                        row.get(
                            "project_name"
                        )
                    ),

                "risk_level":
                    _safe(
                        row.get(
                            "risk_level"
                        )
                    ),

                "overall_risk_score":
                    _safe(
                        row.get(
                            "overall_risk_score"
                        )
                    ),

                "sector":
                    _safe(
                        row.get(
                            "sector"
                        )
                    ),

                "ministry":
                    _safe(
                        row.get(
                            "ministry"
                        )
                    ),

                "state":
                    _safe(
                        row.get(
                            "flash_state"
                        )
                    ),

                "schedule_status":
                    _safe(
                        row.get(
                            "schedule_status"
                        )
                    ),
            }
        )

    return jsonify(
        {
            "count":
                len(projects),

            "projects":
                projects,
        }
    )


# ============================================================
# DELAY REASONS + SOLUTIONS
# ============================================================

SOLUTIONS = {

    "Schedule slippage":
        (
            "Review the critical path, milestone dependencies "
            "and revised completion plan; increase schedule "
            "reviews for delayed work packages."
        ),

    "Completion-date revision":
        (
            "Validate the revised completion date against "
            "remaining scope, contractor capacity and "
            "procurement/site constraints."
        ),

    "Cost escalation":
        (
            "Reconcile the latest expenditure with "
            "approved/revised cost and investigate major "
            "cost drivers before further commitments."
        ),

    "Revised project cost":
        (
            "Review the justification for cost revisions "
            "and lock a monitored cost baseline with "
            "approval checkpoints."
        ),

    "Low physical progress":
        (
            "Identify the lowest-progress work packages, "
            "remove execution bottlenecks and track "
            "weekly physical milestones."
        ),

    "Progress stagnation":
        (
            "Escalate stalled activities and verify "
            "contractor, resource, land/site-readiness "
            "and dependency constraints from project records."
        ),

    "Expenditure movement":
        (
            "Compare expenditure growth with physical "
            "progress; investigate spending that is not "
            "translating into proportional progress."
        ),

    "No dominant recorded trigger":
        (
            "Continue structured monitoring and validate "
            "qualitative causes from departmental/project "
            "records because the dataset alone cannot "
            "establish causation."
        ),
}


def _reasons(row):

    reasons = []

    delay = float(
        row.get(
            "delay_days",
            0,
        )
        or 0
    )

    schedule_change = float(
        row.get(
            "schedule_change_days",
            0,
        )
        or 0
    )

    cost = row.get(
        "cost_overrun_pct"
    )

    revised_cost = float(
        row.get(
            "revised_cost_cr",
            0,
        )
        or 0
    )

    original_cost = float(
        row.get(
            "original_cost_cr",
            0,
        )
        or 0
    )

    progress = row.get(
        "flash_latest_physical_progress"
    )

    stagnation = row.get(
        "flash_progress_stagnation_flag",
        0,
    )

    expenditure_change = row.get(
        "flash_max_monthly_expenditure_change"
    )

    if delay > 0:

        reasons.append(
            (
                "Schedule slippage",
                (
                    f"The project has "
                    f"{delay:,.0f} recorded delay days."
                ),
            )
        )

    if schedule_change > 0:

        reasons.append(
            (
                "Completion-date revision",
                (
                    f"Schedule has changed by about "
                    f"{schedule_change:,.0f} days "
                    f"from the baseline."
                ),
            )
        )

    try:

        if (
            cost is not None
            and pd.notna(cost)
            and float(cost) > 0
        ):

            reasons.append(
                (
                    "Cost escalation",
                    (
                        f"Recorded cost overrun is "
                        f"{float(cost):.1f}%."
                    ),
                )
            )

    except (TypeError, ValueError):
        pass

    if (
        original_cost > 0
        and revised_cost > original_cost
    ):

        reasons.append(
            (
                "Revised project cost",
                (
                    "Revised cost is higher than "
                    "the original approved cost."
                ),
            )
        )

    try:

        if (
            progress is not None
            and pd.notna(progress)
            and float(progress) < 60
        ):

            reasons.append(
                (
                    "Low physical progress",
                    (
                        "Latest available physical "
                        f"progress is only "
                        f"{float(progress):.1f}%."
                    ),
                )
            )

    except (TypeError, ValueError):
        pass

    try:

        if int(stagnation or 0) == 1:

            reasons.append(
                (
                    "Progress stagnation",
                    (
                        "The data contains a "
                        "progress-stagnation signal "
                        "in the FLASH history."
                    ),
                )
            )

    except (TypeError, ValueError):
        pass

    try:

        if (
            expenditure_change is not None
            and pd.notna(expenditure_change)
            and float(expenditure_change) > 0
        ):

            reasons.append(
                (
                    "Expenditure movement",
                    (
                        "Maximum observed monthly FLASH "
                        "expenditure change is "
                        f"₹{float(expenditure_change):,.2f} Cr."
                    ),
                )
            )

    except (TypeError, ValueError):
        pass

    if not reasons:

        reasons.append(
            (
                "No dominant recorded trigger",
                (
                    "The supplied records do not show "
                    "a strong rule-based delay trigger."
                ),
            )
        )

    return reasons


# ============================================================
# HISTORY
# ============================================================

def _history(project_code):

    code = _normalise_code(
        project_code
    )

    # ========================================================
    # PAIMANA MONTHLY HISTORY
    # ========================================================

    schedule = []

    try:

        history = _load_csv(
            "02_PAIMANA_MONTHLY_HISTORY_CLEAN.csv",
            "02_PAIMANA_MONTHLY_HISTORY.csv",
        )

        if "project_code" in history.columns:

            history["project_code"] = (
                history["project_code"]
                .map(_normalise_code)
            )

            history = history[
                history["project_code"] == code
            ].copy()

        if not history.empty:

            if "snapshot_month" in history.columns:

                history["snapshot_month"] = pd.to_datetime(
                    history["snapshot_month"],
                    errors="coerce",
                )

                history = history.sort_values(
                    "snapshot_month"
                )

            for _, item in history.iterrows():

                schedule.append(
                    {
                        "date":
                            _safe(
                                item.get(
                                    "snapshot_month"
                                )
                            ),

                        "delay_days":
                            _safe(
                                item.get(
                                    "delay_days"
                                )
                            ),

                        "schedule_change_days":
                            _safe(
                                item.get(
                                    "schedule_change_days"
                                )
                            ),

                        "expenditure_cr":
                            _safe(
                                item.get(
                                    "expenditure_cr"
                                )
                            ),

                        "revised_cost_cr":
                            _safe(
                                item.get(
                                    "revised_cost_cr"
                                )
                            ),
                    }
                )

    except FileNotFoundError:

        schedule = []

    # ========================================================
    # PHYSICAL PROGRESS HISTORY
    # ========================================================

    progress = []

    try:

        ml_history = _load_csv(
            "PAIMANA_ML_READY_WITH_PROJECT_CODE.csv",
            "09_RISK_MODEL_TRAINING_DATA.csv",
        )

        if "project_code" in ml_history.columns:

            ml_history["project_code"] = (
                ml_history["project_code"]
                .map(_normalise_code)
            )

            ml_history = ml_history[
                ml_history["project_code"] == code
            ].copy()

        if not ml_history.empty:

            if {
                "snapshot_year",
                "snapshot_month_num",
            }.issubset(
                ml_history.columns
            ):

                ml_history["date"] = pd.to_datetime(
                    ml_history[
                        "snapshot_year"
                    ].astype(int).astype(str)
                    + "-"
                    + ml_history[
                        "snapshot_month_num"
                    ].astype(int).astype(str).str.zfill(2)
                    + "-01",
                    errors="coerce",
                )

                ml_history = ml_history.sort_values(
                    "date"
                )

                for _, item in ml_history.iterrows():

                    progress.append(
                        {
                            "date":
                                _safe(
                                    item.get(
                                        "date"
                                    )
                                ),

                            "physical_progress_pct":
                                _safe(
                                    item.get(
                                        "physical_progress_pct"
                                    )
                                ),
                        }
                    )

    except FileNotFoundError:

        progress = []

    return {
        "schedule": schedule,
        "progress": progress,
    }


# ============================================================
# PROJECT DETAIL
# ============================================================

@analytics_bp.get(
    "/analytics/project/<project_code>"
)
def project_analytics_detail(
    project_code
):

    code = _normalise_code(
        project_code
    )

    # ========================================================
    # IMPORTANT:
    # DO NOT call _project_frame() here.
    #
    # That would build the entire portfolio and potentially
    # trigger expensive ML processing.
    # ========================================================

    project = None

    # First try direct database lookup.
    try:

        project = (
            Project.query
            .filter(
                Project.project_code == code
            )
            .first()
        )

    except Exception:

        project = None

    # Fallback for numeric/string project-code mismatch.
    if project is None:

        for item in Project.query.all():

            if (
                _normalise_code(
                    item.project_code
                )
                == code
            ):

                project = item
                break

    if project is None:

        return jsonify(
            {
                "error":
                    "Project not found"
            }
        ), 404

    # ========================================================
    # AUTHORITATIVE ML SCORE FOR SELECTED PROJECT
    # ========================================================

    ml_result = _risk_for_project(
        code
    )

    delay_probability = ml_result.get(
        "future_delay_probability"
    )

    stall_probability = ml_result.get(
        "future_progress_stall_probability"
    )

    # ========================================================
    # RISK
    # ========================================================

    risk = {

        "overall":
            _safe(
                ml_result.get(
                    "overall_risk_score"
                )
            ),

        "level":
            _safe(
                ml_result.get(
                    "risk_level"
                )
            ),

        "cost":
            _safe(
                ml_result.get(
                    "cost_risk_score"
                )
            ),

        "delay":
            _safe(
                float(delay_probability) * 100
                if delay_probability is not None
                and pd.notna(delay_probability)
                else None
            ),

        "stall":
            _safe(
                float(stall_probability) * 100
                if stall_probability is not None
                and pd.notna(stall_probability)
                else None
            ),

        "predicted_cost_overrun_pct":
            _safe(
                ml_result.get(
                    "predicted_cost_overrun_pct"
                )
            ),

        "alert_priority":
            _safe(
                ml_result.get(
                    "early_warning_priority"
                )
            ),

        "early_warning_active":
            _safe(
                ml_result.get(
                    "early_warning_active"
                )
            ),
    }

    # ========================================================
    # PROJECT FACTS
    # ========================================================

    row = {

        "project_code":
            project.project_code,

        "project_name":
            project.project_name,

        "ministry":
            project.ministry,

        "sector":
            project.sector,

        "flash_state":
            project.flash_state,

        "flash_implementing_agency":
            project.flash_implementing_agency,

        "schedule_status":
            project.schedule_status,

        "cost_status":
            project.cost_status,

        "original_cost_cr":
            project.original_cost_cr,

        "revised_cost_cr":
            project.revised_cost_cr,

        "expenditure_cr":
            project.expenditure_cr,

        "delay_days":
            project.delay_days,

        "delay_months":
            project.delay_months,

        "cost_overrun_pct":
            project.cost_overrun_pct,

        "expenditure_pct":
            project.expenditure_pct,

        "flash_latest_physical_progress":
            project.flash_latest_physical_progress,

        "original_end_date":
            project.original_end_date,

        "revised_end_date":
            project.revised_end_date,

        "schedule_change_days":
            project.schedule_change_days,

        "data_completeness_score":
            project.data_completeness_score,

        "data_quality_flag":
            project.data_quality_flag,

        "flash_progress_stagnation_flag":
            project.flash_progress_stagnation_flag,

        "flash_max_monthly_expenditure_change":
            project.flash_max_monthly_expenditure_change,
    }

    # ========================================================
    # REASONS
    # ========================================================

    reason_rows = []

    for title, explanation in _reasons(row):

        reason_rows.append(
            {
                "title":
                    title,

                "explanation":
                    explanation,

                "solution":
                    SOLUTIONS.get(
                        title,
                        SOLUTIONS[
                            "No dominant recorded trigger"
                        ],
                    ),
            }
        )

    # ========================================================
    # FINAL RESPONSE
    # ========================================================

    return jsonify(
        {
            "project":
                {
                    key: _safe(value)
                    for key, value in row.items()
                },

            "risk":
                risk,

            "reasons":
                reason_rows,

            "history":
                _history(code),
        }
    )


# ============================================================
# WHAT-IF SIMULATOR
# ============================================================

@analytics_bp.post(
    "/analytics/project/<project_code>/simulate"
)
def project_analytics_simulate(
    project_code
):

    payload = (
        request.get_json(
            silent=True
        )
        or {}
    )

    try:

        progress_delta = float(
            payload.get(
                "progress_delta",
                0,
            )
        )

        delay_delta = float(
            payload.get(
                "delay_delta",
                0,
            )
        )

        expenditure_delta = float(
            payload.get(
                "expenditure_delta",
                0,
            )
        )

        revised_cost_delta = float(
            payload.get(
                "revised_cost_delta",
                0,
            )
        )

    except (
        TypeError,
        ValueError,
    ):

        return jsonify(
            {
                "error":
                    "Simulation values must be numeric."
            }
        ), 400

    try:

        result = simulate(

            _normalise_code(
                project_code
            ),

            progress_delta,

            delay_delta,

            expenditure_delta,

            revised_cost_delta,
        )

        return jsonify(
            result
        )

    except ValueError as exc:

        return jsonify(
            {
                "error":
                    str(exc)
            }
        ), 404

    except Exception as exc:

        return jsonify(
            {
                "error":
                    f"Simulation failed: {exc}"
            }
        ), 500