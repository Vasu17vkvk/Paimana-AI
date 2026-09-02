from flask import Blueprint, jsonify
from app.ml.ml_engine import score

ml_risk_bp = Blueprint("ml_risk", __name__)


@ml_risk_bp.get("/ml/risk/<int:project_code>")
def ml_project_risk(project_code):
    try:
        result = score(project_code)
        return jsonify(result)

    except ValueError as exc:
        return jsonify({"error": str(exc)}), 404

    except Exception as exc:
        return jsonify({"error": str(exc)}), 500