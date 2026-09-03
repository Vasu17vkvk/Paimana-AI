from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional

import joblib
import numpy as np
import pandas as pd

from sqlalchemy import text

from app.extensions import db

# ============================================================
# PATHS
# ============================================================

APP_ROOT = Path(__file__).resolve().parents[2]

DATA_DIR = APP_ROOT / "data"
MODELS_DIR = APP_ROOT / "models"


MASTER_FILE = DATA_DIR / "01_PROJECT_MASTER_CLEANED.csv"
HISTORY_FILE = DATA_DIR / "02_PAIMANA_MONTHLY_HISTORY_CLEAN.csv"
FLASH_FILE = DATA_DIR / "03_FLASH_MODERN_HISTORY_CLEAN.csv"
ML_READY_FILE = DATA_DIR / "PAIMANA_ML_READY_WITH_PROJECT_CODE.csv"
STATE_SUMMARY_PATH = DATA_DIR / "08_RAJYA_SABHA_STATE_SUMMARY_CLEANED.csv"

FEATURE_CONTRACT_FILE = MODELS_DIR / "feature_contract.json"

FUTURE_DELAY_MODEL_FILE = MODELS_DIR / "future_delay_model.joblib"
FUTURE_DELAY_CALIBRATOR_FILE = MODELS_DIR / "future_delay_calibrator.joblib"

FUTURE_STALL_MODEL_FILE = (
    MODELS_DIR / "future_progress_stall_model.joblib"
)
FUTURE_STALL_CALIBRATOR_FILE = (
    MODELS_DIR / "future_progress_stall_calibrator.joblib"
)

COST_MODEL_FILE = MODELS_DIR / "cost_overrun_model.joblib"


# ============================================================
# CACHE
# ============================================================

_master_cache: Optional[pd.DataFrame] = None
_history_cache: Optional[pd.DataFrame] = None
_flash_cache: Optional[pd.DataFrame] = None
_ml_ready_cache: Optional[pd.DataFrame] = None

_models_cache: Optional[dict[str, Any]] = None


# ============================================================
# HELPERS
# ============================================================

def _to_project_code(value: Any) -> str:
    """
    Normalize project codes so values coming from CSV/API
    are compared consistently.
    """
    if value is None:
        return ""

    if isinstance(value, float) and value.is_integer():
        return str(int(value))

    return str(value).strip()


def _safe_float(value: Any, default: float = 0.0) -> float:
    """
    Safely convert a value to float.
    """
    try:
        if pd.isna(value):
            return default

        return float(value)

    except (TypeError, ValueError):
        return default


def _safe_int(value: Any, default: int = 0) -> int:
    """
    Safely convert a value to integer.
    """
    try:
        if pd.isna(value):
            return default

        return int(float(value))

    except (TypeError, ValueError):
        return default


def _clean_value(value: Any) -> Any:
    """
    Convert pandas/numpy values into JSON-safe Python values.
    """
    if value is None:
        return None

    if isinstance(value, pd.Timestamp):
        if pd.isna(value):
            return None

        return value.strftime("%Y-%m-%d")

    if isinstance(value, np.generic):
        value = value.item()

    if isinstance(value, float):
        if np.isnan(value) or np.isinf(value):
            return None

    if pd.isna(value):
        return None

    return value


def _records(df: pd.DataFrame) -> list[dict[str, Any]]:
    """
    Convert dataframe to JSON-safe records.
    """
    if df is None or df.empty:
        return []

    result = []

    for record in df.to_dict(orient="records"):
        result.append(
            {
                str(key): _clean_value(value)
                for key, value in record.items()
            }
        )

    return result


# ============================================================
# DATA LOADING
# ============================================================

# ============================================================
# DATA LOADING
# ============================================================

def _load_postgres_table(
    table_name: str,
) -> pd.DataFrame:
    """
    Load a complete Project Analytics table from PostgreSQL.
    """

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

    df = df.loc[
        :,
        ~df.columns.duplicated(),
    ].copy()

    return df


def _normalize_project_code_column(
    df: pd.DataFrame,
) -> pd.DataFrame:
    """
    Normalize project_code values for consistent API matching.
    """

    if "project_code" in df.columns:
        df["project_code"] = (
            df["project_code"]
            .apply(_to_project_code)
        )

    return df


def load_master() -> pd.DataFrame:
    global _master_cache

    if _master_cache is not None:
        return _master_cache.copy()

    df = _load_postgres_table(
        "project_master"
    )

    date_columns = [
        "original_end_date",
        "revised_end_date",
        "first_snapshot",
        "last_snapshot",
        "flash_first_seen",
        "flash_last_seen",
    ]

    for column in date_columns:
        if column in df.columns:
            df[column] = pd.to_datetime(
                df[column],
                errors="coerce",
            )

    df = _normalize_project_code_column(
        df
    )

    _master_cache = df.copy()

    return df


def load_history() -> pd.DataFrame:
    global _history_cache

    if _history_cache is not None:
        return _history_cache.copy()

    df = _load_postgres_table(
        "paimana_monthly_history"
    )

    if "snapshot_month" in df.columns:
        df["snapshot_month"] = pd.to_datetime(
            df["snapshot_month"],
            errors="coerce",
        )

    df = _normalize_project_code_column(
        df
    )

    _history_cache = df.copy()

    return df


