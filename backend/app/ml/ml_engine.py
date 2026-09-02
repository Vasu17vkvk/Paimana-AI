import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parent
MODEL_DIR = ROOT / "models"


# -----------------------------
# Load feature contract
# -----------------------------
with open(
    MODEL_DIR / "feature_contract.json",
    encoding="utf-8"
) as f:
    CONTRACT = json.load(f)


# -----------------------------
# Load trained models
# -----------------------------
DELAY_MODEL = joblib.load(
    MODEL_DIR / "future_delay_model.joblib"
)

DELAY_CAL = joblib.load(
    MODEL_DIR / "future_delay_calibrator.joblib"
)

STALL_MODEL = joblib.load(
    MODEL_DIR / "future_progress_stall_model.joblib"
)

STALL_CAL = joblib.load(
    MODEL_DIR / "future_progress_stall_calibrator.joblib"
)

COST_MODEL = joblib.load(
    MODEL_DIR / "cost_overrun_model.joblib"
)


# -----------------------------
# Risk thresholds
# -----------------------------
LOW_THRESHOLD = 40.0
MEDIUM_THRESHOLD = 70.0
HIGH_THRESHOLD = 85.0

EARLY_WARNING_THRESHOLD = 70.0
CRITICAL_RISK_THRESHOLD = 85.0


def _probability(calibrator, model, X):
    """Return calibrated probability for positive class."""
    raw = model.predict_proba(X)[:, 1]

    return float(
        calibrator.predict_proba(
            raw.reshape(-1, 1)
        )[0, 1]
    )


def _risk_level(score: float) -> str:
    if score >= HIGH_THRESHOLD:
        return "CRITICAL"

    if score >= MEDIUM_THRESHOLD:
        return "HIGH"

    if score >= LOW_THRESHOLD:
        return "MEDIUM"

    return "LOW"


def _load_project_data():
    """
    Load ML-ready data.

    For now this uses the authoritative ML-ready CSV
    supplied with the trained models.
    """

    data_path = (
        ROOT
        / "PAIMANA_ML_READY_WITH_PROJECT_CODE.csv"
    )

    if not data_path.exists():
        raise FileNotFoundError(
            f"ML dataset not found: {data_path}"
        )

    data = pd.read_csv(data_path)

    # Remove duplicated column names if any
    data = data.loc[
        :,
        ~data.columns.duplicated()
    ].copy()

    return data


DATA = _load_project_data()


def score(project_code):
    """
    Generate ML risk prediction for a project.
    """

    rows = DATA[
        DATA["project_code"].astype(str)
        == str(project_code)
    ]

    if rows.empty:
        raise ValueError(
            f"Project code not found: {project_code}"
        )

    # Use latest chronological snapshot
    row = rows.sort_values(
        [
            "snapshot_year",
            "snapshot_month_num"
        ]
    ).iloc[-1]

    # Delay + progress-stall features
    X = row[
        CONTRACT["features"]
    ].to_frame().T

    # Cost model features
    X_cost = row[
        CONTRACT["cost_features"]
    ].to_frame().T


    # -----------------------------
    # Predictions
    # -----------------------------
    delay_probability = _probability(
        DELAY_CAL,
        DELAY_MODEL,
        X
    )

    stall_probability = _probability(
        STALL_CAL,
        STALL_MODEL,
        X
    )

    raw_cost_prediction = float(
        COST_MODEL.predict(X_cost)[0]
    )

    predicted_cost_overrun_pct = max(
        0.0,
        raw_cost_prediction
    )


    # -----------------------------
    # Cost risk score
    # -----------------------------
    cost_reference = float(
        CONTRACT[
            "cost_risk_reference_percentile"
        ]
    )

    cost_risk_score = float(
        np.clip(
            (
                predicted_cost_overrun_pct
                / cost_reference
                * 100.0
            ),
            0.0,
            100.0
        )
    )


    # -----------------------------
    # Overall risk
    # -----------------------------
    overall_risk_score = float(
        0.30 * cost_risk_score
        + 0.35 * delay_probability * 100.0
        + 0.35 * stall_probability * 100.0
    )

    overall_risk_score = float(
        np.clip(
            overall_risk_score,
            0.0,
            100.0
        )
    )


    risk_level = _risk_level(
        overall_risk_score
    )


    # -----------------------------
    # Early warning
    # -----------------------------
    early_warning_active = (
        overall_risk_score
        >= EARLY_WARNING_THRESHOLD
    )

    if overall_risk_score >= CRITICAL_RISK_THRESHOLD:
        early_warning_priority = "IMMEDIATE"

    elif early_warning_active:
        early_warning_priority = "HIGH"

    else:
        early_warning_priority = "NONE"


    # -----------------------------
    # Warning reasons
    # -----------------------------
    warning_reasons = []

    if early_warning_active:

        if delay_probability >= 0.60:
            warning_reasons.append(
                "future_delay"
            )

        if stall_probability >= 0.60:
            warning_reasons.append(
                "progress_stall"
            )

        if cost_risk_score >= 60:
            warning_reasons.append(
                "cost_pressure"
            )

        if not warning_reasons:
            warning_reasons.append(
                "elevated_overall_risk"
            )


    # -----------------------------
    # Final response
    # -----------------------------
    return {
        "project_code": str(project_code),

        "snapshot_year": (
            int(row["snapshot_year"])
            if pd.notna(row["snapshot_year"])
            else None
        ),

        "snapshot_month": (
            int(row["snapshot_month_num"])
            if pd.notna(row["snapshot_month_num"])
            else None
        ),

        "predicted_cost_overrun_pct": round(
            predicted_cost_overrun_pct,
            4
        ),

        "future_delay_probability": round(
            delay_probability,
            6
        ),

        "future_progress_stall_probability": round(
            stall_probability,
            6
        ),

        "cost_risk_score": round(
            cost_risk_score,
            4
        ),

        "overall_risk_score": round(
            overall_risk_score,
            4
        ),

        "risk_level": risk_level,

        "early_warning_active":
            early_warning_active,

        "early_warning_priority":
            early_warning_priority,

        "early_warning_reasons":
            warning_reasons,
    }


def list_projects(limit=100):
    """Return available project codes."""

    codes = sorted(
        DATA["project_code"]
        .dropna()
        .astype(str)
        .unique()
    )

    return codes[:limit]