from app.services.risk_service import get_project_risk


def get_project_cost(project_code: str) -> dict:
    risk = get_project_risk(project_code)

    return {
        "project_code": risk["project_code"],
        "snapshot_year": risk["snapshot_year"],
        "snapshot_month": risk["snapshot_month"],
        "predicted_cost_overrun_pct": risk["predicted_cost_overrun_pct"],
        "cost_risk_score": risk["cost_risk_score"],
        "risk_level": risk["risk_level"],
    }