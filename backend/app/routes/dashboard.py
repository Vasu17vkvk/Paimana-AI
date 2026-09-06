from flask import Blueprint, jsonify, request
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

    # ---------------------------------------------------------
    # Dashboard filters
    # ---------------------------------------------------------
    ministry = request.args.get("ministry")
    sector = request.args.get("sector")
    state = request.args.get("state")
    status = request.args.get("status")

    # Start with all projects
    query = Project.query

    # Apply PostgreSQL filters
    if ministry and ministry != "All Ministries":
        query = query.filter(Project.ministry == ministry)

    if sector and sector != "All Sectors":
        query = query.filter(Project.sector == sector)

    if state and state != "All States":
        query = query.filter(Project.flash_state == state)

    if status and status != "All Statuses":
        if status == "Delayed":
            query = query.filter(Project.is_delayed == 1)

        elif status == "Ongoing":
            query = query.filter(
                Project.schedule_status == "Ongoing"
            )

        elif status == "Completed":
            query = query.filter(
                Project.schedule_status == "Completed"
            )

    # ---------------------------------------------------------
    # Filtered summary
    # ---------------------------------------------------------
    total_projects = query.count()

    delayed_projects = query.filter(
        Project.is_delayed == 1
    ).count()

    cost_overrun_projects = query.filter(
        Project.has_cost_overrun == 1
    ).count()

    on_schedule_projects = query.filter(
        Project.schedule_status == "On Schedule"
    ).count()

    total_original_cost = db.session.query(
        func.sum(Project.original_cost_cr)
    ).select_from(Project)

    total_revised_cost = db.session.query(
        func.sum(Project.revised_cost_cr)
    ).select_from(Project)

    total_expenditure = db.session.query(
        func.sum(Project.expenditure_cr)
    ).select_from(Project)

    avg_progress = db.session.query(
        func.avg(Project.flash_latest_physical_progress)
    ).select_from(Project)

    # Apply same filters to aggregate queries
    def apply_filters(q):
        if ministry and ministry != "All Ministries":
            q = q.filter(Project.ministry == ministry)

        if sector and sector != "All Sectors":
            q = q.filter(Project.sector == sector)

        if state and state != "All States":
            q = q.filter(Project.flash_state == state)

        if status and status != "All Statuses":
            if status == "Delayed":
                q = q.filter(Project.is_delayed == 1)

            elif status == "Ongoing":
                q = q.filter(
                    Project.schedule_status == "Ongoing"
                )

            elif status == "Completed":
                q = q.filter(
                    Project.schedule_status == "Completed"
                )

        return q

    total_original_cost = apply_filters(
        total_original_cost
    ).scalar() or 0

    total_revised_cost = apply_filters(
        total_revised_cost
    ).scalar() or 0

    total_expenditure = apply_filters(
        total_expenditure
    ).scalar() or 0

    avg_progress = apply_filters(
        avg_progress
    ).scalar() or 0

    # ---------------------------------------------------------
    # Distributions
    # ---------------------------------------------------------
    sector_data = apply_filters(
        db.session.query(
            Project.sector,
            func.count(Project.project_code)
        )
    ).group_by(
        Project.sector
    ).order_by(
        func.count(Project.project_code).desc()
    ).all()

    ministry_data = apply_filters(
        db.session.query(
            Project.ministry,
            func.count(Project.project_code)
        )
    ).group_by(
        Project.ministry
    ).order_by(
        func.count(Project.project_code).desc()
    ).all()

    state_data = apply_filters(
        db.session.query(
            Project.flash_state,
            func.count(Project.project_code)
        )
    ).group_by(
        Project.flash_state
    ).order_by(
        func.count(Project.project_code).desc()
    ).all()

    schedule_data = apply_filters(
        db.session.query(
            Project.schedule_status,
            func.count(Project.project_code)
        )
    ).group_by(
        Project.schedule_status
    ).all()

    cost_status_data = apply_filters(
        db.session.query(
            Project.cost_status,
            func.count(Project.project_code)
        )
    ).group_by(
        Project.cost_status
    ).all()

    return jsonify({
        "summary": {
            "total_projects": total_projects,
            "delayed_projects": delayed_projects,
            "cost_overrun_projects": cost_overrun_projects,
            "on_schedule_projects": on_schedule_projects,
            "total_original_cost_cr": round(
                float(total_original_cost), 2
            ),
            "total_revised_cost_cr": round(
                float(total_revised_cost), 2
            ),
            "total_expenditure_cr": round(
                float(total_expenditure), 2
            ),
            "average_physical_progress_pct": round(
                float(avg_progress), 2
            )
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