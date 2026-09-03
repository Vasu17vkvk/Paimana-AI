import type { ReactNode } from "react";

import {
    AlertTriangle,
    ArrowRight,
    Bell,
    Clock3,
    Filter,
    IndianRupee,
    Search,
    ShieldAlert,
    TrendingUp,
} from "lucide-react";

import {
    useEffect,
    useMemo,
    useState,
} from "react";

import { useNavigate } from "react-router-dom";

import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import Input from "../../components/ui/Input";
import Select from "../../components/ui/Select";

import MetricCard from "../../components/cards/MetricCard";

import FilterDrawer from "../../components/filters/FilterDrawer";
import FilterChips from "../../components/filters/FilterChips";

import PageHeader from "../../components/layout/PageHeader";

import {
    defaultDashboardFilters,
} from "./dashboard.data";

import type {
    DashboardFilters,
    DashboardProject,
} from "./dashboard.types";

import {
    formatCrore,
    formatNumber,
} from "../../utils/formatNumber";

import {
    getRiskBadgeVariant,
} from "../../utils/riskUtils";

import {
    getDashboard,
    getDashboardFilterOptions,
    type DashboardResponse,
} from "../../services/api";


/* =========================================================
   HELPERS
========================================================= */

function mapDashboardProject(
    project: DashboardResponse["projects"][number],
): DashboardProject {
    return {
        id: project.id,
        name: project.name,
        ministry: project.ministry,
        sector: project.sector,
        state: project.state,
        originalCost: project.originalCost,
        revisedCost: project.revisedCost,
        riskScore: project.riskScore,
        riskLevel:
            (project.riskLevel || "Low") as DashboardProject["riskLevel"],
        costRisk: project.costRisk,
        delayRisk:
            (project.delayRisk || project.riskLevel || "Low") as DashboardProject["delayRisk"],
        delayMonths: project.delayMonths,
        physicalProgress: project.physicalProgress,
        status: project.status,
    };
}


function normalizeDashboardFilters(
    filters: DashboardFilters,
): {
    period?: string;
    ministry?: string;
    sector?: string;
    state?: string;
    risk?: string;
    status?: string;
} {
    return {
        period:
            filters.period &&
            filters.period !== "All Periods"
                ? filters.period
                : undefined,

        ministry:
            filters.ministry !== "All Ministries"
                ? filters.ministry
                : undefined,

        sector:
            filters.sector !== "All Sectors"
                ? filters.sector
                : undefined,

        state:
            filters.state !== "All States"
                ? filters.state
                : undefined,

        risk:
            filters.risk !== "All Risk Levels"
                ? filters.risk
                : undefined,

        status:
            filters.status !== "All Statuses"
                ? filters.status
                : undefined,
    };
}


/* =========================================================
   PAGE
========================================================= */

