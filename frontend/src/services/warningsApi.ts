import { apiRequest } from "./api";


/* =========================================================
   TYPES
========================================================= */

export interface ActiveWarning {
    project_code: string;

    snapshot_year: number | null;

    snapshot_month:
        | number
        | null;

    risk_level:
        | "LOW"
        | "MEDIUM"
        | "HIGH"
        | "CRITICAL";

    overall_risk_score: number;

    early_warning_priority:
        | "NONE"
        | "HIGH"
        | "IMMEDIATE";

    early_warning_reasons:
        string[];
}


/* =========================================================
   ACTIVE WARNINGS
========================================================= */

export async function getActiveWarnings(): Promise<
    ActiveWarning[]
> {
    return apiRequest<ActiveWarning[]>(
        "/warnings/active",
    );
}


/* =========================================================
   PROJECT WARNINGS
========================================================= */

export async function getProjectWarnings(
    projectCode: string,
) {
    return apiRequest(
        `/warnings/project/${encodeURIComponent(
            projectCode,
        )}`,
    );
}