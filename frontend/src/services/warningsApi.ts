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

export async function getActiveWarnings(): Promise<ActiveWarning[]> {
    return apiRequest<ActiveWarning[]>("/warnings/active");
}

export async function getProjectWarnings(
    projectCode: string,
): Promise<ActiveWarning | {
    project_code: string;
    snapshot_year: number | null;
    snapshot_month: number | null;
    early_warning_active: boolean;
    early_warning_priority: "NONE" | "HIGH" | "IMMEDIATE";
    early_warning_reasons: string[];
    risk_level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    overall_risk_score: number;
}> {
    return apiRequest(`/warnings/project/${projectCode}`);
}