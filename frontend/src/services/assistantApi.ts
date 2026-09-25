import { apiRequest } from "./api";

import {
    getBrowserQueryEmbedding,
} from "../rag/browserEmbedding";


// ============================================================================
// ASSISTANT API TYPES
// ============================================================================

export type AssistantQueryType =
    | "FACT_QUERY"
    | "ML_QUERY"
    | "RAG_QUERY"
    | "HYBRID_QUERY"
    | "GENERAL_QUERY"
    | "ANALYTICS_QUERY";


export interface AssistantCitation {
    type: string;
    source_number: number;
    document_name: string | null;
    document_type: string | null;
    source: string | null;
    page_number: number | null;
    section_title: string | null;
    topic: string | null;
    country: string | null;
    document_year: number | null;
    chunk_index: number | null;
}


export interface AssistantRetrievedChunk {
    id: number;
    document_name: string | null;
    document_type: string | null;
    source: string | null;
    page_number: number | null;
    section_title: string | null;
    topic: string | null;
    country: string | null;
    document_year: number | null;

    vector_score: number | null;
    keyword_score: number | null;
    rrf_score: number | null;
    vector_rank: number | null;
    keyword_rank: number | null;

    // Present only if the backend exposes chunk text.
    chunk_text?: string;
}


export interface AssistantUsage {
    prompt_tokens: number | null;
    output_tokens: number | null;
    thought_tokens: number | null;
    cached_tokens: number | null;
    tool_tokens: number | null;
    total_tokens: number | null;
}


export interface AssistantResponseData {
    text: string;
    query_type: AssistantQueryType;
    project_code: string | null;

    citations: AssistantCitation[];
    retrieved_chunks: AssistantRetrievedChunk[];

    model_used: boolean;
    model?: string | null;

    usage?: AssistantUsage;

    source: string;
}


export interface AssistantQueryResponse
    extends AssistantResponseData {
    success: boolean;
}


export interface AssistantQueryRequest {
    question: string;
    project_code?: string | null;

    /**
     * Optional browser-generated BGE embedding.
     *
     * The backend validates that this contains exactly
     * 384 numeric values.
     *
     * When omitted, the backend uses its existing
     * FastEmbed fallback.
     */
    query_embedding?: number[] | null;
}


// ============================================================================
// PROJECT SELECTOR TYPES
// ============================================================================

export interface AssistantProjectOption {
    project_code: string;
    project_name: string | null;
}


export interface AssistantProjectsResponse {
    success: boolean;
    count: number;
    projects: AssistantProjectOption[];
}


// ============================================================================
// POST /api/assistant/query
// ============================================================================

export async function askAssistant(
    question: string,
    projectCode?: string | null,
): Promise<AssistantQueryResponse> {

    const trimmedQuestion =
        question.trim();

    if (!trimmedQuestion) {
        throw new Error(
            "Question is required.",
        );
    }

    // ------------------------------------------------------------------------
    // Build the normal request first.
    //
    // We intentionally keep the embedding optional.
    // If browser BGE cannot initialize, load, or infer,
    // getBrowserQueryEmbedding() returns null and the backend
    // automatically falls back to FastEmbed.
    // ------------------------------------------------------------------------

    const body:
        AssistantQueryRequest = {
        question: trimmedQuestion,
    };

    // ------------------------------------------------------------------------
    // Project code
    // ------------------------------------------------------------------------

    if (
        projectCode !== undefined &&
        projectCode !== null
    ) {

        const trimmedProjectCode =
            String(projectCode).trim();

        if (trimmedProjectCode) {

            body.project_code =
                trimmedProjectCode;
        }
    }

    // ------------------------------------------------------------------------
    // Browser-side BGE embedding
    // ------------------------------------------------------------------------
    //
    // This is deliberately attempted before the API request so the
    // backend receives a ready-to-use 384-dimensional vector.
    //
    // If anything fails, null is returned and the backend retains
    // the existing FastEmbed fallback.
    // ------------------------------------------------------------------------

    try {

        const queryEmbedding =
            await getBrowserQueryEmbedding(
                trimmedQuestion,
            );

        if (
            queryEmbedding !== null
        ) {

            body.query_embedding =
                queryEmbedding;
        }

    } catch {
        // ------------------------------------------------------------
        // Never allow browser embedding failure to break the Assistant.
        //
        // The backend will fall back to its existing FastEmbed path.
        // ------------------------------------------------------------
    }

    // ------------------------------------------------------------------------
    // Send request
    // ------------------------------------------------------------------------

    return apiRequest<AssistantQueryResponse>(
        "/assistant/query",
        {
            method: "POST",

            body: JSON.stringify(
                body,
            ),
        },
    );
}


// ============================================================================
// GET /api/assistant/projects
// ============================================================================

export async function getAssistantProjects(): Promise<AssistantProjectsResponse> {

    return apiRequest<AssistantProjectsResponse>(
        "/assistant/projects",
    );
}


// ============================================================================
// GET /api/assistant/health
// ============================================================================

export interface AssistantHealthResponse {
    success: boolean;
    service: string;
    status: string;
}


export async function getAssistantHealth(): Promise<AssistantHealthResponse> {

    return apiRequest<AssistantHealthResponse>(
        "/assistant/health",
    );
}