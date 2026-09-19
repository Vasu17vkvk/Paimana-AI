"""
NIRMAAN AI RAG Service.

Architecture:

    User question
        |
        v
    Local BGE embedding
        |
        +---------------------------+
        |                           |
        v                           v
    pgvector search          PostgreSQL FTS
        |                           |
        +-------------+-------------+
                      |
                      v
          Weighted Reciprocal Rank Fusion
                      |
                      v
            Intent-aware local reranking
                      |
                      v
              Quality filtering
                      |
                      v
             Document diversity
                      |
                      v
               Top relevant chunks
                      |
                      v
                    Gemini
               final answer only

Gemini is NOT used for:
    - PDF ingestion
    - embeddings
    - vector search
    - keyword search
    - RAG retrieval

Existing PostgreSQL table:
    nirmaan_rag_documents

Existing embedding:
    vector(384)

Existing indexes:
    HNSW vector index
    GIN full-text index
"""

from __future__ import annotations

import re
from functools import lru_cache
from typing import Any

from sentence_transformers import SentenceTransformer
from sqlalchemy import text

from app.extensions import db
from app.services.gemini_service import generate_grounded_response


# ============================================================================
# CONFIGURATION
# ============================================================================

EMBEDDING_MODEL_NAME = "BAAI/bge-small-en-v1.5"

# ---------------------------------------------------------------------------
# Local candidate retrieval.
#
# These are local PostgreSQL operations and do NOT consume Gemini tokens.
# ---------------------------------------------------------------------------

VECTOR_TOP_K = 15
KEYWORD_TOP_K = 10


# ---------------------------------------------------------------------------
# Final number of chunks.
#
# Keep this small because only these chunks reach Gemini.
# ---------------------------------------------------------------------------

FINAL_TOP_K = 3


# ---------------------------------------------------------------------------
# Final context size.
# ---------------------------------------------------------------------------

MAX_CHUNK_CHARS = 1400
MAX_CONTEXT_CHARS = 4500


# ---------------------------------------------------------------------------
# Weighted Reciprocal Rank Fusion.
# ---------------------------------------------------------------------------

RRF_K = 60

# Semantic relevance remains the strongest signal.
VECTOR_RRF_WEIGHT = 1.75

# Keyword relevance provides an additional exact-term signal.
KEYWORD_RRF_WEIGHT = 0.75


# ---------------------------------------------------------------------------
# Diversity controls.
# ---------------------------------------------------------------------------

MAX_CHUNKS_PER_DOCUMENT = 2
MAX_CHUNKS_PER_PAGE = 1


# ---------------------------------------------------------------------------
# Intent-aware reranking.
#
# These values are intentionally small because RRF remains the primary
# relevance signal.
# ---------------------------------------------------------------------------

INTENT_TERM_BOOST = 0.00075
INTENT_SECTION_BOOST = 0.00200
ABSTRACT_PENALTY = 0.00300

# Prevent a long chunk with repeated versions of the same word from getting
# an unlimited score increase.
MAX_TERM_HITS_PER_INTENT = 4


# ============================================================================
# QUERY INTENT VOCABULARY
# ============================================================================

INTENT_TERMS: dict[str, tuple[str, ...]] = {
    "mitigation": (
        "mitigation",
        "mitigate",
        "mitigating",
        "recommendation",
        "recommendations",
        "strategy",
        "strategies",
        "action",
        "actions",
        "prevent",
        "prevention",
        "remedial",
        "response",
        "countermeasure",
        "solution",
        "solutions",
    ),
    "cause": (
        "cause",
        "causes",
        "causal",
        "reason",
        "reasons",
        "factor",
        "factors",
        "driver",
        "drivers",
        "barrier",
        "barriers",
        "challenge",
        "challenges",
        "source",
        "sources",
    ),
    "risk": (
        "risk",
        "risks",
        "threat",
        "threats",
        "uncertainty",
        "vulnerability",
        "hazard",
        "hazards",
        "risk factor",
        "risk factors",
    ),
    "delay": (
        "delay",
        "delays",
        "delayed",
        "slippage",
        "schedule",
        "scheduling",
        "late",
        "completion",
        "completion date",
        "time overrun",
        "schedule overrun",
    ),
    "contractor": (
        "contractor",
        "contractors",
        "contract management",
        "contractor management",
        "supervision",
        "workforce",
        "labour",
        "labor",
        "subcontractor",
        "subcontractors",
    ),
    "procurement": (
        "procurement",
        "supplier",
        "suppliers",
        "material",
        "materials",
        "supply chain",
        "purchase",
        "purchasing",
        "tender",
        "tenders",
    ),
    "design": (
        "design",
        "design error",
        "design errors",
        "design change",
        "design changes",
        "bim",
        "engineering",
        "redesign",
    ),
    "land": (
        "land acquisition",
        "land",
        "acquisition",
        "right of way",
        "right-of-way",
        "resettlement",
        "relocation",
    ),
    "cost": (
        "cost",
        "cost overrun",
        "cost overruns",
        "expenditure",
        "spending",
        "payment",
        "payments",
        "funding",
        "finance",
        "financial",
    ),
}


