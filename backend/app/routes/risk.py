from flask import Blueprint, jsonify

from app.services.risk_service import (
    get_project_risk,
)


risk_bp = Blueprint(
    "risk",
    __name__,
)


@risk_bp.get(
    "/risk/<project_code>"
)
def project_risk(
    project_code: str,
):
    try:
        result = get_project_risk(
            project_code
        )

        return jsonify(
            result
        )

    except ValueError as error:
        return jsonify(
            {
                "error": str(error),
            }
        ), 404

    except FileNotFoundError as error:
        return jsonify(
            {
                "error": str(error),
            }
        ), 500

    except Exception:
        return jsonify(
            {
                "error": (
                    "Unable to calculate "
                    "project risk."
                ),
            }
        ), 500