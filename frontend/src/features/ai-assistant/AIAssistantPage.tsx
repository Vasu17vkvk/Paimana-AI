import {
    useMemo,
    useRef,
    useState,
} from "react";

import type {
    SyntheticEvent,
} from "react";

import {
    askAssistant,
    getAssistantProjects,
    type AssistantCitation,
    type AssistantProjectOption,
    type AssistantResponseData,
} from "../../services/assistantApi";


// ============================================================================
// MESSAGE TYPES
// ============================================================================

interface ChatMessage {
    id: string;
    role: "user" | "assistant";
    text: string;
    data?: AssistantResponseData;
}


// ============================================================================
// HELPERS
// ============================================================================

function formatSource(
    citation: AssistantCitation,
): string {
    const documentName =
        citation.document_name ||
        "Unknown document";

    const page =
        citation.page_number !== null &&
            citation.page_number !== undefined
            ? ` · p.${citation.page_number}`
            : "";

    return `${documentName}${page}`;
}


function formatQueryType(
    queryType: string,
): string {
    return queryType
        .replace("_QUERY", "")
        .replaceAll("_", " ");
}

const ANALYTICS_PREVIEW_LINES = 16;


function getAnalyticsDisplay(
    message: ChatMessage,
    expanded: boolean,
): {
    text: string;
    hasMore: boolean;
} {
    if (
        message.role !== "assistant" ||
        message.data?.query_type !== "ANALYTICS_QUERY"
    ) {
        return {
            text: message.text,
            hasMore: false,
        };
    }

    const lines = message.text.split("\n");

    if (
        lines.length <= ANALYTICS_PREVIEW_LINES ||
        expanded
    ) {
        return {
            text: message.text,
            hasMore: false,
        };
    }

    return {
        text: lines
            .slice(
                0,
                ANALYTICS_PREVIEW_LINES,
            )
            .join("\n"),
        hasMore: true,
    };
}


// ============================================================================
// COMPONENT
// ============================================================================

