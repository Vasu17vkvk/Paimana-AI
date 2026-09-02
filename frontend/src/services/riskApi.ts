import { apiRequest } from "./api";

export interface ProjectRiskResponse {
    project_code: string;

    snapshot_year: number | null;
    snapshot_month: number | null;

    predicted_cost_overrun_pct: number;

    future_delay_probability: number;

    future_progress_stall_probability: number;

    cost_risk_score: number;

    overall_risk_score: number;

    risk_level:
    | "LOW"
    | "MEDIUM"
    | "HIGH"
    | "CRITICAL";

    early_warning_active: boolean;

    early_warning_priority:
    | "NONE"
    | "HIGH"
    | "IMMEDIATE";

    early_warning_reasons: string[];
}

export function getProjectRisk(
    projectCode: string,
) {
    return apiRequest<ProjectRiskResponse>(
        `/risk/${projectCode}`,
    );
}