# Terms that are especially valuable in a section title.
INTENT_SECTION_TERMS: dict[str, tuple[str, ...]] = {
    "mitigation": (
        "mitigation",
        "recommendation",
        "recommendations",
        "strategy",
        "strategies",
        "action",
        "actions",
        "solution",
        "response",
        "discussion",
        "implications",
        "lessons",
    ),
    "cause": (
        "cause",
        "causes",
        "factors",
        "drivers",
        "challenges",
        "barriers",
        "risk factors",
        "findings",
        "discussion",
    ),
    "risk": (
        "risk",
        "risk identification",
        "risk assessment",
        "risk factors",
        "uncertainty",
        "threat",
    ),
    "delay": (
        "delay",
        "schedule",
        "time overrun",
        "completion",
        "slippage",
        "findings",
        "discussion",
    ),
    "contractor": (
        "contractor",
        "contract management",
        "construction management",
        "supervision",
        "workforce",
    ),
    "procurement": (
        "procurement",
        "supply chain",
        "materials",
        "supplier",
        "tender",
    ),
    "design": (
        "design",
        "engineering",
        "bim",
        "redesign",
    ),
    "land": (
        "land acquisition",
        "land",
        "right of way",
        "resettlement",
    ),
    "cost": (
        "cost",
        "payment",
        "funding",
        "financial",
        "expenditure",
    ),
}


# ============================================================================
# SYSTEM INSTRUCTION
# ============================================================================

RAG_SYSTEM_INSTRUCTION = """
You are NIRMAAN AI's infrastructure knowledge assistant.

Use the retrieved NIRMAAN knowledge passages for general infrastructure
knowledge.

Do not invent facts, statistics, standards, citations, or sources.
Do not turn general causes into confirmed causes of a specific project.
Keep answers concise, practical, and evidence-based.
Cite relevant retrieved passages as [Source N].
If evidence is insufficient, say so.
""".strip()


# ============================================================================
# EMBEDDING MODEL
# ============================================================================

@lru_cache(maxsize=1)
def get_embedding_model() -> SentenceTransformer:
    """
    Load the local BGE embedding model once per Python process.

    This runs locally and consumes no Gemini tokens.
    """
    return SentenceTransformer(
        EMBEDDING_MODEL_NAME
    )


def _embed_query(
    query: str,
) -> list[float]:
    """
    Convert a user question into a normalized BGE embedding.
    """
    model = get_embedding_model()

    retrieval_query = (
        "Represent this sentence for searching relevant passages: "
        + query
    )

    embedding = model.encode(
        retrieval_query,
        normalize_embeddings=True,
    )

    return embedding.tolist()


def _embedding_to_pgvector(
    embedding: list[float],
) -> str:
    """
    Convert a Python embedding to pgvector literal syntax.
    """
    return (
        "["
        + ",".join(
            f"{float(value):.8f}"
            for value in embedding
        )
        + "]"
    )


# ============================================================================
# OPTIONAL METADATA FILTERS
# ============================================================================

def _build_filter_sql(
    *,
    topic: str | None = None,
    country: str | None = None,
    document_type: str | None = None,
    document_year: int | None = None,
) -> tuple[str, dict[str, Any]]:
    """
    Build optional PostgreSQL filters.

    Filters are applied in PostgreSQL and never require Gemini.
    """
    conditions: list[str] = []
    params: dict[str, Any] = {}

    if topic:
        conditions.append(
            "topic = :topic"
        )
        params["topic"] = topic

    if country:
        conditions.append(
            "country = :country"
        )
        params["country"] = country

    if document_type:
        conditions.append(
            "document_type = :document_type"
        )
        params["document_type"] = document_type

    if document_year is not None:
        conditions.append(
            "document_year = :document_year"
        )
        params["document_year"] = int(
            document_year
        )

    if not conditions:
        return "", params

    return (
        " AND " + " AND ".join(conditions),
        params,
    )


