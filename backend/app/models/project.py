from app.extensions import db


class Project(db.Model):
    __tablename__ = "projects"

    id = db.Column(
        db.Integer,
        primary_key=True,
    )

    project_code = db.Column(
        db.String(100),
        unique=True,
        nullable=False,
        index=True,
    )

    project_name = db.Column(
        db.String(500),
        nullable=True,
    )

    ministry = db.Column(
        db.String(255),
        nullable=True,
        index=True,
    )

    sector = db.Column(
        db.String(255),
        nullable=True,
        index=True,
    )

    state = db.Column(
        db.String(255),
        nullable=True,
        index=True,
    )

    implementing_agency = db.Column(
        db.String(500),
        nullable=True,
    )

    status = db.Column(
        db.String(100),
        nullable=True,
        index=True,
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

    original_end_date = db.Column(
        db.Date,
        nullable=True,
    )

    revised_end_date = db.Column(
        db.Date,
        nullable=True,
    )

    created_at = db.Column(
        db.DateTime,
        server_default=db.func.now(),
        nullable=False,
    )

    updated_at = db.Column(
        db.DateTime,
        server_default=db.func.now(),
        onupdate=db.func.now(),
        nullable=False,
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "project_code": self.project_code,
            "project_name": self.project_name,
            "ministry": self.ministry,
            "sector": self.sector,
            "state": self.state,
            "implementing_agency": (
                self.implementing_agency
            ),
            "status": self.status,
            "original_cost_cr": (
                float(self.original_cost_cr)
                if self.original_cost_cr is not None
                else None
            ),
            "revised_cost_cr": (
                float(self.revised_cost_cr)
                if self.revised_cost_cr is not None
                else None
            ),
            "expenditure_cr": (
                float(self.expenditure_cr)
                if self.expenditure_cr is not None
                else None
            ),
            "original_end_date": (
                self.original_end_date.isoformat()
                if self.original_end_date
                else None
            ),
            "revised_end_date": (
                self.revised_end_date.isoformat()
                if self.revised_end_date
                else None
            ),
        }