from app.extensions import db


class ProjectSnapshot(db.Model):
    __tablename__ = "project_snapshots"

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
        nullable=False,
        index=True,
    )

    snapshot_month = db.Column(
        db.Integer,
        nullable=False,
    )

    original_cost_cr = db.Column(
        db.Numeric(18, 4),
        nullable=True,
    )

    revised_cost_cr = db.Column(
        db.Numeric(18, 4),
        nullable=True,
    )

    expenditure_cr = db.Column(
        db.Numeric(18, 4),
        nullable=True,
    )

    physical_progress_pct = db.Column(
        db.Numeric(7, 3),
        nullable=True,
    )

    delay_days = db.Column(
        db.Integer,
        nullable=True,
    )

    cost_overrun_pct = db.Column(
        db.Numeric(10, 4),
        nullable=True,
    )

    schedule_change_days = db.Column(
        db.Integer,
        nullable=True,
    )

    expenditure_change_cr_paimana = db.Column(
        db.Numeric(18, 4),
        nullable=True,
    )

    expenditure_change_cr_flash = db.Column(
        db.Numeric(18, 4),
        nullable=True,
    )

    progress_change_pct = db.Column(
        db.Numeric(10, 4),
        nullable=True,
    )

    flash_history_count = db.Column(
        db.Integer,
        nullable=True,
    )

    created_at = db.Column(
        db.DateTime,
        server_default=db.func.now(),
        nullable=False,
    )

    __table_args__ = (
        db.UniqueConstraint(
            "project_id",
            "snapshot_year",
            "snapshot_month",
            name="uq_project_snapshot",
        ),
    )