from pathlib import Path
import pandas as pd
from sqlalchemy import inspect

from app.extensions import db


DATA_DIR = Path(__file__).resolve().parents[2] / "data"

FILES = {
    "project_master": "01_PROJECT_MASTER_CLEANED.csv",
    "paimana_monthly_history": "02_PAIMANA_MONTHLY_HISTORY_CLEAN.csv",
    "flash_modern_history": "03_FLASH_MODERN_HISTORY_CLEAN.csv",
    "rajya_sabha_state_summary": "08_RAJYA_SABHA_STATE_SUMMARY_CLEANED.csv",
    "paimana_ml_ready": "PAIMANA_ML_READY_WITH_PROJECT_CODE.csv",
}


def initialize_analytics_tables():
    """
    Import analytics CSVs into PostgreSQL only when the required
    tables are missing.

    Existing tables are left untouched.
    """
    try:
        inspector = inspect(db.engine)

        missing_tables = [
            table
            for table in FILES
            if not inspector.has_table(table)
        ]

        if not missing_tables:
            print("✅ Analytics PostgreSQL tables already exist.")
            return

        print(f"⚠️ Missing analytics tables: {missing_tables}")
        print("📥 Importing analytics data into PostgreSQL...")

        for table_name in missing_tables:
            filename = FILES[table_name]
            csv_path = DATA_DIR / filename

            if not csv_path.exists():
                print(f"❌ CSV not found: {csv_path}")
                continue

            df = pd.read_csv(csv_path)

            df.to_sql(
                table_name,
                con=db.engine,
                if_exists="replace",
                index=False,
                chunksize=500,
                method="multi",
            )

            print(
                f"✅ {table_name}: {len(df)} rows imported"
            )

        print("✅ Analytics database initialization completed.")

    except Exception as exc:
        # Do not prevent Flask from starting if the import fails.
        print(
            f"⚠️ Analytics database initialization failed: "
            f"{type(exc).__name__}: {exc}"
        )