# ============================================================================
# VECTOR SEARCH
# ============================================================================

def _vector_search(
    query_embedding: list[float],
    *,
    limit: int = VECTOR_TOP_K,
    topic: str | None = None,
    country: str | None = None,
    document_type: str | None = None,
    document_year: int | None = None,
) -> list[dict[str, Any]]:
    """
    Semantic search using PostgreSQL + pgvector.
    """
    vector_value = _embedding_to_pgvector(
        query_embedding
    )

    filter_sql, filter_params = _build_filter_sql(
        topic=topic,
        country=country,
        document_type=document_type,
        document_year=document_year,
    )

    sql = text(
        f"""
        SELECT
            id,
            document_name,
            document_type,
            source,
            page_number,
            section_title,
            chunk_index,
            chunk_text,
            topic,
            country,
            document_year,
            metadata,

            1 - (
                embedding <=> CAST(:embedding AS vector)
            ) AS vector_score

        FROM nirmaan_rag_documents

        WHERE
            embedding IS NOT NULL
            {filter_sql}

        ORDER BY
            embedding <=> CAST(:embedding AS vector)

        LIMIT :limit
        """
    )

    params = {
        "embedding": vector_value,
        "limit": int(limit),
        **filter_params,
    }

    result = db.session.execute(
        sql,
        params,
    )

    return [
        dict(row)
        for row in result.mappings()
    ]


# ============================================================================
# KEYWORD SEARCH
# ============================================================================

def _keyword_search(
    query: str,
    *,
    limit: int = KEYWORD_TOP_K,
    topic: str | None = None,
    country: str | None = None,
    document_type: str | None = None,
    document_year: int | None = None,
) -> list[dict[str, Any]]:
    """
    PostgreSQL full-text search.

    The original query is kept intact here. Intent-aware retrieval is applied
    after FTS rather than expanding the FTS query, avoiding overly broad
    keyword matching.
    """
    filter_sql, filter_params = _build_filter_sql(
        topic=topic,
        country=country,
        document_type=document_type,
        document_year=document_year,
    )

    sql = text(
        f"""
        SELECT
            id,
            document_name,
            document_type,
            source,
            page_number,
            section_title,
            chunk_index,
            chunk_text,
            topic,
            country,
            document_year,
            metadata,

            ts_rank_cd(
                search_vector,
                plainto_tsquery(
                    'english',
                    :query
                )
            ) AS keyword_score

        FROM nirmaan_rag_documents

        WHERE
            search_vector @@ plainto_tsquery(
                'english',
                :query
            )
            {filter_sql}

        ORDER BY
            ts_rank_cd(
                search_vector,
                plainto_tsquery(
                    'english',
                    :query
                )
            ) DESC

        LIMIT :limit
        """
    )

    params = {
        "query": query,
        "limit": int(limit),
        **filter_params,
    }

    result = db.session.execute(
        sql,
        params,
    )

    return [
        dict(row)
        for row in result.mappings()
    ]


# ============================================================================
# RECIPROCAL RANK FUSION
# ============================================================================

def _reciprocal_rank_fusion(
    vector_results: list[dict[str, Any]],
    keyword_results: list[dict[str, Any]],
    *,
    k: int = RRF_K,
) -> list[dict[str, Any]]:
    """
    Combine vector and keyword retrieval using weighted RRF.
    """
    combined: dict[
        int,
        dict[str, Any],
    ] = {}

    # ------------------------------------------------------------------
    # VECTOR RESULTS
    # ------------------------------------------------------------------

    for rank, row in enumerate(
        vector_results,
        start=1,
    ):
        row_id = int(
            row["id"]
        )

        if row_id not in combined:
            combined[row_id] = dict(
                row
            )

        current = combined[
            row_id
        ]

        current["rrf_score"] = (
            current.get(
                "rrf_score",
                0.0,
            )
            + (
                VECTOR_RRF_WEIGHT
                / (
                    k + rank
                )
            )
        )

        current["vector_rank"] = rank
        current["vector_score"] = row.get(
            "vector_score"
        )

    # ------------------------------------------------------------------
    # KEYWORD RESULTS
    # ------------------------------------------------------------------

    for rank, row in enumerate(
        keyword_results,
        start=1,
    ):
        row_id = int(
            row["id"]
        )

        if row_id not in combined:
            combined[row_id] = dict(
                row
            )

        current = combined[
            row_id
        ]

        current["rrf_score"] = (
            current.get(
                "rrf_score",
                0.0,
            )
            + (
                KEYWORD_RRF_WEIGHT
                / (
                    k + rank
                )
            )
        )

        current["keyword_rank"] = rank
        current["keyword_score"] = row.get(
            "keyword_score"
        )

    # ------------------------------------------------------------------
    # Normalize debug fields.
    # ------------------------------------------------------------------

    for row in combined.values():
        row.setdefault(
            "vector_score",
            None,
        )

        row.setdefault(
            "keyword_score",
            None,
        )

        row.setdefault(
            "vector_rank",
            None,
        )

        row.setdefault(
            "keyword_rank",
            None,
        )

        row.setdefault(
            "rrf_score",
            0.0,
        )

    results = list(
        combined.values()
    )

    results.sort(
        key=lambda item: item.get(
            "rrf_score",
            0.0,
        ),
        reverse=True,
    )

    return results


