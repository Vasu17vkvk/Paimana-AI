from app.extensions import db


class Prediction(db.Model):
    __tablename__ = "predictions"

    id = db.Column(
        db.BigInteger,
        primary_key=True,
    )

    project_id = db.Column(
        db.Integer,
        db.ForeignKey(
            "projects.id",
        ),
        nullable=False,
        index=True,
    )

    snapshot_year = db.Column(
        db.Integer,
        nullable=True,
    )

    snapshot_month = db.Column(
        db.Integer,
        nullable=True,
    )

    predicted_cost_overrun_pct = db.Column(
        db.Numeric(10, 4),
        nullable=True,
    )

    future_delay_probability = db.Column(
        db.Numeric(8, 6),
        nullable=True,
    )

    future_progress_stall_probability = db.Column(
        db.Numeric(8, 6),
        nullable=True,
    )

    cost_risk_score = db.Column(
        db.Numeric(8, 4),
        nullable=False,
    )

    overall_risk_score = db.Column(
        db.Numeric(8, 4),
        nullable=False,
    )

    risk_level = db.Column(
        db.String(20),
        nullable=False,
        index=True,
    )

    early_warning_active = db.Column(
        db.Boolean,
        nullable=False,
        default=False,
        index=True,
    )

    early_warning_priority = db.Column(
        db.String(30),
        nullable=False,
        default="NONE",
    )

    early_warning_reasons = db.Column(
        db.JSON,
        nullable=True,
    )

    model_version = db.Column(
        db.String(100),
        nullable=True,
    )

    created_at = db.Column(
        db.DateTime,
        server_default=db.func.now(),
        nullable=False,
    )