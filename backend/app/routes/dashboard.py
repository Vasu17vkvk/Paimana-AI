from flask import Blueprint, jsonify
from sqlalchemy import text, func

from app.extensions import db
from app.models.project import Project


dashboard_bp = Blueprint("dashboard", __name__)


@dashboard_bp.get("/health")
def health_check():
    try:
        db.session.execute(text("SELECT 1"))

        return jsonify({
            "status": "ok",
            "service": "PAIMANA AI API",
            "database": "connected"
        })

    except Exception as e:
        return jsonify({
            "status": "error",
            "service": "PAIMANA AI API",
            "database": "disconnected",
            "error": str(e)
        }), 500


@dashboard_bp.get("/dashboard")
def dashboard():

    total_projects = Project.query.count()

    delayed_projects = Project.query.filter(
        Project.is_delayed == 1
    ).count()

    cost_overrun_projects = Project.query.filter(
        Project.has_cost_overrun == 1
    ).count()

    on_schedule_projects = Project.query.filter(
        Project.schedule_status == "On Schedule"
    ).count()

    total_original_cost = db.session.query(
        func.sum(Project.original_cost_cr)
    ).scalar() or 0

    total_revised_cost = db.session.query(
        func.sum(Project.revised_cost_cr)
    ).scalar() or 0

    total_expenditure = db.session.query(
        func.sum(Project.expenditure_cr)
    ).scalar() or 0

    avg_progress = db.session.query(
        func.avg(Project.flash_latest_physical_progress)
    ).scalar() or 0

    sector_data = db.session.query(
        Project.sector,
        func.count(Project.project_code)
    ).group_by(
        Project.sector
    ).order_by(
        func.count(Project.project_code).desc()
    ).all()

    ministry_data = db.session.query(
        Project.ministry,
        func.count(Project.project_code)
    ).group_by(
        Project.ministry
    ).order_by(
        func.count(Project.project_code).desc()
    ).all()

    state_data = db.session.query(
        Project.flash_state,
        func.count(Project.project_code)
    ).group_by(
        Project.flash_state
    ).order_by(
        func.count(Project.project_code).desc()
    ).all()

    schedule_data = db.session.query(
        Project.schedule_status,
        func.count(Project.project_code)
    ).group_by(
        Project.schedule_status
    ).all()

    cost_status_data = db.session.query(
        Project.cost_status,
        func.count(Project.project_code)
    ).group_by(
        Project.cost_status
    ).all()

    return jsonify({
        "summary": {
            "total_projects": total_projects,
            "delayed_projects": delayed_projects,
            "cost_overrun_projects": cost_overrun_projects,
            "on_schedule_projects": on_schedule_projects,
            "total_original_cost_cr": round(float(total_original_cost), 2),
            "total_revised_cost_cr": round(float(total_revised_cost), 2),
            "total_expenditure_cr": round(float(total_expenditure), 2),
            "average_physical_progress_pct": round(float(avg_progress), 2)
        },

        "sector_distribution": [
            {
                "sector": sector or "Unknown",
                "projects": count
            }
            for sector, count in sector_data
        ],

        "ministry_distribution": [
            {
                "ministry": ministry or "Unknown",
                "projects": count
            }
            for ministry, count in ministry_data
        ],

        "state_distribution": [
            {
                "state": state or "Unknown",
                "projects": count
            }
            for state, count in state_data
        ],

        "schedule_status": [
            {
                "status": status or "Unknown",
                "projects": count
            }
            for status, count in schedule_data
        ],

        "cost_status": [
            {
                "status": status or "Unknown",
                "projects": count
            }
            for status, count in cost_status_data
        ]
    })