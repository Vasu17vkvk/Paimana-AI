import {
    AutoTokenizer,
    AutoModel,
} from "@huggingface/transformers";


// ============================================================================
// TYPES
// ============================================================================

interface EmbedRequest {
    type: "embed";
    requestId: number;
    text: string;
}


interface EmbedResponse {
    type:
    | "ready"
    | "embedding"
    | "error";

    requestId?: number;

    embedding?: number[];

    error?: string;
}


// ============================================================================
// MODEL CONFIGURATION
// ============================================================================

const MODEL_ID =
    "Xenova/bge-small-en-v1.5";

const RETRIEVAL_PREFIX =
    "Represent this sentence for searching relevant passages: ";


// ============================================================================
// MODEL CACHE
// ============================================================================

let tokenizer:
    Awaited<
        ReturnType<
            typeof AutoTokenizer.from_pretrained
        >
    > | null = null;


let model:
    Awaited<
        ReturnType<
            typeof AutoModel.from_pretrained
        >
    > | null = null;


let loadingPromise:
    Promise<void> | null = null;


// ============================================================================
// LOAD MODEL
// ============================================================================

async function loadModel(): Promise<void> {

    if (
        tokenizer !== null &&
        model !== null
    ) {
        return;
    }

    if (loadingPromise !== null) {
        return loadingPromise;
    }

    loadingPromise = (
        async () => {

            tokenizer =
                await AutoTokenizer.from_pretrained(
                    MODEL_ID,
                );

            model =
                await AutoModel.from_pretrained(
                    MODEL_ID,
                    {
                        dtype: "q8",
                    },
                );
        }
    )();

    try {
        await loadingPromise;

    } finally {
        loadingPromise = null;
    }
}


// ============================================================================
// NORMALIZE VECTOR
// ============================================================================

function normalizeEmbedding(
    embedding: number[],
): number[] {

    let squaredSum = 0;

    for (
        const value of embedding
    ) {
        squaredSum +=
            value * value;
    }

    const norm =
        Math.sqrt(
            squaredSum,
        );

    if (
        !Number.isFinite(norm) ||
        norm === 0
    ) {
        throw new Error(
            "Embedding model returned a zero vector.",
        );
    }

    return embedding.map(
        (value) =>
            value / norm,
    );
}


// ============================================================================
// MEAN POOLING
// ============================================================================

function meanPool(
    lastHiddenState: any,
    attentionMask: any,
): number[] {

    const data =
        lastHiddenState
            .data as
        Float32Array;

    const mask =
        attentionMask
            .data as
        BigInt64Array | Int32Array | number[];

    const dims =
        lastHiddenState
            .dims as number[];

    if (
        !dims ||
        dims.length !== 3
    ) {
        throw new Error(
            "Unexpected BGE model output dimensions.",
        );
    }

    const sequenceLength =
        dims[1];

    const hiddenSize =
        dims[2];

    const pooled =
        new Float32Array(
            hiddenSize,
        );

    let tokenCount = 0;

    for (
        let tokenIndex = 0;
        tokenIndex <
        sequenceLength;
        tokenIndex += 1
    ) {

        const maskValue =
            Number(
                mask[tokenIndex],
            );

        if (
            maskValue <= 0
        ) {
            continue;
        }

        tokenCount += 1;

        const offset =
            tokenIndex *
            hiddenSize;

        for (
            let dimension = 0;
            dimension <
            hiddenSize;
            dimension += 1
        ) {

            pooled[
                dimension
            ] +=
                data[
                offset +
                dimension
                ];
        }
    }

    if (
        tokenCount === 0
    ) {
        throw new Error(
            "Attention mask contained no valid tokens.",
        );
    }

    return Array.from(
        pooled,
        (value) =>
            value /
            tokenCount,
    );
}


// ============================================================================
// EMBEDDING
// ============================================================================

async function embed(
    text: string,
): Promise<number[]> {

    await loadModel();

    if (
        tokenizer === null ||
        model === null
    ) {
        throw new Error(
            "BGE model failed to initialize.",
        );
    }

    const input =
        RETRIEVAL_PREFIX +
        text;

    const encoded =
        tokenizer(
            input,
            {
                padding: true,
                truncation: true,
            },
        );

    const output =
        await model(
            encoded,
        );

    const vector =
        meanPool(
            output.last_hidden_state,
            encoded.attention_mask,
        );

    const normalized =
        normalizeEmbedding(
            vector,
        );

    if (
        normalized.length !== 384
    ) {
        throw new Error(
            `Expected a 384-dimensional embedding, received ${normalized.length}.`,
        );
    }

    return normalized;
}


// ============================================================================
// WORKER MESSAGE HANDLER
// ============================================================================

self.onmessage = async (
    event: MessageEvent<
        EmbedRequest
    >,
) => {

    const message =
        event.data;

    if (
        message.type !== "embed"
    ) {
        return;
    }

    try {

        const embedding =
            await embed(
                message.text,
            );

        const response:
            EmbedResponse = {
            type:
                "embedding",

            requestId:
                message.requestId,

            embedding,
        };

        self.postMessage(
            response,
        );

    } catch (error) {

        const messageText =
            error instanceof Error
                ? error.message
                : "Browser embedding failed.";

        const response:
            EmbedResponse = {
            type:
                "error",

            requestId:
                message.requestId,

            error:
                messageText,
        };

        self.postMessage(
            response,
        );
    }
};


// ============================================================================
// INITIALIZE IN BACKGROUND
// ============================================================================

loadModel()
    .then(() => {

        const response:
            EmbedResponse = {
            type: "ready",
        };

        self.postMessage(
            response,
        );

    })
    .catch(() => {
        // Do not fail application startup.
        // The actual embed request will report the
        // initialization error.
    });