export default function DashboardPage() {
    const navigate = useNavigate();

    const [filters, setFilters] =
        useState<DashboardFilters>(
            defaultDashboardFilters,
        );

    const [appliedFilters, setAppliedFilters] =
        useState<DashboardFilters>(
            defaultDashboardFilters,
        );

    const [filterDrawerOpen, setFilterDrawerOpen] =
        useState(false);

    const [search, setSearch] =
        useState("");

    const [dashboardData, setDashboardData] =
        useState<DashboardResponse | null>(
            null,
        );

    const [reportingPeriods, setReportingPeriods] =
        useState<string[]>([]);

    const [isLoading, setIsLoading] =
        useState(true);

    const [isFilterOptionsLoading, setIsFilterOptionsLoading] =
        useState(true);

    const [error, setError] =
        useState<string | null>(null);


    /* =====================================================
       LOAD REAL FILTER OPTIONS
    ===================================================== */

    useEffect(() => {
        let cancelled = false;

        const loadFilterOptions =
            async () => {
                setIsFilterOptionsLoading(
                    true,
                );

                try {
                    const options =
                        await getDashboardFilterOptions();

                    if (cancelled) {
                        return;
                    }

                    setReportingPeriods(
                        options.periods,
                    );

                    setFilters(
                        (current) => {
                            const period =
                                current.period ||
                                options.periods[0] ||
                                "";

                            return {
                                ...current,
                                period,
                            };
                        },
                    );

                    setAppliedFilters(
                        (current) => {
                            const period =
                                current.period ||
                                options.periods[0] ||
                                "";

                            return {
                                ...current,
                                period,
                            };
                        },
                    );
                } catch (
                    requestError
                ) {
                    if (cancelled) {
                        return;
                    }

                    setError(
                        requestError instanceof
                            Error
                            ? requestError.message
                            : "Unable to load dashboard filter options.",
                    );
                } finally {
                    if (!cancelled) {
                        setIsFilterOptionsLoading(
                            false,
                        );
                    }
                }
            };

        loadFilterOptions();

        return () => {
            cancelled = true;
        };
    }, []);


    /* =====================================================
       LOAD REAL DASHBOARD DATA
    ===================================================== */

    useEffect(() => {
        if (isFilterOptionsLoading) {
            return;
        }

        let cancelled = false;

        const timer =
            window.setTimeout(
                async () => {
                    setIsLoading(true);
                    setError(null);

                    try {
                        const data =
                            await getDashboard({
                                ...normalizeDashboardFilters(
                                    appliedFilters,
                                ),
                                search:
                                    search.trim() ||
                                    undefined,
                            });

                        if (cancelled) {
                            return;
                        }

                        setDashboardData(
                            data,
                        );
                    } catch (
                        requestError
                    ) {
                        if (cancelled) {
                            return;
                        }

                        setError(
                            requestError instanceof
                                Error
                                ? requestError.message
                                : "Unable to load dashboard data.",
                        );

                        setDashboardData(
                            null,
                        );
                    } finally {
                        if (!cancelled) {
                            setIsLoading(
                                false,
                            );
                        }
                    }
                },
                250,
            );

        return () => {
            cancelled = true;
            window.clearTimeout(
                timer,
            );
        };
    }, [
        appliedFilters,
        search,
        isFilterOptionsLoading,
    ]);


    /* =====================================================
       REAL PROJECT DATA
    ===================================================== */

    const projects = useMemo(() => {
    const dashboardProjects =
        dashboardData?.projects ?? [];

    return dashboardProjects.map(
        mapDashboardProject,
    );
    }, [dashboardData]);


    /* =====================================================
       REAL BACKEND KPI DATA
    ===================================================== */

    const metrics = dashboardData?.metrics ?? {
        totalProjects: 0,
        highRiskProjects: 0,
        costRiskProjects: 0,
        delayedProjects: 0,
    };


    const riskDistribution =
        dashboardData?.riskDistribution ?? {
            Critical: 0,
            High: 0,
            Elevated: 0,
            Moderate: 0,
            Low: 0,
        };


    /* =====================================================
       REAL HIGHEST-RISK PROJECTS
    ===================================================== */

    const highestRiskProjects =
        useMemo(() => {
            if (!dashboardData) {
                return [];
            }

            return dashboardData.highestRiskProjects.map(
                mapDashboardProject,
            );
        }, [dashboardData]);


    /* =====================================================
       REAL FINANCIAL DATA
    ===================================================== */

    const financials =
        dashboardData?.financials ?? {
            originalCost: 0,
            revisedCost: 0,
        };


    /* =====================================================
       FILTER ACTIONS
    ===================================================== */

    const applyFilters = () => {
        setAppliedFilters(
            filters,
        );

        setFilterDrawerOpen(
            false,
        );
    };


    const resetFilters = () => {
        const period =
            reportingPeriods[0] ||
            "";

        const resetValues: DashboardFilters = {
            ...defaultDashboardFilters,
            period,
        };

        setFilters(
            resetValues,
        );

        setAppliedFilters(
            resetValues,
        );

        setSearch("");
    };


    /* =====================================================
       LOADING STATE
    ===================================================== */

    if (
        isLoading &&
        !dashboardData
    ) {
        return (
            <div className="mx-auto w-full max-w-[1500px]">

                <PageHeader
                    eyebrow="NATIONAL PROJECT MONITORING"
                    title="Dashboard"
                    description="Monitor infrastructure projects, emerging risks, cost pressure and schedule performance."
                />

                <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {[
                        "Total Projects",
                        "High Risk Projects",
                        "Projects at Cost Risk",
                        "Delayed Projects",
                    ].map(
                        (label) => (
                            <Card
                                key={label}
                                padding="md"
                            >
                                <div className="h-8 w-8 animate-pulse rounded-lg bg-slate-100" />

                                <div className="mt-4 h-2 w-24 animate-pulse rounded bg-slate-100" />

                                <div className="mt-2 h-7 w-20 animate-pulse rounded bg-slate-100" />

                                <div className="mt-2 h-2 w-32 animate-pulse rounded bg-slate-100" />
                            </Card>
                        ),
                    )}
                </div>

                <div className="mt-5">
                    <Card
                        padding="lg"
                        className="py-16 text-center"
                    >
                        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400">
                            <ShieldAlert
                                size={20}
                                className="animate-pulse"
                            />
                        </div>

                        <h3 className="mt-4 text-sm font-bold text-slate-800">
                            Loading live dashboard
                        </h3>

                        <p className="mt-2 text-xs text-slate-400">
                            Fetching project and ML risk data from the backend.
                        </p>
                    </Card>
                </div>

            </div>
        );
    }


    /* =====================================================
       ERROR STATE
    ===================================================== */

    if (
        error &&
        !dashboardData
    ) {
        return (
            <div className="mx-auto w-full max-w-[1500px]">

                <PageHeader
                    eyebrow="NATIONAL PROJECT MONITORING"
                    title="Dashboard"
                    description="Monitor infrastructure projects, emerging risks, cost pressure and schedule performance."
                />

                <div className="mt-6">
                    <Card
                        padding="lg"
                        className="border-red-100 bg-red-50/40 py-16 text-center"
                    >
                        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-red-100 text-red-600">
                            <ShieldAlert
                                size={20}
                            />
                        </div>

                        <h3 className="mt-4 text-sm font-bold text-red-800">
                            Unable to load dashboard
                        </h3>

                        <p className="mx-auto mt-2 max-w-lg text-xs leading-5 text-red-600">
                            {error}
                        </p>

                        <Button
                            variant="secondary"
                            size="sm"
                            className="mt-5"
                            onClick={() =>
                                window.location.reload()
                            }
                        >
                            Retry
                        </Button>
                    </Card>
                </div>

            </div>
        );
    }


    return (
        <div className="mx-auto w-full max-w-[1500px]">

            {/* ==================================================
              PAGE HEADER
            =================================================== */}

            <PageHeader
                eyebrow="NATIONAL PROJECT MONITORING"
                title="Dashboard"
                description="Monitor infrastructure projects, emerging risks, cost pressure and schedule performance."
                action={
                    <div className="hidden items-center gap-2 sm:flex">

                        <Select
                            aria-label="Reporting period"
                            value={
                                filters.period
                            }
                            onChange={(
                                event,
                            ) =>
                                setFilters({
                                    ...filters,
                                    period:
                                        event.target.value,
                                })
                            }
                            options={
                                reportingPeriods.length > 0
                                    ? reportingPeriods.map(
                                        (
                                            period,
                                        ) => ({
                                            label:
                                                period,
                                            value:
                                                period,
                                        }),
                                    )
                                    : [
                                        {
                                            label:
                                                "Latest",
                                            value:
                                                "",
                                        },
                                    ]
                            }
                            className="w-[150px]"
                        />

                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() =>
                                setFilterDrawerOpen(
                                    true,
                                )
                            }
                        >
                            <Filter size={14} />
                            Filters
                        </Button>

                    </div>
                }
            />


            {/* ==================================================
              MOBILE CONTROLS
            =================================================== */}

            <div className="mb-5 flex gap-2 sm:hidden">

                <Select
                    aria-label="Reporting period"
                    value={
                        filters.period
                    }
                    onChange={(
                        event,
                    ) =>
                        setFilters({
                            ...filters,
                            period:
                                event.target.value,
                        })
                    }
                    options={
                        reportingPeriods.length > 0
                            ? reportingPeriods.map(
                                (
                                    period,
                                ) => ({
                                    label:
                                        period,
                                    value:
                                        period,
                                }),
                            )
                            : [
                                {
                                    label:
                                        "Latest",
                                    value:
                                        "",
                                },
                            ]
                    }
                    className="flex-1"
                />

                <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                        setFilterDrawerOpen(
                            true,
                        )
                    }
                >
                    <Filter size={14} />
                    Filters
                </Button>

            </div>


            {/* ==================================================
              SEARCH
            =================================================== */}

            <div className="mb-4 max-w-md">

                <div className="relative">

                    <Search
                        size={15}
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />

                    <Input
                        aria-label="Search projects"
                        value={
                            search
                        }
                        onChange={(
                            event,
                        ) =>
                            setSearch(
                                event.target.value,
                            )
                        }
                        placeholder="Search projects, ministries..."
                        className="pl-9"
                    />

                </div>

            </div>


            {/* ==================================================
              ACTIVE FILTERS
            =================================================== */}

            <div className="mb-5">

                <FilterChips
                    filters={
                        appliedFilters
                    }
                    onChange={
                        setAppliedFilters
                    }
                />

            </div>


            {/* ==================================================
              REFRESHING INDICATOR
            =================================================== */}

            {isLoading && (
                <div className="mb-4 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-400">
                    <ShieldAlert
                        size={13}
                        className="animate-pulse"
                    />
                    Updating live dashboard data...
                </div>
            )}


            {/* ==================================================
              BACKEND ERROR WHILE OLD DATA EXISTS
            =================================================== */}

            {error && dashboardData && (
                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
                    Latest dashboard data is shown. The newest refresh failed:
                    {" "}
                    {error}
                </div>
            )}


            {/* ==================================================
              KPI
            =================================================== */}

            <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">

                <MetricCard
                    label="Total Projects"
                    value={formatNumber(
                        metrics.totalProjects,
                    )}
                    description="Projects in selected portfolio"
                    icon={
                        <ShieldAlert
                            size={18}
                        />
                    }
                    onClick={() =>
                        navigate(
                            "/project-analytics",
                        )
                    }
                />

                <MetricCard
                    label="High Risk Projects"
                    value={formatNumber(
                        metrics.highRiskProjects,
                    )}
                    description="Projects requiring attention"
                    icon={
                        <AlertTriangle
                            size={18}
                        />
                    }
                    onClick={() =>
                        navigate(
                            "/risk-analysis",
                        )
                    }
                />

                <MetricCard
                    label="Projects at Cost Risk"
                    value={formatNumber(
                        metrics.costRiskProjects,
                    )}
                    description="Projects showing cost pressure"
                    icon={
                        <IndianRupee
                            size={18}
                        />
                    }
                    onClick={() =>
                        navigate(
                            "/cost-prediction",
                        )
                    }
                />

                <MetricCard
                    label="Delayed Projects"
                    value={formatNumber(
                        metrics.delayedProjects,
                    )}
                    description="Projects with schedule pressure"
                    icon={
                        <Clock3
                            size={18}
                        />
                    }
                    onClick={() =>
                        navigate(
                            "/delay-prediction",
                        )
                    }
                />

            </section>


            {/* ==================================================
              PORTFOLIO FINANCIALS
            =================================================== */}

            <section className="mt-5">

                <PortfolioFinancials
                    originalCost={
                        financials.originalCost
                    }
                    revisedCost={
                        financials.revisedCost
                    }
                />

            </section>


            {/* ==================================================
              RISK + WARNING
            =================================================== */}

            <section className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-[1.6fr_1fr]">

                <Card padding="lg">

                    <div className="flex items-start justify-between gap-4">

                        <div>

                            <h2 className="text-sm font-bold text-slate-900">
                                Risk Overview
                            </h2>

                            <p className="mt-1 text-[11px] text-slate-400">
                                Distribution of the currently filtered live portfolio.
                            </p>

                        </div>

                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                                navigate(
                                    "/risk-analysis",
                                )
                            }
                        >
                            View analysis
                            <ArrowRight size={13} />
                        </Button>

                    </div>


                    <RiskDistribution
                        data={
                            riskDistribution
                        }
                    />

                </Card>


                <Card padding="lg">

                    <div className="flex items-start gap-3">

                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-red-50 text-red-600">
                            <Bell size={17} />
                        </div>

                        <div>

                            <h2 className="text-sm font-bold text-slate-900">
                                Early Warning Center
                            </h2>

                            <p className="mt-1 text-[11px] text-slate-400">
                                Current projects requiring attention.
                            </p>

                        </div>

                    </div>


                    <div className="mt-6 space-y-3">

                        <WarningRow
                            label="Critical"
                            count={
                                riskDistribution.Critical
                            }
                            variant="danger"
                        />

                        <WarningRow
                            label="High"
                            count={
                                riskDistribution.High
                            }
                            variant="warning"
                        />

                        <WarningRow
                            label="Elevated"
                            count={
                                riskDistribution.Elevated
                            }
                            variant="warning"
                        />

                        <WarningRow
                            label="Moderate"
                            count={
                                riskDistribution.Moderate
                            }
                            variant="info"
                        />

                    </div>


                    <Button
                        fullWidth
                        className="mt-5"
                        onClick={() =>
                            navigate(
                                "/early-warnings",
                            )
                        }
                    >
                        Open Warning Center
                    </Button>

                </Card>

            </section>


            {/* ==================================================
              HIGHEST RISK PROJECTS
            =================================================== */}

            <section className="mt-5">

                <Card padding="none">

                    <div className="flex flex-col gap-3 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-5">

                        <div>

                            <h2 className="text-sm font-bold text-slate-900">
                                Highest Risk Projects
                            </h2>

                            <p className="mt-1 text-[11px] text-slate-400">
                                {highestRiskProjects.length} highest-risk projects shown from the live dashboard data
                            </p>

                        </div>

                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                                navigate(
                                    "/risk-analysis",
                                )
                            }
                        >
                            View all
                            <ArrowRight size={13} />
                        </Button>

                    </div>


                    <div className="overflow-x-auto">

                        <table className="w-full min-w-[850px] border-collapse">

                            <thead>

                                <tr className="border-y border-slate-100 bg-slate-50/60">

                                    <TableHeading>
                                        Project
                                    </TableHeading>

                                    <TableHeading>
                                        Ministry
                                    </TableHeading>

                                    <TableHeading>
                                        State
                                    </TableHeading>

                                    <TableHeading>
                                        Risk
                                    </TableHeading>

                                    <TableHeading>
                                        Cost Risk
                                    </TableHeading>

                                    <TableHeading>
                                        Delay
                                    </TableHeading>

                                    <TableHeading>
                                        Progress
                                    </TableHeading>

                                </tr>

                            </thead>


                            <tbody>

                                {highestRiskProjects.length ===
                                    0 ? (

                                    <tr>

                                        <td
                                            colSpan={7}
                                            className="px-5 py-12 text-center"
                                        >

                                            <div className="text-sm font-semibold text-slate-700">
                                                No projects found
                                            </div>

                                            <div className="mt-1 text-xs text-slate-400">
                                                Try changing your filters or search.
                                            </div>

                                        </td>

                                    </tr>

                                ) : (

                                    highestRiskProjects.map(
                                        (
                                            project,
                                        ) => (

                                            <ProjectRow
                                                key={
                                                    project.id
                                                }
                                                project={
                                                    project
                                                }
                                                onClick={() =>
                                                    navigate(
                                                        `/project-analytics?project=${encodeURIComponent(
                                                            project.id,
                                                        )}`,
                                                    )
                                                }
                                            />

                                        ),
                                    )

                                )}

                            </tbody>

                        </table>

                    </div>

                </Card>

            </section>


            {/* ==================================================
              PORTFOLIO INSIGHT
            =================================================== */}

            <section className="mt-5">

                <Card padding="lg">

                    <div className="flex items-start gap-4">

                        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-900 text-white">
                            <TrendingUp
                                size={18}
                            />
                        </div>

                        <div>

                            <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
                                PORTFOLIO INSIGHT
                            </div>

                            <h3 className="mt-1 text-sm font-bold text-slate-900">
                                {metrics.delayedProjects} projects are currently showing schedule pressure.
                            </h3>

                            <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-500">
                                Projects combining elevated risk, cost pressure and
                                schedule deterioration should receive priority monitoring.
                            </p>

                        </div>

                    </div>

                </Card>

            </section>


            {/* ==================================================
              FILTER DRAWER
            =================================================== */}

            <FilterDrawer
                open={
                    filterDrawerOpen
                }
                filters={
                    filters
                }
                onChange={
                    setFilters
                }
                onApply={
                    applyFilters
                }
                onClose={() =>
                    setFilterDrawerOpen(
                        false,
                    )
                }
                onReset={
                    resetFilters
                }
            />

        </div>
    );
}


