const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL || "/api";

export async function apiRequest<T>(
    endpoint: string,
    options?: RequestInit,
): Promise<T> {
    const response = await fetch(
        `${API_BASE_URL}${endpoint}`,
        {
            ...options,

            headers: {
                "Content-Type": "application/json",
                ...options?.headers,
            },
        },
    );

    if (!response.ok) {
        let message = `API request failed: ${response.status}`;

        try {
            const errorBody =
                await response.json();

            if (
                typeof errorBody?.error ===
                "string"
            ) {
                message = errorBody.error;
            }
        } catch {
            // Keep default message.
        }

        throw new Error(message);
    }

    return response.json() as Promise<T>;
}