# ============================================================================
# QUERY INTENT DETECTION
# ============================================================================

def _detect_query_intents(
    query: str,
) -> set[str]:
    """
    Detect retrieval intents from the user's question.

    This is entirely local and consumes no Gemini tokens.
    """
    normalized = " ".join(
        str(query)
        .lower()
        .split()
    )

    intents: set[str] = set()

    for intent, terms in INTENT_TERMS.items():
        if any(
            term in normalized
            for term in terms
        ):
            intents.add(
                intent
            )

    return intents


def _count_intent_hits(
    text_value: str,
    terms: tuple[str, ...],
) -> int:
    """
    Count distinct matching terms with a small cap.
    """
    hits = 0

    for term in terms:
        if term in text_value:
            hits += 1

        if hits >= MAX_TERM_HITS_PER_INTENT:
            break

    return hits


def _intent_rerank(
    results: list[dict[str, Any]],
    query: str,
) -> list[dict[str, Any]]:
    """
    Locally rerank fused results using the question's intent.

    RRF remains the primary signal.

    Small local boosts improve retrieval for questions such as:
        - mitigation actions
        - common causes
        - project delay
        - contractor risks
        - procurement delays
        - design issues
        - land acquisition
        - cost overruns

    Abstracts are not automatically rejected because they can contain useful
    information. They are only slightly penalized for cause/mitigation
    questions when they do not contain action-oriented language.
    """
    intents = _detect_query_intents(
        query
    )

    if not intents:
        return results

    reranked: list[
        dict[str, Any]
    ] = []

    for result in results:
        text_value = str(
            result.get(
                "chunk_text"
            )
            or ""
        ).strip().lower()

        section = str(
            result.get(
                "section_title"
            )
            or ""
        ).strip().lower()

        boost = 0.0

        # --------------------------------------------------------------
        # Intent term boost.
        # --------------------------------------------------------------

        for intent in intents:
            term_hits = _count_intent_hits(
                text_value,
                INTENT_TERMS[
                    intent
                ],
            )

            boost += (
                min(
                    term_hits,
                    MAX_TERM_HITS_PER_INTENT,
                )
                * INTENT_TERM_BOOST
            )

            # Section-title matches are stronger because sections such as
            # "Mitigation Strategies", "Risk Factors", and "Findings" are
            # usually more targeted than a generic section.
            if any(
                term in section
                for term in INTENT_SECTION_TERMS[
                    intent
                ]
            ):
                boost += (
                    INTENT_SECTION_BOOST
                )

        # --------------------------------------------------------------
        # Soft abstract penalty.
        # --------------------------------------------------------------

                # --------------------------------------------------------------
        # Stronger abstract penalty for cause/mitigation questions.
        # --------------------------------------------------------------

        if (
            "abstract" in section
            and (
                "mitigation" in intents
                or "cause" in intents
                or "delay" in intents
                or "risk" in intents
            )
        ):
            has_action_language = any(
                term in text_value
                for term in (
                    "mitigation",
                    "mitigate",
                    "recommendation",
                    "recommendations",
                    "strategy",
                    "strategies",
                    "action",
                    "actions",
                    "prevent",
                    "prevention",
                    "solution",
                    "solutions",
                    "response",
                    "measures",
                )
            )

            if not has_action_language:
                boost -= ABSTRACT_PENALTY

        item = dict(
            result
        )

        item[
            "intent_boost"
        ] = round(
            boost,
            6,
        )

        item[
            "reranked_score"
        ] = (
            float(
                result.get(
                    "rrf_score",
                    0.0,
                )
            )
            + boost
        )

        reranked.append(
            item
        )

    reranked.sort(
        key=lambda item: item.get(
            "reranked_score",
            item.get(
                "rrf_score",
                0.0,
            ),
        ),
        reverse=True,
    )

    return reranked


