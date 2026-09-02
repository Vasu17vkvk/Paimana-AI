import pandas as pd

from app import create_app
from app.extensions import db
from app.models.risk import RiskTrainingData


app = create_app()

with app.app_context():

    csv_path = "09_RISK_MODEL_TRAINING_DATA.csv"

    df = pd.read_csv(csv_path)

    print("CSV rows:", len(df))
    print("CSV columns:", len(df.columns))

    # Convert Pandas NaN to Python None
    df = df.where(pd.notna(df), None)

    records = df.to_dict(orient="records")

    print("Preparing", len(records), "records...")

    for record in records:
        risk_record = RiskTrainingData(**record)
        db.session.add(risk_record)

    db.session.commit()

    print("Risk data import completed successfully.")
    print("Rows inserted:", len(records))