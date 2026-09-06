from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import joblib


BASE_DIR = Path(__file__).resolve().parents[2]
MODEL_DIR = BASE_DIR / "models"


def _load_json(
    path: Path,
) -> dict[str, Any]:
    with path.open(
        "r",
        encoding="utf-8",
    ) as file:
        return json.load(file)


def load_artifacts() -> dict[str, Any]:
    required_files = [
        "feature_contract.json",
        "metrics.json",
        "cost_overrun_model.joblib",
        "future_delay_model.joblib",
        "future_delay_calibrator.joblib",
        "future_progress_stall_model.joblib",
        "future_progress_stall_calibrator.joblib",
    ]

    missing = [
        name
        for name in required_files
        if not (
            MODEL_DIR / name
        ).exists()
    ]

    if missing:
        raise FileNotFoundError(
            "Missing ML artifacts: "
            + ", ".join(missing)
        )

    contract = _load_json(
        MODEL_DIR / "feature_contract.json"
    )

    metrics = _load_json(
        MODEL_DIR / "metrics.json"
    )

    return {
        "contract": contract,
        "metrics": metrics,
        "cost_model": joblib.load(
            MODEL_DIR
            / "cost_overrun_model.joblib"
        ),
        "delay_model": joblib.load(
            MODEL_DIR
            / "future_delay_model.joblib"
        ),
        "delay_calibrator": joblib.load(
            MODEL_DIR
            / "future_delay_calibrator.joblib"
        ),
        "stall_model": joblib.load(
            MODEL_DIR
            / "future_progress_stall_model.joblib"
        ),
        "stall_calibrator": joblib.load(
            MODEL_DIR
            / "future_progress_stall_calibrator.joblib"
        ),
    }