def load_flash() -> pd.DataFrame:
    global _flash_cache

    if _flash_cache is not None:
        return _flash_cache.copy()

    df = _load_postgres_table(
        "flash_modern_history"
    )

    if "snapshot_month" in df.columns:
        df["snapshot_month"] = pd.to_datetime(
            df["snapshot_month"],
            errors="coerce",
        )

    df = _normalize_project_code_column(
        df
    )

    _flash_cache = df.copy()

    return df


def load_ml_ready() -> pd.DataFrame:
    global _ml_ready_cache

    if _ml_ready_cache is not None:
        return _ml_ready_cache.copy()

    df = _load_postgres_table(
        "paimana_ml_ready"
    )

    df = _normalize_project_code_column(
        df
    )

    _ml_ready_cache = df.copy()

    return df

# ============================================================
# MODEL LOADING
# ============================================================

def load_models() -> dict[str, Any]:
    global _models_cache

    if _models_cache is not None:
        return _models_cache

    required_files = [
        FEATURE_CONTRACT_FILE,
        FUTURE_DELAY_MODEL_FILE,
        FUTURE_DELAY_CALIBRATOR_FILE,
        FUTURE_STALL_MODEL_FILE,
        FUTURE_STALL_CALIBRATOR_FILE,
        COST_MODEL_FILE,
    ]

    missing = [
        str(path)
        for path in required_files
        if not path.exists()
    ]

    if missing:
        raise FileNotFoundError(
            "Required Project Analytics model files are missing: "
            + ", ".join(missing)
        )

    contract = json.loads(
        FEATURE_CONTRACT_FILE.read_text(
            encoding="utf-8"
        )
    )

    _models_cache = {
        "contract": contract,
        "delay_model": joblib.load(
            FUTURE_DELAY_MODEL_FILE
        ),
        "delay_calibrator": joblib.load(
            FUTURE_DELAY_CALIBRATOR_FILE
        ),
        "stall_model": joblib.load(
            FUTURE_STALL_MODEL_FILE
        ),
        "stall_calibrator": joblib.load(
            FUTURE_STALL_CALIBRATOR_FILE
        ),
        "cost_model": joblib.load(
            COST_MODEL_FILE
        ),
    }

    return _models_cache


# ============================================================
# LATEST ROW HELPERS
# ============================================================

def latest_ml_row(
    project_code: str,
) -> Optional[pd.Series]:
    """
    Return the latest ML-ready snapshot for a project.
    """
    df = load_ml_ready()

    code = _to_project_code(project_code)

    rows = df[
        df["project_code"] == code
    ].copy()

    if rows.empty:
        return None

    sort_columns = [
        column
        for column in [
            "snapshot_year",
            "snapshot_month_num",
        ]
        if column in rows.columns
    ]

    if sort_columns:
        rows = rows.sort_values(
            sort_columns
        )

    return rows.iloc[-1]


def project_history(
    project_code: str,
) -> pd.DataFrame:
    """
    Return monthly PAIMANA history for one project.
    """
    df = load_history()

    code = _to_project_code(project_code)

    rows = df[
        df["project_code"] == code
    ].copy()

    if "snapshot_month" in rows.columns:
        rows = rows.sort_values(
            "snapshot_month"
        )

    return rows


def project_flash_history(
    project_code: str,
) -> pd.DataFrame:
    """
    Return FLASH history for one project.
    """
    df = load_flash()

    code = _to_project_code(project_code)

    rows = df[
        df["project_code"] == code
    ].copy()

    if "snapshot_month" in rows.columns:
        rows = rows.sort_values(
            "snapshot_month"
        )

    return rows


# ============================================================
# RISK MODEL
# ============================================================

