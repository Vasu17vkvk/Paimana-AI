import type {
    DashboardFilters,
} from "./dashboard.types";


/* =========================================================
   DEFAULT DASHBOARD FILTERS
========================================================= */

export const defaultDashboardFilters: DashboardFilters = {
    period: "",

    ministry:
        "All Ministries",

    sector:
        "All Sectors",

    state:
        "All States",

    risk:
        "All Risk Levels",

    status:
        "All Statuses",
};


/* =========================================================
   STATIC RISK LEVEL OPTIONS
========================================================= */

export const riskLevels = [
    "All Risk Levels",
    "Critical",
    "High",
    "Elevated",
    "Moderate",
    "Low",
];


/* =========================================================
   STATIC STATUS OPTIONS
========================================================= */

export const statuses = [
    "All Statuses",
    "Ongoing",
    "Delayed",
    "Completed",
    "On Schedule",
    "Accelerated",
    "No Revised Date",
];


/*
 * IMPORTANT:
 *
 * The following are intentionally empty.
 *
 * DashboardPage now gets real reporting periods,
 * ministries, sectors and states from:
 *
 *     GET /api/dashboard/filter-options
 *
 * Do NOT put dummy project data here.
 */


/* =========================================================
   REPORTING PERIODS
========================================================= */

export const reportingPeriods: string[] = [];


/* =========================================================
   MINISTRIES
========================================================= */

export const ministries: string[] = [];


/* =========================================================
   SECTORS
========================================================= */

export const sectors: string[] = [];


/* =========================================================
   STATES
========================================================= */

export const states: string[] = [];