export default function AIAssistantPage() {

    // ------------------------------------------------------------------------
    // Assistant state
    // ------------------------------------------------------------------------

    const [
        question,
        setQuestion,
    ] = useState("");

    const [
        projectCode,
        setProjectCode,
    ] = useState("");

    const [
        messages,
        setMessages,
    ] = useState<ChatMessage[]>([]);

    const [
        isLoading,
        setIsLoading,
    ] = useState(false);

    const [
        error,
        setError,
    ] = useState<string | null>(null);

    const [expandedMessageIds, setExpandedMessageIds] =
        useState<Set<string>>(new Set());


    // ------------------------------------------------------------------------
    // Project selector state
    // ------------------------------------------------------------------------

    const [
        projectOptions,
        setProjectOptions,
    ] = useState<AssistantProjectOption[]>([]);

    const [
        projectSearch,
        setProjectSearch,
    ] = useState("");

    const [
        projectDropdownOpen,
        setProjectDropdownOpen,
    ] = useState(false);

    const [
        projectsLoading,
        setProjectsLoading,
    ] = useState(false);

    const [
        projectsLoaded,
        setProjectsLoaded,
    ] = useState(false);

    const [
        projectsError,
        setProjectsError,
    ] = useState<string | null>(null);

    const projectSelectorRef =
        useRef<HTMLDivElement | null>(null);


    // ------------------------------------------------------------------------
    // Submit state
    // ------------------------------------------------------------------------

    const canSubmit =
        question.trim().length > 0 &&
        !isLoading;


    // ------------------------------------------------------------------------
    // Latest assistant response
    // ------------------------------------------------------------------------

    const latestAssistantData =
        useMemo(() => {
            const assistantMessages =
                messages.filter(
                    (message) =>
                        message.role ===
                        "assistant",
                );

            return assistantMessages.length > 0
                ? assistantMessages[
                    assistantMessages.length - 1
                ].data
                : undefined;
        }, [
            messages,
        ]);


    // ------------------------------------------------------------------------
    // Selected project
    // ------------------------------------------------------------------------

    const selectedProject =
        useMemo(() => {
            if (!projectCode) {
                return undefined;
            }

            return projectOptions.find(
                (project) =>
                    String(
                        project.project_code,
                    ) === projectCode,
            );
        }, [
            projectCode,
            projectOptions,
        ]);


    // ------------------------------------------------------------------------
    // Local project search
    // ------------------------------------------------------------------------

    const filteredProjects =
        useMemo(() => {
            const search =
                projectSearch
                    .trim()
                    .toLowerCase();

            if (!search) {
                return projectOptions.slice(
                    0,
                    100,
                );
            }

            return projectOptions
                .filter(
                    (project) => {
                        const code =
                            String(
                                project.project_code ||
                                "",
                            ).toLowerCase();

                        const name =
                            String(
                                project.project_name ||
                                "",
                            ).toLowerCase();

                        return (
                            code.includes(search) ||
                            name.includes(search)
                        );
                    },
                )
                .slice(
                    0,
                    100,
                );
        }, [
            projectOptions,
            projectSearch,
        ]);


    // ------------------------------------------------------------------------
    // Load project list lazily.
    //
    // IMPORTANT:
    // This does NOT run when the page first opens.
    // It runs only when the user opens the selector.
    //
    // After loading, all searching is done locally.
    // ------------------------------------------------------------------------

    async function loadProjects() {

        if (
            projectsLoaded ||
            projectsLoading
        ) {
            return;
        }

        setProjectsLoading(true);
        setProjectsError(null);

        try {
            const response =
                await getAssistantProjects();

            const projects =
                Array.isArray(
                    response.projects,
                )
                    ? response.projects
                    : [];

            setProjectOptions(
                projects,
            );

            setProjectsLoaded(true);

        } catch (requestError) {
            const message =
                requestError instanceof Error
                    ? requestError.message
                    : "Unable to load project codes.";

            setProjectsError(
                message,
            );

        } finally {
            setProjectsLoading(false);
        }
    }


    // ------------------------------------------------------------------------
    // Open selector
    // ------------------------------------------------------------------------

    async function openProjectSelector() {
        setProjectDropdownOpen(
            true,
        );

        setProjectSearch(
            "",
        );

        await loadProjects();
    }


    // ------------------------------------------------------------------------
    // Select project
    // ------------------------------------------------------------------------

    function handleSelectProject(
        project: AssistantProjectOption,
    ) {
        const code =
            String(
                project.project_code,
            ).trim();

        if (!code) {
            return;
        }

        setProjectCode(
            code,
        );

        setProjectSearch(
            "",
        );

        setProjectDropdownOpen(
            false,
        );

        setError(null);
    }


    // ------------------------------------------------------------------------
    // Clear project
    // ------------------------------------------------------------------------

    function handleClearProject() {
        setProjectCode(
            "",
        );

        setProjectSearch(
            "",
        );

        setProjectDropdownOpen(
            false,
        );
    }


    // ------------------------------------------------------------------------
    // Close selector when clicking outside.
    // ------------------------------------------------------------------------

    function handleProjectBlur(
        event: React.FocusEvent<HTMLDivElement>,
    ) {
        const nextTarget =
            event.relatedTarget as Node | null;

        if (
            nextTarget &&
            projectSelectorRef.current?.contains(
                nextTarget,
            )
        ) {
            return;
        }

        setProjectDropdownOpen(
            false,
        );

        if (projectCode) {
            setProjectSearch(
                "",
            );
        }
    }


    // ------------------------------------------------------------------------
    // SEND QUESTION
    // ------------------------------------------------------------------------

    async function handleSubmit(
        event: SyntheticEvent<HTMLFormElement>,
    ) {
        event.preventDefault();

        const trimmedQuestion =
            question.trim();

        if (
            !trimmedQuestion ||
            isLoading
        ) {
            return;
        }

        setError(null);

        const userMessage: ChatMessage = {
            id:
                `${Date.now()}-user`,
            role: "user",
            text:
                trimmedQuestion,
        };

        setMessages(
            (current) => [
                ...current,
                userMessage,
            ],
        );

        setQuestion("");

        setIsLoading(true);

        try {
            const response =
                await askAssistant(
                    trimmedQuestion,
                    projectCode.trim() ||
                    undefined,
                );

            const rawAssistantData =
                response.data;

            // --------------------------------------------------------------
            // Normalize optional arrays.
            // --------------------------------------------------------------

            const assistantData:
                AssistantResponseData = {
                ...rawAssistantData,

                citations:
                    rawAssistantData
                        .citations ??
                    [],

                retrieved_chunks:
                    rawAssistantData
                        .retrieved_chunks ??
                    [],
            };

            const assistantMessage:
                ChatMessage = {
                id:
                    `${Date.now()}-assistant`,

                role: "assistant",

                text:
                    assistantData.text ||
                    "No answer was returned.",

                data:
                    assistantData,
            };

            setMessages(
                (current) => [
                    ...current,
                    assistantMessage,
                ],
            );

        } catch (requestError) {
            const message =
                requestError instanceof Error
                    ? requestError.message
                    : "Unable to connect to the assistant API.";

            setError(
                message,
            );

        } finally {
            setIsLoading(
                false,
            );
        }
    }


    // ------------------------------------------------------------------------
    // CLEAR CHAT
    // ------------------------------------------------------------------------

    function clearChat() {
        setMessages([]);
        setExpandedMessageIds(new Set());
        setError(null);
    }

    function toggleExpandedMessage(
        messageId: string,
    ) {
        setExpandedMessageIds((current) => {
            const next = new Set(current);

            if (next.has(messageId)) {
                next.delete(messageId);
            } else {
                next.add(messageId);
            }

            return next;
        });
    }


    // ------------------------------------------------------------------------
    // UI
    // ------------------------------------------------------------------------

    return (
        <div className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">

            {/* ==================================================================
                HEADER
            ================================================================== */}

            <div className="mb-6">

                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    PAIMANA AI
                </div>


                <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">

                    <div>

                        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                            AI Project Assistant
                        </h1>


                        <p className="mt-1 max-w-3xl text-sm text-slate-500">
                            Ask about project facts, ML risk predictions,
                            infrastructure knowledge, or project-specific
                            risks and mitigation actions.
                        </p>

                    </div>


                    {messages.length > 0 && (
                        <button
                            type="button"
                            onClick={clearChat}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                        >
                            Clear chat
                        </button>
                    )}

                </div>

            </div>


            {/* ==================================================================
                MAIN GRID
            ================================================================== */}

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">

                {/* =================================================================
                    CHAT
                ================================================================= */}

                <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">

                    {/* ----------------------------------------------------------------
                        Conversation header
                    ---------------------------------------------------------------- */}

                    <div className="border-b border-slate-100 px-5 py-4">

                        <div className="text-sm font-semibold text-slate-900">
                            Conversation
                        </div>


                        <div className="mt-1 text-xs text-slate-500">
                            Responses are grounded in your PostgreSQL,
                            ML, and local RAG pipeline.
                        </div>

                    </div>


                    {/* ----------------------------------------------------------------
                        Messages
                    ---------------------------------------------------------------- */}

                    <div className="min-h-[460px] space-y-5 p-5">

                        {messages.length === 0 ? (

                            <div className="flex min-h-[400px] items-center justify-center">

                                <div className="max-w-xl text-center">

                                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">

                                        <span className="text-xl font-bold">
                                            AI
                                        </span>

                                    </div>


                                    <h2 className="mt-4 text-lg font-semibold text-slate-900">
                                        Ask NIRMAAN AI
                                    </h2>


                                    <p className="mt-2 text-sm leading-6 text-slate-500">
                                        Try questions such as:
                                    </p>


                                    <div className="mt-4 grid gap-2 text-left sm:grid-cols-2">

                                        {[
                                            "What is the physical progress of project 400005?",
                                            "What is the risk score for project 400005?",
                                            "What are the common causes of infrastructure delays?",
                                            "Why is project 400005 at risk of delay?",
                                        ].map(
                                            (example) => (
                                                <button
                                                    key={example}
                                                    type="button"
                                                    onClick={() =>
                                                        setQuestion(
                                                            example,
                                                        )
                                                    }
                                                    className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm text-slate-700 transition hover:border-slate-300 hover:bg-white"
                                                >
                                                    {example}
                                                </button>
                                            ),
                                        )}

                                    </div>

                                </div>

                            </div>

                        ) : (

                            <>
                                {messages.map(
                                    (
                                        message,
                                    ) => (

                                        <div
                                            key={message.id}
                                            className={
                                                message.role ===
                                                    "user"
                                                    ? "flex justify-end"
                                                    : "flex justify-start"
                                            }
                                        >

                                            <div
                                                className={
                                                    message.role ===
                                                        "user"
                                                        ? "max-w-[85%] rounded-2xl rounded-br-md bg-slate-900 px-4 py-3 text-sm text-white"
                                                        : "max-w-[92%] rounded-2xl rounded-bl-md border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-800"
                                                }
                                            >

                                                {(() => {
                                                    const expanded =
                                                        expandedMessageIds.has(
                                                            message.id,
                                                        );

                                                    const display =
                                                        getAnalyticsDisplay(
                                                            message,
                                                            expanded,
                                                        );

                                                    return (
                                                        <>
                                                            <div className="whitespace-pre-wrap leading-6">
                                                                {display.text}
                                                            </div>

                                                            {display.hasMore && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        toggleExpandedMessage(
                                                                            message.id,
                                                                        )
                                                                    }
                                                                    className="mt-3 text-xs font-semibold text-slate-600 underline underline-offset-2 transition hover:text-slate-900"
                                                                >
                                                                    Show more
                                                                </button>
                                                            )}

                                                            {message.role === "assistant" &&
                                                                message.data?.query_type ===
                                                                "ANALYTICS_QUERY" &&
                                                                expanded &&
                                                                message.text.split("\n").length >
                                                                ANALYTICS_PREVIEW_LINES && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() =>
                                                                            toggleExpandedMessage(
                                                                                message.id,
                                                                            )
                                                                        }
                                                                        className="mt-3 text-xs font-semibold text-slate-600 underline underline-offset-2 transition hover:text-slate-900"
                                                                    >
                                                                        Show less
                                                                    </button>
                                                                )}
                                                        </>
                                                    );
                                                })()}


                                                {message.role ===
                                                    "assistant" &&
                                                    message.data && (

                                                        <div className="mt-4 space-y-3 border-t border-slate-200 pt-3">

                                                            {/* =================================================
                                                                Query metadata
                                                            ================================================= */}

                                                            <div className="flex flex-wrap gap-2">

                                                                <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200">
                                                                    {formatQueryType(
                                                                        message
                                                                            .data
                                                                            .query_type,
                                                                    )}
                                                                </span>


                                                                {message
                                                                    .data
                                                                    .model_used &&
                                                                    message
                                                                        .data
                                                                        .model && (

                                                                        <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200">
                                                                            {
                                                                                message
                                                                                    .data
                                                                                    .model
                                                                            }
                                                                        </span>

                                                                    )}


                                                                {message
                                                                    .data
                                                                    .project_code && (

                                                                        <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200">
                                                                            Project{" "}
                                                                            {
                                                                                message
                                                                                    .data
                                                                                    .project_code
                                                                            }
                                                                        </span>

                                                                    )}

                                                            </div>


                                                            {/* =================================================
                                                                Citations
                                                            ================================================= */}

                                                            {(
                                                                message
                                                                    .data
                                                                    .citations ??
                                                                []
                                                            ).length > 0 && (

                                                                    <div>

                                                                        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                                                            Sources
                                                                        </div>


                                                                        <div className="space-y-2">

                                                                            {(
                                                                                message
                                                                                    .data
                                                                                    .citations ??
                                                                                []
                                                                            ).map(
                                                                                (
                                                                                    citation,
                                                                                ) => (

                                                                                    <div
                                                                                        key={`${citation.source_number}-${citation.document_name}`}
                                                                                        className="rounded-lg border border-slate-200 bg-white px-3 py-2"
                                                                                    >

                                                                                        <div className="text-xs font-semibold text-slate-700">
                                                                                            [
                                                                                            {
                                                                                                citation.source_number
                                                                                            }
                                                                                            ]{" "}
                                                                                            {formatSource(
                                                                                                citation,
                                                                                            )}
                                                                                        </div>


                                                                                        {citation.section_title && (

                                                                                            <div className="mt-1 text-[11px] text-slate-500">
                                                                                                {
                                                                                                    citation.section_title
                                                                                                }
                                                                                            </div>

                                                                                        )}

                                                                                    </div>

                                                                                ),
                                                                            )}

                                                                        </div>

                                                                    </div>

                                                                )}


                                                            {/* =================================================
                                                                Token usage
                                                            ================================================= */}

                                                            {message
                                                                .data
                                                                .usage && (

                                                                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">

                                                                        {message
                                                                            .data
                                                                            .usage
                                                                            .prompt_tokens !==
                                                                            null &&
                                                                            message
                                                                                .data
                                                                                .usage
                                                                                .prompt_tokens !==
                                                                            undefined && (

                                                                                <span>
                                                                                    Input:{" "}
                                                                                    {
                                                                                        message
                                                                                            .data
                                                                                            .usage
                                                                                            .prompt_tokens
                                                                                    }
                                                                                </span>

                                                                            )}


                                                                        {message
                                                                            .data
                                                                            .usage
                                                                            .output_tokens !==
                                                                            null &&
                                                                            message
                                                                                .data
                                                                                .usage
                                                                                .output_tokens !==
                                                                            undefined && (

                                                                                <span>
                                                                                    Output:{" "}
                                                                                    {
                                                                                        message
                                                                                            .data
                                                                                            .usage
                                                                                            .output_tokens
                                                                                    }
                                                                                </span>

                                                                            )}


                                                                        {message
                                                                            .data
                                                                            .usage
                                                                            .total_tokens !==
                                                                            null &&
                                                                            message
                                                                                .data
                                                                                .usage
                                                                                .total_tokens !==
                                                                            undefined && (

                                                                                <span>
                                                                                    Total:{" "}
                                                                                    {
                                                                                        message
                                                                                            .data
                                                                                            .usage
                                                                                            .total_tokens
                                                                                    }
                                                                                </span>

                                                                            )}

                                                                    </div>

                                                                )}

                                                        </div>

                                                    )}

                                            </div>

                                        </div>

                                    ),
                                )}


                                {isLoading && (

                                    <div className="flex justify-start">

                                        <div className="rounded-2xl rounded-bl-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                                            NIRMAAN AI is analyzing the
                                            project data and knowledge base…
                                        </div>

                                    </div>

                                )}

                            </>

                        )}

                    </div>


                    {/* =================================================================
                        INPUT AREA
                    ================================================================= */}

                    <form
                        onSubmit={handleSubmit}
                        className="border-t border-slate-100 p-5"
                    >

                        <div className="grid gap-3 sm:grid-cols-[240px_minmax(0,1fr)_auto]">

                            {/* =========================================================
                                SEARCHABLE PROJECT SELECTOR
                            ========================================================= */}

                            <div
                                ref={projectSelectorRef}
                                onBlur={handleProjectBlur}
                                className="relative"
                            >

                                {/* -----------------------------------------------------
                                    Selector input
                                ----------------------------------------------------- */}

                                <div className="relative">

                                    <input
                                        type="text"

                                        value={
                                            projectDropdownOpen
                                                ? projectSearch
                                                : selectedProject
                                                    ? `${selectedProject.project_code} — ${selectedProject.project_name || ""}`
                                                    : ""
                                        }

                                        onFocus={() => {
                                            void openProjectSelector();
                                        }}

                                        onChange={(event) => {

                                            setProjectSearch(
                                                event.target.value,
                                            );

                                            // Typing a new search clears the
                                            // previous selected project.
                                            setProjectCode("");

                                            setProjectDropdownOpen(
                                                true,
                                            );

                                            setProjectsError(
                                                null,
                                            );
                                        }}

                                        placeholder={
                                            projectsLoading
                                                ? "Loading projects..."
                                                : "Search project code or name"
                                        }

                                        disabled={isLoading}

                                        role="combobox"

                                        aria-expanded={
                                            projectDropdownOpen
                                        }

                                        aria-haspopup="listbox"

                                        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 pr-10 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400"
                                    />


                                    {/* -------------------------------------------------
                                        Clear selected project
                                    ------------------------------------------------- */}

                                    {(
                                        projectCode ||
                                        projectSearch
                                    ) && (

                                            <button
                                                type="button"

                                                onMouseDown={(event) =>
                                                    event.preventDefault()
                                                }

                                                onClick={() => {

                                                    if (
                                                        projectSearch &&
                                                        !projectCode
                                                    ) {
                                                        setProjectSearch(
                                                            "",
                                                        );

                                                        void loadProjects();

                                                        setProjectDropdownOpen(
                                                            true,
                                                        );

                                                        return;
                                                    }

                                                    handleClearProject();

                                                }}

                                                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs font-medium text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"

                                                aria-label="Clear project selection"
                                            >
                                                Clear
                                            </button>

                                        )}

                                </div>


                                {/* -----------------------------------------------------
                                    Dropdown
                                ----------------------------------------------------- */}

                                {projectDropdownOpen && (

                                    <div
                                        role="listbox"
                                        className="absolute left-0 right-0 z-50 mt-2 max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl"
                                    >

                                        {/* =================================================
                                            Top actions / status
                                        ================================================= */}

                                        <div className="sticky top-0 z-10 border-b border-slate-100 bg-white px-2 py-2">

                                            <div className="flex items-center justify-between">

                                                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                                                    Project
                                                </span>


                                                {projectsLoaded && (
                                                    <span className="text-[11px] text-slate-400">
                                                        {projectOptions.length.toLocaleString()} available
                                                    </span>
                                                )}

                                            </div>

                                        </div>


                                        {/* =================================================
                                            No project
                                        ================================================= */}

                                        <button
                                            type="button"

                                            role="option"

                                            aria-selected={
                                                !projectCode
                                            }

                                            onMouseDown={(event) =>
                                                event.preventDefault()
                                            }

                                            onClick={() => {
                                                handleClearProject();
                                            }}

                                            className={
                                                !projectCode
                                                    ? "w-full rounded-lg bg-slate-100 px-3 py-2 text-left"
                                                    : "w-full rounded-lg px-3 py-2 text-left transition hover:bg-slate-50"
                                            }
                                        >

                                            <div className="text-sm font-medium text-slate-700">
                                                No project
                                            </div>

                                            <div className="mt-0.5 text-[11px] text-slate-400">
                                                Use for general infrastructure questions
                                            </div>

                                        </button>


                                        {/* =================================================
                                            Loading
                                        ================================================= */}

                                        {projectsLoading && (

                                            <div className="px-3 py-4 text-xs text-slate-500">
                                                Loading project codes…
                                            </div>

                                        )}


                                        {/* =================================================
                                            Error
                                        ================================================= */}

                                        {!projectsLoading &&
                                            projectsError && (

                                                <div className="px-3 py-4">

                                                    <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-3 text-xs text-red-600">
                                                        {projectsError}
                                                    </div>


                                                    <button
                                                        type="button"
                                                        onMouseDown={(event) =>
                                                            event.preventDefault()
                                                        }
                                                        onClick={() => {
                                                            setProjectsLoaded(
                                                                false,
                                                            );

                                                            void loadProjects();
                                                        }}
                                                        className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                                                    >
                                                        Retry
                                                    </button>

                                                </div>

                                            )}


                                        {/* =================================================
                                            Results
                                        ================================================= */}

                                        {!projectsLoading &&
                                            !projectsError &&
                                            filteredProjects.length > 0 && (

                                                <div className="space-y-1 p-1">

                                                    {filteredProjects.map(
                                                        (
                                                            project,
                                                        ) => {

                                                            const code =
                                                                String(
                                                                    project.project_code,
                                                                );

                                                            const isSelected =
                                                                code ===
                                                                projectCode;

                                                            return (

                                                                <button
                                                                    key={code}

                                                                    type="button"

                                                                    role="option"

                                                                    aria-selected={
                                                                        isSelected
                                                                    }

                                                                    onMouseDown={(
                                                                        event,
                                                                    ) =>
                                                                        event.preventDefault()
                                                                    }

                                                                    onClick={() =>
                                                                        handleSelectProject(
                                                                            project,
                                                                        )
                                                                    }

                                                                    className={
                                                                        isSelected
                                                                            ? "w-full rounded-lg bg-slate-100 px-3 py-2 text-left"
                                                                            : "w-full rounded-lg px-3 py-2 text-left transition hover:bg-slate-50"
                                                                    }
                                                                >

                                                                    <div className="text-sm font-semibold text-slate-800">
                                                                        {
                                                                            project.project_code
                                                                        }
                                                                    </div>


                                                                    {project.project_name && (

                                                                        <div className="mt-0.5 truncate text-xs text-slate-500">
                                                                            {
                                                                                project.project_name
                                                                            }
                                                                        </div>

                                                                    )}

                                                                </button>

                                                            );

                                                        },
                                                    )}

                                                </div>

                                            )}


                                        {/* =================================================
                                            No matching projects
                                        ================================================= */}

                                        {!projectsLoading &&
                                            !projectsError &&
                                            projectsLoaded &&
                                            filteredProjects.length === 0 && (

                                                <div className="px-3 py-5 text-center">

                                                    <div className="text-sm font-medium text-slate-600">
                                                        No projects found
                                                    </div>

                                                    <div className="mt-1 text-xs text-slate-400">
                                                        Try another code or project name.
                                                    </div>

                                                </div>

                                            )}

                                    </div>

                                )}

                            </div>


                            {/* =========================================================
                                QUESTION INPUT
                            ========================================================= */}

                            <input
                                type="text"

                                value={question}

                                onChange={(event) =>
                                    setQuestion(
                                        event.target.value,
                                    )
                                }

                                placeholder="Ask a question about NIRMAAN projects..."

                                className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400"

                                disabled={isLoading}
                            />


                            {/* =========================================================
                                ASK BUTTON
                            ========================================================= */}

                            <button
                                type="submit"

                                disabled={!canSubmit}

                                className="h-11 rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {isLoading
                                    ? "Analyzing..."
                                    : "Ask AI"}
                            </button>

                        </div>


                        {/* ----------------------------------------------------------------
                            Selected project information
                        ---------------------------------------------------------------- */}

                        {projectCode && (

                            <div className="mt-2 flex flex-wrap items-center gap-1 text-xs text-slate-500">

                                <span>
                                    Selected project:
                                </span>


                                <span className="font-semibold text-slate-700">
                                    {projectCode}
                                </span>


                                {selectedProject?.project_name && (

                                    <span>
                                        —{" "}
                                        {
                                            selectedProject.project_name
                                        }
                                    </span>

                                )}

                            </div>

                        )}


                        {/* ----------------------------------------------------------------
                            Helpful selector hint
                        ---------------------------------------------------------------- */}

                        {!projectCode && (

                            <div className="mt-2 text-xs text-slate-400">
                                Select a project for project-specific questions.
                                Leave it empty for general infrastructure knowledge.
                            </div>

                        )}


                        {/* ----------------------------------------------------------------
                            Request error
                        ---------------------------------------------------------------- */}

                        {error && (

                            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                                {error}
                            </div>

                        )}

                    </form>

                </section>


                {/* =================================================================
                    DETAILS PANEL
                ================================================================= */}

                <aside className="space-y-4">

                    {/* =============================================================
                        PIPELINE
                    ============================================================= */}

                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">

                        <div className="text-sm font-semibold text-slate-900">
                            Assistant Pipeline
                        </div>


                        <div className="mt-4 space-y-3">

                            {[
                                "PostgreSQL project facts",
                                "Existing ML predictions",
                                "Local BGE + pgvector retrieval",
                                "PostgreSQL full-text search",
                                "Weighted RRF + local reranking",
                                "One Gemini generation call",
                            ].map(
                                (
                                    item,
                                    index,
                                ) => (

                                    <div
                                        key={item}
                                        className="flex items-start gap-3"
                                    >

                                        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">
                                            {index + 1}
                                        </div>


                                        <div className="text-sm leading-5 text-slate-600">
                                            {item}
                                        </div>

                                    </div>

                                ),
                            )}

                        </div>

                    </div>


                    {/* =============================================================
                        LATEST REQUEST
                    ============================================================= */}

                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">

                        <div className="text-sm font-semibold text-slate-900">
                            Latest Request
                        </div>


                        {latestAssistantData ? (

                            <div className="mt-4 space-y-3 text-sm">

                                <div>

                                    <div className="text-xs text-slate-400">
                                        Query type
                                    </div>


                                    <div className="mt-1 font-medium text-slate-700">
                                        {formatQueryType(
                                            latestAssistantData.query_type,
                                        )}
                                    </div>

                                </div>


                                <div>

                                    <div className="text-xs text-slate-400">
                                        Source
                                    </div>


                                    <div className="mt-1 font-medium text-slate-700">
                                        {
                                            latestAssistantData.source
                                        }
                                    </div>

                                </div>


                                <div>

                                    <div className="text-xs text-slate-400">
                                        Model
                                    </div>


                                    <div className="mt-1 font-medium text-slate-700">
                                        {
                                            latestAssistantData.model ||
                                            "No Gemini generation"
                                        }
                                    </div>

                                </div>


                                <div>

                                    <div className="text-xs text-slate-400">
                                        Retrieved chunks
                                    </div>


                                    <div className="mt-1 font-medium text-slate-700">
                                        {
                                            latestAssistantData
                                                .retrieved_chunks
                                                ?.length ?? 0
                                        }
                                    </div>

                                </div>


                                {latestAssistantData
                                    .usage
                                    ?.total_tokens !==
                                    null &&
                                    latestAssistantData
                                        .usage
                                        ?.total_tokens !==
                                    undefined && (

                                        <div>

                                            <div className="text-xs text-slate-400">
                                                Total tokens
                                            </div>


                                            <div className="mt-1 font-medium text-slate-700">
                                                {
                                                    latestAssistantData
                                                        .usage
                                                        .total_tokens
                                                }
                                            </div>

                                        </div>

                                    )}

                            </div>

                        ) : (

                            <p className="mt-2 text-sm leading-6 text-slate-500">
                                Ask a question to see routing,
                                retrieval, and model information here.
                            </p>

                        )}

                    </div>

                </aside>

            </div>

        </div>
    );
}