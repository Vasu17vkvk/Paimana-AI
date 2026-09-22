import os

import psutil

from app import create_app


def _log_memory(label: str) -> None:
    process = psutil.Process(os.getpid())
    rss_mb = process.memory_info().rss / 1024 / 1024
    print(
        f"[MEMORY] {label}: {rss_mb:.1f} MB",
        flush=True,
    )


app = create_app()

_log_memory("after_app_create")




if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=5000,
        debug=True,
        use_reloader=False,
    )