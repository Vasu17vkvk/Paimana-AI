"""
NIRMAAN AI Gemini configuration.

Gemini is used only for final response generation.

RAG retrieval, embeddings, PDF processing, and PostgreSQL search
are handled locally by NIRMAAN.

All Gemini settings are read from environment variables so that
secrets and deployment-specific configuration are never hard-coded.
"""

from __future__ import annotations

import os


# ============================================================================
# API KEY
# ============================================================================

def get_gemini_api_key() -> str:
    """
    Return the Gemini API key.

    The key must be supplied through the environment.
    """

    api_key = os.getenv(
        "GEMINI_API_KEY",
        "",
    ).strip()

    if not api_key:
        raise RuntimeError(
            "GEMINI_API_KEY is not configured."
        )

    return api_key


# ============================================================================
# MODEL
# ============================================================================

def get_gemini_model() -> str:
    """
    Return the Gemini generation model.

    The environment variable takes precedence.

    The default is Gemini 3.5 Flash-Lite, which is suitable for
    cost-sensitive high-throughput generation. You can override it
    through GEMINI_MODEL without changing application code.
    """

    return os.getenv(
        "GEMINI_MODEL",
        "gemini-3.5-flash-lite",
    ).strip()


# ============================================================================
# OUTPUT TOKENS
# ============================================================================

def get_gemini_max_output_tokens() -> int:
    """
    Maximum number of output tokens Gemini may generate.

    Keep this relatively small for dashboard-style answers.
    """

    raw_value = os.getenv(
        "GEMINI_MAX_OUTPUT_TOKENS",
        "600",
    ).strip()

    try:
        value = int(
            raw_value
        )
    except ValueError as exc:
        raise RuntimeError(
            "GEMINI_MAX_OUTPUT_TOKENS must be an integer."
        ) from exc

    if value <= 0:
        raise RuntimeError(
            "GEMINI_MAX_OUTPUT_TOKENS must be greater than zero."
        )

    return value


# ============================================================================
# TEMPERATURE
# ============================================================================

def get_gemini_temperature() -> float:
    """
    Return Gemini temperature.

    Low temperature is preferable for grounded RAG answers because
    we want stable, evidence-driven responses rather than creative
    generation.
    """

    raw_value = os.getenv(
        "GEMINI_TEMPERATURE",
        "0.2",
    ).strip()

    try:
        value = float(
            raw_value
        )
    except ValueError as exc:
        raise RuntimeError(
            "GEMINI_TEMPERATURE must be a number."
        ) from exc

    if not 0.0 <= value <= 2.0:
        raise RuntimeError(
            "GEMINI_TEMPERATURE must be between 0.0 and 2.0."
        )

    return value


# ============================================================================
# THINKING LEVEL
# ============================================================================

def get_gemini_thinking_level() -> str:
    """
    Return Gemini thinking level.

    Supported values for the current Gemini 3 Flash family include
    low / medium / high where supported by the selected model.
    """

    value = os.getenv(
        "GEMINI_THINKING_LEVEL",
        "low",
    ).strip().lower()

    allowed = {
        "low",
        "medium",
        "high",
    }

    if value not in allowed:
        raise RuntimeError(
            "GEMINI_THINKING_LEVEL must be one of: "
            "low, medium, high."
        )

    return value


# ============================================================================
# COMBINED CONFIG
# ============================================================================

def get_gemini_config() -> dict[str, str | int | float]:
    """
    Return the complete Gemini generation configuration.

    There is intentionally no File Search configuration here.
    """

    return {
        "api_key": get_gemini_api_key(),
        "model": get_gemini_model(),
        "max_output_tokens": (
            get_gemini_max_output_tokens()
        ),
        "temperature": (
            get_gemini_temperature()
        ),
        "thinking_level": (
            get_gemini_thinking_level()
        ),
    }