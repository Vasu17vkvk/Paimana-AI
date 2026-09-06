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

    def predict_batch(
        self,
        rows: pd.DataFrame,
        batch_size: int = 256,
    ) -> pd.DataFrame:
        """
        Vectorized portfolio prediction using the same models,
        calibrators, risk formula and warning rules as predict_row().

        This method is intended for portfolio-level workloads such as
        Early Warning and Project Analytics.
        """

        output_columns = [
            "project_code",
            "snapshot_year",
            "snapshot_month",
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

        if rows is None or rows.empty:
            return pd.DataFrame(
                columns=output_columns
            )

        features = self.contract["features"]
        cost_features = self.contract["cost_features"]

        # --------------------------------------------------------
        # Build numeric feature matrix
        # --------------------------------------------------------

        feature_data: dict[str, pd.Series] = {}

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
                )

            feature_data[column] = (
                series.astype(float)
            )

        X = pd.DataFrame(
            feature_data,
            index=rows.index,
            columns=features,
        )

        X_cost = X[
            cost_features
        ]

        # --------------------------------------------------------
        # Cost-risk reference
        # --------------------------------------------------------

        cost_reference = float(
            self.contract.get(
                "cost_risk_reference_percentile",
                1.0,
            )
            or 1.0
        )

        if cost_reference <= 0:
            cost_reference = 1.0

        result_parts: list[pd.DataFrame] = []

        # --------------------------------------------------------
        # Process in memory-safe batches
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

            original_rows = rows.iloc[
                start:end
            ].copy()

            # ====================================================
            # Future delay
            # ====================================================

            raw_delay = (
                self.delay_model
                .predict_proba(
                    X_batch[features]
                )[:, 1]
                .reshape(-1, 1)
            )

            delay_probability = (
                self.delay_calibrator
                .predict_proba(
                    raw_delay
                )[:, 1]
            )

            # ====================================================
            # Progress stall
            # ====================================================

            raw_stall = (
                self.stall_model
                .predict_proba(
                    X_batch[features]
                )[:, 1]
                .reshape(-1, 1)
            )

            stall_probability = (
                self.stall_calibrator
                .predict_proba(
                    raw_stall
                )[:, 1]
            )

            # ====================================================
            # Cost overrun
            # ====================================================

            predicted_cost = np.maximum(
                0.0,
                self.cost_model.predict(
                    X_cost_batch
                ),
            )

            # ====================================================
            # Cost risk
            # ====================================================

            cost_risk = np.clip(
                (
                    predicted_cost
                    / cost_reference
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
                    overall_risk >= HIGH_THRESHOLD,
                    overall_risk >= MEDIUM_THRESHOLD,
                    overall_risk >= LOW_THRESHOLD,
                ],
                [
                    "CRITICAL",
                    "HIGH",
                    "MEDIUM",
                ],
                default="LOW",
            )

            # ====================================================
            # Early warning
            # ====================================================

            early_warning_active = (
                overall_risk
                >= EARLY_WARNING_THRESHOLD
            )

            priority = np.where(
                overall_risk >= CRITICAL_RISK_THRESHOLD,
                "IMMEDIATE",
                np.where(
                    early_warning_active,
                    "HIGH",
                    "NONE",
                ),
            )

            # ====================================================
            # Build reasons
            #
            # Keep the exact same reason rules as predict_row().
            # ====================================================

            reasons: list[list[str]] = []

            for index in range(
                len(original_rows)
            ):
                row_reasons: list[str] = []

                if early_warning_active[index]:

                    if (
                        delay_probability[index]
                        >= 0.60
                    ):
                        row_reasons.append(
                            "future_delay"
                        )

                    if (
                        stall_probability[index]
                        >= 0.60
                    ):
                        row_reasons.append(
                            "progress_stall"
                        )

                    if (
                        cost_risk[index]
                        >= 60.0
                    ):
                        row_reasons.append(
                            "cost_pressure"
                        )

                    if not row_reasons:
                        row_reasons.append(
                            "elevated_overall_risk"
                        )

                reasons.append(
                    row_reasons
                )

            # ====================================================
            # Snapshot information
            # ====================================================

            project_codes = (
                original_rows[
                    "project_code"
                ]
                .astype(str)
                .str.strip()
                .values
            )

            if "snapshot_year" in original_rows.columns:
                snapshot_year = (
                    pd.to_numeric(
                        original_rows[
                            "snapshot_year"
                        ],
                        errors="coerce",
                    )
                    .astype("Int64")
                    .astype(object)
                )
            else:
                snapshot_year = pd.Series(
                    [None] * len(original_rows)
                )

            if "snapshot_month_num" in original_rows.columns:
                snapshot_month = (
                    pd.to_numeric(
                        original_rows[
                            "snapshot_month_num"
                        ],
                        errors="coerce",
                    )
                    .astype("Int64")
                    .astype(object)
                )
            else:
                snapshot_month = pd.Series(
                    [None] * len(original_rows)
                )

            batch_result = pd.DataFrame(
                {
                    "project_code":
                        project_codes,

                    "snapshot_year":
                        snapshot_year.values,

                    "snapshot_month":
                        snapshot_month.values,

                    "predicted_cost_overrun_pct":
                        np.round(
                            predicted_cost,
                            4,
                        ),

                    "future_delay_probability":
                        np.round(
                            delay_probability,
                            6,
                        ),

                    "future_progress_stall_probability":
                        np.round(
                            stall_probability,
                            6,
                        ),

                    "cost_risk_score":
                        np.round(
                            cost_risk,
                            4,
                        ),

                    "overall_risk_score":
                        np.round(
                            overall_risk,
                            4,
                        ),

                    "risk_level":
                        risk_level,

                    "early_warning_active":
                        early_warning_active,

                    "early_warning_priority":
                        priority,

                    "early_warning_reasons":
                        reasons,
                }
            )

            result_parts.append(
                batch_result
            )

        if not result_parts:
            return pd.DataFrame(
                columns=output_columns
            )

        return pd.concat(
            result_parts,
            ignore_index=True,
        )    

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