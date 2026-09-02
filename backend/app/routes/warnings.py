from flask import Blueprint, jsonify

from app.services.warning_service import (
    get_project_warnings,
    get_active_warnings,
)


warnings_bp = Blueprint("warnings", __name__)


@warnings_bp.get("/warnings/project/<project_code>")
def project_warnings(project_code):
    try:
        result = get_project_warnings(project_code)
        return jsonify(result), 200

    except ValueError as exc:
        return jsonify({"error": str(exc)}), 404

    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@warnings_bp.get("/warnings/active")
def active_warnings():
    try:
        result = get_active_warnings()
        return jsonify(result), 200

    except Exception as exc:
        return jsonify({"error": str(exc)}), 500