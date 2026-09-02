import { apiRequest } from "./api";

export interface ProjectDelayPrediction {
    project_code: string;
    snapshot_year: number | null;
    snapshot_month: number | null;
    future_delay_probability: number;
    risk_level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

export async function getProjectDelay(
    projectCode: string,
): Promise<ProjectDelayPrediction> {
    return apiRequest<ProjectDelayPrediction>(`/delay/${projectCode}`);
}