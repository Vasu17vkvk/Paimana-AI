import math

from flask import Blueprint, jsonify

from app.models.project import Project


projects_bp = Blueprint("projects", __name__)


def json_safe(value):
    """
    Convert NaN / Infinity values into JSON-safe None.
    Keep all other values unchanged.
    """
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return None

    return value


@projects_bp.get("/projects")
def get_projects():
    projects = Project.query.all()

    return jsonify([
        {
            "project_code": json_safe(p.project_code),
            "project_name": json_safe(p.project_name),
            "sector": json_safe(p.sector),
            "ministry": json_safe(p.ministry),

            "original_cost_cr": json_safe(
                p.original_cost_cr
            ),

            "revised_cost_cr": json_safe(
                p.revised_cost_cr
            ),

            "expenditure_cr": json_safe(
                p.expenditure_cr
            ),

            "original_end_date": json_safe(
                p.original_end_date
            ),

            "revised_end_date": json_safe(
                p.revised_end_date
            ),

            "cost_overrun_pct": json_safe(
                p.cost_overrun_pct
            ),

            "delay_days": json_safe(
                p.delay_days
            ),

            "schedule_status": json_safe(
                p.schedule_status
            ),

            "cost_status": json_safe(
                p.cost_status
            ),

            "is_delayed": json_safe(
                p.is_delayed
            ),

            "has_cost_overrun": json_safe(
                p.has_cost_overrun
            ),

            "flash_latest_expenditure": json_safe(
                p.flash_latest_expenditure
            ),

            "flash_latest_physical_progress": json_safe(
                p.flash_latest_physical_progress
            ),

            "flash_state": json_safe(
                p.flash_state
            ),

            "flash_implementing_agency": json_safe(
                p.flash_implementing_agency
            ),

            "coverage_status": json_safe(
                p.coverage_status
            ),
        }
        for p in projects
    ])