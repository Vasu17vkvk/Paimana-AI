from flask import Flask
from flask_cors import CORS

from app.config.development import DevelopmentConfig
from app.extensions import db, migrate
from app import models

from app.routes.risk import risk_bp
from app.routes.cost import cost_bp
from app.routes.delay import delay_bp
from app.routes.warnings import warnings_bp


def create_app() -> Flask:
    app = Flask(__name__)

    app.config.from_object(DevelopmentConfig)

    CORS(
        app,
        resources={
            r"/api/*": {
                "origins": [
                    "http://localhost:5173",
                ]
            }
        },
    )

    db.init_app(app)
    migrate.init_app(app, db)

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

    return app