import type {
    DashboardFilters,
} from "./dashboard.types";

export const defaultDashboardFilters: DashboardFilters = {
    period: "",
    ministry: "All Ministries",
    sector: "All Sectors",
    state: "All States",
    risk: "All Risk Levels",
    status: "All Statuses",
};

export const reportingPeriods: string[] = [];

export const ministries: string[] = [];

export const sectors: string[] = [];

export const states: string[] = [];

export const riskLevels = [
    "All Risk Levels",
    "Critical",
    "High",
    "Elevated",
    "Moderate",
    "Low",
];

export const statuses = [
    "All Statuses",
    "Ongoing",
    "Delayed",
    "Completed",
    "On Schedule",
    "Accelerated",
    "No Revised Date",
];