/* =========================================================
   PORTFOLIO FINANCIALS
========================================================= */

function PortfolioFinancials({
    originalCost,
    revisedCost,
}: {
    originalCost: number;
    revisedCost: number;
}) {
    const escalation =
        revisedCost -
        originalCost;

    const escalationPercent =
        originalCost > 0
            ? (
                escalation /
                originalCost
            ) *
            100
            : 0;

    return (
        <Card padding="md">

            <div className="mb-4 flex items-center justify-between">

                <div>

                    <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
                        PORTFOLIO FINANCIALS
                    </div>

                    <div className="mt-1 text-xs text-slate-400">
                        Financial position of the selected portfolio
                    </div>

                </div>

                <Badge
                    variant={
                        escalationPercent >
                            10
                            ? "warning"
                            : "info"
                    }
                >
                    {escalationPercent >= 0
                        ? "+"
                        : ""}
                    {escalationPercent.toFixed(
                        1,
                    )}
                    %
                </Badge>

            </div>


            <div className="grid grid-cols-1 divide-y divide-slate-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">

                <FinancialMetric
                    label="Original Cost"
                    value={
                        originalCost
                    }
                />

                <FinancialMetric
                    label="Latest Revised Cost"
                    value={
                        revisedCost
                    }
                />

                <FinancialMetric
                    label="Cost Escalation"
                    value={
                        escalation
                    }
                    highlight
                />

            </div>

        </Card>
    );
}


