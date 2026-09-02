import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parent
MODEL_DIR = ROOT / "models"
DATA_PATH = ROOT / "PAIMANA_ML_READY_WITH_PROJECT_CODE.csv"


# --------------------------------------------------
# Load feature contract
# --------------------------------------------------
with open(
    MODEL_DIR / "feature_contract.json",
    encoding="utf-8",
) as f:
    CONTRACT = json.load(f)


# --------------------------------------------------
# Load trained ML models
# --------------------------------------------------
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


# --------------------------------------------------
# Authoritative thresholds from ML package
# --------------------------------------------------
LOW_THRESHOLD = 40.0
MEDIUM_THRESHOLD = 70.0
HIGH_THRESHOLD = 85.0

EARLY_WARNING_THRESHOLD = 70.0
CRITICAL_RISK_THRESHOLD = 85.0


def _load_project_data():
    if not DATA_PATH.exists():
        raise FileNotFoundError(
            f"ML dataset not found: {DATA_PATH}"
        )

    data = pd.read_csv(DATA_PATH)

    data = data.loc[
        :,
        ~data.columns.duplicated(),
    ].copy()

    return data


DATA = _load_project_data()


# --------------------------------------------------
# Helpers
# --------------------------------------------------
def _risk_level(score_value: float) -> str:
    if score_value >= HIGH_THRESHOLD:
        return "CRITICAL"

    if score_value >= MEDIUM_THRESHOLD:
        return "HIGH"

    if score_value >= LOW_THRESHOLD:
        return "MEDIUM"

    return "LOW"


def _warning_details(
    overall_risk_score,
    delay_probability,
    stall_probability,
    cost_risk_score,
):
    early_warning_active = (
        overall_risk_score >= EARLY_WARNING_THRESHOLD
    )

    if overall_risk_score >= CRITICAL_RISK_THRESHOLD:
        priority = "IMMEDIATE"

    elif early_warning_active:
        priority = "HIGH"

    else:
        priority = "NONE"

    reasons = []

    # Important:
    # individual probabilities do NOT independently
    # create an alert.
    if early_warning_active:

        if delay_probability >= 0.60:
            reasons.append("future_delay")

        if stall_probability >= 0.60:
            reasons.append("progress_stall")

        if cost_risk_score >= 60:
            reasons.append("cost_pressure")

        if not reasons:
            reasons.append(
                "elevated_overall_risk"
            )

    return (
        early_warning_active,
        priority,
        reasons,
    )


def _latest_rows(data):
    """
    Keep latest chronological ML snapshot
    for every project.
    """

    ordered = data.sort_values(
        [
            "project_code",
            "snapshot_year",
            "snapshot_month_num",
        ]
    )

    latest = ordered.groupby(
        "project_code",
        as_index=False,
    ).tail(1)

    return latest.reset_index(drop=True)


def _build_result(
    row,
    predicted_cost_overrun_pct,
    delay_probability,
    stall_probability,
    cost_risk_score,
    overall_risk_score,
):
    risk_level = _risk_level(
        overall_risk_score
    )

    (
        warning_active,
        warning_priority,
        warning_reasons,
    ) = _warning_details(
        overall_risk_score,
        delay_probability,
        stall_probability,
        cost_risk_score,
    )

    project_code = row["project_code"]

    # Prevent 400005.0 style IDs
    try:
        project_code = str(
            int(float(project_code))
        )
    except (ValueError, TypeError):
        project_code = str(project_code)

    return {
        "project_code": project_code,

        "snapshot_year": int(
            row["snapshot_year"]
        ),

        "snapshot_month": int(
            row["snapshot_month_num"]
        ),

        "predicted_cost_overrun_pct": round(
            float(predicted_cost_overrun_pct),
            6,
        ),

        "future_delay_probability": round(
            float(delay_probability),
            6,
        ),

        "future_progress_stall_probability": round(
            float(stall_probability),
            6,
        ),

        "cost_risk_score": round(
            float(cost_risk_score),
            4,
        ),

        "overall_risk_score": round(
            float(overall_risk_score),
            4,
        ),

        "risk_level": risk_level,

        "early_warning_active": bool(
            warning_active
        ),

        "early_warning_priority":
            warning_priority,

        "early_warning_reasons":
            warning_reasons,
    }


