from flask import Blueprint, jsonify

from app.services.delay_service import get_project_delay


delay_bp = Blueprint("delay", __name__)


@delay_bp.get("/delay/<project_code>")
def project_delay(project_code):
    try:
        result = get_project_delay(project_code)
        return jsonify(result), 200

    except ValueError as exc:
        return jsonify({"error": str(exc)}), 404

    except Exception as exc:
        return jsonify({"error": str(exc)}), 500