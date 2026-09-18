"""
NIRMAAN AI Gemini configuration.

All Gemini settings are read from environment variables so secrets and
deployment-specific configuration are never hard-coded into application code.
"""

from __future__ import annotations

import os


def get_gemini_api_key() -> str:
    api_key = os.getenv("GEMINI_API_KEY", "").strip()

    if not api_key:
        raise RuntimeError(
            "GEMINI_API_KEY is not configured."
        )

    return api_key


def get_gemini_model() -> str:
    return os.getenv(
        "GEMINI_MODEL",
        "gemini-3.6-flash",
    ).strip()


def get_gemini_file_search_store() -> str:
    return os.getenv(
        "GEMINI_FILE_SEARCH_STORE",
        "",
    ).strip()


def get_gemini_config() -> dict[str, str]:
    return {
        "api_key": get_gemini_api_key(),
        "model": get_gemini_model(),
        "file_search_store": get_gemini_file_search_store(),
    }