def model_score_from_features(
    row: pd.Series,
) -> dict[str, Any]:
    """
    Run the supplied trained models using the exact supplied
    ML feature contract.

    No model is trained here.
    """

    models = load_models()

    contract = models["contract"]

    features = contract["features"]
    cost_features = contract["cost_features"]

    values: dict[str, float] = {}

    for column in features:
        value = row.get(
            column,
            0.0,
        )

        values[column] = _safe_float(
            value,
            0.0,
        )

    X = pd.DataFrame(
        [values],
        columns=features,
    )

    X_cost = X[
        cost_features
    ].copy()

    # --------------------------------------------------------
    # Future delay
    # --------------------------------------------------------

    raw_delay = (
        models["delay_model"]
        .predict_proba(
            X[features]
        )[:, 1]
        .reshape(-1, 1)
    )

    delay_probability = float(
        models["delay_calibrator"]
        .predict_proba(
            raw_delay
        )[0, 1]
    )

    # --------------------------------------------------------
    # Progress stall
    # --------------------------------------------------------

    raw_stall = (
        models["stall_model"]
        .predict_proba(
            X[features]
        )[:, 1]
        .reshape(-1, 1)
    )

    stall_probability = float(
        models["stall_calibrator"]
        .predict_proba(
            raw_stall
        )[0, 1]
    )

    # --------------------------------------------------------
    # Cost overrun
    # --------------------------------------------------------

    predicted_cost = max(
        0.0,
        float(
            models["cost_model"].predict(
                X_cost[cost_features]
            )[0]
        ),
    )

    # --------------------------------------------------------
    # Cost risk
    # --------------------------------------------------------

    reference = _safe_float(
        contract.get(
            "cost_risk_reference_percentile",
            1.0,
        ),
        1.0,
    )

    if reference <= 0:
        reference = 1.0

    cost_risk = float(
        np.clip(
            predicted_cost
            / reference
            * 100,
            0,
            100,
        )
    )

    # --------------------------------------------------------
    # Overall risk
    # --------------------------------------------------------

    score = float(
        np.clip(
            0.30 * cost_risk
            + 0.35 * delay_probability * 100
            + 0.35 * stall_probability * 100,
            0,
            100,
        )
    )

    if score >= 85:
        risk_level = "CRITICAL"
    elif score >= 70:
        risk_level = "HIGH"
    elif score >= 40:
        risk_level = "MEDIUM"
    else:
        risk_level = "LOW"

    return {
        "delay_probability": delay_probability,
        "stall_probability": stall_probability,
        "predicted_cost_overrun": predicted_cost,
        "cost_risk": cost_risk,
        "overall_risk": score,
        "risk_level": risk_level,
    }


# ============================================================
# PROJECT FILTERING
# ============================================================

def get_filter_options() -> dict[str, list[str]]:
    """
    Return all available dropdown options from the actual data.
    """

    portfolio = load_master()

    sectors = sorted(
        portfolio["sector"]
        .dropna()
        .astype(str)
        .str.strip()
        .replace("", np.nan)
        .dropna()
        .unique()
        .tolist()
    )

    ministries = sorted(
        portfolio["ministry"]
        .dropna()
        .astype(str)
        .str.strip()
        .replace("", np.nan)
        .dropna()
        .unique()
        .tolist()
    )

    states = []

    if "flash_state" in portfolio.columns:
        states = sorted(
            portfolio["flash_state"]
            .dropna()
            .astype(str)
            .str.strip()
            .replace("", np.nan)
            .dropna()
            .unique()
            .tolist()
        )

    statuses = sorted(
        portfolio["schedule_status"]
        .dropna()
        .astype(str)
        .str.strip()
        .replace("", np.nan)
        .dropna()
        .unique()
        .tolist()
    )

    risk_levels = [
        "LOW",
        "MEDIUM",
        "HIGH",
        "CRITICAL",
    ]

    return {
        "sectors": sectors,
        "ministries": ministries,
        "states": states,
        "risk_levels": risk_levels,
        "schedule_statuses": statuses,
    }


def filter_projects(
    *,
    sector: Optional[str] = None,
    ministry: Optional[str] = None,
    state: Optional[str] = None,
    risk_level: Optional[str] = None,
    schedule_status: Optional[str] = None,
    search: Optional[str] = None,
) -> pd.DataFrame:
    """
    Filter the project portfolio.
    """

    portfolio = load_master().copy()

    # --------------------------------------------------------
    # Sector
    # --------------------------------------------------------

    if sector and sector != "All Sectors":
        portfolio = portfolio[
            portfolio["sector"]
            .astype(str)
            .eq(str(sector))
        ]

    # --------------------------------------------------------
    # Ministry
    # --------------------------------------------------------

    if ministry and ministry != "All Ministries":
        portfolio = portfolio[
            portfolio["ministry"]
            .astype(str)
            .eq(str(ministry))
        ]

    # --------------------------------------------------------
    # State
    # --------------------------------------------------------

    if state and state != "All States":
        if "flash_state" in portfolio.columns:
            portfolio = portfolio[
                portfolio["flash_state"]
                .astype(str)
                .eq(str(state))
            ]

    # --------------------------------------------------------
    # Risk level
    #
    # First use an existing overall risk level if available.
    # If it isn't available in master data, calculate it from
    # the latest ML-ready snapshot for matching projects.
    # --------------------------------------------------------

    if risk_level and risk_level != "All Risk Levels":

        risk_level_upper = str(
            risk_level
        ).upper()

        if "risk_level" in portfolio.columns:
            portfolio = portfolio[
                portfolio["risk_level"]
                .astype(str)
                .str.upper()
                .eq(risk_level_upper)
            ]

        else:
            portfolio = _attach_risk_scores(
                portfolio
            )

            portfolio = portfolio[
                portfolio["risk_level"]
                .astype(str)
                .str.upper()
                .eq(risk_level_upper)
            ]

    # --------------------------------------------------------
    # Schedule status
    # --------------------------------------------------------

    if (
        schedule_status
        and schedule_status != "All Schedule Statuses"
    ):
        portfolio = portfolio[
            portfolio["schedule_status"]
            .astype(str)
            .eq(str(schedule_status))
        ]

    # --------------------------------------------------------
    # Search
    # --------------------------------------------------------

    if search:
        search_value = str(
            search
        ).strip().lower()

        if search_value:

            code_match = (
                portfolio["project_code"]
                .astype(str)
                .str.lower()
                .str.contains(
                    search_value,
                    na=False,
                    regex=False,
                )
            )

            name_match = (
                portfolio["project_name"]
                .astype(str)
                .str.lower()
                .str.contains(
                    search_value,
                    na=False,
                    regex=False,
                )
            )

            portfolio = portfolio[
                code_match | name_match
            ]

    return portfolio


