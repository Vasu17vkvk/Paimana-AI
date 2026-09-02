from app.services.risk_service import get_project_risk


def get_project_delay(project_code: str) -> dict:
    risk = get_project_risk(project_code)

    return {
        "project_code": risk["project_code"],
        "snapshot_year": risk["snapshot_year"],
        "snapshot_month": risk["snapshot_month"],
        "future_delay_probability": risk["future_delay_probability"],
        "risk_level": risk["risk_level"],
    }