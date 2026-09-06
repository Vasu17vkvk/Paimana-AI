from flask import Blueprint, jsonify, request

from app.services.sector_ministry_service import (
    generate_analytics,
    get_filter_options,
)


sector_ministry_bp = Blueprint(
    "sector_ministry",
    __name__,
)


@sector_ministry_bp.get(
    "/sector-ministry/filter-options"
)
def sector_ministry_filter_options():
    try:
        result = get_filter_options()

        return jsonify(result), 200

    except FileNotFoundError as exc:
        return jsonify(
            {
                "error": str(exc)
            }
        ), 503

    except ValueError as exc:
        return jsonify(
            {
                "error": str(exc)
            }
        ), 400

    except Exception as exc:
        return jsonify(
            {
                "error": str(exc)
            }
        ), 500


@sector_ministry_bp.get(
    "/sector-ministry/analytics"
)
def sector_ministry_analytics():

    try:

        view_by = request.args.get(
            "view_by",
            "sector",
        )

        ministry = request.args.get(
            "ministry",
            "All Ministries",
        )

        sector = request.args.get(
            "sector",
            "All Sectors",
        )

        state = request.args.get(
            "state",
            "All States",
        )

        financial_year = request.args.get(
            "financial_year",
            "All Years",
        )

        snapshot_month = request.args.get(
            "snapshot_month",
            "All Months",
        )

        # ----------------------------------------------------
        # Normalize frontend values
        # ----------------------------------------------------

        if financial_year.startswith(
            "FY "
        ):
            financial_year = financial_year[
                3:
            ]

        result = generate_analytics(
            view_by=view_by,
            ministry=ministry,
            sector=sector,
            state=state,
            financial_year_filter=(
                None
                if financial_year == "All Years"
                else financial_year
            ),
            snapshot_month=(
                None
                if snapshot_month == "All Months"
                else snapshot_month
            ),
        )

        return jsonify(result), 200

    except FileNotFoundError as exc:

        return jsonify(
            {
                "error": str(exc)
            }
        ), 503

    except ValueError as exc:

        return jsonify(
            {
                "error": str(exc)
            }
        ), 400

    except Exception as exc:

        return jsonify(
            {
                "error": str(exc)
            }
        ), 500