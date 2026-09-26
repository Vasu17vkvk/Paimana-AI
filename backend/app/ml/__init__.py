from __future__ import annotations

from threading import Lock
from typing import Any


_ENGINE: Any | None = None
_ENGINE_LOCK = Lock()


def _load_engine() -> Any:
    """
    Load the NIRMAAN ML engine only when it is actually needed.

    This prevents ML model artifacts from being loaded merely because
    `app.ml` is imported during application startup.
    """
    global _ENGINE

    if _ENGINE is None:
        with _ENGINE_LOCK:
            if _ENGINE is None:
                from app.ml.engine import PAIMANAMLEngine
                from app.ml.model_loader import load_artifacts

                artifacts = load_artifacts()

                _ENGINE = PAIMANAMLEngine(
                    artifacts
                )

    return _ENGINE


class _LazyEngine:
    """
    Lightweight proxy around the real PAIMANA ML engine.

    Existing code can continue using:

        from app.ml import engine

    The real engine is created only when one of its attributes/methods
    is accessed.
    """

    def __getattr__(
        self,
        name: str,
    ) -> Any:
        return getattr(
            _load_engine(),
            name,
        )

    def __dir__(self) -> list[str]:
        return dir(
            _load_engine()
        )


engine = _LazyEngine()


def get_engine() -> Any:
    """
    Explicitly retrieve the real ML engine.
    """
    return _load_engine()


__all__ = [
    "engine",
    "get_engine",
]