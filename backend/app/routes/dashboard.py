from flask import Blueprint, jsonify, request

from app.services.dashboard_service import (
    get_dashboard,
    get_dashboard_filter_options,
)


dashboard_bp = Blueprint(
    "dashboard",
    __name__,
)


@dashboard_bp.get("/health")
def health_check():
    return jsonify(
        {
            "status": "ok",
            "service": "PAIMANA AI API",
            "message": "Backend is running successfully.",
        }
    )


@dashboard_bp.get("/dashboard/filter-options")
def dashboard_filter_options():
    try:
        return jsonify(
            get_dashboard_filter_options()
        ), 200

    except Exception as exc:
        return jsonify(
            {
                "error": str(exc)
            }
        ), 500


@dashboard_bp.get("/dashboard")
def dashboard_data():
    try:
        return jsonify(
            get_dashboard(
                period=request.args.get(
                    "period"
                ),
                ministry=request.args.get(
                    "ministry"
                ),
                sector=request.args.get(
                    "sector"
                ),
                state=request.args.get(
                    "state"
                ),
                risk=request.args.get(
                    "risk"
                ),
                status=request.args.get(
                    "status"
                ),
                search=request.args.get(
                    "search"
                ),
            )
        ), 200

    except Exception as exc:
        return jsonify(
            {
                "error": str(exc)
            }
        ), 500