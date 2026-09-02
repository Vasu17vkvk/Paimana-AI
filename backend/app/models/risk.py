from app.extensions import db


class RiskTrainingData(db.Model):
    __tablename__ = "risk_training_data"

    id = db.Column(db.BigInteger, primary_key=True, autoincrement=True)

    project_code = db.Column(db.BigInteger, nullable=False, index=True)

    original_cost_cr = db.Column(db.Float)
    revised_cost_cr = db.Column(db.Float)
    expenditure_cr = db.Column(db.Float)

    cost_overrun_cr = db.Column(db.Float)
    cost_overrun_pct = db.Column(db.Float)
    delay_days = db.Column(db.Float)
    schedule_change_days = db.Column(db.Float)

    expenditure_change_cr_paimana = db.Column(db.Float)
    revision_cost_change_cr = db.Column(db.Float)

    original_cost = db.Column(db.Float)
    revised_cost = db.Column(db.Float)
    cumulative_expenditure = db.Column(db.Float)
    physical_progress_pct = db.Column(db.Float)

    expenditure_change_cr_flash = db.Column(db.Float)
    progress_change_pct = db.Column(db.Float)
    revised_cost_change_cr = db.Column(db.Float)

    previous_expenditure_cr = db.Column(db.Float)
    previous_progress_pct = db.Column(db.Float)

    flash_history_count = db.Column(db.Float)

    future_delay_flag = db.Column(db.Integer, nullable=False)

    snapshot_year = db.Column(db.Float)
    snapshot_month_num = db.Column(db.Float)

    original_end_year = db.Column(db.Float)
    original_end_month = db.Column(db.Float)

    revised_end_year = db.Column(db.Float)
    revised_end_month = db.Column(db.Float)

    sector_freq = db.Column(db.Float)
    ministry_freq = db.Column(db.Float)
    state_freq = db.Column(db.Float)
    implementing_agency_freq = db.Column(db.Float)