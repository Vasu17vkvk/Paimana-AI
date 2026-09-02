from app.extensions import db


class EarlyWarning(db.Model):
    __tablename__ = "early_warnings"

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

    prediction_id = db.Column(
        db.BigInteger,
        db.ForeignKey(
            "predictions.id",
        ),
        nullable=True,
        index=True,
    )

    warning_type = db.Column(
        db.String(100),
        nullable=False,
    )

    priority = db.Column(
        db.String(30),
        nullable=False,
        index=True,
    )

    reason = db.Column(
        db.Text,
        nullable=True,
    )

    status = db.Column(
        db.String(30),
        nullable=False,
        default="ACTIVE",
        index=True,
    )

    created_at = db.Column(
        db.DateTime,
        server_default=db.func.now(),
        nullable=False,
    )

    acknowledged_at = db.Column(
        db.DateTime,
        nullable=True,
    )

    resolved_at = db.Column(
        db.DateTime,
        nullable=True,
    )