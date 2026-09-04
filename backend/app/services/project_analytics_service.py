from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional

import joblib
import numpy as np
import pandas as pd
from sqlalchemy import text

from app.extensions import db

from app.ml import engine


# ============================================================
# PATHS
# ============================================================

APP_ROOT = Path(__file__).resolve().parents[2]

DATA_DIR = APP_ROOT / "data"
MODELS_DIR = APP_ROOT / "models"

# Kept for compatibility with the existing project structure.
# Project Analytics now uses PostgreSQL as the source of truth.
MASTER_FILE = DATA_DIR / "01_PROJECT_MASTER_CLEANED.csv"
HISTORY_FILE = DATA_DIR / "02_PAIMANA_MONTHLY_HISTORY_CLEAN.csv"
FLASH_FILE = DATA_DIR / "03_FLASH_MODERN_HISTORY_CLEAN.csv"
ML_READY_FILE = DATA_DIR / "PAIMANA_ML_READY_WITH_PROJECT_CODE.csv"
STATE_SUMMARY_PATH = (
    DATA_DIR / "08_RAJYA_SABHA_STATE_SUMMARY_CLEANED.csv"
)

FEATURE_CONTRACT_FILE = (
    MODELS_DIR / "feature_contract.json"
)

FUTURE_DELAY_MODEL_FILE = (
    MODELS_DIR / "future_delay_model.joblib"
)

FUTURE_DELAY_CALIBRATOR_FILE = (
    MODELS_DIR / "future_delay_calibrator.joblib"
)

FUTURE_STALL_MODEL_FILE = (
    MODELS_DIR
    / "future_progress_stall_model.joblib"
)

FUTURE_STALL_CALIBRATOR_FILE = (
    MODELS_DIR
    / "future_progress_stall_calibrator.joblib"
)

COST_MODEL_FILE = (
    MODELS_DIR / "cost_overrun_model.joblib"
)


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
    Normalize project codes for reliable comparisons between
    PostgreSQL, pandas and API input.
    """

    if value is None:
        return ""

    if isinstance(value, float) and value.is_integer():
        return str(int(value))

    return str(value).strip()


def _safe_float(
    value: Any,
    default: float = 0.0,
) -> float:
    """
    Safely convert a value to float.
    """

    try:
        if pd.isna(value):
            return default

        return float(value)

    except (TypeError, ValueError):
        return default


def _safe_int(
    value: Any,
    default: int = 0,
) -> int:
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
    Convert pandas / numpy values into JSON-safe values.
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


def _records(
    df: pd.DataFrame,
) -> list[dict[str, Any]]:
    """
    Convert dataframe rows into JSON-safe dictionaries.
    """

    if df is None or df.empty:
        return []

    result: list[dict[str, Any]] = []

    for record in df.to_dict(
        orient="records"
    ):
        result.append(
            {
                str(key): _clean_value(value)
                for key, value in record.items()
            }
        )

    return result


def _safe_sum(
    df: pd.DataFrame,
    column: str,
) -> float:
    """
    Safe numeric dataframe sum.
    """

    if column not in df.columns:
        return 0.0

    values = pd.to_numeric(
        df[column],
        errors="coerce",
    ).fillna(0)

    return float(values.sum())


# ============================================================
# DATA LOADING
# ============================================================

def _load_postgres_table(
    table_name: str,
) -> pd.DataFrame:
    """
    Load a complete Project Analytics table from PostgreSQL.
    """

    allowed_tables = {
        "project_master",
        "paimana_monthly_history",
        "flash_modern_history",
        "paimana_ml_ready",
    }

    if table_name not in allowed_tables:
        raise ValueError(
            f"Unsupported Project Analytics table: {table_name}"
        )

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
    Normalize project_code values.
    """

    if "project_code" in df.columns:
        df["project_code"] = (
            df["project_code"]
            .apply(_to_project_code)
        )

    return df


