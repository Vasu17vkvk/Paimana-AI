import os
import psutil
from multiprocessing import freeze_support

from app import create_app
from app.services.rag_service import answer_from_knowledge_base
from app.services.assistant_context_service import get_project_context
from app.services.assistant_service import _ml_response


def memory(process, label):
    print(
        label,
        round(process.memory_info().rss / 1024 / 1024, 1),
        "MB",
    )


def main():
    process = psutil.Process(os.getpid())

    flask_app = create_app()

    memory(process, "AFTER_CREATE_APP:")

    with flask_app.app_context():

        # ---------------------------------------------------------
        # RAG
        # ---------------------------------------------------------

        print("\n--- RAG REQUEST ---")

        rag_result = answer_from_knowledge_base(
            "What are common causes of delays in infrastructure projects?"
        )

        memory(process, "AFTER_RAG:")

        print(
            "RAG_OK:",
            bool(rag_result),
        )

        # ---------------------------------------------------------
        # ML
        # ---------------------------------------------------------

        print("\n--- ML REQUEST ---")

        context = get_project_context("400005")

        memory(process, "AFTER_ML_CONTEXT:")

        ml_result = _ml_response(context)

        memory(process, "AFTER_ML_RESPONSE:")

        print(
            "ML_OK:",
            bool(ml_result),
        )

        print(
            "ML_SOURCE:",
            ml_result.get("source"),
        )


if __name__ == "__main__":
    freeze_support()
    main()