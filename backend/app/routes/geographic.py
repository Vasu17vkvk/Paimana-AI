from flask import Blueprint, jsonify, request

from app.services.geographic_service import get_geographic_projects


geographic_bp = Blueprint("geographic", __name__)


@geographic_bp.get("/geographic/projects")
def geographic_projects():
    state = request.args.get("state")

    if state:
        state = state.strip()

    try:
        data = get_geographic_projects(state=state)

        return jsonify(data), 200

    except Exception as exc:
        return jsonify(
            {
                "error": "Failed to load geographic projects.",
                "details": str(exc),
            }
        ), 500