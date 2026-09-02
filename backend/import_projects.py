import pandas as pd

from app import create_app
from app.extensions import db
from app.models.project import Project


app = create_app()

with app.app_context():

    csv_path = "01_PROJECT_MASTER_CLEANED.csv"

    df = pd.read_csv(csv_path)

    print("CSV rows:", len(df))
    print("CSV columns:", len(df.columns))

    # Convert date columns
    date_columns = [
        "original_end_date",
        "revised_end_date",
        "first_snapshot",
        "last_snapshot",
        "flash_first_seen",
        "flash_last_seen",
    ]

    for column in date_columns:
        df[column] = pd.to_datetime(
            df[column],
            errors="coerce"
        ).dt.date

    # Convert Pandas NaN/NaT to Python None
    df = df.where(pd.notna(df), None)

    records = df.to_dict(orient="records")

    print("Preparing", len(records), "records...")

    for record in records:
        project = Project(**record)
        db.session.add(project)

    db.session.commit()

    print("Import completed successfully.")
    print("Rows inserted:", len(records))