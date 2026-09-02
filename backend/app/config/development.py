import os

from dotenv import load_dotenv


load_dotenv()


class DevelopmentConfig:
    DEBUG = True
    TESTING = False

    SECRET_KEY = os.getenv(
        "SECRET_KEY",
        "development-secret",
    )

    SQLALCHEMY_DATABASE_URI = os.getenv(
        "DATABASE_URL",
        "postgresql+psycopg://postgres:postgres@localhost:5432/paimana_ai",
    )

    SQLALCHEMY_TRACK_MODIFICATIONS = False

    ML_MODEL_DIR = os.getenv(
        "ML_MODEL_DIR",
        "models",
    )

    ML_DATA_DIR = os.getenv(
        "ML_DATA_DIR",
        "data",
    )