from flask import Blueprint, jsonify
from sqlalchemy import or_

from app.models.project import Project


early_warnings_bp = Blueprint("early_warnings", __name__)


@early_warnings_bp.get("/early-warnings/summary")
def early_warnings_summary():

    total_projects = Project.query.count()

    high_delay = Project.query.filter(
        Project.delay_days > 365
    ).count()

    high_cost_overrun = Project.query.filter(
        Project.cost_overrun_pct > 20
    ).count()

    low_progress = Project.query.filter(
        Project.flash_low_progress_flag == 1
    ).count()

    progress_stagnation = Project.query.filter(
        Project.flash_progress_stagnation_flag == 1
    ).count()

    expenditure_growth = Project.query.filter(
        Project.flash_expenditure_growth_flag == 1
    ).count()

    extreme_schedule_change = Project.query.filter(
        Project.extreme_schedule_change_flag == 1
    ).count()

    warning_projects = Project.query.filter(
        or_(
            Project.delay_days > 365,
            Project.cost_overrun_pct > 20,
            Project.flash_low_progress_flag == 1,
            Project.flash_progress_stagnation_flag == 1,
            Project.flash_expenditure_growth_flag == 1,
            Project.extreme_schedule_change_flag == 1
        )
    ).count()

    return jsonify({
        "total_projects": total_projects,
        "warning_projects": warning_projects,

        "warning_percentage": round(
            (warning_projects / total_projects) * 100,
            2
        ) if total_projects else 0,

        "warning_breakdown": {
            "high_delay": high_delay,
            "high_cost_overrun": high_cost_overrun,
            "low_progress": low_progress,
            "progress_stagnation": progress_stagnation,
            "expenditure_growth": expenditure_growth,
            "extreme_schedule_change": extreme_schedule_change
        }
    })


@early_warnings_bp.get("/early-warnings/projects")
def early_warning_projects():

    projects = Project.query.filter(
        or_(
            Project.delay_days > 365,
            Project.cost_overrun_pct > 20,
            Project.flash_low_progress_flag == 1,
            Project.flash_progress_stagnation_flag == 1,
            Project.flash_expenditure_growth_flag == 1,
            Project.extreme_schedule_change_flag == 1
        )
    ).all()

    result = []

    for p in projects:

        warnings = []

        if p.delay_days is not None and p.delay_days > 365:
            warnings.append("High Delay")

        if (
            p.cost_overrun_pct is not None
            and p.cost_overrun_pct > 20
        ):
            warnings.append("High Cost Overrun")

        if p.flash_low_progress_flag == 1:
            warnings.append("Low Physical Progress")

        if p.flash_progress_stagnation_flag == 1:
            warnings.append("Progress Stagnation")

        if p.flash_expenditure_growth_flag == 1:
            warnings.append("Rapid Expenditure Growth")

        if p.extreme_schedule_change_flag == 1:
            warnings.append("Extreme Schedule Change")

        result.append({
            "project_code": p.project_code,
            "project_name": p.project_name,
            "sector": p.sector,
            "ministry": p.ministry,
            "state": p.flash_state,

            "delay_days": p.delay_days,
            "cost_overrun_pct": p.cost_overrun_pct,
            "physical_progress_pct": p.flash_latest_physical_progress,

            "schedule_status": p.schedule_status,
            "cost_status": p.cost_status,

            "warning_count": len(warnings),
            "warnings": warnings
        })

    result.sort(
        key=lambda x: x["warning_count"],
        reverse=True
    )

    return jsonify(result)


@early_warnings_bp.get(
    "/early-warnings/project/<int:project_code>"
)
def project_early_warning(project_code):

    project = Project.query.filter_by(
        project_code=project_code
    ).first()

    if not project:
        return jsonify({
            "error": "Project not found"
        }), 404

    warnings = []

    if (
        project.delay_days is not None
        and project.delay_days > 365
    ):
        warnings.append({
            "type": "High Delay",
            "value": project.delay_days,
            "severity": "High"
        })

    if (
        project.cost_overrun_pct is not None
        and project.cost_overrun_pct > 20
    ):
        warnings.append({
            "type": "High Cost Overrun",
            "value": project.cost_overrun_pct,
            "severity": "High"
        })

    if project.flash_low_progress_flag == 1:
        warnings.append({
            "type": "Low Physical Progress",
            "value": project.flash_latest_physical_progress,
            "severity": "Medium"
        })

    if project.flash_progress_stagnation_flag == 1:
        warnings.append({
            "type": "Progress Stagnation",
            "severity": "High"
        })

    if project.flash_expenditure_growth_flag == 1:
        warnings.append({
            "type": "Rapid Expenditure Growth",
            "severity": "Medium"
        })

    if project.extreme_schedule_change_flag == 1:
        warnings.append({
            "type": "Extreme Schedule Change",
            "value": project.max_schedule_change_days,
            "severity": "High"
        })

    return jsonify({
        "project_code": project.project_code,
        "project_name": project.project_name,
        "sector": project.sector,
        "ministry": project.ministry,
        "state": project.flash_state,

        "warning_count": len(warnings),

        "risk_level": (
            "Critical"
            if len(warnings) >= 4
            else "High"
            if len(warnings) >= 2
            else "Medium"
            if len(warnings) == 1
            else "Low"
        ),

        "warnings": warnings
    })