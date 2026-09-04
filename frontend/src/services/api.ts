const configuredApiBaseUrl = String(import.meta.env.VITE_API_BASE_URL || "").trim();

// Keep production resilient to a stale Vercel environment variable.
// Local development still uses the local Flask API from .env.
const API_BASE_URL =
    configuredApiBaseUrl &&
    !configuredApiBaseUrl.includes("paimana-ai-xmzp.onrender.com")
        ? configuredApiBaseUrl
        : import.meta.env.PROD
          ? "https://paimana-ai-backend.onrender.com/api"
          : "/api";

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
            const body = await response.json();
            if (body?.error) message = body.error;
        } catch {
            // Keep the status-based message when the response is not JSON.
        }
        throw new Error(message);
    }

    return response.json() as Promise<T>;
}
