// ============================================================================
// Browser BGE Embedding Service
// ============================================================================
//
// Runs BGE inside a Web Worker so model inference does not block React's
// main UI thread.
//
// The service is intentionally optional:
//     - success -> returns a 384-dimensional embedding
//     - failure -> returns null
//
// Returning null allows the backend to fall back to its existing FastEmbed
// implementation during the migration.
// ============================================================================

export type BrowserEmbeddingResult =
    number[] | null;


interface WorkerReadyMessage {
    type: "ready";
}


interface WorkerEmbeddingMessage {
    type: "embedding";
    requestId: number;
    embedding?: number[];
}


interface WorkerErrorMessage {
    type: "error";
    requestId: number;
    error?: string;
}


type WorkerResponse =
    | WorkerReadyMessage
    | WorkerEmbeddingMessage
    | WorkerErrorMessage;


// ============================================================================
// CONFIG
// ============================================================================

const EMBEDDING_DIMENSION = 384;

const REQUEST_TIMEOUT_MS = 30_000;


// ============================================================================
// SINGLE WORKER INSTANCE
// ============================================================================

let worker: Worker | null = null;

let nextRequestId = 1;

let workerFailed = false;


// ============================================================================
// PENDING REQUESTS
// ============================================================================

interface PendingRequest {
    resolve: (
        value: BrowserEmbeddingResult,
    ) => void;

    timer: ReturnType<
        typeof setTimeout
    >;
}


const pendingRequests =
    new Map<
        number,
        PendingRequest
    >();


// ============================================================================
// CREATE WORKER
// ============================================================================

function getWorker(): Worker | null {

    if (workerFailed) {
        return null;
    }

    if (worker !== null) {
        return worker;
    }

    try {

        worker = new Worker(
            new URL(
                "../workers/ragEmbedding.worker.ts",
                import.meta.url,
            ),
            {
                type: "module",
            },
        );

        worker.onmessage = (
            event: MessageEvent<WorkerResponse>,
        ) => {

            const message =
                event.data;

            // --------------------------------------------------------------
            // Model ready
            // --------------------------------------------------------------

            if (
                message.type === "ready"
            ) {
                return;
            }

            // --------------------------------------------------------------
            // Embedding response
            // --------------------------------------------------------------

            if (
                message.type === "embedding"
            ) {

                const request =
                    pendingRequests.get(
                        message.requestId,
                    );

                if (!request) {
                    return;
                }

                clearTimeout(
                    request.timer,
                );

                pendingRequests.delete(
                    message.requestId,
                );

                const embedding =
                    message.embedding;

                if (
                    !Array.isArray(
                        embedding,
                    )
                    ||
                    embedding.length !==
                    EMBEDDING_DIMENSION
                ) {

                    request.resolve(
                        null,
                    );

                    return;
                }

                const numericEmbedding =
                    embedding.map(
                        (
                            value,
                        ) =>
                            Number(value),
                    );

                if (
                    numericEmbedding.some(
                        (
                            value,
                        ) =>
                            !Number.isFinite(
                                value,
                            ),
                    )
                ) {

                    request.resolve(
                        null,
                    );

                    return;
                }

                request.resolve(
                    numericEmbedding,
                );

                return;
            }

            // --------------------------------------------------------------
            // Worker error for a specific request
            // --------------------------------------------------------------

            if (
                message.type === "error"
            ) {

                const request =
                    pendingRequests.get(
                        message.requestId,
                    );

                if (!request) {
                    return;
                }

                clearTimeout(
                    request.timer,
                );

                pendingRequests.delete(
                    message.requestId,
                );

                request.resolve(
                    null,
                );
            }
        };

        worker.onerror = () => {

            workerFailed = true;

            worker?.terminate();

            worker = null;

            // --------------------------------------------------------------
            // Resolve all waiting requests with null.
            // The backend can then use FastEmbed fallback.
            // --------------------------------------------------------------

            for (
                const [
                    requestId,
                    request,
                ]
                of pendingRequests
            ) {

                clearTimeout(
                    request.timer,
                );

                pendingRequests.delete(
                    requestId,
                );

                request.resolve(
                    null,
                );
            }
        };

        return worker;

    } catch {

        workerFailed = true;

        worker = null;

        return null;
    }
}


// ============================================================================
// PUBLIC API
// ============================================================================

export function getBrowserQueryEmbedding(
    text: string,
): Promise<BrowserEmbeddingResult> {

    const query =
        String(text ?? "")
            .trim();

    if (!query) {
        return Promise.resolve(
            null,
        );
    }

    const activeWorker =
        getWorker();

    if (
        activeWorker === null
    ) {
        return Promise.resolve(
            null,
        );
    }

    const requestId =
        nextRequestId++;

    return new Promise(
        (resolve) => {

            const timer =
                setTimeout(
                    () => {

                        pendingRequests.delete(
                            requestId,
                        );

                        resolve(
                            null,
                        );

                    },
                    REQUEST_TIMEOUT_MS,
                );

            pendingRequests.set(
                requestId,
                {
                    resolve,
                    timer,
                },
            );

            try {

                activeWorker.postMessage(
                    {
                        type: "embed",
                        requestId,
                        text: query,
                    },
                );

            } catch {

                clearTimeout(
                    timer,
                );

                pendingRequests.delete(
                    requestId,
                );

                resolve(
                    null,
                );
            }
        },
    );
}


// ============================================================================
// OPTIONAL CLEANUP
// ============================================================================

export function disposeBrowserEmbeddingWorker(): void {

    if (worker !== null) {
        worker.terminate();
    }

    worker = null;

    workerFailed = false;

    for (
        const [
            requestId,
            request,
        ]
        of pendingRequests
    ) {

        clearTimeout(
            request.timer,
        );

        pendingRequests.delete(
            requestId,
        );

        request.resolve(
            null,
        );
    }
}