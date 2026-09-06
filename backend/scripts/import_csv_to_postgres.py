from pathlib import Path
import os

import pandas as pd
from dotenv import load_dotenv
from sqlalchemy import create_engine, text


# ============================================================
# PATHS
# ============================================================

BACKEND_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = BACKEND_ROOT / "data"

load_dotenv(BACKEND_ROOT / ".env")

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL not found in backend/.env"
    )

# Ensure psycopg3 driver is used
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace(
        "postgres://",
        "postgresql+psycopg://",
        1,
    )
elif DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace(
        "postgresql://",
        "postgresql+psycopg://",
        1,
    )


engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
)


# ============================================================
# CSV → POSTGRES IMPORT
# ============================================================

FILES = {
    "project_master": "01_PROJECT_MASTER_CLEANED.csv",
    "paimana_monthly_history": "02_PAIMANA_MONTHLY_HISTORY_CLEAN.csv",
    "flash_modern_history": "03_FLASH_MODERN_HISTORY_CLEAN.csv",
    "rajya_sabha_state_summary": "08_RAJYA_SABHA_STATE_SUMMARY_CLEANED.csv",
    "paimana_ml_ready": "PAIMANA_ML_READY_WITH_PROJECT_CODE.csv",
}


def import_csv(table_name: str, filename: str) -> None:
    csv_path = DATA_DIR / filename

    if not csv_path.exists():
        raise FileNotFoundError(
            f"CSV file not found: {csv_path}"
        )

    print()
    print("=" * 70)
    print(f"Importing: {filename}")
    print(f"Table:     {table_name}")
    print("=" * 70)

    df = pd.read_csv(
        csv_path,
        low_memory=False,
    )

    print(f"Rows:    {len(df):,}")
    print(f"Columns: {len(df.columns)}")

    df.to_sql(
        table_name,
        con=engine,
        if_exists="replace",
        index=False,
        chunksize=500,
        method="multi",
    )

    print(f"✅ Imported {table_name}")


def create_indexes() -> None:
    print()
    print("=" * 70)
    print("Creating indexes")
    print("=" * 70)

    statements = [
        """
        CREATE INDEX IF NOT EXISTS
        idx_project_master_project_code
        ON project_master ("project_code")
        """,
        """
        CREATE INDEX IF NOT EXISTS
        idx_paimana_monthly_history_project_code
        ON paimana_monthly_history ("project_code")
        """,
        """
        CREATE INDEX IF NOT EXISTS
        idx_flash_modern_history_project_code
        ON flash_modern_history ("project_code")
        """,
        """
        CREATE INDEX IF NOT EXISTS
        idx_paimana_ml_ready_project_code
        ON paimana_ml_ready ("project_code")
        """,
    ]

    with engine.begin() as connection:
        for statement in statements:
            connection.execute(
                text(statement)
            )

    print("✅ Indexes created")


def verify_tables() -> None:
    print()
    print("=" * 70)
    print("Verifying tables")
    print("=" * 70)

    with engine.connect() as connection:
        for table_name in FILES:
            result = connection.execute(
                text(
                    f'SELECT COUNT(*) FROM "{table_name}"'
                )
            )

            count = result.scalar()

            print(
                f"{table_name:35} {count:,} rows"
            )


def main() -> None:
    print()
    print("PAIMANA AI")
    print("CSV → Render PostgreSQL Import")
    print()

    for table_name, filename in FILES.items():
        import_csv(
            table_name,
            filename,
        )

    create_indexes()
    verify_tables()

    print()
    print("=" * 70)
    print("✅ ALL DATA IMPORTED SUCCESSFULLY")
    print("=" * 70)


if __name__ == "__main__":
    main()