/* =========================================================
   FINANCIAL METRIC
========================================================= */

function FinancialMetric({
    label,
    value,
    highlight = false,
}: {
    label: string;
    value: number;
    highlight?: boolean;
}) {
    return (
        <div className="py-3 first:pt-0 last:pb-0 sm:px-5 sm:py-1 first:sm:pl-0 last:sm:pr-0">

            <div className="text-[9px] font-bold uppercase tracking-[0.05em] text-slate-400">
                {label}
            </div>

            <div
                className={[
                    "mt-1 text-lg font-bold tracking-tight",
                    highlight
                        ? "text-orange-600"
                        : "text-slate-900",
                ].join(" ")}
            >
                ₹
                {formatCrore(
                    value,
                )}
            </div>

            <div className="mt-0.5 text-[9px] text-slate-400">
                crore
            </div>

        </div>
    );
}


/* =========================================================
   RISK DISTRIBUTION
========================================================= */

function RiskDistribution({
    data,
}: {
    data: {
        Critical: number;
        High: number;
        Elevated: number;
        Moderate: number;
        Low: number;
    };
}) {
    const total =
        data.Critical +
        data.High +
        data.Elevated +
        data.Moderate +
        data.Low;

    const items = [
        {
            label: "Critical",
            value: data.Critical,
            color: "bg-red-500",
            variant:
                "danger" as const,
        },
        {
            label: "High",
            value: data.High,
            color: "bg-orange-500",
            variant:
                "warning" as const,
        },
        {
            label: "Elevated",
            value: data.Elevated,
            color: "bg-yellow-400",
            variant:
                "warning" as const,
        },
        {
            label: "Moderate",
            value: data.Moderate,
            color: "bg-slate-400",
            variant:
                "info" as const,
        },
        {
            label: "Low",
            value: data.Low,
            color: "bg-emerald-500",
            variant:
                "success" as const,
        },
    ];

    return (
        <div className="mt-8">

            <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">

                {items.map(
                    (
                        item,
                    ) => (
                        <div
                            key={
                                item.label
                            }
                            className={
                                item.color
                            }
                            style={{
                                width:
                                    total >
                                        0
                                        ? `${(
                                            item.value /
                                            total
                                        ) *
                                        100
                                        }%`
                                        : "0%",
                            }}
                        />
                    ),
                )}

            </div>


            <div className="mt-7 grid grid-cols-2 gap-4 sm:grid-cols-5">

                {items.map(
                    (
                        item,
                    ) => (
                        <div
                            key={
                                item.label
                            }
                        >

                            <Badge
                                variant={
                                    item.variant
                                }
                                dot
                            >
                                {
                                    item.label
                                }
                            </Badge>

                            <div className="mt-2 text-xl font-bold tracking-tight text-slate-900">
                                {formatNumber(
                                    item.value,
                                )}
                            </div>

                            <div className="mt-1 text-[10px] text-slate-400">
                                projects
                            </div>

                        </div>
                    ),
                )}

            </div>

        </div>
    );
}


