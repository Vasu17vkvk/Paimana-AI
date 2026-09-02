import os
from dotenv import load_dotenv

load_dotenv()


class DevelopmentConfig:
    DEBUG = True
    TESTING = False

    SECRET_KEY = os.getenv(
        "SECRET_KEY",
        "paimana-ai-development-secret"
    )

    SQLALCHEMY_DATABASE_URI = os.getenv("DATABASE_URL")
    SQLALCHEMY_TRACK_MODIFICATIONS = False