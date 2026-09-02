from flask import Blueprint, jsonify, request
from sqlalchemy import func

from app.extensions import db
from app.models.risk import RiskTrainingData


risk_bp = Blueprint("risk", __name__)


# Overall risk summary
@risk_bp.get("/risk/summary")
def risk_summary():

    total_records = RiskTrainingData.query.count()

    high_risk_records = RiskTrainingData.query.filter(
        RiskTrainingData.future_delay_flag == 1
    ).count()

    low_risk_records = RiskTrainingData.query.filter(
        RiskTrainingData.future_delay_flag == 0
    ).count()

    avg_delay = db.session.query(
        func.avg(RiskTrainingData.delay_days)
    ).scalar() or 0

    avg_cost_overrun = db.session.query(
        func.avg(RiskTrainingData.cost_overrun_pct)
    ).scalar() or 0

    return jsonify({
        "total_records": total_records,
        "high_risk_records": high_risk_records,
        "low_risk_records": low_risk_records,
        "high_risk_percentage": round(
            (high_risk_records / total_records) * 100, 2
        ) if total_records else 0,
        "average_delay_days": round(float(avg_delay), 2),
        "average_cost_overrun_pct": round(
            float(avg_cost_overrun), 2
        )
    })


# Risk records for a particular project
@risk_bp.get("/risk/project/<int:project_code>")
def project_risk(project_code):

    records = RiskTrainingData.query.filter(
        RiskTrainingData.project_code == project_code
    ).order_by(
        RiskTrainingData.snapshot_year,
        RiskTrainingData.snapshot_month_num
    ).all()

    if not records:
        return jsonify({
            "error": "Project risk data not found"
        }), 404

    return jsonify({
        "project_code": project_code,
        "records": [
            {
                "id": r.id,
                "snapshot_year": r.snapshot_year,
                "snapshot_month": r.snapshot_month_num,
                "future_delay_flag": r.future_delay_flag,
                "delay_days": r.delay_days,
                "cost_overrun_pct": r.cost_overrun_pct,
                "physical_progress_pct": r.physical_progress_pct,
                "progress_change_pct": r.progress_change_pct,
                "expenditure_cr": r.expenditure_cr,
                "expenditure_change_cr_flash": r.expenditure_change_cr_flash,
                "flash_history_count": r.flash_history_count
            }
            for r in records
        ]
    })