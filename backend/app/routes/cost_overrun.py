from flask import Blueprint, jsonify
from sqlalchemy import func, cast, Float

from app.extensions import db
from app.models.project import Project


cost_overrun_bp = Blueprint("cost_overrun", __name__)


# ============================================================
# COST OVERRUN SUMMARY
# ============================================================

@cost_overrun_bp.get("/cost-overrun/summary")
def cost_overrun_summary():

    total_projects = Project.query.count()

    overrun_projects = Project.query.filter(
        Project.has_cost_overrun == 1
    ).count()

    no_overrun_projects = Project.query.filter(
        Project.has_cost_overrun == 0
    ).count()

    # PostgreSQL NaN-safe calculations
    nan_value = cast("NaN", Float)

    avg_overrun_pct = db.session.query(
        func.avg(
            func.nullif(
                Project.cost_overrun_pct,
                nan_value
            )
        )
    ).scalar() or 0

    total_original_cost = db.session.query(
        func.sum(
            func.nullif(
                Project.original_cost_cr,
                nan_value
            )
        )
    ).scalar() or 0

    total_revised_cost = db.session.query(
        func.sum(
            func.nullif(
                Project.revised_cost_cr,
                nan_value
            )
        )
    ).scalar() or 0

    total_overrun = db.session.query(
        func.sum(
            func.nullif(
                Project.cost_overrun_cr,
                nan_value
            )
        )
    ).scalar() or 0

    return jsonify({
        "total_projects": total_projects,

        "overrun_projects": overrun_projects,

        "no_overrun_projects": no_overrun_projects,

        "overrun_percentage": round(
            (overrun_projects / total_projects) * 100,
            2
        ) if total_projects else 0,

        "average_cost_overrun_pct": round(
            float(avg_overrun_pct),
            2
        ),

        "total_original_cost_cr": round(
            float(total_original_cost),
            2
        ),

        "total_revised_cost_cr": round(
            float(total_revised_cost),
            2
        ),

        "total_cost_overrun_cr": round(
            float(total_overrun),
            2
        )
    })


# ============================================================
# ALL PROJECTS WITH COST OVERRUN
# ============================================================

@cost_overrun_bp.get("/cost-overrun/projects")
def cost_overrun_projects():

    projects = Project.query.filter(
        Project.has_cost_overrun == 1
    ).order_by(
        Project.cost_overrun_pct.desc().nullslast()
    ).all()

    return jsonify([
        {
            "project_code": p.project_code,
            "project_name": p.project_name,
            "sector": p.sector,
            "ministry": p.ministry,

            "original_cost_cr": p.original_cost_cr,
            "revised_cost_cr": p.revised_cost_cr,

            "cost_overrun_cr": p.cost_overrun_cr,
            "cost_overrun_pct": p.cost_overrun_pct,

            "cost_status": p.cost_status
        }
        for p in projects
    ])


# ============================================================
# COST OVERRUN DETAILS FOR ONE PROJECT
# ============================================================

@cost_overrun_bp.get("/cost-overrun/project/<int:project_code>")
def project_cost_overrun(project_code):

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

        "original_cost_cr": project.original_cost_cr,
        "revised_cost_cr": project.revised_cost_cr,

        "cost_overrun_cr": project.cost_overrun_cr,
        "cost_overrun_pct": project.cost_overrun_pct,

        "max_cost_overrun_pct": project.max_cost_overrun_pct,
        "final_cost_overrun_pct": project.final_cost_overrun_pct,

        "cost_revision_count": project.cost_revision_count,

        "cost_status": project.cost_status,
        "has_cost_overrun": project.has_cost_overrun
    })