from flask import Blueprint, jsonify
from sqlalchemy import func

from app.extensions import db
from app.models.project import Project


delay_bp = Blueprint("delay", __name__)


@delay_bp.get("/delay/summary")
def delay_summary():

    total_projects = Project.query.count()

    delayed_projects = Project.query.filter(
        Project.is_delayed == 1
    ).count()

    not_delayed_projects = Project.query.filter(
        Project.is_delayed == 0
    ).count()

    avg_delay_days = db.session.query(
        func.avg(Project.delay_days)
    ).filter(
        Project.delay_days.isnot(None)
    ).scalar() or 0

    max_delay_days = db.session.query(
        func.max(Project.delay_days)
    ).filter(
        Project.delay_days.isnot(None)
    ).scalar() or 0

    schedule_data = db.session.query(
        Project.schedule_status,
        func.count(Project.project_code)
    ).group_by(
        Project.schedule_status
    ).order_by(
        func.count(Project.project_code).desc()
    ).all()

    return jsonify({
        "total_projects": total_projects,
        "delayed_projects": delayed_projects,
        "not_delayed_projects": not_delayed_projects,

        "delay_percentage": round(
            (delayed_projects / total_projects) * 100,
            2
        ) if total_projects else 0,

        "average_delay_days": round(
            float(avg_delay_days),
            2
        ),

        "maximum_delay_days": round(
            float(max_delay_days),
            2
        ),

        "schedule_status": [
            {
                "status": status or "Unknown",
                "projects": count
            }
            for status, count in schedule_data
        ]
    })


@delay_bp.get("/delay/projects")
def delay_projects():

    projects = Project.query.filter(
        Project.is_delayed == 1
    ).order_by(
        Project.delay_days.desc().nullslast()
    ).all()

    return jsonify([
        {
            "project_code": p.project_code,
            "project_name": p.project_name,
            "sector": p.sector,
            "ministry": p.ministry,

            "original_end_date": p.original_end_date,
            "revised_end_date": p.revised_end_date,

            "delay_days": p.delay_days,
            "delay_months": p.delay_months,

            "schedule_change_days": p.schedule_change_days,
            "max_delay_days": p.max_delay_days,

            "schedule_status": p.schedule_status,
            "is_delayed": p.is_delayed
        }
        for p in projects
    ])


@delay_bp.get("/delay/project/<int:project_code>")
def project_delay(project_code):

    project = Project.query.filter_by(
        project_code=project_code
    ).first()

    if not project:
        return jsonify({
            "error": "Project not found"
        }), 404

    return jsonify({
        "project_code": project.project_code,
        "project_name": project.project_name,
        "sector": project.sector,
        "ministry": project.ministry,

        "original_end_date": project.original_end_date,
        "revised_end_date": project.revised_end_date,

        "delay_days": project.delay_days,
        "delay_months": project.delay_months,

        "schedule_change_days": project.schedule_change_days,
        "max_schedule_change_days": project.max_schedule_change_days,
        "final_schedule_change_days": project.final_schedule_change_days,
        "max_delay_days": project.max_delay_days,

        "schedule_status": project.schedule_status,
        "is_delayed": project.is_delayed,
        "is_accelerated": project.is_accelerated
    })