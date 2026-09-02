from app.extensions import db


class Project(db.Model):
    __tablename__ = "projects"

    project_code = db.Column(db.BigInteger, primary_key=True)

    project_name = db.Column(db.Text)
    sector = db.Column(db.Text)
    ministry = db.Column(db.Text)

    original_cost_cr = db.Column(db.BigInteger)
    revised_cost_cr = db.Column(db.Float)
    expenditure_cr = db.Column(db.Float)

    original_end_date = db.Column(db.Date)
    revised_end_date = db.Column(db.Date)

    cost_overrun_cr = db.Column(db.Float)
    cost_overrun_pct = db.Column(db.Float)
    delay_days = db.Column(db.Float)
    delay_months = db.Column(db.Float)
    expenditure_pct = db.Column(db.Float)

    cost_overrun_flag = db.Column(db.Integer)
    time_overrun_flag = db.Column(db.Integer)
    number_of_snapshots = db.Column(db.Integer)

    revised_cost_analytical_cr = db.Column(db.Float)
    schedule_change_days = db.Column(db.Float)
    revised_date_missing_flag = db.Column(db.Integer)

    schedule_status = db.Column(db.Text)
    cost_status = db.Column(db.Text)

    has_revised_cost = db.Column(db.Integer)
    has_revised_date = db.Column(db.Integer)
    is_delayed = db.Column(db.Integer)
    is_accelerated = db.Column(db.Integer)
    has_cost_overrun = db.Column(db.Integer)

    months_observed = db.Column(db.Integer)
    first_snapshot = db.Column(db.Date)
    last_snapshot = db.Column(db.Date)

    total_expenditure_growth_cr = db.Column(db.Float)
    avg_monthly_expenditure_growth_cr = db.Column(db.Float)
    max_monthly_expenditure_growth_cr = db.Column(db.Float)

    max_cost_overrun_pct = db.Column(db.Float)
    final_cost_overrun_pct = db.Column(db.Float)

    cost_revision_count = db.Column(db.Integer)
    date_revision_count = db.Column(db.Integer)

    max_schedule_change_days = db.Column(db.Float)
    final_schedule_change_days = db.Column(db.Float)
    max_delay_days = db.Column(db.Float)

    final_expenditure_cr = db.Column(db.Float)

    revised_cost_missing_flag = db.Column(db.Integer)
    extreme_cost_overrun_flag = db.Column(db.Integer)
    extreme_expenditure_pct_flag = db.Column(db.Integer)
    negative_expenditure_flag = db.Column(db.Integer)
    extreme_schedule_change_flag = db.Column(db.Integer)

    data_completeness_score = db.Column(db.Float)
    data_quality_flag = db.Column(db.Text)

    flash_months_observed = db.Column(db.Integer)
    flash_first_seen = db.Column(db.Date)
    flash_last_seen = db.Column(db.Date)

    flash_latest_expenditure = db.Column(db.Float)
    flash_latest_physical_progress = db.Column(db.Float)
    flash_max_physical_progress = db.Column(db.Float)

    flash_total_expenditure_change = db.Column(db.Float)
    flash_max_monthly_expenditure_change = db.Column(db.Float)

    flash_avg_monthly_progress_change = db.Column(db.Float)
    flash_max_monthly_progress_change = db.Column(db.Float)

    flash_revised_cost_change = db.Column(db.Float)

    flash_state = db.Column(db.Text)
    flash_implementing_agency = db.Column(db.Text)

    flash_available_flag = db.Column(db.Integer)
    flash_progress_available_flag = db.Column(db.Integer)
    flash_expenditure_available_flag = db.Column(db.Integer)
    flash_monthly_history_available_flag = db.Column(db.Integer)

    flash_progress_stagnation_flag = db.Column(db.Integer)
    flash_expenditure_growth_flag = db.Column(db.Integer)
    flash_low_progress_flag = db.Column(db.Integer)
    flash_high_progress_flag = db.Column(db.Integer)

    project_master_id = db.Column(db.BigInteger)

    paimana_available_flag = db.Column(db.Integer)

    flash_history_months = db.Column(db.Integer)
    paimana_history_months = db.Column(db.Integer)

    coverage_status = db.Column(db.Text)
    master_completeness_pct = db.Column(db.Float)