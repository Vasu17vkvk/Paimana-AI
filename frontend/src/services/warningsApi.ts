import { apiRequest } from "./api";

export interface ActiveWarning {
    project_code: string;
    snapshot_year: number | null;
    snapshot_month: number | null;
    risk_level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    overall_risk_score: number;
    early_warning_priority: "NONE" | "HIGH" | "IMMEDIATE";
    early_warning_reasons: string[];
}

let activeWarningsCache: ActiveWarning[] | null = null;
let activeWarningsCacheTime = 0;
let activeWarningsRequest: Promise<ActiveWarning[]> | null = null;

const ACTIVE_WARNINGS_CACHE_MS = 60_000;

export async function getActiveWarnings(
    forceRefresh = false,
): Promise<ActiveWarning[]> {
    const now = Date.now();

    if (
        !forceRefresh &&
        activeWarningsCache &&
        now - activeWarningsCacheTime < ACTIVE_WARNINGS_CACHE_MS
    ) {
        return activeWarningsCache;
    }

    if (!forceRefresh && activeWarningsRequest) {
        return activeWarningsRequest;
    }

    activeWarningsRequest = apiRequest<ActiveWarning[]>(
        "/warnings/active",
    )
        .then((warnings) => {
            activeWarningsCache = warnings;
            activeWarningsCacheTime = Date.now();
            return warnings;
        })
        .finally(() => {
            activeWarningsRequest = null;
        });

    return activeWarningsRequest;
}

export async function getProjectWarnings(
    projectCode: string,
): Promise<ActiveWarning & {
    early_warning_active: boolean;
}> {
    return apiRequest(`/warnings/project/${projectCode}`);
}