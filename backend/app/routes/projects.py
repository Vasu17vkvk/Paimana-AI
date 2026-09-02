from flask import Blueprint, jsonify
from app.models.project import Project

projects_bp = Blueprint("projects", __name__)


@projects_bp.get("/projects")
def get_projects():
    projects = Project.query.all()

    return jsonify([
        {
            "project_code": p.project_code,
            "project_name": p.project_name,
            "sector": p.sector,
            "ministry": p.ministry,
            "original_cost_cr": p.original_cost_cr,
            "revised_cost_cr": p.revised_cost_cr,
            "expenditure_cr": p.expenditure_cr,
            "original_end_date": p.original_end_date,
            "revised_end_date": p.revised_end_date,
            "cost_overrun_pct": p.cost_overrun_pct,
            "delay_days": p.delay_days,
            "schedule_status": p.schedule_status,
            "cost_status": p.cost_status,
            "is_delayed": p.is_delayed,
            "has_cost_overrun": p.has_cost_overrun,
            "flash_latest_expenditure": p.flash_latest_expenditure,
            "flash_latest_physical_progress": p.flash_latest_physical_progress,
            "flash_state": p.flash_state,
            "flash_implementing_agency": p.flash_implementing_agency,
            "coverage_status": p.coverage_status
        }
        for p in projects
    ])