/* =========================================================
   WARNING ROW
========================================================= */

function WarningRow({
    label,
    count,
    variant,
}: {
    label: string;
    count: number;
    variant:
        | "success"
        | "warning"
        | "danger"
        | "info";
}) {
    return (
        <div className="flex items-center justify-between rounded-xl border border-slate-100 p-3">

            <Badge
                variant={
                    variant
                }
                dot
            >
                {label}
            </Badge>

            <span className="text-sm font-bold text-slate-900">
                {formatNumber(
                    count,
                )}
            </span>

        </div>
    );
}


/* =========================================================
   PROJECT ROW
========================================================= */

function ProjectRow({
    project,
    onClick,
}: {
    project: DashboardProject;
    onClick: () => void;
}) {
    const riskLevel =
        project.riskLevel ||
        "Low";

    const riskScore =
        project.riskScore;

    const progress = Math.min(
        Math.max(
            Number(
                project.physicalProgress ||
                0,
            ),
            0,
        ),
        100,
    );

    const delayMonths =
        Number(
            project.delayMonths ||
            0,
        );

    return (
        <tr
            onClick={
                onClick
            }
            className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50/70"
        >

            <td className="px-5 py-4">

                <div className="max-w-[280px] truncate text-xs font-semibold text-slate-800">
                    {project.name ||
                        "Unnamed Project"}
                </div>

                <div className="mt-1 text-[10px] text-slate-400">
                    {project.id}
                </div>

            </td>


            <td className="px-5 py-4 text-xs text-slate-500">
                {project.ministry ||
                    "—"}
            </td>


            <td className="px-5 py-4 text-xs text-slate-500">
                {project.state ||
                    "—"}
            </td>


            <td className="px-5 py-4">

                <div className="flex items-center gap-2">

                    <span className="text-xs font-bold text-slate-900">
                        {riskScore !==
                            null &&
                        riskScore !==
                            undefined
                            ? Number(
                                riskScore,
                            ).toFixed(
                                1,
                            )
                            : "—"}
                    </span>

                    <Badge
                        variant={getRiskBadgeVariant(
                            riskLevel,
                        )}
                        dot
                    >
                        {
                            riskLevel
                        }
                    </Badge>

                </div>

            </td>


            <td className="px-5 py-4">

                <Badge
                    variant={
                        project.costRisk ===
                            "High"
                            ? "warning"
                            : project.costRisk ===
                                "Low"
                                ? "success"
                                : "info"
                    }
                >
                    {project.costRisk ||
                        "—"}
                </Badge>

            </td>


            <td className="px-5 py-4 text-xs font-semibold text-red-500">
                {delayMonths >
                    0
                    ? `+${delayMonths.toFixed(
                        1,
                    )} mo`
                    : "—"}
            </td>


            <td className="px-5 py-4">

                <div className="flex items-center gap-3">

                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">

                        <div
                            className="h-full rounded-full bg-slate-700"
                            style={{
                                width: `${progress}%`,
                            }}
                        />

                    </div>

                    <span className="text-xs font-semibold text-slate-600">
                        {progress.toFixed(
                            1,
                        )}
                        %
                    </span>

                </div>

            </td>

        </tr>
    );
}


/* =========================================================
   TABLE HEADING
========================================================= */

function TableHeading({
    children,
}: {
    children: ReactNode;
}) {
    return (
        <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {children}
        </th>
    );
}