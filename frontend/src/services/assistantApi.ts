import { apiRequest } from "./api";


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

    const body:
        AssistantQueryRequest = {
        question: trimmedQuestion,
    };

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

    return apiRequest<AssistantQueryResponse>(
        "/assistant/query",
        {
            method: "POST",
            body: JSON.stringify(body),
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