from flask import Blueprint, jsonify, request

from app.services.project_analytics_service import (
    get_filter_options,
    get_matching_projects,
    get_portfolio_summary,
    get_project_detail,
    simulate_project,
)


project_analytics_bp = Blueprint(
    "project_analytics",
    __name__,
)


# ============================================================
# FILTER OPTIONS
# ============================================================

@project_analytics_bp.get(
    "/project-analytics/filter-options"
)
def project_analytics_filter_options():
    """
    Return all dropdown/filter options from the actual
    Project Analytics datasets.
    """

    try:
        return jsonify(
            get_filter_options()
        )

    except FileNotFoundError as exc:
        return jsonify(
            {
                "error": str(exc)
            }
        ), 503

    except Exception as exc:
        return jsonify(
            {
                "error": str(exc)
            }
        ), 500


# ============================================================
# PROJECT LIST
# ============================================================

@project_analytics_bp.get(
    "/project-analytics/projects"
)
def project_analytics_projects():
    """
    Return projects matching the selected filters.
    """

    try:

        result = get_matching_projects(
            sector=request.args.get(
                "sector"
            ),
            ministry=request.args.get(
                "ministry"
            ),
            state=request.args.get(
                "state"
            ),
            risk_level=request.args.get(
                "risk_level"
            ),
            schedule_status=request.args.get(
                "schedule_status"
            ),
            search=request.args.get(
                "search"
            ),
        )

        return jsonify(
            result
        )

    except FileNotFoundError as exc:

        return jsonify(
            {
                "error": str(exc)
            }
        ), 503

    except Exception as exc:

        return jsonify(
            {
                "error": str(exc)
            }
        ), 500


# ============================================================
# PORTFOLIO SUMMARY
# ============================================================

@project_analytics_bp.get(
    "/project-analytics/summary"
)
def project_analytics_summary():
    """
    Return portfolio-level summary for the selected filters.
    """

    try:

        result = get_portfolio_summary(
            sector=request.args.get(
                "sector"
            ),
            ministry=request.args.get(
                "ministry"
            ),
            state=request.args.get(
                "state"
            ),
            risk_level=request.args.get(
                "risk_level"
            ),
            schedule_status=request.args.get(
                "schedule_status"
            ),
            search=request.args.get(
                "search"
            ),
        )

        return jsonify(
            result
        )

    except FileNotFoundError as exc:

        return jsonify(
            {
                "error": str(exc)
            }
        ), 503

    except Exception as exc:

        return jsonify(
            {
                "error": str(exc)
            }
        ), 500


# ============================================================
# PROJECT DETAIL
# ============================================================

@project_analytics_bp.get(
    "/project-analytics/project/<project_code>"
)
def project_analytics_project(
    project_code: str,
):
    """
    Return complete analytics for one project.
    """

    try:

        result = get_project_detail(
            project_code
        )

        return jsonify(
            result
        )

    except ValueError as exc:

        return jsonify(
            {
                "error": str(exc)
            }
        ), 404

    except FileNotFoundError as exc:

        return jsonify(
            {
                "error": str(exc)
            }
        ), 503

    except Exception as exc:

        return jsonify(
            {
                "error": str(exc)
            }
        ), 500


# ============================================================
# WHAT-IF SIMULATOR
# ============================================================

@project_analytics_bp.post(
    "/project-analytics/project/<project_code>/what-if"
)
def project_analytics_what_if(
    project_code: str,
):
    """
    Run a What-If risk simulation for a project.

    JSON body:

    {
        "progress_delta": 10,
        "delay_delta": 30,
        "expenditure_delta": 20,
        "revised_cost_delta": 50
    }
    """

    try:

        body = request.get_json(
            silent=True
        ) or {}

        progress_delta = body.get(
            "progress_delta",
            0,
        )

        delay_delta = body.get(
            "delay_delta",
            0,
        )

        expenditure_delta = body.get(
            "expenditure_delta",
            0,
        )

        revised_cost_delta = body.get(
            "revised_cost_delta",
            0,
        )

        result = simulate_project(
            project_code,
            progress_delta=float(
                progress_delta
            ),
            delay_delta=float(
                delay_delta
            ),
            expenditure_delta=float(
                expenditure_delta
            ),
            revised_cost_delta=float(
                revised_cost_delta
            ),
        )

        return jsonify(
            result
        )

    except ValueError as exc:

        return jsonify(
            {
                "error": str(exc)
            }
        ), 400

    except FileNotFoundError as exc:

        return jsonify(
            {
                "error": str(exc)
            }
        ), 503

    except (TypeError, ValueError) as exc:

        return jsonify(
            {
                "error": (
                    "Invalid What-If input: "
                    f"{exc}"
                )
            }
        ), 400

    except Exception as exc:

        return jsonify(
            {
                "error": str(exc)
            }
        ), 500