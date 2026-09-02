from flask import Flask
from flask_cors import CORS

from app.config.development import DevelopmentConfig
from app.extensions import db


def create_app() -> Flask:
    app = Flask(__name__)

    app.config.from_object(DevelopmentConfig)

    db.init_app(app)

    from app.models.project import Project
    from app.models.risk import RiskTrainingData

    CORS(
        app,
        resources={
            r"/api/*": {
                "origins": [
                    "http://localhost:5173",
                    "https://paimana-ai-two.vercel.app",
                ]
            }
        }
    )

    from app.routes.dashboard import dashboard_bp
    from app.routes.projects import projects_bp
    from app.routes.risk import risk_bp
    from app.routes.cost_overrun import cost_overrun_bp
    from app.routes.delay import delay_bp
    from app.routes.early_warnings import early_warnings_bp
    from app.routes.analytics import analytics_bp
    from app.routes.ml_risk import ml_risk_bp

    app.register_blueprint(dashboard_bp, url_prefix="/api")
    app.register_blueprint(projects_bp, url_prefix="/api")
    app.register_blueprint(risk_bp, url_prefix="/api")
    app.register_blueprint(cost_overrun_bp, url_prefix="/api")
    app.register_blueprint(delay_bp, url_prefix="/api")
    app.register_blueprint(early_warnings_bp, url_prefix="/api")
    app.register_blueprint(analytics_bp, url_prefix="/api")
    app.register_blueprint(ml_risk_bp, url_prefix="/api")

    with app.app_context():
        db.create_all()

    return app