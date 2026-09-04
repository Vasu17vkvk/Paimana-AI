import os

from flask import Flask
from flask_cors import CORS

from app.config.development import DevelopmentConfig
from app.extensions import db, migrate
from app import models

from app.routes.risk import risk_bp
from app.routes.cost import cost_bp
from app.routes.delay import delay_bp
from app.routes.warnings import warnings_bp
from app.routes.sector_ministry import sector_ministry_bp
from app.routes.project_analytics import project_analytics_bp

from app.routes.dashboard import dashboard_bp

from app.routes.geographic import geographic_bp

def create_app() -> Flask:
    app = Flask(__name__)

    app.config.from_object(DevelopmentConfig)

    # ============================================================
    # PostgreSQL / SQLAlchemy driver
    # ============================================================

    database_url = app.config.get(
        "SQLALCHEMY_DATABASE_URI"
    )

    if database_url:
        if database_url.startswith("postgres://"):
            database_url = database_url.replace(
                "postgres://",
                "postgresql+psycopg://",
                1,
            )

        elif database_url.startswith("postgresql://"):
            database_url = database_url.replace(
                "postgresql://",
                "postgresql+psycopg://",
                1,
            )

        app.config[
            "SQLALCHEMY_DATABASE_URI"
        ] = database_url

    # ============================================================
    # CORS
    # ============================================================

    frontend_url = os.getenv(
        "FRONTEND_URL",
        "https://paimana-ai-two.vercel.app",
    ).strip().rstrip("/")

    allowed_origins = [
        "http://localhost:5173",
        "https://paimana-ai-two.vercel.app",
    ]

    if frontend_url not in allowed_origins:
        allowed_origins.append(frontend_url)

    CORS(
        app,
        resources={
            r"/api/*": {
                "origins": allowed_origins,
                "methods": [
                    "GET",
                    "POST",
                    "PUT",
                    "PATCH",
                    "DELETE",
                    "OPTIONS",
                ],
                "allow_headers": [
                    "Content-Type",
                    "Authorization",
                ],
            }
        },
    )

    # ============================================================
    # Database
    # ============================================================

    db.init_app(app)
    migrate.init_app(
        app,
        db,
    )

    # ============================================================
    # Routes
    # ============================================================

    from app.routes.health import health_bp

    app.register_blueprint(
        health_bp,
        url_prefix="/api",
    )

    app.register_blueprint(
        risk_bp,
        url_prefix="/api",
    )

    app.register_blueprint(
        cost_bp,
        url_prefix="/api",
    )

    app.register_blueprint(
        delay_bp,
        url_prefix="/api",
    )

    app.register_blueprint(
        warnings_bp,
        url_prefix="/api",
    )

    app.register_blueprint(
        sector_ministry_bp,
        url_prefix="/api",
    )

    app.register_blueprint(
        project_analytics_bp,
        url_prefix="/api",
    )

    app.register_blueprint(
    dashboard_bp,
    url_prefix="/api",
    )

    app.register_blueprint(
    geographic_bp,
    url_prefix="/api",
    )

    return app