# ============================================================================
# QUALITY FILTERING
# ============================================================================

def _is_low_quality_chunk(
    result: dict[str, Any],
) -> bool:
    """
    Remove poor final-context candidates.

    Filters:
        - empty chunks
        - very short chunks
        - bibliography/reference sections
        - URL-heavy chunks
        - DOI-heavy chunks
    """
    text_value = str(
        result.get(
            "chunk_text"
        )
        or ""
    ).strip().lower()

    section = str(
        result.get(
            "section_title"
        )
        or ""
    ).strip().lower()

    if not text_value:
        return True

    # Very short chunks usually do not contain enough context.
    if len(text_value) < 120:
        return True

    # Explicit reference sections.
    reference_terms = (
        "references",
        "bibliography",
        "reference list",
        "works cited",
        "references and bibliography",
    )

    if any(
        term in section
        for term in reference_terms
    ):
        return True

    # Reference-like URL density.
    url_count = (
        text_value.count(
            "http://"
        )
        + text_value.count(
            "https://"
        )
        + text_value.count(
            "www."
        )
    )

    if url_count >= 3:
        return True

    # Reference-like DOI density.
    doi_count = text_value.count(
        "doi.org"
    )

    if doi_count >= 3:
        return True

    return False


# ============================================================================
# CONTENT DUPLICATE DETECTION
# ============================================================================

def _is_same_content(
    first: dict[str, Any],
    second: dict[str, Any],
) -> bool:
    """
    Detect identical or strongly overlapping chunks.
    """
    first_text = str(
        first.get(
            "chunk_text"
        )
        or ""
    ).strip().lower()

    second_text = str(
        second.get(
            "chunk_text"
        )
        or ""
    ).strip().lower()

    if not first_text or not second_text:
        return False

    if first_text == second_text:
        return True

    shorter, longer = sorted(
        (
            first_text,
            second_text,
        ),
        key=len,
    )

    # Detect substantial overlap created by ingestion chunk overlap.
    if (
        len(shorter) >= 300
        and shorter in longer
    ):
        return True

    return False


# ============================================================================
# DOCUMENT DIVERSITY
# ============================================================================

def _diversify_results(
    results: list[dict[str, Any]],
    *,
    limit: int = FINAL_TOP_K,
) -> list[dict[str, Any]]:
    """
    Select a high-quality, diverse result set.

    Pass 1:
        One strong chunk per document.

    Pass 2:
        Allow a second chunk from a document when useful.

    Pass 3:
        Fill remaining slots while respecting document/duplicate limits.

    This prevents one large document from dominating the Gemini context.
    """
    filtered_results = [
        result
        for result in results
        if not _is_low_quality_chunk(
            result
        )
    ]

    selected: list[
        dict[str, Any]
    ] = []

    document_counts: dict[
        str,
        int,
    ] = {}

    page_counts: dict[
        tuple[str, int],
        int,
    ] = {}

    # ------------------------------------------------------------------
    # PASS 1
    # One chunk per document.
    # ------------------------------------------------------------------

    for result in filtered_results:
        if len(selected) >= limit:
            break

        document_name = str(
            result.get(
                "document_name"
            )
            or ""
        )

        if not document_name:
            continue

        if document_counts.get(
            document_name,
            0,
        ) >= 1:
            continue

        if any(
            _is_same_content(
                result,
                existing,
            )
            for existing in selected
        ):
            continue

        selected.append(
            result
        )

        document_counts[
            document_name
        ] = 1

        page_number = result.get(
            "page_number"
        )

        if page_number is not None:
            page_key = (
                document_name,
                int(page_number),
            )

            page_counts[
                page_key
            ] = 1

    # ------------------------------------------------------------------
    # PASS 2
    # Allow a second chunk from the same document.
    # ------------------------------------------------------------------

    for result in filtered_results:
        if len(selected) >= limit:
            break

        if result in selected:
            continue

        document_name = str(
            result.get(
                "document_name"
            )
            or ""
        )

        if not document_name:
            continue

        current_document_count = (
            document_counts.get(
                document_name,
                0,
            )
        )

        if current_document_count >= MAX_CHUNKS_PER_DOCUMENT:
            continue

        page_number = result.get(
            "page_number"
        )

        if page_number is not None:
            page_key = (
                document_name,
                int(page_number),
            )

            if page_counts.get(
                page_key,
                0,
            ) >= MAX_CHUNKS_PER_PAGE:
                continue

        if any(
            _is_same_content(
                result,
                existing,
            )
            for existing in selected
        ):
            continue

        selected.append(
            result
        )

        document_counts[
            document_name
        ] = (
            current_document_count
            + 1
        )

        if page_number is not None:
            page_key = (
                document_name,
                int(page_number),
            )

            page_counts[
                page_key
            ] = (
                page_counts.get(
                    page_key,
                    0,
                )
                + 1
            )

    # ------------------------------------------------------------------
    # PASS 3
    # Fill remaining slots.
    # ------------------------------------------------------------------

    for result in filtered_results:
        if len(selected) >= limit:
            break

        if result in selected:
            continue

        document_name = str(
            result.get(
                "document_name"
            )
            or ""
        )

        if not document_name:
            continue

        current_document_count = (
            document_counts.get(
                document_name,
                0,
            )
        )

        if current_document_count >= MAX_CHUNKS_PER_DOCUMENT:
            continue

        if any(
            _is_same_content(
                result,
                existing,
            )
            for existing in selected
        ):
            continue

        selected.append(
            result
        )

        document_counts[
            document_name
        ] = (
            current_document_count
            + 1
        )

    return selected


