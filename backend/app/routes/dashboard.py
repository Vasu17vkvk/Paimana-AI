from flask import Blueprint, jsonify


dashboard_bp = Blueprint("dashboard", __name__)


@dashboard_bp.get("/health")
def health_check():
    return jsonify(
        {
            "status": "ok",
            "service": "PAIMANA AI API",
            "message": "Backend is running successfully."
        }
    )