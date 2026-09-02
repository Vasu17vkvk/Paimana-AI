import { apiRequest } from "./api";

export interface ProjectCostPrediction {
    project_code: string;
    snapshot_year: number | null;
    snapshot_month: number | null;
    predicted_cost_overrun_pct: number;
    cost_risk_score: number;
    risk_level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

export async function getProjectCost(
    projectCode: string,
): Promise<ProjectCostPrediction> {
    return apiRequest<ProjectCostPrediction>(`/cost/${projectCode}`);
}