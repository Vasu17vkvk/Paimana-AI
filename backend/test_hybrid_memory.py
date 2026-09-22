import os
import psutil

from app import create_app
from app.services.assistant_service import answer_query


def main():
    process = psutil.Process(os.getpid())

    app = create_app()

    print(
        "START:",
        round(process.memory_info().rss / 1024 / 1024, 1),
        "MB",
    )

    with app.app_context():
        result = answer_query(
            "Why is project 400005 delayed?"
        )

    print(
        "END:",
        round(process.memory_info().rss / 1024 / 1024, 1),
        "MB",
    )

    print(
        "QUERY_TYPE:",
        result.get("query_type"),
    )

    print(
        "SOURCE:",
        result.get("source"),
    )

    print(
        "PROJECT_CODE:",
        result.get("project_code"),
    )

    print("ANSWER:")
    print(result.get("text"))


if __name__ == "__main__":
    main()