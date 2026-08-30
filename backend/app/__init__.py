from flask import Flask
from flask_cors import CORS

from app.config.development import DevelopmentConfig


def create_app() -> Flask:
    app = Flask(__name__)

    # Load configuration
    app.config.from_object(DevelopmentConfig)

    # Allow requests from the React frontend during development
    CORS(
        app,
        resources={
            r"/api/*": {
                "origins": ["http://localhost:5173"]
            }
        }
    )

    # Register routes
    from app.routes.dashboard import dashboard_bp

    app.register_blueprint(dashboard_bp, url_prefix="/api")

    return app