def load_master() -> pd.DataFrame:
    """
    Load project_master from PostgreSQL.
    """

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
    """
    Load PAIMANA monthly history from PostgreSQL.
    """

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
    """
    Load FLASH history from PostgreSQL.
    """

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
    """
    Load ML-ready project snapshots from PostgreSQL.
    """

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
    """
    Load all Project Analytics models once and cache them.
    """

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

    if "features" not in contract:
        raise ValueError(
            "feature_contract.json is missing 'features'."
        )

    if "cost_features" not in contract:
        raise ValueError(
            "feature_contract.json is missing "
            "'cost_features'."
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
    Return the latest ML-ready snapshot for one project.
    """

    df = load_ml_ready()

    code = _to_project_code(
        project_code
    )

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
    Return PAIMANA monthly history for one project.
    """

    df = load_history()

    code = _to_project_code(
        project_code
    )

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

    code = _to_project_code(
        project_code
    )

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

def _build_feature_frame(
    rows: pd.DataFrame,
    features: list[str],
) -> pd.DataFrame:
    """
    Build a complete numeric feature dataframe based on the
    trained feature contract.

    Missing model features are filled with zero so the deployed
    API remains schema-safe.
    """

    values: dict[str, pd.Series] = {}

    for column in features:
        if column in rows.columns:
            series = pd.to_numeric(
                rows[column],
                errors="coerce",
            ).fillna(0.0)
        else:
            series = pd.Series(
                0.0,
                index=rows.index,
                dtype=float,
            )

        values[column] = (
            series.astype(float)
        )

    return pd.DataFrame(
        values,
        index=rows.index,
        columns=features,
    )


def model_score_from_features(
    row: pd.Series,
) -> dict[str, Any]:
    """
    Run the canonical PAIMANA ML engine for one project row.

    Project Analytics uses the same ML engine as:
    - Risk Analysis
    - Cost Prediction
    - Delay Prediction

    This function only adapts the engine response to the
    existing Project Analytics internal response format.
    """

    features = engine.contract["features"]

    # --------------------------------------------------------
    # Make sure every model feature exists and is numeric.
    # This preserves the previous Project Analytics behavior
    # where missing values were safely treated as 0.0.
    # --------------------------------------------------------

    normalized_row = row.copy()

    for column in features:
        if column not in normalized_row.index:
            normalized_row[column] = 0.0
        else:
            normalized_row[column] = _safe_float(
                normalized_row[column],
                0.0,
            )

    # --------------------------------------------------------
    # Project code
    # --------------------------------------------------------

    project_code = _to_project_code(
        normalized_row.get(
            "project_code",
            "",
        )
    )

    # --------------------------------------------------------
    # Canonical ML engine
    # --------------------------------------------------------

    result = engine.predict_row(
        normalized_row,
        project_code,
    )

    # --------------------------------------------------------
    # Keep the existing Project Analytics response contract
    # --------------------------------------------------------

    return {
        "delay_probability": float(
            result["future_delay_probability"]
        ),
        "stall_probability": float(
            result["future_progress_stall_probability"]
        ),
        "predicted_cost_overrun": float(
            result["predicted_cost_overrun_pct"]
        ),
        "cost_risk": float(
            result["cost_risk_score"]
        ),
        "overall_risk": float(
            result["overall_risk_score"]
        ),
        "risk_level": result["risk_level"],
    }

def project_risk_trajectory(project_code: str) -> list[dict[str, Any]]:
    """
    Return historical ML risk predictions for one project.

    Source:
        PostgreSQL -> paimana_ml_ready

    Prediction:
        Canonical PAIMANA ML engine

    This keeps Project Analytics aligned with the same
    engine used by Risk / Cost / Delay services.
    """

    df = load_ml_ready()

    rows = df[
        df["project_code"]
        .astype(str)
        .eq(str(project_code))
    ].copy()

    if rows.empty:
        return []

    rows = rows.sort_values(
        ["snapshot_year", "snapshot_month_num"]
    )

    trajectory: list[dict[str, Any]] = []

    for _, row in rows.iterrows():
        try:
            prediction = engine.predict_row(
                row,
                str(project_code),
            )
        except Exception:
            continue

        year = row.get("snapshot_year")
        month = row.get("snapshot_month_num")

        snapshot_date = None

        if pd.notna(year) and pd.notna(month):
            try:
                snapshot_date = (
                    f"{int(year):04d}-"
                    f"{int(month):02d}-01"
                )
            except (TypeError, ValueError):
                snapshot_date = None

        trajectory.append(
            {
                "snapshot_date": snapshot_date,
                "snapshot_year": (
                    int(year)
                    if pd.notna(year)
                    else None
                ),
                "snapshot_month": (
                    int(month)
                    if pd.notna(month)
                    else None
                ),
                "overall_risk": float(
                    prediction["overall_risk_score"]
                ),
                "cost_risk": float(
                    prediction["cost_risk_score"]
                ),
                "future_delay": float(
                    prediction["future_delay_probability"]
                    * 100.0
                ),
                "progress_stall": float(
                    prediction[
                        "future_progress_stall_probability"
                    ]
                    * 100.0
                ),
                "predicted_cost_overrun_pct": float(
                    prediction[
                        "predicted_cost_overrun_pct"
                    ]
                ),
                "risk_level": prediction[
                    "risk_level"
                ],
            }
        )

    return trajectory    


def model_scores_from_features_batch(
    rows: pd.DataFrame,
    batch_size: int = 256,
) -> pd.DataFrame:
    """
    Run Project Analytics ML scoring in memory-safe batches.

    Uses the same trained models, calibrators, cost-risk scaling,
    overall-risk formula, and risk thresholds as the canonical engine,
    but performs inference vectorized across batches instead of
    calling engine.predict_row() once per row.
    """

    empty_columns = [
        "project_code",
        "predicted_cost_overrun_pct",
        "future_delay_probability",
        "future_progress_stall_probability",
        "cost_risk_score",
        "overall_risk_score",
        "risk_level",
    ]

    if rows is None or rows.empty:
        return pd.DataFrame(
            columns=empty_columns
        )

    models = load_models()
    contract = models["contract"]

    features = contract["features"]
    cost_features = contract["cost_features"]

    # --------------------------------------------------------
    # Build complete numeric feature matrix once
    # --------------------------------------------------------

    X = _build_feature_frame(
        rows,
        features,
    )

    X_cost = X[
        cost_features
    ].copy()

    results: list[pd.DataFrame] = []

    # --------------------------------------------------------
    # Memory-safe batch inference
    # --------------------------------------------------------

    for start in range(
        0,
        len(X),
        batch_size,
    ):
        end = min(
            start + batch_size,
            len(X),
        )

        X_batch = X.iloc[
            start:end
        ]

        X_cost_batch = X_cost.iloc[
            start:end
        ]

        # ====================================================
        # Future delay
        # ====================================================

        raw_delay = (
            models["delay_model"]
            .predict_proba(
                X_batch[features]
            )[:, 1]
            .reshape(-1, 1)
        )

        delay_probability = (
            models["delay_calibrator"]
            .predict_proba(
                raw_delay
            )[:, 1]
        )

        # ====================================================
        # Progress stall
        # ====================================================

        raw_stall = (
            models["stall_model"]
            .predict_proba(
                X_batch[features]
            )[:, 1]
            .reshape(-1, 1)
        )

        stall_probability = (
            models["stall_calibrator"]
            .predict_proba(
                raw_stall
            )[:, 1]
        )

        # ====================================================
        # Cost overrun
        # ====================================================

        predicted_cost = np.maximum(
            0.0,
            models["cost_model"].predict(
                X_cost_batch[
                    cost_features
                ]
            ),
        )

        # ====================================================
        # Cost risk
        # ====================================================

        reference = _safe_float(
            contract.get(
                "cost_risk_reference_percentile",
                1.0,
            ),
            1.0,
        )

        if reference <= 0:
            reference = 1.0

        cost_risk = np.clip(
            (
                predicted_cost
                / reference
                * 100.0
            ),
            0.0,
            100.0,
        )

        # ====================================================
        # Overall risk
        # ====================================================

        overall_risk = np.clip(
            (
                0.30 * cost_risk
                + 0.35
                * delay_probability
                * 100.0
                + 0.35
                * stall_probability
                * 100.0
            ),
            0.0,
            100.0,
        )

        # ====================================================
        # Risk level
        # ====================================================

        risk_level = np.select(
            [
                overall_risk >= 85.0,
                overall_risk >= 70.0,
                overall_risk >= 40.0,
            ],
            [
                "CRITICAL",
                "HIGH",
                "MEDIUM",
            ],
            default="LOW",
        )

        # ====================================================
        # Batch result
        # ====================================================

        batch_result = pd.DataFrame(
            {
                "project_code": (
                    rows.iloc[
                        start:end
                    ]["project_code"]
                    .astype(str)
                    .values
                ),

                "predicted_cost_overrun_pct":
                    predicted_cost,

                "future_delay_probability":
                    delay_probability,

                "future_progress_stall_probability":
                    stall_probability,

                "cost_risk_score":
                    cost_risk,

                "overall_risk_score":
                    overall_risk,

                "risk_level":
                    risk_level,
            }
        )

        results.append(
            batch_result
        )

    # --------------------------------------------------------
    # Combine all batches
    # --------------------------------------------------------

    if not results:
        return pd.DataFrame(
            columns=empty_columns
        )

    return pd.concat(
        results,
        ignore_index=True,
    )


# ============================================================
# PROJECT FILTERING
# ============================================================

def get_filter_options() -> dict[str, list[str]]:
    """
    Return current filter options from PostgreSQL.
    """

    portfolio = load_master()

    sectors = sorted(
        portfolio["sector"]
        .dropna()
        .astype(str)
        .str.strip()
        .replace(
            "",
            np.nan,
        )
        .dropna()
        .unique()
        .tolist()
    )

    ministries = sorted(
        portfolio["ministry"]
        .dropna()
        .astype(str)
        .str.strip()
        .replace(
            "",
            np.nan,
        )
        .dropna()
        .unique()
        .tolist()
    )

    states: list[str] = []

    if "flash_state" in portfolio.columns:
        states = sorted(
            portfolio["flash_state"]
            .dropna()
            .astype(str)
            .str.strip()
            .replace(
                "",
                np.nan,
            )
            .dropna()
            .unique()
            .tolist()
        )

    statuses: list[str] = []

    if "schedule_status" in portfolio.columns:
        statuses = sorted(
            portfolio["schedule_status"]
            .dropna()
            .astype(str)
            .str.strip()
            .replace(
                "",
                np.nan,
            )
            .dropna()
            .unique()
            .tolist()
        )

    return {
        "sectors": sectors,
        "ministries": ministries,
        "states": states,
        "risk_levels": [
            "LOW",
            "MEDIUM",
            "HIGH",
            "CRITICAL",
        ],
        "schedule_statuses": statuses,
    }


def _normalize_filter_values(
    values: Optional[list[str]],
) -> list[str]:
    """
    Normalize multi-select filter values.

    Removes:
    - None
    - empty strings
    - 'All ...' placeholder values

    Preserves actual selected values.
    """

    if not values:
        return []

    normalized: list[str] = []

    for value in values:
        if value is None:
            continue

        value = str(value).strip()

        if not value:
            continue

        if value.lower().startswith("all "):
            continue

        normalized.append(value)

    # Remove duplicates while preserving order
    return list(dict.fromkeys(normalized))


def filter_projects(
    *,
    sector: Optional[list[str]] = None,
    ministry: Optional[list[str]] = None,
    state: Optional[list[str]] = None,
    risk_level: Optional[list[str]] = None,
    schedule_status: Optional[list[str]] = None,
    search: Optional[str] = None,
) -> pd.DataFrame:
    """
    Filter the current PostgreSQL project portfolio.

    Supports:
    - multi-select sector
    - multi-select ministry
    - multi-select state
    - multi-select risk level
    - multi-select schedule status
    - project code/name search
    """

    portfolio = load_master().copy()

    # --------------------------------------------------------
    # Normalize filters
    # --------------------------------------------------------

    sector_values = _normalize_filter_values(sector)
    ministry_values = _normalize_filter_values(ministry)
    state_values = _normalize_filter_values(state)
    risk_values = _normalize_filter_values(risk_level)
    schedule_values = _normalize_filter_values(schedule_status)

    # --------------------------------------------------------
    # Sector
    # --------------------------------------------------------

    if sector_values:
        portfolio = portfolio[
            portfolio["sector"]
            .astype(str)
            .isin(sector_values)
        ]

    # --------------------------------------------------------
    # Ministry
    # --------------------------------------------------------

    if ministry_values:
        portfolio = portfolio[
            portfolio["ministry"]
            .astype(str)
            .isin(ministry_values)
        ]

    # --------------------------------------------------------
    # State
    # --------------------------------------------------------

    if (
        state_values
        and "flash_state" in portfolio.columns
    ):
        portfolio = portfolio[
            portfolio["flash_state"]
            .astype(str)
            .isin(state_values)
        ]

    # --------------------------------------------------------
    # Risk level
    # --------------------------------------------------------

    if risk_values:

        risk_values_upper = {
            str(value).strip().upper()
            for value in risk_values
        }

        if (
            "risk_level"
            not in portfolio.columns
        ):
            portfolio = _attach_risk_scores(
                portfolio
            )

        portfolio = portfolio[
            portfolio["risk_level"]
            .astype(str)
            .str.upper()
            .isin(risk_values_upper)
        ]

    # --------------------------------------------------------
    # Schedule status
    # --------------------------------------------------------

    if (
        schedule_values
        and "schedule_status"
        in portfolio.columns
    ):
        portfolio = portfolio[
            portfolio["schedule_status"]
            .astype(str)
            .isin(schedule_values)
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
                portfolio[
                    "project_code"
                ]
                .astype(str)
                .str.lower()
                .str.contains(
                    search_value,
                    na=False,
                    regex=False,
                )
            )

            name_match = (
                portfolio[
                    "project_name"
                ]
                .astype(str)
                .str.lower()
                .str.contains(
                    search_value,
                    na=False,
                    regex=False,
                )
            )

            portfolio = portfolio[
                code_match
                | name_match
            ]

    return portfolio


# ============================================================
# RISK ATTACHMENT
# ============================================================

def _attach_risk_scores(
    portfolio: pd.DataFrame,
) -> pd.DataFrame:
    """
    Attach model-based risk scores using batched inference.
    """

    result = portfolio.copy()

    # --------------------------------------------------------
    # Default risk columns
    # --------------------------------------------------------

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
        "risk_level"
    ] = None

    # --------------------------------------------------------
    # ML data
    # --------------------------------------------------------

    ml = load_ml_ready()

    if ml.empty:
        return result

    # --------------------------------------------------------
    # Latest snapshot
    # --------------------------------------------------------

    sort_columns = [
        column
        for column in [
            "snapshot_year",
            "snapshot_month_num",
        ]
        if column in ml.columns
    ]

    if sort_columns:
        latest_rows = (
            ml
            .sort_values(
                sort_columns
            )
            .drop_duplicates(
                "project_code",
                keep="last",
            )
        )

    else:
        latest_rows = (
            ml
            .drop_duplicates(
                "project_code",
                keep="last",
            )
        )

    # --------------------------------------------------------
    # Only selected projects
    # --------------------------------------------------------

    selected_codes = set(
        result[
            "project_code"
        ]
        .astype(str)
    )

    latest_rows = latest_rows[
        latest_rows[
            "project_code"
        ]
        .astype(str)
        .isin(
            selected_codes
        )
    ].copy()

    if latest_rows.empty:
        return result

    # --------------------------------------------------------
    # Batch scoring
    # --------------------------------------------------------

    scores = (
        model_scores_from_features_batch(
            latest_rows,
            batch_size=256,
        )
    )

    if scores.empty:
        return result

    # --------------------------------------------------------
    # Normalize codes
    # --------------------------------------------------------

    result[
        "project_code"
    ] = (
        result["project_code"]
        .apply(
            _to_project_code
        )
    )

    scores[
        "project_code"
    ] = (
        scores["project_code"]
        .apply(
            _to_project_code
        )
    )

    scores = scores.drop_duplicates(
        "project_code",
        keep="last",
    )

    # --------------------------------------------------------
    # Merge
    # --------------------------------------------------------

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
    # Promote calculated columns
    # --------------------------------------------------------

    risk_columns = [
        "predicted_cost_overrun_pct",
        "future_delay_probability",
        "future_progress_stall_probability",
        "cost_risk_score",
        "overall_risk_score",
        "risk_level",
    ]

    for column in risk_columns:
        risk_column = (
            f"{column}_risk"
        )

        if (
            risk_column
            in result.columns
        ):
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
# PROJECT LIST
# ============================================================