# ============================================================================
# CONTEXT COMPACTION
# ============================================================================

def _compact_chunks(
    chunks: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    Apply final per-chunk and total context budgets.

    This affects only text sent to Gemini. Retrieval itself stays local.
    """
    compacted: list[
        dict[str, Any]
    ] = []

    total_chars = 0

    for chunk in chunks:
        if len(compacted) >= FINAL_TOP_K:
            break

        content = str(
            chunk.get(
                "chunk_text"
            )
            or ""
        ).strip()

        if not content:
            continue

        # Per-chunk budget.
        content = content[
            :MAX_CHUNK_CHARS
        ]

        remaining = (
            MAX_CONTEXT_CHARS
            - total_chars
        )

        if remaining <= 0:
            break

        if len(content) > remaining:
            content = content[
                :remaining
            ]

        item = dict(
            chunk
        )

        item[
            "chunk_text"
        ] = content

        compacted.append(
            item
        )

        total_chars += len(
            content
        )

    return compacted


# ============================================================================
# PUBLIC RETRIEVAL
# ============================================================================

def retrieve_knowledge(
    question: str,
    *,
    top_k: int = FINAL_TOP_K,
    topic: str | None = None,
    country: str | None = None,
    document_type: str | None = None,
    document_year: int | None = None,
) -> list[dict[str, Any]]:
    """
    Retrieve relevant local RAG knowledge.

    Pipeline:
        1. BGE embedding
        2. pgvector search
        3. PostgreSQL full-text search
        4. Weighted RRF
        5. Intent-aware reranking
        6. Quality filtering
        7. Document diversity
        8. Context compaction

    Gemini is NOT called here.
    """
    query = str(
        question
    ).strip()

    if not query:
        raise ValueError(
            "question is required."
        )

    if top_k <= 0:
        raise ValueError(
            "top_k must be greater than zero."
        )

    top_k = min(
        int(top_k),
        FINAL_TOP_K,
    )

    # ------------------------------------------------------------------
    # 1. Local embedding.
    # ------------------------------------------------------------------

    query_embedding = _embed_query(
        query
    )

    # ------------------------------------------------------------------
    # 2. Vector retrieval.
    # ------------------------------------------------------------------

    vector_results = _vector_search(
        query_embedding,
        limit=VECTOR_TOP_K,
        topic=topic,
        country=country,
        document_type=document_type,
        document_year=document_year,
    )

    # ------------------------------------------------------------------
    # 3. Keyword retrieval.
    # ------------------------------------------------------------------

    keyword_results = _keyword_search(
        query,
        limit=KEYWORD_TOP_K,
        topic=topic,
        country=country,
        document_type=document_type,
        document_year=document_year,
    )

    # ------------------------------------------------------------------
    # 4. Weighted RRF.
    # ------------------------------------------------------------------

    fused_results = _reciprocal_rank_fusion(
        vector_results,
        keyword_results,
    )

    # ------------------------------------------------------------------
    # 5. Local intent-aware reranking.
    # ------------------------------------------------------------------

    reranked_results = _intent_rerank(
        fused_results,
        query,
    )

    # ------------------------------------------------------------------
    # 6. Quality filtering + document diversity.
    # ------------------------------------------------------------------

    diversified_results = _diversify_results(
        reranked_results,
        limit=top_k,
    )

    # ------------------------------------------------------------------
    # 7. Final context budget.
    # ------------------------------------------------------------------

    return _compact_chunks(
        diversified_results
    )


# ============================================================================
# DEBUG RETRIEVAL
# ============================================================================

def debug_retrieval(
    question: str,
    *,
    top_k: int = FINAL_TOP_K,
) -> list[dict[str, Any]]:
    """
    Debug the complete local retrieval pipeline.

    Gemini is NOT called.

    Returns:
        vector score
        keyword score
        vector rank
        keyword rank
        RRF score
        intent boost
        reranked score
        document metadata
        chunk text
    """
    query = str(
        question
    ).strip()

    if not query:
        raise ValueError(
            "question is required."
        )

    if top_k <= 0:
        raise ValueError(
            "top_k must be greater than zero."
        )

    query_embedding = _embed_query(
        query
    )

    vector_results = _vector_search(
        query_embedding,
        limit=VECTOR_TOP_K,
    )

    keyword_results = _keyword_search(
        query,
        limit=KEYWORD_TOP_K,
    )

    fused_results = _reciprocal_rank_fusion(
        vector_results,
        keyword_results,
    )

    reranked_results = _intent_rerank(
        fused_results,
        query,
    )

    diversified_results = _diversify_results(
        reranked_results,
        limit=min(
            int(top_k),
            FINAL_TOP_K,
        ),
    )

    selected = _compact_chunks(
        diversified_results
    )

    return [
        {
            "id": item.get(
                "id"
            ),
            "document_name": item.get(
                "document_name"
            ),
            "document_type": item.get(
                "document_type"
            ),
            "source": item.get(
                "source"
            ),
            "page_number": item.get(
                "page_number"
            ),
            "section_title": item.get(
                "section_title"
            ),
            "chunk_index": item.get(
                "chunk_index"
            ),
            "topic": item.get(
                "topic"
            ),
            "country": item.get(
                "country"
            ),
            "document_year": item.get(
                "document_year"
            ),
            "vector_score": item.get(
                "vector_score"
            ),
            "keyword_score": item.get(
                "keyword_score"
            ),
            "rrf_score": item.get(
                "rrf_score"
            ),
            "vector_rank": item.get(
                "vector_rank"
            ),
            "keyword_rank": item.get(
                "keyword_rank"
            ),
            "intent_boost": item.get(
                "intent_boost",
                0.0,
            ),
            "reranked_score": item.get(
                "reranked_score",
                item.get(
                    "rrf_score",
                    0.0,
                ),
            ),
            "chunk_text": item.get(
                "chunk_text"
            ),
        }
        for item in selected
    ]


# ============================================================================
# COMPACT RAG CONTEXT FOR GEMINI
# ============================================================================

def _build_rag_context(
    chunks: list[dict[str, Any]],
) -> str:
    """
    Build a token-efficient source-labelled context.

    Only document name, page, section, and content are sent to Gemini.
    Other metadata remains available through the citation object.
    """
    chunks = _compact_chunks(
        chunks
    )

    if not chunks:
        return (
            "No relevant knowledge passages were retrieved."
        )

    parts: list[str] = []

    for index, chunk in enumerate(
        chunks,
        start=1,
    ):
        document_name = str(
            chunk.get(
                "document_name"
            )
            or "Unknown document"
        )

        page_number = chunk.get(
            "page_number"
        )

        section_title = str(
            chunk.get(
                "section_title"
            )
            or ""
        ).strip()

        content = str(
            chunk.get(
                "chunk_text"
            )
            or ""
        ).strip()

        label = (
            f"[Source {index}] "
            f"{document_name}"
        )

        if page_number is not None:
            label += (
                f", p.{page_number}"
            )

        if section_title:
            label += (
                f" | {section_title}"
            )

        parts.append(
            f"{label}\n{content}"
        )

    return "\n\n".join(
        parts
    )


# ============================================================================
# CITATIONS
# ============================================================================

def _build_citations(
    chunks: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    Build citation metadata from PostgreSQL.

    Gemini does not generate these citations.
    """
    chunks = _compact_chunks(
        chunks
    )

    citations: list[
        dict[str, Any]
    ] = []

    for index, chunk in enumerate(
        chunks,
        start=1,
    ):
        citations.append(
            {
                "type": "rag_source",
                "source_number": index,
                "document_name": chunk.get(
                    "document_name"
                ),
                "document_type": chunk.get(
                    "document_type"
                ),
                "source": chunk.get(
                    "source"
                ),
                "page_number": chunk.get(
                    "page_number"
                ),
                "section_title": chunk.get(
                    "section_title"
                ),
                "topic": chunk.get(
                    "topic"
                ),
                "country": chunk.get(
                    "country"
                ),
                "document_year": chunk.get(
                    "document_year"
                ),
                "chunk_index": chunk.get(
                    "chunk_index"
                ),
            }
        )

    return citations


# ============================================================================
# FINAL RAG ANSWER
# ============================================================================

def answer_from_knowledge_base(
    question: str,
    *,
    top_k: int = FINAL_TOP_K,
    topic: str | None = None,
    country: str | None = None,
    document_type: str | None = None,
    document_year: int | None = None,
) -> dict[str, Any]:
    """
    Retrieve local knowledge and ask Gemini for one final answer.

    Retrieval:
        PostgreSQL + pgvector + PostgreSQL FTS

    Generation:
        One Gemini call
    """
    query = str(
        question
    ).strip()

    if not query:
        raise ValueError(
            "question is required."
        )

    # ------------------------------------------------------------------
    # Local retrieval.
    # ------------------------------------------------------------------

    chunks = retrieve_knowledge(
        query,
        top_k=top_k,
        topic=topic,
        country=country,
        document_type=document_type,
        document_year=document_year,
    )

    # ------------------------------------------------------------------
    # No useful retrieval.
    # ------------------------------------------------------------------

    if not chunks:
        return {
            "text": (
                "I could not find sufficiently relevant "
                "information in the NIRMAAN knowledge base "
                "to answer that question."
            ),
            "citations": [],
            "retrieved_chunks": [],
            "model": None,
            "usage": {},
            "source": "postgresql_pgvector",
        }

    # ------------------------------------------------------------------
    # Compact Gemini context.
    # ------------------------------------------------------------------

    rag_context = _build_rag_context(
        chunks
    )

    prompt = (
        "QUESTION\n"
        f"{query}\n\n"

        "RETRIEVED NIRMAAN KNOWLEDGE\n"
        f"{rag_context}\n\n"

        "INSTRUCTIONS\n"
        "Answer only from the supplied knowledge. "
        "Do not invent facts or citations. "
        "Use [Source N] for relevant evidence. "
        "Preserve important limitations. "
        "Do not turn general knowledge into a confirmed "
        "project-specific cause. "
        "Keep the answer concise and practical."
    )

    # ------------------------------------------------------------------
    # Exactly ONE Gemini generation call.
    # ------------------------------------------------------------------

    result = generate_grounded_response(
        prompt,
        system_instruction=RAG_SYSTEM_INSTRUCTION,
    )

    compacted_chunks = _compact_chunks(
        chunks
    )

    return {
        "text": result.get(
            "text",
            "",
        ),
        "citations": _build_citations(
            compacted_chunks
        ),
        "retrieved_chunks": [
            {
                "id": chunk.get(
                    "id"
                ),
                "document_name": chunk.get(
                    "document_name"
                ),
                "document_type": chunk.get(
                    "document_type"
                ),
                "page_number": chunk.get(
                    "page_number"
                ),
                "section_title": chunk.get(
                    "section_title"
                ),
                "topic": chunk.get(
                    "topic"
                ),
                "country": chunk.get(
                    "country"
                ),
                "document_year": chunk.get(
                    "document_year"
                ),
                "vector_score": chunk.get(
                    "vector_score"
                ),
                "keyword_score": chunk.get(
                    "keyword_score"
                ),
                "rrf_score": chunk.get(
                    "rrf_score"
                ),
                "vector_rank": chunk.get(
                    "vector_rank"
                ),
                "keyword_rank": chunk.get(
                    "keyword_rank"
                ),
                "intent_boost": chunk.get(
                    "intent_boost",
                    0.0,
                ),
                "reranked_score": chunk.get(
                    "reranked_score",
                    chunk.get(
                        "rrf_score",
                        0.0,
                    ),
                ),
            }
            for chunk in compacted_chunks
        ],
        "model": result.get(
            "model"
        ),
        "usage": result.get(
            "usage",
            {},
        ),
        "source": "postgresql_pgvector",
    }