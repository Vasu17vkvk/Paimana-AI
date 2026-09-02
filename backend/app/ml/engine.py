from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd


LOW_THRESHOLD = 40.0
MEDIUM_THRESHOLD = 70.0
HIGH_THRESHOLD = 85.0

EARLY_WARNING_THRESHOLD = 70.0
CRITICAL_RISK_THRESHOLD = 85.0


class PAIMANAMLEngine:
    def __init__(
        self,
        artifacts: dict[str, Any],
    ) -> None:
        self.contract = artifacts[
            "contract"
        ]

        self.cost_model = artifacts[
            "cost_model"
        ]

        self.delay_model = artifacts[
            "delay_model"
        ]

        self.delay_calibrator = artifacts[
            "delay_calibrator"
        ]

        self.stall_model = artifacts[
            "stall_model"
        ]

        self.stall_calibrator = artifacts[
            "stall_calibrator"
        ]

    @staticmethod
    def _probability(
        calibrator,
        model,
        X: pd.DataFrame,
    ) -> float:
        raw_probability = (
            model.predict_proba(X)[:, 1]
        )

        calibrated = (
            calibrator.predict_proba(
                raw_probability.reshape(
                    -1,
                    1,
                )
            )
        )

        return float(
            calibrated[0, 1]
        )

    @staticmethod
    def _risk_level(
        score: float,
    ) -> str:
        if score >= HIGH_THRESHOLD:
            return "CRITICAL"

        if score >= MEDIUM_THRESHOLD:
            return "HIGH"

        if score >= LOW_THRESHOLD:
            return "MEDIUM"

        return "LOW"

    def predict_row(
        self,
        row: pd.Series,
        project_code: str,
    ) -> dict[str, Any]:

        features = self.contract[
            "features"
        ]

        cost_features = self.contract[
            "cost_features"
        ]

        X = (
            row[features]
            .to_frame()
            .T
        )

        X_cost = (
            row[cost_features]
            .to_frame()
            .T
        )

        delay_probability = (
            self._probability(
                self.delay_calibrator,
                self.delay_model,
                X,
            )
        )

        stall_probability = (
            self._probability(
                self.stall_calibrator,
                self.stall_model,
                X,
            )
        )

        raw_cost_prediction = float(
            self.cost_model.predict(
                X_cost
            )[0]
        )

        predicted_cost_overrun_pct = max(
            0.0,
            raw_cost_prediction,
        )

        cost_reference = float(
            self.contract[
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

        overall_risk_score = float(
            0.30 * cost_risk_score
            + 0.35
            * delay_probability
            * 100.0
            + 0.35
            * stall_probability
            * 100.0
        )

        overall_risk_score = float(
            np.clip(
                overall_risk_score,
                0.0,
                100.0,
            )
        )

        risk_level = (
            self._risk_level(
                overall_risk_score
            )
        )

        early_warning_active = (
            overall_risk_score
            >= EARLY_WARNING_THRESHOLD
        )

        if (
            overall_risk_score
            >= CRITICAL_RISK_THRESHOLD
        ):
            priority = "IMMEDIATE"

        elif early_warning_active:
            priority = "HIGH"

        else:
            priority = "NONE"

        reasons: list[str] = []

        if early_warning_active:

            if delay_probability >= 0.60:
                reasons.append(
                    "future_delay"
                )

            if stall_probability >= 0.60:
                reasons.append(
                    "progress_stall"
                )

            if cost_risk_score >= 60:
                reasons.append(
                    "cost_pressure"
                )

            if not reasons:
                reasons.append(
                    "elevated_overall_risk"
                )

        return {
            "project_code": str(
                project_code
            ),

            "snapshot_year": (
                int(row["snapshot_year"])
                if pd.notna(
                    row["snapshot_year"]
                )
                else None
            ),

            "snapshot_month": (
                int(
                    row["snapshot_month_num"]
                )
                if pd.notna(
                    row[
                        "snapshot_month_num"
                    ]
                )
                else None
            ),

            "predicted_cost_overrun_pct": round(
                predicted_cost_overrun_pct,
                4,
            ),

            "future_delay_probability": round(
                delay_probability,
                6,
            ),

            "future_progress_stall_probability": round(
                stall_probability,
                6,
            ),

            "cost_risk_score": round(
                cost_risk_score,
                4,
            ),

            "overall_risk_score": round(
                overall_risk_score,
                4,
            ),

            "risk_level": risk_level,

            "early_warning_active": (
                early_warning_active
            ),

            "early_warning_priority": (
                priority
            ),

            "early_warning_reasons": reasons,
        }