# --------------------------------------------------
# Single project prediction
# --------------------------------------------------
def score(project_code):
    rows = DATA[
        DATA["project_code"].astype(str)
        == str(project_code)
    ]

    if rows.empty:
        raise ValueError(
            f"Project code not found: {project_code}"
        )

    row = rows.sort_values(
        [
            "snapshot_year",
            "snapshot_month_num",
        ]
    ).iloc[-1]

    X = row[
        CONTRACT["features"]
    ].to_frame().T

    X_cost = row[
        CONTRACT["cost_features"]
    ].to_frame().T


    # Delay probability
    raw_delay = (
        DELAY_MODEL
        .predict_proba(X)[:, 1]
    )

    delay_probability = float(
        DELAY_CAL.predict_proba(
            raw_delay.reshape(-1, 1)
        )[0, 1]
    )


    # Progress stall probability
    raw_stall = (
        STALL_MODEL
        .predict_proba(X)[:, 1]
    )

    stall_probability = float(
        STALL_CAL.predict_proba(
            raw_stall.reshape(-1, 1)
        )[0, 1]
    )


    # Cost overrun prediction
    predicted_cost_overrun_pct = max(
        0.0,
        float(
            COST_MODEL.predict(
                X_cost
            )[0]
        ),
    )


    # Cost risk score
    cost_reference = float(
        CONTRACT[
            "cost_risk_reference_percentile"
        ]
    )

    cost_risk_score = float(
        np.clip(
            predicted_cost_overrun_pct
            / cost_reference
            * 100.0,
            0.0,
            100.0,
        )
    )


    # Overall risk
    overall_risk_score = float(
        np.clip(
            0.30 * cost_risk_score
            + 0.35
            * delay_probability
            * 100
            + 0.35
            * stall_probability
            * 100,
            0.0,
            100.0,
        )
    )


    return _build_result(
        row,
        predicted_cost_overrun_pct,
        delay_probability,
        stall_probability,
        cost_risk_score,
        overall_risk_score,
    )


# --------------------------------------------------
# Batch prediction
# --------------------------------------------------
def score_all():
    """
    Generate predictions for latest snapshot
    of every ML-covered project.

    Models are executed in batch, making this
    much faster than calling score() repeatedly.
    """

    latest = _latest_rows(DATA)

    X = latest[
        CONTRACT["features"]
    ]

    X_cost = latest[
        CONTRACT["cost_features"]
    ]


    # -----------------------------
    # Delay probabilities
    # -----------------------------
    raw_delay = (
        DELAY_MODEL
        .predict_proba(X)[:, 1]
    )

    delay_probabilities = (
        DELAY_CAL
        .predict_proba(
            raw_delay.reshape(-1, 1)
        )[:, 1]
    )


    # -----------------------------
    # Progress stall probabilities
    # -----------------------------
    raw_stall = (
        STALL_MODEL
        .predict_proba(X)[:, 1]
    )

    stall_probabilities = (
        STALL_CAL
        .predict_proba(
            raw_stall.reshape(-1, 1)
        )[:, 1]
    )


    # -----------------------------
    # Cost overrun
    # -----------------------------
    cost_predictions = (
        COST_MODEL.predict(X_cost)
    )

    cost_predictions = np.maximum(
        cost_predictions,
        0.0,
    )


    # -----------------------------
    # Cost risk
    # -----------------------------
    cost_reference = float(
        CONTRACT[
            "cost_risk_reference_percentile"
        ]
    )

    cost_risk_scores = np.clip(
        cost_predictions
        / cost_reference
        * 100.0,
        0.0,
        100.0,
    )


    # -----------------------------
    # Overall risk
    # -----------------------------
    overall_scores = np.clip(
        0.30 * cost_risk_scores
        + 0.35
        * delay_probabilities
        * 100
        + 0.35
        * stall_probabilities
        * 100,
        0.0,
        100.0,
    )


    # -----------------------------
    # Response
    # -----------------------------
    results = []

    for i in range(len(latest)):
        results.append(
            _build_result(
                latest.iloc[i],
                cost_predictions[i],
                delay_probabilities[i],
                stall_probabilities[i],
                cost_risk_scores[i],
                overall_scores[i],
            )
        )

    return results