# ============================================================
# RISK ATTACHMENT
# ============================================================

# ============================================================
# RISK ATTACHMENT
# ============================================================

def _attach_risk_scores(
    portfolio: pd.DataFrame,
) -> pd.DataFrame:
    """
    Calculate current model-based risk for projects when the
    master dataset does not already contain risk outputs.

    This is mainly used for project filtering.
    """

    result = portfolio.copy()

    result["predicted_cost_overrun_pct"] = np.nan
    result["future_delay_probability"] = np.nan
    result["future_progress_stall_probability"] = np.nan
    result["cost_risk_score"] = np.nan
    result["overall_risk_score"] = np.nan
    result["risk_level"] = None

    ml = load_ml_ready()

    if ml.empty:
        return result

    latest_rows = (
        ml.sort_values(
            [
                column
                for column in [
                    "snapshot_year",
                    "snapshot_month_num",
                ]
                if column in ml.columns
            ]
        )
        .drop_duplicates(
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
        .astype(str)
        .isin(selected_codes)
    ]

    for _, ml_row in latest_rows.iterrows():

        code = _to_project_code(
            ml_row["project_code"]
        )

        try:
            score = model_score_from_features(
                ml_row
            )
        except Exception:
            continue

        mask = (
            result["project_code"]
            .astype(str)
            .eq(code)
        )

        result.loc[
            mask,
            "predicted_cost_overrun_pct"
        ] = score[
            "predicted_cost_overrun"
        ]

        result.loc[
            mask,
            "future_delay_probability"
        ] = score[
            "delay_probability"
        ]

        result.loc[
            mask,
            "future_progress_stall_probability"
        ] = score[
            "stall_probability"
        ]

        result.loc[
            mask,
            "cost_risk_score"
        ] = score[
            "cost_risk"
        ]

        result.loc[
            mask,
            "overall_risk_score"
        ] = score[
            "overall_risk"
        ]

        result.loc[
            mask,
            "risk_level"
        ] = score[
            "risk_level"
        ]

    return result


# ============================================================
# PROJECT LIST
# ============================================================

def get_matching_projects(
    *,
    sector: Optional[str] = None,
    ministry: Optional[str] = None,
    state: Optional[str] = None,
    risk_level: Optional[str] = None,
    schedule_status: Optional[str] = None,
    search: Optional[str] = None,
) -> dict[str, Any]:

    portfolio = filter_projects(
        sector=sector,
        ministry=ministry,
        state=state,
        risk_level=risk_level,
        schedule_status=schedule_status,
        search=search,
    )

    if (
        "overall_risk_score" not in portfolio.columns
        or "risk_level" not in portfolio.columns
    ):
        portfolio = _attach_risk_scores(
            portfolio
        )

    columns = [
        "project_code",
        "project_name",
        "risk_level",
        "overall_risk_score",
        "sector",
        "ministry",
        "flash_state",
        "schedule_status",
    ]

    available_columns = [
        column
        for column in columns
        if column in portfolio.columns
    ]

    projects = (
        portfolio[
            available_columns
        ]
        .drop_duplicates(
            "project_code"
        )
        .copy()
    )

    if "project_name" in projects.columns:
        projects = projects.sort_values(
            [
                "project_name",
                "project_code",
            ],
            na_position="last",
        )

    return {
        "count": int(
            len(projects)
        ),
        "projects": _records(
            projects
        ),
    }


# ============================================================
# PROJECT DETAIL
# ============================================================

def get_project_detail(
    project_code: str,
) -> dict[str, Any]:
    """
    Return complete project-level information.
    """

    code = _to_project_code(
        project_code
    )

    master = load_master()

    row_df = master[
        master["project_code"] == code
    ].copy()

    if row_df.empty:
        raise ValueError(
            f"Project {code} was not found."
        )

    row = row_df.iloc[0]

    history = project_history(
        code
    )

    flash = project_flash_history(
        code
    )

    ml_row = latest_ml_row(
        code
    )

    # --------------------------------------------------------
    # Risk
    # --------------------------------------------------------

    risk = None

    if ml_row is not None:
        try:
            risk = model_score_from_features(
                ml_row
            )
        except Exception:
            risk = None

    # If the master row already has risk output, use it
    # when model calculation is unavailable.

    if risk is None:

        overall_risk = row.get(
            "overall_risk_score"
        )

        if pd.notna(
            overall_risk
        ):

            risk = {
                "delay_probability": _safe_float(
                    row.get(
                        "future_delay_probability"
                    )
                ),
                "stall_probability": _safe_float(
                    row.get(
                        "future_progress_stall_probability"
                    )
                ),
                "predicted_cost_overrun": _safe_float(
                    row.get(
                        "predicted_cost_overrun_pct"
                    )
                ),
                "cost_risk": _safe_float(
                    row.get(
                        "cost_risk_score"
                    )
                ),
                "overall_risk": _safe_float(
                    overall_risk
                ),
                "risk_level": str(
                    row.get(
                        "risk_level",
                        "N/A",
                    )
                ),
            }

    # --------------------------------------------------------
    # Project information
    # --------------------------------------------------------

    project_info = {
        "project_code": code,
        "project_name": _clean_value(
            row.get("project_name")
        ),
        "ministry": _clean_value(
            row.get("ministry")
        ),
        "sector": _clean_value(
            row.get("sector")
        ),
        "state": _clean_value(
            row.get("flash_state")
        ),
        "implementing_agency": _clean_value(
            row.get(
                "flash_implementing_agency"
            )
        ),
        "schedule_status": _clean_value(
            row.get(
                "schedule_status"
            )
        ),
        "cost_status": _clean_value(
            row.get(
                "cost_status"
            )
        ),
        "original_completion": _clean_value(
            row.get(
                "original_end_date"
            )
        ),
        "revised_completion": _clean_value(
            row.get(
                "revised_end_date"
            )
        ),
        "data_quality_flag": _clean_value(
            row.get(
                "data_quality_flag"
            )
        ),
        "data_completeness_score": (
            _safe_float(
                row.get(
                    "data_completeness_score"
                )
            )
            if pd.notna(
                row.get(
                    "data_completeness_score"
                )
            )
            else None
        ),
    }

    # --------------------------------------------------------
    # Key facts
    # --------------------------------------------------------

    key_facts = {
        "risk_score": (
            risk["overall_risk"]
            if risk
            else None
        ),
        "risk_level": (
            risk["risk_level"]
            if risk
            else _clean_value(
                row.get(
                    "risk_level"
                )
            )
        ),
        "delay_days": (
            _safe_float(
                row.get(
                    "delay_days"
                )
            )
        ),
        "physical_progress_pct": (
            _safe_float(
                row.get(
                    "flash_latest_physical_progress"
                )
            )
            if pd.notna(
                row.get(
                    "flash_latest_physical_progress"
                )
            )
            else None
        ),
        "original_cost_cr": (
            _safe_float(
                row.get(
                    "original_cost_cr"
                )
            )
        ),
        "expenditure_cr": (
            _safe_float(
                row.get(
                    "expenditure_cr"
                )
            )
        ),
        "alert_priority": _clean_value(
            row.get(
                "alert_priority"
            )
        ),
    }

    # --------------------------------------------------------
    # Risk breakdown
    # --------------------------------------------------------

    risk_breakdown = {
        "cost_risk": (
            risk["cost_risk"]
            if risk
            else None
        ),
        "future_delay": (
            risk["delay_probability"] * 100
            if risk
            else None
        ),
        "progress_stall": (
            risk["stall_probability"] * 100
            if risk
            else None
        ),
        "overall_risk": (
            risk["overall_risk"]
            if risk
            else None
        ),
        "risk_level": (
            risk["risk_level"]
            if risk
            else None
        ),
    }

    # --------------------------------------------------------
    # Delay reasons
    # --------------------------------------------------------

    reasons = delay_reasons(
        row,
        history,
    )

    delay_reasons_response = []

    for title, explanation in reasons:

        delay_reasons_response.append(
            {
                "title": title,
                "explanation": explanation,
                "recommended_solution": solution_for_reason(
                    title
                ),
            }
        )

    # --------------------------------------------------------
    # Monthly history
    # --------------------------------------------------------

    history_records = []

    if not history.empty:

        history_columns = [
            "snapshot_month",
            "expenditure_cr",
            "expenditure_change_cr",
            "expenditure_growth_pct",
            "revised_cost_cr",
            "revised_cost_change_cr",
            "cost_overrun_cr",
            "cost_overrun_pct",
            "schedule_change_days",
            "delay_days",
        ]

        history_columns = [
            column
            for column in history_columns
            if column in history.columns
        ]

        history_records = _records(
            history[
                history_columns
            ]
        )

    # --------------------------------------------------------
    # FLASH history
    # --------------------------------------------------------

    flash_records = []

    if not flash.empty:

        flash_columns = [
            "snapshot_month",
            "implementing_agency",
            "state",
            "original_cost",
            "revised_cost",
            "anticipated_cost",
            "cumulative_expenditure",
            "physical_progress_pct",
            "expenditure_change_cr",
            "physical_progress_change_pct",
            "revised_cost_change_cr",
            "completion_date_change",
        ]

        flash_columns = [
            column
            for column in flash_columns
            if column in flash.columns
        ]

        flash_records = _records(
            flash[
                flash_columns
            ]
        )

    # --------------------------------------------------------
    # Physical progress trajectory
    # --------------------------------------------------------

    progress_records = []

    if ml_row is not None:

        ml_project = load_ml_ready()

        ml_project = ml_project[
            ml_project["project_code"] == code
        ].copy()

        if not ml_project.empty:

            ml_project["snapshot_date"] = pd.to_datetime(
                ml_project[
                    "snapshot_year"
                ].astype(int).astype(str)
                + "-"
                + ml_project[
                    "snapshot_month_num"
                ].astype(int).astype(str).str.zfill(2)
                + "-01",
                errors="coerce",
            )

            progress_columns = [
                "snapshot_date",
                "physical_progress_pct",
                "progress_change_pct",
                "expenditure_cr",
                "revised_cost_cr",
            ]

            progress_columns = [
                column
                for column in progress_columns
                if column in ml_project.columns
            ]

            progress_records = _records(
                ml_project[
                    progress_columns
                ]
                .sort_values(
                    "snapshot_date"
                )
            )

    return {
        "project": project_info,
        "key_facts": key_facts,
        "risk": risk_breakdown,
        "delay_reasons": delay_reasons_response,
        "history": history_records,
        "flash_history": flash_records,
        "progress_trajectory": progress_records,
        "has_ml_snapshot": ml_row is not None,
    }


# ============================================================
# DELAY REASONS
# ============================================================

def delay_reasons(
    row: pd.Series,
    history: pd.DataFrame,
) -> list[tuple[str, str]]:
    """
    Evidence-based delay indicators.

    These are indicators from the supplied project records,
    not causal findings.
    """

    reasons: list[
        tuple[str, str]
    ] = []

    delay = _safe_float(
        row.get(
            "delay_days"
        )
    )

    schedule_change = _safe_float(
        row.get(
            "schedule_change_days"
        )
    )

    cost_pct = _safe_float(
        row.get(
            "cost_overrun_pct"
        )
    )

    revised_cost = _safe_float(
        row.get(
            "revised_cost_cr"
        )
    )

    original_cost = _safe_float(
        row.get(
            "original_cost_cr"
        )
    )

    progress_value = row.get(
        "flash_latest_physical_progress"
    )

    progress_stall = _safe_int(
        row.get(
            "flash_progress_stagnation_flag"
        )
    )

    expenditure_change = row.get(
        "flash_max_monthly_expenditure_change"
    )

    # --------------------------------------------------------
    # Schedule slippage
    # --------------------------------------------------------

    if delay > 0:

        reasons.append(
            (
                "Schedule slippage",
                (
                    f"The project has "
                    f"{delay:,.0f} recorded "
                    f"delay days."
                ),
            )
        )

    # --------------------------------------------------------
    # Completion date revision
    # --------------------------------------------------------

    if schedule_change > 0:

        reasons.append(
            (
                "Completion-date revision",
                (
                    f"Schedule has changed "
                    f"by about "
                    f"{schedule_change:,.0f} "
                    f"days from the baseline."
                ),
            )
        )

    # --------------------------------------------------------
    # Cost escalation
    # --------------------------------------------------------

    if cost_pct > 0:

        reasons.append(
            (
                "Cost escalation",
                (
                    f"Recorded cost overrun "
                    f"is {cost_pct:.1f}%."
                ),
            )
        )

    # --------------------------------------------------------
    # Revised project cost
    # --------------------------------------------------------

    if (
        original_cost > 0
        and revised_cost > 0
        and revised_cost > original_cost
    ):

        reasons.append(
            (
                "Revised project cost",
                (
                    "Revised cost is higher "
                    "than the original "
                    "approved cost."
                ),
            )
        )

    # --------------------------------------------------------
    # Low physical progress
    # --------------------------------------------------------

    if pd.notna(
        progress_value
    ):

        progress = _safe_float(
            progress_value
        )

        if progress < 60:

            reasons.append(
                (
                    "Low physical progress",
                    (
                        f"Latest available "
                        f"physical progress "
                        f"is only "
                        f"{progress:.1f}%."
                    ),
                )
            )

    # --------------------------------------------------------
    # Progress stagnation
    # --------------------------------------------------------

    if progress_stall == 1:

        reasons.append(
            (
                "Progress stagnation",
                (
                    "The data contains a "
                    "progress-stagnation "
                    "signal in the "
                    "FLASH history."
                ),
            )
        )

    # --------------------------------------------------------
    # Expenditure movement
    # --------------------------------------------------------

    if pd.notna(
        expenditure_change
    ):

        expenditure_change_value = _safe_float(
            expenditure_change
        )

        if expenditure_change_value > 0:

            reasons.append(
                (
                    "Expenditure movement",
                    (
                        "Maximum observed "
                        "monthly FLASH "
                        "expenditure change "
                        f"is ₹"
                        f"{expenditure_change_value:,.2f} "
                        "Cr."
                    ),
                )
            )

    # --------------------------------------------------------
    # No dominant trigger
    # --------------------------------------------------------

    if (
        not reasons
        and history is not None
        and not history.empty
    ):

        reasons.append(
            (
                "No dominant recorded trigger",
                (
                    "The supplied records "
                    "do not show a strong "
                    "rule-based delay trigger."
                ),
            )
        )

    return reasons


# ============================================================
# RECOMMENDED SOLUTIONS
# ============================================================

def solution_for_reason(
    title: str,
) -> str:

    mapping = {

        "Schedule slippage":
            (
                "Review the critical path, "
                "milestone dependencies and "
                "revised completion plan; "
                "increase schedule reviews "
                "for delayed work packages."
            ),

        "Completion-date revision":
            (
                "Validate the revised "
                "completion date against "
                "remaining scope, contractor "
                "capacity and procurement/"
                "site constraints."
            ),

        "Cost escalation":
            (
                "Reconcile the latest "
                "expenditure with approved/"
                "revised cost and investigate "
                "major cost drivers before "
                "further commitments."
            ),

        "Revised project cost":
            (
                "Review the justification "
                "for cost revisions and "
                "lock a monitored cost "
                "baseline with approval "
                "checkpoints."
            ),

        "Low physical progress":
            (
                "Identify the lowest-progress "
                "work packages, remove "
                "execution bottlenecks and "
                "track weekly physical "
                "milestones."
            ),

        "Progress stagnation":
            (
                "Escalate stalled activities "
                "and verify contractor, "
                "resource, land/site-readiness "
                "and dependency constraints "
                "from project records."
            ),

        "Expenditure movement":
            (
                "Compare expenditure growth "
                "with physical progress; "
                "investigate spending that "
                "is not translating into "
                "proportional progress."
            ),

        "No dominant recorded trigger":
            (
                "Continue structured "
                "monitoring and validate "
                "qualitative causes from "
                "departmental/project records "
                "because the dataset alone "
                "cannot establish causation."
            ),
    }

    return mapping.get(
        title,
        (
            "Review the underlying "
            "project records and define "
            "a measurable corrective action."
        ),
    )


# ============================================================
# WHAT-IF SCENARIO
# ============================================================

def build_scenario(
    base_row: pd.Series,
    progress_delta: float = 0.0,
    delay_delta: float = 0.0,
    expenditure_delta: float = 0.0,
    revised_cost_delta: float = 0.0,
) -> pd.Series:
    """
    Modify only supported scenario variables while preserving
    the exact ML-ready feature structure.
    """

    scenario = base_row.copy()

    def number(
        name: str,
        default: float = 0.0,
    ) -> float:

        value = scenario.get(
            name,
            default,
        )

        return _safe_float(
            value,
            default,
        )

    # --------------------------------------------------------
    # Physical progress
    # --------------------------------------------------------

    if "physical_progress_pct" in scenario.index:

        scenario[
            "physical_progress_pct"
        ] = np.clip(
            number(
                "physical_progress_pct"
            )
            + float(progress_delta),
            0,
            100,
        )

    # --------------------------------------------------------
    # Schedule
    # --------------------------------------------------------

    if "delay_days" in scenario.index:

        scenario[
            "delay_days"
        ] = max(
            0.0,
            number(
                "delay_days"
            )
            + float(delay_delta),
        )

    if "schedule_change_days" in scenario.index:

        scenario[
            "schedule_change_days"
        ] = (
            number(
                "schedule_change_days"
            )
            + float(delay_delta)
        )

    # --------------------------------------------------------
    # Monthly expenditure shock
    # --------------------------------------------------------

    for column in [
        "expenditure_change_cr_paimana",
        "expenditure_change_cr_flash",
    ]:

        if column in scenario.index:

            scenario[column] = (
                number(column)
                + float(expenditure_delta)
            )

    if "expenditure_cr" in scenario.index:

        scenario[
            "expenditure_cr"
        ] = max(
            0.0,
            number(
                "expenditure_cr"
            )
            + float(expenditure_delta),
        )

    if "cumulative_expenditure" in scenario.index:

        scenario[
            "cumulative_expenditure"
        ] = max(
            0.0,
            number(
                "cumulative_expenditure"
            )
            + float(expenditure_delta),
        )

    # --------------------------------------------------------
    # Revised cost shock
    # --------------------------------------------------------

    for column in [
        "revised_cost_cr",
        "revised_cost",
    ]:

        if column in scenario.index:

            scenario[column] = max(
                0.0,
                number(column)
                + float(revised_cost_delta),
            )

    for column in [
        "revision_cost_change_cr",
        "revised_cost_change_cr",
    ]:

        if column in scenario.index:

            scenario[column] = (
                number(column)
                + float(revised_cost_delta)
            )

    return scenario


def simulate_project(
    project_code: str,
    *,
    progress_delta: float = 0.0,
    delay_delta: float = 0.0,
    expenditure_delta: float = 0.0,
    revised_cost_delta: float = 0.0,
) -> dict[str, Any]:
    """
    Run baseline and scenario predictions for one project.
    """

    code = _to_project_code(
        project_code
    )

    base_row = latest_ml_row(
        code
    )

    if base_row is None:

        raise ValueError(
            "No ML-ready snapshot is available "
            f"for project {code}."
        )

    # --------------------------------------------------------
    # Validate scenario bounds
    # --------------------------------------------------------

    progress_delta = float(
        np.clip(
            progress_delta,
            -30,
            30,
        )
    )

    delay_delta = float(
        np.clip(
            delay_delta,
            -365,
            365,
        )
    )

    expenditure_delta = float(
        np.clip(
            expenditure_delta,
            -200,
            200,
        )
    )

    revised_cost_delta = float(
        np.clip(
            revised_cost_delta,
            -500,
            500,
        )
    )

    # --------------------------------------------------------
    # Baseline
    # --------------------------------------------------------

    baseline = model_score_from_features(
        base_row
    )

    # --------------------------------------------------------
    # Scenario
    # --------------------------------------------------------

    scenario_row = build_scenario(
        base_row,
        progress_delta=progress_delta,
        delay_delta=delay_delta,
        expenditure_delta=expenditure_delta,
        revised_cost_delta=revised_cost_delta,
    )

    simulated = model_score_from_features(
        scenario_row
    )

    # --------------------------------------------------------
    # Changes
    # --------------------------------------------------------

    change = {
        "overall_risk": (
            simulated["overall_risk"]
            - baseline["overall_risk"]
        ),
        "delay_probability": (
            simulated["delay_probability"]
            - baseline["delay_probability"]
        ),
        "stall_probability": (
            simulated["stall_probability"]
            - baseline["stall_probability"]
        ),
        "predicted_cost_overrun": (
            simulated["predicted_cost_overrun"]
            - baseline["predicted_cost_overrun"]
        ),
        "cost_risk": (
            simulated["cost_risk"]
            - baseline["cost_risk"]
        ),
    }

    return {
        "project_code": code,

        "scenario_inputs": {
            "progress_delta": progress_delta,
            "delay_delta": delay_delta,
            "expenditure_delta": expenditure_delta,
            "revised_cost_delta": revised_cost_delta,
        },

        "baseline": baseline,

        "scenario": simulated,

        "change": change,
    }


# ============================================================
# PORTFOLIO SUMMARY
# ============================================================

def get_portfolio_summary(
    *,
    sector: Optional[str] = None,
    ministry: Optional[str] = None,
    state: Optional[str] = None,
    risk_level: Optional[str] = None,
    schedule_status: Optional[str] = None,
    search: Optional[str] = None,
) -> dict[str, Any]:

    portfolio = filter_projects(
        sector=sector,
        ministry=ministry,
        state=state,
        risk_level=risk_level,
        schedule_status=schedule_status,
        search=search,
    )

    if (
        "overall_risk_score" not in portfolio.columns
        or "risk_level" not in portfolio.columns
    ):
        portfolio = _attach_risk_scores(
            portfolio
        )

    total_projects = int(
        portfolio[
            "project_code"
        ].nunique()
    )

    delayed_projects = 0

    if "is_delayed" in portfolio.columns:

        delayed_projects = int(
            pd.to_numeric(
                portfolio[
                    "is_delayed"
                ],
                errors="coerce",
            )
            .fillna(0)
            .sum()
        )

    elif "delay_days" in portfolio.columns:

        delayed_projects = int(
            (
                pd.to_numeric(
                    portfolio[
                        "delay_days"
                    ],
                    errors="coerce",
                )
                .fillna(0)
                > 0
            ).sum()
        )

    cost_overrun_projects = 0

    if "has_cost_overrun" in portfolio.columns:

        cost_overrun_projects = int(
            pd.to_numeric(
                portfolio[
                    "has_cost_overrun"
                ],
                errors="coerce",
            )
            .fillna(0)
            .sum()
        )

    elif "cost_overrun_pct" in portfolio.columns:

        cost_overrun_projects = int(
            (
                pd.to_numeric(
                    portfolio[
                        "cost_overrun_pct"
                    ],
                    errors="coerce",
                )
                .fillna(0)
                > 0
            ).sum()
        )

    total_original_cost = _safe_sum(
        portfolio,
        "original_cost_cr",
    )

    total_revised_cost = _safe_sum(
        portfolio,
        "revised_cost_cr",
    )

    total_expenditure = _safe_sum(
        portfolio,
        "expenditure_cr",
    )

    average_risk = None

    if "overall_risk_score" in portfolio.columns:

        risk_values = pd.to_numeric(
            portfolio[
                "overall_risk_score"
            ],
            errors="coerce",
        ).dropna()

        if not risk_values.empty:

            average_risk = float(
                risk_values.mean()
            )

    return {
        "total_projects": total_projects,

        "total_original_cost_cr":
            total_original_cost,

        "total_revised_cost_cr":
            total_revised_cost,

        "total_expenditure_cr":
            total_expenditure,

        "delayed_projects":
            delayed_projects,

        "delay_rate_pct":
            (
                delayed_projects
                / total_projects
                * 100
                if total_projects
                else 0.0
            ),

        "cost_overrun_projects":
            cost_overrun_projects,

        "cost_overrun_rate_pct":
            (
                cost_overrun_projects
                / total_projects
                * 100
                if total_projects
                else 0.0
            ),

        "average_risk_score":
            average_risk,
    }


def _safe_sum(
    df: pd.DataFrame,
    column: str,
) -> float:

    if column not in df.columns:
        return 0.0

    values = pd.to_numeric(
        df[column],
        errors="coerce",
    ).fillna(0)

    return float(
        values.sum()
    )