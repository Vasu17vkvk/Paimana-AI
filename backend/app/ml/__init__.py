from app.ml.engine import PAIMANAMLEngine
from app.ml.model_loader import (
    load_artifacts,
)


artifacts = load_artifacts()

engine = PAIMANAMLEngine(
    artifacts
)


__all__ = [
    "engine",
]