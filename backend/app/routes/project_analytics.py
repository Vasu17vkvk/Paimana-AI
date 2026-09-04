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

    Multi-select query parameters are supported.

    Example:

    /project-analytics/projects
        ?sector=Roads
        &sector=Railways
        &state=Gujarat
        &state=Maharashtra
        &risk_level=HIGH
        &risk_level=CRITICAL
        &search=400005
    """

    try:

        # ----------------------------------------------------
        # Multi-select filters
        # ----------------------------------------------------

        sectors = request.args.getlist(
            "sector"
        )

        ministries = request.args.getlist(
            "ministry"
        )

        states = request.args.getlist(
            "state"
        )

        risk_levels = request.args.getlist(
            "risk_level"
        )

        schedule_statuses = request.args.getlist(
            "schedule_status"
        )

        # ----------------------------------------------------
        # Search remains single value
        # ----------------------------------------------------

        search = request.args.get(
            "search"
        )

        result = get_matching_projects(
            sector=sectors,
            ministry=ministries,
            state=states,
            risk_level=risk_levels,
            schedule_status=schedule_statuses,
            search=search,
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

    Multi-select query parameters are supported.
    """

    try:

        # ----------------------------------------------------
        # Multi-select filters
        # ----------------------------------------------------

        sectors = request.args.getlist(
            "sector"
        )

        ministries = request.args.getlist(
            "ministry"
        )

        states = request.args.getlist(
            "state"
        )

        risk_levels = request.args.getlist(
            "risk_level"
        )

        schedule_statuses = request.args.getlist(
            "schedule_status"
        )

        # ----------------------------------------------------
        # Search
        # ----------------------------------------------------

        search = request.args.get(
            "search"
        )

        result = get_portfolio_summary(
            sector=sectors,
            ministry=ministries,
            state=states,
            risk_level=risk_levels,
            schedule_status=schedule_statuses,
            search=search,
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

    Accepted JSON body:

    {
        "physical_progress_delta": 10,
        "schedule_delay_days": 30,
        "monthly_expenditure_change_cr": 20,
        "revised_cost_change_cr": 50
    }

    Backward-compatible keys are also accepted:

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

        # ----------------------------------------------------
        # Read frontend field names first
        # Fallback to original backend field names
        # ----------------------------------------------------

        progress_delta = body.get(
            "physical_progress_delta",
            body.get(
                "progress_delta",
                0,
            ),
        )

        delay_delta = body.get(
            "schedule_delay_days",
            body.get(
                "delay_delta",
                0,
            ),
        )

        expenditure_delta = body.get(
            "monthly_expenditure_change_cr",
            body.get(
                "expenditure_delta",
                0,
            ),
        )

        revised_cost_delta = body.get(
            "revised_cost_change_cr",
            body.get(
                "revised_cost_delta",
                0,
            ),
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

    except TypeError as exc:

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