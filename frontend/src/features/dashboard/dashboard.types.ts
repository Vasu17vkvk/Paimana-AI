export type RiskLevel =
    | "Low"
    | "Moderate"
    | "Elevated"
    | "High"
    | "Critical";

export type ProjectStatus =
    | "Ongoing"
    | "Delayed"
    | "Completed";

export interface DashboardProject {
    id: string;
    name: string;
    ministry: string;
    sector: string;
    state: string;

    originalCost: number;
    revisedCost: number;

    riskScore: number;
    costRisk: RiskLevel;
    delayRisk: RiskLevel;

    delayMonths: number;
    physicalProgress: number;

    status: ProjectStatus;
}

export interface DashboardFilters {
    period: string;
    ministry: string;
    sector: string;
    state: string;
    risk: string;
    status: string;
}