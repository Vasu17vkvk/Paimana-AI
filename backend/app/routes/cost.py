from flask import Blueprint, jsonify

from app.services.cost_service import get_project_cost


cost_bp = Blueprint("cost", __name__)


@cost_bp.get("/cost/<project_code>")
def project_cost(project_code):
    try:
        result = get_project_cost(project_code)
        return jsonify(result), 200

    except ValueError as exc:
        return jsonify({"error": str(exc)}), 404

    except Exception as exc:
        return jsonify({"error": str(exc)}), 500