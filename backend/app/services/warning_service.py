from pathlib import Path

import pandas as pd

from app.config.development import DevelopmentConfig
from app.services.risk_service import get_project_risk


def _find_column(df: pd.DataFrame, candidates: list[str]) -> str | None:
    """
    Find a dataframe column using case-insensitive matching.
    Also ignores spaces, underscores and hyphens.
    """
    normalized = {
        str(col).strip().lower().replace(" ", "").replace("_", "").replace("-", ""): col
        for col in df.columns
    }

    for candidate in candidates:
        key = (
            candidate.strip()
            .lower()
            .replace(" ", "")
            .replace("_", "")
            .replace("-", "")
        )

        if key in normalized:
            return normalized[key]

    return None


def get_project_warnings(project_code: str) -> dict:
    risk = get_project_risk(project_code)

    return {
        "project_code": risk["project_code"],
        "snapshot_year": risk["snapshot_year"],
        "snapshot_month": risk["snapshot_month"],
        "early_warning_active": risk["early_warning_active"],
        "early_warning_priority": risk["early_warning_priority"],
        "early_warning_reasons": risk["early_warning_reasons"],
        "risk_level": risk["risk_level"],
        "overall_risk_score": risk["overall_risk_score"],
    }


def get_active_warnings() -> list[dict]:
    data_dir = Path(DevelopmentConfig.ML_DATA_DIR)
    csv_path = data_dir / "PAIMANA_ML_READY_WITH_PROJECT_CODE.csv"

    if not csv_path.exists():
        raise FileNotFoundError(
            f"ML data file not found: {csv_path}"
        )

    df = pd.read_csv(csv_path)

    # Detect actual project-code column
    project_code_col = _find_column(
        df,
        [
            "Project Code",
            "ProjectCode",
            "project_code",
            "projectcode",
            "Code",
            "Project ID",
            "Project_ID",
        ],
    )

    if project_code_col is None:
        raise ValueError(
            f"Could not identify project-code column. "
            f"Available columns: {list(df.columns)}"
        )

    # Detect snapshot year/month columns
    year_col = _find_column(
        df,
        [
            "Snapshot Year",
            "snapshot_year",
            "SnapshotYear",
            "Year",
        ],
    )

    month_col = _find_column(
        df,
        [
            "Snapshot Month",
            "snapshot_month",
            "SnapshotMonth",
            "Month",
        ],
    )

    # Sort by latest snapshot where possible
    sort_columns = []

    if year_col:
        sort_columns.append(year_col)

    if month_col:
        sort_columns.append(month_col)

    if sort_columns:
        df = df.sort_values(sort_columns)

    # One latest row per project
    latest_df = df.drop_duplicates(
        subset=[project_code_col],
        keep="last",
    )

    warnings = []

    for raw_project_code in latest_df[project_code_col].tolist():

        if pd.isna(raw_project_code):
            continue

        project_code = str(raw_project_code).strip()

        try:
            risk = get_project_risk(project_code)
        except Exception:
            continue

        if risk["early_warning_active"]:
            warnings.append(
                {
                    "project_code": risk["project_code"],
                    "snapshot_year": risk["snapshot_year"],
                    "snapshot_month": risk["snapshot_month"],
                    "risk_level": risk["risk_level"],
                    "overall_risk_score": risk["overall_risk_score"],
                    "early_warning_priority": risk[
                        "early_warning_priority"
                    ],
                    "early_warning_reasons": risk[
                        "early_warning_reasons"
                    ],
                }
            )

    return warnings