export type RiskLevel =
    | "Low"
    | "Moderate"
    | "Elevated"
    | "High"
    | "Critical";

export type ProjectStatus =
    | "Ongoing"
    | "Delayed"
    | "Completed"
    | "On Schedule"
    | "Accelerated"
    | "No Revised Date";

export interface DashboardProject {
    id: string;
    name: string;
    ministry: string;
    sector: string;
    state: string;

    originalCost: number;
    revisedCost: number;

    riskScore: number | null;
    riskLevel: RiskLevel;

    costRisk: string;
    delayRisk: RiskLevel;

    delayMonths: number;
    physicalProgress: number;

    status: string;
}

export interface DashboardFilters {
    period: string;
    ministry: string;
    sector: string;
    state: string;
    risk: string;
    status: string;
}