def get_matching_projects(
    *,
    sector: Optional[list[str]] = None,
    ministry: Optional[list[str]] = None,
    state: Optional[list[str]] = None,
    risk_level: Optional[list[str]] = None,
    schedule_status: Optional[list[str]] = None,
    search: Optional[str] = None,
) -> dict[str, Any]:
    """
    Return filtered project list.
    Supports multi-select filters.
    """

    portfolio = filter_projects(
        sector=sector,
        ministry=ministry,
        state=state,
        risk_level=risk_level,
        schedule_status=schedule_status,
        search=search,
    )

    if (
        "overall_risk_score"
        not in portfolio.columns
        or "risk_level"
        not in portfolio.columns
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

    if (
        "project_name"
        in projects.columns
    ):
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
    Return complete project-level analytics.
    """

    code = _to_project_code(
        project_code
    )

    master = load_master()

    row_df = master[
        master["project_code"]
        == code
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
    # ML risk
    # --------------------------------------------------------

    risk: Optional[
        dict[str, Any]
    ] = None

    # Always initialize this so projects without
    # ML snapshots safely return an empty trajectory.
    risk_trajectory: list[dict[str, Any]] = []

    if ml_row is not None:
        try:
            risk = (
                model_score_from_features(
                    ml_row
                )
            )

        except Exception:
            risk = None

        risk_trajectory = project_risk_trajectory(
            code
        )
    # --------------------------------------------------------
    # Fallback risk already stored in master table
    # --------------------------------------------------------

    if risk is None:

        overall_risk = row.get(
            "overall_risk_score"
        )

        if pd.notna(
            overall_risk
        ):

            stored_risk_level = (
                row.get(
                    "risk_level"
                )
            )

            if (
                pd.isna(
                    stored_risk_level
                )
                or not str(
                    stored_risk_level
                ).strip()
            ):
                score = _safe_float(
                    overall_risk
                )

                if score >= 85:
                    stored_risk_level = "CRITICAL"
                elif score >= 70:
                    stored_risk_level = "HIGH"
                elif score >= 40:
                    stored_risk_level = "MEDIUM"
                else:
                    stored_risk_level = "LOW"

            risk = {
                "delay_probability":
                    _safe_float(
                        row.get(
                            "future_delay_probability"
                        )
                    ),

                "stall_probability":
                    _safe_float(
                        row.get(
                            "future_progress_stall_probability"
                        )
                    ),

                "predicted_cost_overrun":
                    _safe_float(
                        row.get(
                            "predicted_cost_overrun_pct"
                        )
                    ),

                "cost_risk":
                    _safe_float(
                        row.get(
                            "cost_risk_score"
                        )
                    ),

                "overall_risk":
                    _safe_float(
                        overall_risk
                    ),

                "risk_level":
                    str(
                        stored_risk_level
                    ),
            }

    # --------------------------------------------------------
    # Project information
    # --------------------------------------------------------

    project_info = {
        "project_code": code,

        "project_name":
            _clean_value(
                row.get(
                    "project_name"
                )
            ),

        "ministry":
            _clean_value(
                row.get(
                    "ministry"
                )
            ),

        "sector":
            _clean_value(
                row.get(
                    "sector"
                )
            ),

        "state":
            _clean_value(
                row.get(
                    "flash_state"
                )
            ),

        "implementing_agency":
            _clean_value(
                row.get(
                    "flash_implementing_agency"
                )
            ),

        "schedule_status":
            _clean_value(
                row.get(
                    "schedule_status"
                )
            ),

        "cost_status":
            _clean_value(
                row.get(
                    "cost_status"
                )
            ),

        "original_completion":
            _clean_value(
                row.get(
                    "original_end_date"
                )
            ),

        "revised_completion":
            _clean_value(
                row.get(
                    "revised_end_date"
                )
            ),

        "data_quality_flag":
            _clean_value(
                row.get(
                    "data_quality_flag"
                )
            ),

        "data_completeness_score":
            (
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
        "risk_score":
            (
                risk["overall_risk"]
                if risk
                else None
            ),

        "risk_level":
            (
                risk["risk_level"]
                if risk
                else _clean_value(
                    row.get(
                        "risk_level"
                    )
                )
            ),

        "delay_days":
            _safe_float(
                row.get(
                    "delay_days"
                )
            ),

        "physical_progress_pct":
            (
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

        "original_cost_cr":
            _safe_float(
                row.get(
                    "original_cost_cr"
                )
            ),

        "expenditure_cr":
            _safe_float(
                row.get(
                    "expenditure_cr"
                )
            ),

        "alert_priority":
            _clean_value(
                row.get(
                    "alert_priority"
                )
            ),
    }

    # --------------------------------------------------------
    # Risk breakdown
    # --------------------------------------------------------

    risk_breakdown = {
        "cost_risk":
            (
                risk["cost_risk"]
                if risk
                else None
            ),

        "future_delay":
            (
                risk[
                    "delay_probability"
                ]
                * 100.0
                if risk
                else None
            ),

        "progress_stall":
            (
                risk[
                    "stall_probability"
                ]
                * 100.0
                if risk
                else None
            ),

        "overall_risk":
            (
                risk["overall_risk"]
                if risk
                else None
            ),

        "risk_level":
            (
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

    for (
        title,
        explanation,
    ) in reasons:

        delay_reasons_response.append(
            {
                "title": title,
                "explanation": explanation,
                "recommended_solution":
                    solution_for_reason(
                        title
                    ),
            }
        )

    # --------------------------------------------------------
    # Monthly PAIMANA history
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

        if history_columns:
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

        if flash_columns:
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
            ml_project["project_code"]
            == code
        ].copy()

        if not ml_project.empty:

            if (
                "snapshot_year"
                in ml_project.columns
                and
                "snapshot_month_num"
                in ml_project.columns
            ):

                ml_project[
                    "snapshot_date"
                ] = pd.to_datetime(
                    ml_project[
                        "snapshot_year"
                    ]
                    .astype(int)
                    .astype(str)
                    + "-"
                    + ml_project[
                        "snapshot_month_num"
                    ]
                    .astype(int)
                    .astype(str)
                    .str.zfill(2)
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
                if column
                in ml_project.columns
            ]

            if (
                progress_columns
            ):
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
        "delay_reasons":
            delay_reasons_response,
        "history":
            history_records,
        "flash_history":
            flash_records,
        "progress_trajectory":
            progress_records,
        "risk_trajectory": risk_trajectory,

        "has_ml_snapshot":
            ml_row is not None,
    }


# ============================================================
# DELAY REASONS
# ============================================================

def delay_reasons(
    row: pd.Series,
    history: pd.DataFrame,
) -> list[tuple[str, str]]:
    """
    Evidence-based project warning indicators.

    These are dataset indicators, not causal findings.
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
    # Completion-date revision
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

        expenditure_value = _safe_float(
            expenditure_change
        )

        if expenditure_value > 0:
            reasons.append(
                (
                    "Expenditure movement",
                    (
                        "Maximum observed "
                        "monthly FLASH "
                        "expenditure change "
                        f"is ₹"
                        f"{expenditure_value:,.2f} "
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
    """
    Return the recommended operational action for
    a detected evidence indicator.
    """

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
    Build a coherent What-If scenario row using the same
    feature semantics as the trained ML dataset.
    """

    scenario = base_row.copy()

    def number(
        name: str,
        default: float = 0.0,
    ) -> float:
        return _safe_float(
            scenario.get(
                name,
                default,
            ),
            default,
        )

    # ========================================================
    # PHYSICAL PROGRESS
    # ========================================================

    old_progress = number(
        "physical_progress_pct"
    )

    old_previous_progress = number(
        "previous_progress_pct",
        old_progress,
    )

    new_progress = float(
        np.clip(
            old_progress + float(progress_delta),
            0.0,
            100.0,
        )
    )

    if "physical_progress_pct" in scenario.index:
        scenario["physical_progress_pct"] = new_progress

    # Current snapshot change relative to the previous snapshot.
    if "progress_change_pct" in scenario.index:
        scenario["progress_change_pct"] = (
            new_progress - old_previous_progress
        )

    # Keep the previous snapshot fixed.
    if "previous_progress_pct" in scenario.index:
        scenario["previous_progress_pct"] = (
            old_previous_progress
        )

    # FLASH equivalent if present.
    if "physical_progress_change_pct" in scenario.index:
        scenario["physical_progress_change_pct"] = (
            new_progress - old_previous_progress
        )

    # ========================================================
    # DELAY / SCHEDULE
    # ========================================================

    old_delay = number(
        "delay_days"
    )

    new_delay = max(
        0.0,
        old_delay + float(delay_delta),
    )

    if "delay_days" in scenario.index:
        scenario["delay_days"] = new_delay

    old_schedule_change = number(
        "schedule_change_days"
    )

    if "schedule_change_days" in scenario.index:
        scenario["schedule_change_days"] = (
            old_schedule_change
            + float(delay_delta)
        )

    # ========================================================
    # EXPENDITURE
    # ========================================================

    old_expenditure = number(
        "expenditure_cr"
    )

    new_expenditure = max(
        0.0,
        old_expenditure + float(expenditure_delta),
    )

    if "expenditure_cr" in scenario.index:
        scenario["expenditure_cr"] = (
            new_expenditure
        )

    # Keep previous expenditure fixed because the scenario
    # changes the current/latest snapshot.
    old_previous_expenditure = number(
        "previous_expenditure_cr",
        old_expenditure,
    )

    if "previous_expenditure_cr" in scenario.index:
        scenario["previous_expenditure_cr"] = (
            old_previous_expenditure
        )

    # Recalculate monthly expenditure movement.
    new_expenditure_change = (
        new_expenditure
        - old_previous_expenditure
    )

    if "expenditure_change_cr_paimana" in scenario.index:
        scenario["expenditure_change_cr_paimana"] = (
            new_expenditure_change
        )

    if "expenditure_change_cr_flash" in scenario.index:
        scenario["expenditure_change_cr_flash"] = (
            new_expenditure_change
        )

    # FLASH cumulative expenditure.
    old_cumulative = number(
        "cumulative_expenditure",
        old_expenditure,
    )

    new_cumulative = max(
        0.0,
        old_cumulative + float(expenditure_delta),
    )

    if "cumulative_expenditure" in scenario.index:
        scenario["cumulative_expenditure"] = (
            new_cumulative
        )

    # ========================================================
    # REVISED COST
    # ========================================================

    # The source row may have revised_cost_cr = 0 because
    # revised cost is not formally reported, while the
    # effective revised_cost field still contains a value.
    #
    # For What-If, use the existing effective revised cost
    # as the baseline rather than starting from zero.
    # ========================================================

    old_original_cost_cr = number(
        "original_cost_cr"
    )

    old_revised_cost = number(
        "revised_cost",
        old_original_cost_cr,
    )

    old_revised_cost_cr = number(
        "revised_cost_cr"
    )

    effective_revised_cost = (
        old_revised_cost
        if old_revised_cost > 0
        else (
            old_original_cost_cr
            if old_original_cost_cr > 0
            else old_revised_cost_cr
        )
    )

    new_revised_cost = max(
        0.0,
        effective_revised_cost
        + float(revised_cost_delta),
    )

    if "revised_cost" in scenario.index:
        scenario["revised_cost"] = (
            new_revised_cost
        )

    if "revised_cost_cr" in scenario.index:
        scenario["revised_cost_cr"] = (
            new_revised_cost
        )

    # Revision movement from the scenario cost change.
    old_revision_change = number(
        "revision_cost_change_cr"
    )

    if "revision_cost_change_cr" in scenario.index:
        scenario["revision_cost_change_cr"] = (
            old_revision_change
            + float(revised_cost_delta)
        )

    old_revised_cost_change = number(
        "revised_cost_change_cr"
    )

    if "revised_cost_change_cr" in scenario.index:
        scenario["revised_cost_change_cr"] = (
            old_revised_cost_change
            + float(revised_cost_delta)
        )

    # ========================================================
    # COST OVERRUN
    # ========================================================

    # Recalculate cost overrun against the original approved
    # cost instead of leaving the baseline values unchanged.
    new_cost_overrun_cr = max(
        0.0,
        new_revised_cost - old_original_cost_cr,
    )

    new_cost_overrun_pct = 0.0

    if old_original_cost_cr > 0:
        new_cost_overrun_pct = (
            new_cost_overrun_cr
            / old_original_cost_cr
            * 100.0
        )

    if "cost_overrun_cr" in scenario.index:
        scenario["cost_overrun_cr"] = (
            new_cost_overrun_cr
        )

    if "cost_overrun_pct" in scenario.index:
        scenario["cost_overrun_pct"] = (
            new_cost_overrun_pct
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
    # Validate scenario limits
    # --------------------------------------------------------

    progress_delta = float(
        np.clip(
            progress_delta,
            -30.0,
            30.0,
        )
    )

    delay_delta = float(
        np.clip(
            delay_delta,
            -365.0,
            365.0,
        )
    )

    expenditure_delta = float(
        np.clip(
            expenditure_delta,
            -200.0,
            200.0,
        )
    )

    revised_cost_delta = float(
        np.clip(
            revised_cost_delta,
            -500.0,
            500.0,
        )
    )

    # --------------------------------------------------------
    # Baseline
    # --------------------------------------------------------

    baseline = (
        model_score_from_features(
            base_row
        )
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

    simulated = (
        model_score_from_features(
            scenario_row
        )
    )

    # --------------------------------------------------------
    # Change
    # --------------------------------------------------------

    change = {
        "overall_risk": (
            simulated[
                "overall_risk"
            ]
            - baseline[
                "overall_risk"
            ]
        ),

        "delay_probability": (
            simulated[
                "delay_probability"
            ]
            - baseline[
                "delay_probability"
            ]
        ),

        "stall_probability": (
            simulated[
                "stall_probability"
            ]
            - baseline[
                "stall_probability"
            ]
        ),

        "predicted_cost_overrun": (
            simulated[
                "predicted_cost_overrun"
            ]
            - baseline[
                "predicted_cost_overrun"
            ]
        ),

        "cost_risk": (
            simulated[
                "cost_risk"
            ]
            - baseline[
                "cost_risk"
            ]
        ),
    }

    return {
        "project_code": code,

        "scenario_inputs": {
            "progress_delta":
                progress_delta,

            "delay_delta":
                delay_delta,

            "expenditure_delta":
                expenditure_delta,

            "revised_cost_delta":
                revised_cost_delta,
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
    """
    Return portfolio-level project analytics.
    """

    portfolio = filter_projects(
        sector=sector,
        ministry=ministry,
        state=state,
        risk_level=risk_level,
        schedule_status=schedule_status,
        search=search,
    )

    if (
        "overall_risk_score"
        not in portfolio.columns
        or "risk_level"
        not in portfolio.columns
    ):
        portfolio = _attach_risk_scores(
            portfolio
        )

    # --------------------------------------------------------
    # Project count
    # --------------------------------------------------------

    total_projects = int(
        portfolio[
            "project_code"
        ].nunique()
    )

    # --------------------------------------------------------
    # Delayed projects
    # --------------------------------------------------------

    delayed_projects = 0

    if (
        "is_delayed"
        in portfolio.columns
    ):
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

    elif (
        "delay_days"
        in portfolio.columns
    ):
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

    # --------------------------------------------------------
    # Cost overrun projects
    # --------------------------------------------------------

    cost_overrun_projects = 0

    if (
        "has_cost_overrun"
        in portfolio.columns
    ):
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

    elif (
        "cost_overrun_pct"
        in portfolio.columns
    ):
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

    # --------------------------------------------------------
    # Financial totals
    # --------------------------------------------------------

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

    # --------------------------------------------------------
    # Average risk
    # --------------------------------------------------------

    average_risk = None

    if (
        "overall_risk_score"
        in portfolio.columns
    ):
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
        "total_projects":
            total_projects,

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
                * 100.0
                if total_projects
                else 0.0
            ),

        "cost_overrun_projects":
            cost_overrun_projects,

        "cost_overrun_rate_pct":
            (
                cost_overrun_projects
                / total_projects
                * 100.0
                if total_projects
                else 0.0
            ),

        "average_risk_score":
            average_risk,
    }