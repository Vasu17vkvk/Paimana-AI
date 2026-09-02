from flask import Blueprint, jsonify
from sqlalchemy import func

from app.extensions import db
from app.models.project import Project


analytics_bp = Blueprint("analytics", __name__)


@analytics_bp.get("/analytics/summary")
def analytics_summary():

    total_projects = Project.query.count()

    avg_progress = db.session.query(
        func.avg(Project.flash_latest_physical_progress)
    ).filter(
        Project.flash_latest_physical_progress.isnot(None)
    ).scalar() or 0

    avg_delay = db.session.query(
        func.avg(Project.delay_days)
    ).filter(
        Project.delay_days.isnot(None)
    ).scalar() or 0

    avg_cost_overrun = db.session.query(
        func.avg(Project.cost_overrun_pct)
    ).filter(
        Project.cost_overrun_pct.isnot(None)
    ).scalar() or 0

    avg_expenditure_pct = db.session.query(
        func.avg(Project.expenditure_pct)
    ).filter(
        Project.expenditure_pct.isnot(None)
    ).scalar() or 0

    return jsonify({
        "total_projects": total_projects,
        "average_physical_progress_pct": round(
            float(avg_progress), 2
        ),
        "average_delay_days": round(
            float(avg_delay), 2
        ),
        "average_cost_overrun_pct": round(
            float(avg_cost_overrun), 2
        ),
        "average_expenditure_pct": round(
            float(avg_expenditure_pct), 2
        )
    })


@analytics_bp.get("/analytics/sectors")
def sector_analytics():

    data = db.session.query(
        Project.sector,
        func.count(Project.project_code).label("projects"),
        func.avg(Project.delay_days).label("avg_delay_days"),
        func.avg(Project.cost_overrun_pct).label(
            "avg_cost_overrun_pct"
        ),
        func.avg(
            Project.flash_latest_physical_progress
        ).label("avg_progress_pct")
    ).group_by(
        Project.sector
    ).order_by(
        func.count(Project.project_code).desc()
    ).all()

    return jsonify([
        {
            "sector": sector or "Unknown",
            "projects": projects,
            "average_delay_days": round(
                float(avg_delay or 0), 2
            ),
            "average_cost_overrun_pct": round(
                float(avg_cost or 0), 2
            ),
            "average_progress_pct": round(
                float(progress or 0), 2
            )
        }
        for (
            sector,
            projects,
            avg_delay,
            avg_cost,
            progress
        ) in data
    ])


@analytics_bp.get("/analytics/ministries")
def ministry_analytics():

    data = db.session.query(
        Project.ministry,
        func.count(Project.project_code).label("projects"),
        func.avg(Project.delay_days).label("avg_delay_days"),
        func.avg(Project.cost_overrun_pct).label(
            "avg_cost_overrun_pct"
        ),
        func.avg(
            Project.flash_latest_physical_progress
        ).label("avg_progress_pct")
    ).group_by(
        Project.ministry
    ).order_by(
        func.count(Project.project_code).desc()
    ).all()

    return jsonify([
        {
            "ministry": ministry or "Unknown",
            "projects": projects,
            "average_delay_days": round(
                float(avg_delay or 0), 2
            ),
            "average_cost_overrun_pct": round(
                float(avg_cost or 0), 2
            ),
            "average_progress_pct": round(
                float(progress or 0), 2
            )
        }
        for (
            ministry,
            projects,
            avg_delay,
            avg_cost,
            progress
        ) in data
    ])


@analytics_bp.get("/analytics/states")
def state_analytics():

    data = db.session.query(
        Project.flash_state,
        func.count(Project.project_code).label("projects"),
        func.avg(Project.delay_days).label("avg_delay_days"),
        func.avg(Project.cost_overrun_pct).label(
            "avg_cost_overrun_pct"
        ),
        func.avg(
            Project.flash_latest_physical_progress
        ).label("avg_progress_pct")
    ).group_by(
        Project.flash_state
    ).order_by(
        func.count(Project.project_code).desc()
    ).all()

    return jsonify([
        {
            "state": state or "Unknown",
            "projects": projects,
            "average_delay_days": round(
                float(avg_delay or 0), 2
            ),
            "average_cost_overrun_pct": round(
                float(avg_cost or 0), 2
            ),
            "average_progress_pct": round(
                float(progress or 0), 2
            )
        }
        for (
            state,
            projects,
            avg_delay,
            avg_cost,
            progress
        ) in data
    ])


@analytics_bp.get("/analytics/top-delayed")
def top_delayed_projects():

    projects = Project.query.filter(
        Project.delay_days.isnot(None)
    ).order_by(
        Project.delay_days.desc()
    ).limit(20).all()

    return jsonify([
        {
            "project_code": p.project_code,
            "project_name": p.project_name,
            "sector": p.sector,
            "ministry": p.ministry,
            "state": p.flash_state,
            "delay_days": p.delay_days,
            "schedule_status": p.schedule_status
        }
        for p in projects
    ])


@analytics_bp.get("/analytics/top-cost-overrun")
def top_cost_overrun_projects():

    projects = Project.query.filter(
        Project.cost_overrun_pct.isnot(None)
    ).order_by(
        Project.cost_overrun_pct.desc()
    ).limit(20).all()

    return jsonify([
        {
            "project_code": p.project_code,
            "project_name": p.project_name,
            "sector": p.sector,
            "ministry": p.ministry,
            "state": p.flash_state,
            "cost_overrun_pct": p.cost_overrun_pct,
            "cost_overrun_cr": p.cost_overrun_cr,
            "cost_status": p.cost_status
        }
        for p in projects
    ])