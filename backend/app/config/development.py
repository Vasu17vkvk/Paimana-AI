import os


class DevelopmentConfig:
    DEBUG = True
    TESTING = False

    SECRET_KEY = os.getenv(
        "SECRET_KEY",
        "paimana-ai-development-secret"
    )