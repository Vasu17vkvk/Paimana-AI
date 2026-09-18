import type { ReactNode } from "react";

import { useQuery } from "@tanstack/react-query";

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
    X,
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

import {
    getActiveWarnings,
} from "../../services/warningsApi";


interface DashboardFilterOptionsState {
    reportingPeriods: string[];
    ministries: string[];
    sectors: string[];
    states: string[];
    riskLevels: string[];
    statuses: string[];
}


function mapDashboardProject(
    project: DashboardResponse["projects"][number],
): DashboardProject {
    return {
        id: project.id,
        name: project.name || "Unnamed Project",
        ministry: project.ministry || "",
        sector: project.sector || "",
        state: project.state || "",

        originalCost: Number(
            project.originalCost ?? 0,
        ),

        revisedCost: Number(
            project.revisedCost ?? 0,
        ),

        riskScore:
            project.riskScore === null ||
                project.riskScore === undefined
                ? null
                : Number(project.riskScore),

        riskLevel: (
            project.riskLevel || "Low"
        ) as DashboardProject["riskLevel"],

        costRisk:
            project.costRisk || "—",

        delayRisk: (
            project.delayRisk ||
            project.riskLevel ||
            "Low"
        ) as DashboardProject["delayRisk"],

        delayMonths: Number(
            project.delayMonths ?? 0,
        ),

        physicalProgress: Number(
            project.physicalProgress ?? 0,
        ),

        status:
            project.status || "—",
    };
}


function normalizeDashboardFilters(
    filters: DashboardFilters,
) {
    return {
        period:
            filters.period &&
                filters.period !== "All Periods"
                ? filters.period
                : undefined,

        ministry:
            filters.ministry &&
                filters.ministry !== "All Ministries"
                ? filters.ministry
                : undefined,

        sector:
            filters.sector &&
                filters.sector !== "All Sectors"
                ? filters.sector
                : undefined,

        state:
            filters.state &&
                filters.state !== "All States"
                ? filters.state
                : undefined,

        risk:
            filters.risk &&
                filters.risk !== "All Risk Levels"
                ? filters.risk
                : undefined,

        status:
            filters.status &&
                filters.status !== "All Statuses"
                ? filters.status
                : undefined,
    };
}


function getProjectCodeSet(
    projects: DashboardProject[],
) {
    return new Set(
        projects.map((project) =>
            String(project.id),
        ),
    );
}


export default function DashboardPage() {
    const navigate = useNavigate();

    const [filters, setFilters] =
        useState<DashboardFilters>({
            ...defaultDashboardFilters,
            period:
                defaultDashboardFilters.period ||
                "",
        });

    const [appliedFilters, setAppliedFilters] =
        useState<DashboardFilters>({
            ...defaultDashboardFilters,
            period:
                defaultDashboardFilters.period ||
                "",
        });

    const [filterDrawerOpen, setFilterDrawerOpen] =
        useState(false);

    const [search, setSearch] =
        useState("");

    const [debouncedSearch, setDebouncedSearch] =
        useState("");

    const [
        scheduleViewMode,
        setScheduleViewMode,
    ] = useState<
        "projects" | "percentage"
    >("projects");


    useEffect(() => {
        const timer =
            window.setTimeout(() => {
                setDebouncedSearch(
                    search.trim(),
                );
            }, 400);

        return () => {
            window.clearTimeout(timer);
        };
    }, [search]);


    const filterOptionsQuery = useQuery({
        queryKey: [
            "dashboard-filter-options",
        ],
        queryFn:
            getDashboardFilterOptions,
        staleTime: 10 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
    });


    const filterOptions:
        DashboardFilterOptionsState = {
        reportingPeriods:
            filterOptionsQuery.data?.periods ??
            [],

        ministries:
            filterOptionsQuery.data?.ministries ??
            [],

        sectors:
            filterOptionsQuery.data?.sectors ??
            [],

        states:
            filterOptionsQuery.data?.states ??
            [],

        riskLevels:
            filterOptionsQuery.data
                ?.risk_levels?.length
                ? filterOptionsQuery.data
                    .risk_levels
                : [
                    "Critical",
                    "High",
                    "Elevated",
                    "Moderate",
                    "Low",
                ],

        statuses:
            filterOptionsQuery.data
                ?.statuses?.length
                ? filterOptionsQuery.data
                    .statuses
                : [
                    "Ongoing",
                    "Delayed",
                    "Completed",
                    "On Schedule",
                    "Accelerated",
                    "No Revised Date",
                ],
    };


    const dashboardQuery = useQuery({
        queryKey: [
            "dashboard",
            appliedFilters,
            debouncedSearch,
        ],

        queryFn: () =>
            getDashboard({
                ...normalizeDashboardFilters(
                    appliedFilters,
                ),
                search:
                    debouncedSearch ||
                    undefined,
            }),

        staleTime: 60_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
    });


    const dashboardData =
        dashboardQuery.data ?? null;

    const isLoading =
        dashboardQuery.isLoading ||
        dashboardQuery.isFetching;

    const dashboardError =
        dashboardQuery.error
            ? dashboardQuery.error instanceof
                Error
                ? dashboardQuery.error.message
                : "Failed to load dashboard data."
            : null;


    const warningsQuery = useQuery({
        queryKey: ["active-warnings"],
        queryFn: getActiveWarnings,
        staleTime: 60_000,
        refetchInterval: 60_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
    });


    const activeWarnings =
        warningsQuery.data ?? [];

    const isLoadingWarnings =
        warningsQuery.isLoading ||
        warningsQuery.isFetching;


    const dashboardProjects =
        useMemo(() => {
            return (
                dashboardData?.projects ?? []
            ).map(mapDashboardProject);
        }, [dashboardData]);


    const highestRiskProjects =
        useMemo(() => {
            if (
                dashboardData?.highestRiskProjects
            ) {
                return dashboardData
                    .highestRiskProjects
                    .map(mapDashboardProject);
            }

            return [...dashboardProjects]
                .sort(
                    (first, second) =>
                        (second.riskScore ?? -1) -
                        (first.riskScore ?? -1),
                )
                .slice(0, 8);
        }, [
            dashboardData,
            dashboardProjects,
        ]);


    const metrics =
        dashboardData?.metrics ?? {
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


    const financials =
        dashboardData?.financials ?? {
            originalCost: 0,
            revisedCost: 0,
        };


    const monthlyPortfolioData =
        dashboardData?.monthlyPortfolioData ??
        [];


    const getTrend = (
        key:
            | "projects"
            | "highRisk"
            | "delayed"
            | "costRisk",
        lowerIsBetter = false,
    ) => {
        const values =
            monthlyPortfolioData
                .map((item) =>
                    Number(item[key] ?? 0),
                )
                .filter((value) =>
                    Number.isFinite(value),
                );

        if (values.length < 2) {
            return {
                values,
                text: undefined as
                    | string
                    | undefined,
                positive: true,
            };
        }

        const previous =
            values[
            values.length - 2
            ] ?? 0;

        const current =
            values[
            values.length - 1
            ] ?? 0;

        if (previous === 0) {
            return {
                values,
                text:
                    current > 0
                        ? "New"
                        : "No change",
                positive:
                    lowerIsBetter
                        ? current === 0
                        : current > 0,
            };
        }

        const change =
            ((current - previous) /
                Math.abs(previous)) *
            100;

        const positive =
            lowerIsBetter
                ? change <= 0
                : change >= 0;

        return {
            values,
            text:
                `${Math.abs(change).toFixed(1)}%`,
            positive,
        };
    };


    const projectTrend =
        getTrend("projects");

    const highRiskTrend =
        getTrend(
            "highRisk",
            true,
        );

    const costRiskTrend =
        getTrend(
            "costRisk",
            true,
        );

    const delayedTrend =
        getTrend(
            "delayed",
            true,
        );


    const filteredWarningCounts =
        useMemo(() => {
            const selectedCodes =
                getProjectCodeSet(
                    dashboardProjects,
                );

            const warningsForPortfolio =
                activeWarnings.filter(
                    (warning) =>
                        selectedCodes.has(
                            String(
                                warning.project_code,
                            ),
                        ),
                );

            const immediate =
                warningsForPortfolio.filter(
                    (warning) =>
                        warning.early_warning_priority ===
                        "IMMEDIATE",
                ).length;

            const highPriority =
                warningsForPortfolio.filter(
                    (warning) =>
                        warning.early_warning_priority ===
                        "HIGH",
                ).length;

            return {
                active:
                    warningsForPortfolio.length,
                immediate,
                highPriority,
                warnings:
                    warningsForPortfolio,
            };
        }, [
            activeWarnings,
            dashboardProjects,
        ]);


    const applyFilters = () => {
        setAppliedFilters(filters);
        setFilterDrawerOpen(false);
    };


    const resetFilters = () => {
        const resetValues:
            DashboardFilters = {
            ...defaultDashboardFilters,
            period: "",
        };

        setFilters(resetValues);
        setAppliedFilters(resetValues);
        setSearch("");
        setDebouncedSearch("");
    };


    const handlePeriodChange = (
        value: string,
    ) => {
        const nextFilters = {
            ...filters,
            period: value,
        };

        setFilters(nextFilters);
        setAppliedFilters(nextFilters);
    };


    if (
        isLoading &&
        !dashboardData
    ) {
        return (
            <div className="
                mx-auto w-full
                max-w-[1500px]
            ">
                <PageHeader
                    eyebrow="NATIONAL PROJECT MONITORING"
                    title="Dashboard"
                    description="Monitor infrastructure projects, emerging risks, cost pressure and schedule performance."
                />

                <div className="
                    mt-6 grid grid-cols-2
                    gap-3 sm:gap-4
                    xl:grid-cols-4
                ">
                    {[
                        "Total Projects",
                        "High Risk Projects",
                        "Projects at Cost Risk",
                        "Delayed Projects",
                    ].map((label) => (
                        <Card
                            key={label}
                            padding="md"
                        >
                            <div className="
                                h-9 w-9
                                animate-pulse
                                rounded-[10px]
                                bg-slate-100
                            " />

                            <div className="
                                mt-4 h-2 w-24
                                animate-pulse
                                rounded
                                bg-slate-100
                            " />

                            <div className="
                                mt-2 h-7 w-20
                                animate-pulse
                                rounded
                                bg-slate-100
                            " />

                            <div className="
                                mt-2 h-2 w-36
                                animate-pulse
                                rounded
                                bg-slate-100
                            " />
                        </Card>
                    ))}
                </div>

                <div className="mt-5">
                    <Card
                        padding="lg"
                        className="
                            py-16 text-center
                        "
                    >
                        <div className="
                            mx-auto grid h-12 w-12
                            place-items-center
                            rounded-[14px]
                            bg-slate-100
                            text-slate-400
                        ">
                            <ShieldAlert
                                size={20}
                                className="animate-pulse"
                            />
                        </div>

                        <h3 className="
                            mt-4 text-[13px]
                            font-bold text-[#172033]
                        ">
                            Loading live dashboard
                        </h3>

                        <p className="
                            mt-2 text-[11px]
                            text-[#94A3B8]
                        ">
                            Fetching current portfolio and ML risk data.
                        </p>
                    </Card>
                </div>
            </div>
        );
    }


    if (
        dashboardError &&
        !dashboardData
    ) {
        return (
            <div className="
                mx-auto w-full
                max-w-[1500px]
            ">
                <PageHeader
                    eyebrow="NATIONAL PROJECT MONITORING"
                    title="Dashboard"
                    description="Monitor infrastructure projects, emerging risks, cost pressure and schedule performance."
                />

                <div className="mt-6">
                    <Card
                        padding="lg"
                        className="
                            border-red-100
                            bg-red-50/40
                            py-16 text-center
                        "
                    >
                        <div className="
                            mx-auto grid h-12 w-12
                            place-items-center
                            rounded-[14px]
                            bg-red-100
                            text-red-600
                        ">
                            <ShieldAlert
                                size={20}
                            />
                        </div>

                        <h3 className="
                            mt-4 text-[13px]
                            font-bold
                            text-red-800
                        ">
                            Unable to load dashboard
                        </h3>

                        <p className="
                            mx-auto mt-2
                            max-w-lg
                            text-[11px]
                            leading-5
                            text-red-600
                        ">
                            {dashboardError}
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
        <div className="
            mx-auto w-full
            max-w-[1500px]
        ">
            <PageHeader
                eyebrow="NATIONAL PROJECT MONITORING"
                title="Dashboard"
                description="Monitor infrastructure projects, emerging risks, cost pressure and schedule performance."
                action={
                    <div className="
                        hidden items-center
                        gap-2 sm:flex
                    ">
                        <Select
                            aria-label="Reporting period"
                            value={filters.period}
                            onChange={(event) =>
                                handlePeriodChange(
                                    event.target.value,
                                )
                            }
                            tone="dark"
                            options={[
                                {
                                    label:
                                        "Select Month",
                                    value: "",
                                },
                                ...filterOptions
                                    .reportingPeriods
                                    .map(
                                        (period) => ({
                                            label: period,
                                            value: period,
                                        }),
                                    ),
                            ]}
                            className="w-[160px]"
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


            <div className="
                mb-5 flex gap-2 sm:hidden
            ">
                <Select
                    aria-label="Reporting period"
                    value={filters.period}
                    onChange={(event) =>
                        handlePeriodChange(
                            event.target.value,
                        )
                    }
                    options={[
                        {
                            label:
                                "Select Month",
                            value: "",
                        },
                        ...filterOptions
                            .reportingPeriods
                            .map(
                                (period) => ({
                                    label: period,
                                    value: period,
                                }),
                            ),
                    ]}
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


            <div className="
                mb-4 w-full
                max-w-[600px]
            ">
                <div className="relative">
                    <Search
                        size={15}
                        className="
                            pointer-events-none
                            absolute left-3
                            top-1/2
                            -translate-y-1/2
                            text-slate-400
                        "
                    />

                    <Input
                        aria-label="Search projects"
                        value={search}
                        onChange={(event) =>
                            setSearch(
                                event.target.value,
                            )
                        }
                        placeholder="Search projects, ministries..."
                        className="pl-9"
                    />
                </div>
            </div>


            <div className="mb-5">
                <FilterChips
                    filters={appliedFilters}
                    onChange={(nextFilters) => {
                        setAppliedFilters(
                            nextFilters,
                        );

                        setFilters(
                            nextFilters,
                        );
                    }}
                />
            </div>


            {isLoading && (
                <div className="
                    mb-4 flex
                    items-center gap-2
                    rounded-[9px]
                    border
                    border-[#D9E1E8]
                    bg-white
                    px-3 py-2
                    text-[10px]
                    text-[#94A3B8]
                ">
                    <ShieldAlert
                        size={13}
                        className="animate-pulse"
                    />
                    Updating live dashboard data...
                </div>
            )}


            <section className="
                grid grid-cols-2
                gap-3 sm:gap-4
                xl:grid-cols-4
            ">
                <MetricCard
                    label="Total Projects"
                    value={formatNumber(
                        metrics.totalProjects,
                    )}
                    description="Projects in selected portfolio"
                    icon={
                        <ShieldAlert
                            size={18}
                            strokeWidth={1.8}
                        />
                    }
                    trend={projectTrend.text}
                    trendPositive={
                        projectTrend.positive
                    }
                    sparkline={
                        projectTrend.values
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
                    description="Critical and high-risk projects"
                    icon={
                        <AlertTriangle
                            size={18}
                            strokeWidth={1.8}
                        />
                    }
                    trend={highRiskTrend.text}
                    trendPositive={
                        highRiskTrend.positive
                    }
                    sparkline={
                        highRiskTrend.values
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
                    description="Projects with recorded cost overrun"
                    icon={
                        <IndianRupee
                            size={18}
                            strokeWidth={1.8}
                        />
                    }
                    trend={costRiskTrend.text}
                    trendPositive={
                        costRiskTrend.positive
                    }
                    sparkline={
                        costRiskTrend.values
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
                            strokeWidth={1.8}
                        />
                    }
                    trend={delayedTrend.text}
                    trendPositive={
                        delayedTrend.positive
                    }
                    sparkline={
                        delayedTrend.values
                    }
                    onClick={() =>
                        navigate(
                            "/delay-prediction",
                        )
                    }
                />
            </section>


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


            <section className="
                mt-5 grid grid-cols-1
                gap-4 xl:grid-cols-2
            ">
                <Card
                    padding="lg"
                    className="overflow-hidden"
                >
                    <div className="
                        flex items-start
                        justify-between gap-4
                    ">
                        <div>
                            <div className="
                                text-[10px]
                                font-bold uppercase
                                tracking-[0.08em]
                                text-[#94A3B8]
                            ">
                                RISK MONITORING
                            </div>

                            <h2 className="
                                mt-1 text-[16px]
                                font-bold
                                tracking-[-0.02em]
                                text-[#172033]
                            ">
                                Risk Distribution
                            </h2>

                            <p className="
                                mt-1 text-[11px]
                                leading-4
                                text-[#64748B]
                            ">
                                Current model-based risk classification
                            </p>
                        </div>

                        <ChartMenu
                            actions={[
                                {
                                    label:
                                        "Open Risk Analysis",
                                    onClick: () =>
                                        navigate(
                                            "/risk-analysis",
                                        ),
                                },
                                {
                                    label:
                                        "Open Early Warnings",
                                    onClick: () =>
                                        navigate(
                                            "/early-warnings",
                                        ),
                                },
                            ]}
                        />
                    </div>

                    <RiskDistribution
                        data={riskDistribution}
                    />
                </Card>


                <Card
                    padding="lg"
                    className="overflow-hidden"
                >
                    <div className="
                        flex items-start
                        justify-between gap-4
                    ">
                        <div>
                            <div className="
                                text-[10px]
                                font-bold uppercase
                                tracking-[0.08em]
                                text-[#94A3B8]
                            ">
                                SCHEDULE MONITORING
                            </div>

                            <h2 className="
                                mt-1 text-[16px]
                                font-bold
                                tracking-[-0.02em]
                                text-[#172033]
                            ">
                                Schedule Status
                            </h2>

                            <p className="
                                mt-1 text-[11px]
                                leading-4
                                text-[#64748B]
                            ">
                                Portfolio-wide schedule classification
                            </p>
                        </div>

                        <div className="
                            flex items-center gap-2
                        ">
                            <select
                                value={
                                    scheduleViewMode
                                }
                                onChange={(event) =>
                                    setScheduleViewMode(
                                        event.target.value as
                                        | "projects"
                                        | "percentage",
                                    )
                                }
                                className="
                                    hidden h-8
                                    appearance-none
                                    rounded-[8px]
                                    border
                                    border-[#D9E1E8]
                                    bg-white
                                    px-3 pr-6
                                    text-[10px]
                                    font-medium
                                    text-[#64748B]
                                    outline-none
                                    transition-colors
                                    hover:border-slate-300
                                    focus:border-[#94A3B8]
                                    focus:ring-2
                                    focus:ring-[#102A43]/5
                                    sm:block
                                "
                            >
                                <option value="projects">
                                    Projects
                                </option>

                                <option value="percentage">
                                    Share (%)
                                </option>
                            </select>

                            <ChartMenu
                                actions={[
                                    {
                                        label:
                                            "Open Project Analytics",
                                        onClick: () =>
                                            navigate(
                                                "/project-analytics",
                                            ),
                                    },
                                    {
                                        label:
                                            "Open Delay Prediction",
                                        onClick: () =>
                                            navigate(
                                                "/delay-prediction",
                                            ),
                                    },
                                ]}
                            />
                        </div>
                    </div>

                    <ScheduleStatus
                        projects={
                            dashboardProjects
                        }
                        viewMode={
                            scheduleViewMode
                        }
                    />
                </Card>
            </section>


            <section className="mt-5">
                <Card
                    padding="lg"
                    className="
                        relative overflow-hidden
                        border-red-100/80
                    "
                >
                    <div className="
                        absolute right-0 top-0
                        h-28 w-28
                        rounded-full
                        bg-red-50/60
                        blur-3xl
                    " />

                    <div className="relative">
                        <div className="
                            flex items-start
                            justify-between gap-4
                        ">
                            <div className="
                                flex items-start
                                gap-3
                            ">
                                <div className="
                                    grid h-9 w-9
                                    shrink-0
                                    place-items-center
                                    rounded-[10px]
                                    bg-red-50
                                    text-red-600
                                ">
                                    <Bell
                                        size={17}
                                        strokeWidth={1.9}
                                    />
                                </div>

                                <div className="min-w-0">
                                    <div className="
                                        flex items-center
                                        gap-2
                                    ">
                                        <div className="
                                            text-[10px]
                                            font-bold uppercase
                                            tracking-[0.08em]
                                            text-[#94A3B8]
                                        ">
                                            LIVE MONITORING
                                        </div>

                                        {isLoadingWarnings && (
                                            <span className="
                                                rounded-full
                                                bg-slate-100
                                                px-2 py-0.5
                                                text-[8px]
                                                font-semibold
                                                text-slate-400
                                            ">
                                                Updating
                                            </span>
                                        )}
                                    </div>

                                    <h2 className="
                                        mt-1 text-[16px]
                                        font-bold
                                        tracking-[-0.02em]
                                        text-[#172033]
                                    ">
                                        Early Warning Center
                                    </h2>

                                    <p className="
                                        mt-1 text-[11px]
                                        leading-4
                                        text-[#64748B]
                                    ">
                                        Live ML-generated warnings requiring attention.
                                    </p>
                                </div>
                            </div>

                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                    navigate(
                                        "/early-warnings",
                                    )
                                }
                                className="shrink-0"
                            >
                                View center
                                <ArrowRight size={13} />
                            </Button>
                        </div>

                        <div className="
                            mt-6 grid
                            grid-cols-1 gap-2
                            sm:grid-cols-3
                        ">
                            <WarningRow
                                label="Immediate"
                                count={
                                    filteredWarningCounts.immediate
                                }
                                variant="danger"
                            />

                            <WarningRow
                                label="High Priority"
                                count={
                                    filteredWarningCounts.highPriority
                                }
                                variant="warning"
                            />

                            <WarningRow
                                label="Active Warnings"
                                count={
                                    filteredWarningCounts.active
                                }
                                variant="info"
                            />
                        </div>
                    </div>
                </Card>
            </section>


            <section className="mt-5">
                <Card
                    padding="none"
                    className="overflow-hidden"
                >
                    <div className="
                        flex flex-col gap-3
                        border-b
                        border-[#E7EDF2]
                        px-5 py-4
                        sm:flex-row
                        sm:items-center
                        sm:justify-between
                        sm:px-6
                    ">
                        <div>
                            <div className="
                                text-[10px]
                                font-bold uppercase
                                tracking-[0.08em]
                                text-[#94A3B8]
                            ">
                                RISK PRIORITY
                            </div>

                            <h2 className="
                                mt-1 text-[15px]
                                font-bold
                                tracking-[-0.02em]
                                text-[#172033]
                            ">
                                Highest Risk Projects
                            </h2>

                            <p className="
                                mt-1 text-[11px]
                                leading-4
                                text-[#64748B]
                            ">
                                Top projects ranked by current ML risk score.
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
                            className="w-fit shrink-0"
                        >
                            View all
                            <ArrowRight size={13} />
                        </Button>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="
                            w-full min-w-[850px]
                            border-collapse
                        ">
                            <thead>
                                <tr className="
                                    border-b
                                    border-[#E7EDF2]
                                    bg-[#F8FAFB]
                                ">
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
                                            className="
                                                px-5 py-14
                                                text-center
                                            "
                                        >
                                            <div className="
                                                text-[13px]
                                                font-semibold
                                                text-slate-700
                                            ">
                                                No projects found
                                            </div>

                                            <div className="
                                                mt-1 text-[11px]
                                                text-slate-400
                                            ">
                                                Try changing your filters or search.
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    highestRiskProjects.map(
                                        (project) => (
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


            <section className="mt-5">
                <Card padding="lg">
                    <div className="
                        flex items-start gap-4
                    ">
                        <div className="
                            grid h-10 w-10 shrink-0
                            place-items-center
                            rounded-[10px]
                            bg-[#172033]
                            text-white
                        ">
                            <TrendingUp
                                size={18}
                                strokeWidth={1.8}
                            />
                        </div>

                        <div className="min-w-0">
                            <div className="
                                text-[10px]
                                font-bold uppercase
                                tracking-[0.08em]
                                text-[#94A3B8]
                            ">
                                PORTFOLIO INSIGHT
                            </div>

                            <h3 className="
                                mt-1 text-[14px]
                                font-bold
                                tracking-[-0.015em]
                                text-[#172033]
                            ">
                                {metrics.delayedProjects.toLocaleString(
                                    "en-IN",
                                )}{" "}
                                projects are currently showing schedule pressure.
                            </h3>

                            <p className="
                                mt-2 max-w-3xl
                                text-[11px]
                                leading-5
                                text-[#64748B]
                            ">
                                Projects combining elevated or high ML risk
                                with cost and schedule pressure should receive
                                priority monitoring.
                            </p>
                        </div>
                    </div>
                </Card>
            </section>


            <DashboardFilterDrawer
                open={filterDrawerOpen}
                filters={filters}
                options={filterOptions}
                onChange={setFilters}
                onApply={applyFilters}
                onClose={() =>
                    setFilterDrawerOpen(
                        false,
                    )
                }
                onReset={resetFilters}
            />
        </div>
    );
}


/* =========================================================
   FILTER DRAWER
========================================================= */

function DashboardFilterDrawer({
    open,
    filters,
    options,
    onChange,
    onApply,
    onClose,
    onReset,
}: {
    open: boolean;
    filters: DashboardFilters;
    options: DashboardFilterOptionsState;
    onChange: (
        filters: DashboardFilters,
    ) => void;
    onApply: () => void;
    onClose: () => void;
    onReset: () => void;
}) {
    if (!open) {
        return null;
    }

    return (
        <>
            <button
                type="button"
                aria-label="Close filters"
                onClick={onClose}
                className="
                    fixed inset-0 z-[70]
                    bg-slate-950/35
                    backdrop-blur-[2px]
                "
            />

            <div className="
                fixed inset-x-0
                bottom-0 z-[80]
                max-h-[92vh]
                overflow-y-auto
                rounded-t-[20px]
                border border-[#D9E1E8]
                bg-white
                shadow-[0_-12px_40px_rgba(15,23,42,0.14)]
                md:inset-y-0
                md:right-0
                md:left-auto
                md:w-[400px]
                md:max-h-none
                md:rounded-none
                md:rounded-l-[18px]
                md:border-y-0
                md:border-r-0
                md:border-l
                md:shadow-[-12px_0_40px_rgba(15,23,42,0.10)]
            ">
                <div className="
                    flex items-start
                    justify-between
                    border-b
                    border-[#E7EDF2]
                    px-5 py-5
                    sm:px-6
                ">
                    <div>
                        <div className="
                            text-[9px] font-bold
                            uppercase
                            tracking-[0.12em]
                            text-[#94A3B8]
                        ">
                            NIRMAAN AI
                        </div>

                        <h2 className="
                            mt-1 text-[16px]
                            font-bold
                            tracking-[-0.02em]
                            text-[#172033]
                        ">
                            Dashboard Filters
                        </h2>

                        <p className="
                            mt-1 text-[10px]
                            leading-4
                            text-[#94A3B8]
                        ">
                            Refine the portfolio view
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        className="
                            grid h-9 w-9
                            shrink-0
                            place-items-center
                            rounded-[10px]
                            text-[#64748B]
                            transition-colors
                            hover:bg-[#EEF2F5]
                            hover:text-[#172033]
                        "
                        aria-label="Close filters"
                    >
                        <X
                            size={17}
                            strokeWidth={1.8}
                        />
                    </button>
                </div>

                <div className="
                    space-y-4
                    px-5 py-5
                    sm:px-6
                ">
                    <Select
                        label="Reporting Period"
                        value={filters.period}
                        onChange={(event) =>
                            onChange({
                                ...filters,
                                period:
                                    event.target.value,
                            })
                        }
                        options={[
                            {
                                label:
                                    "Select Month",
                                value: "",
                            },
                            ...options
                                .reportingPeriods
                                .map(
                                    (item) => ({
                                        label:
                                            item,
                                        value:
                                            item,
                                    }),
                                ),
                        ]}
                    />

                    <Select
                        label="Ministry"
                        value={filters.ministry}
                        onChange={(event) =>
                            onChange({
                                ...filters,
                                ministry:
                                    event.target.value,
                            })
                        }
                        options={[
                            {
                                label:
                                    "All Ministries",
                                value:
                                    "All Ministries",
                            },
                            ...options
                                .ministries
                                .map(
                                    (item) => ({
                                        label:
                                            item,
                                        value:
                                            item,
                                    }),
                                ),
                        ]}
                    />

                    <Select
                        label="Sector"
                        value={filters.sector}
                        onChange={(event) =>
                            onChange({
                                ...filters,
                                sector:
                                    event.target.value,
                            })
                        }
                        options={[
                            {
                                label:
                                    "All Sectors",
                                value:
                                    "All Sectors",
                            },
                            ...options.sectors.map(
                                (item) => ({
                                    label:
                                        item,
                                    value:
                                        item,
                                }),
                            ),
                        ]}
                    />

                    <Select
                        label="State / Region"
                        value={filters.state}
                        onChange={(event) =>
                            onChange({
                                ...filters,
                                state:
                                    event.target.value,
                            })
                        }
                        options={[
                            {
                                label:
                                    "All States",
                                value:
                                    "All States",
                            },
                            ...options.states.map(
                                (item) => ({
                                    label:
                                        item,
                                    value:
                                        item,
                                }),
                            ),
                        ]}
                    />

                    <Select
                        label="Risk Level"
                        value={filters.risk}
                        onChange={(event) =>
                            onChange({
                                ...filters,
                                risk:
                                    event.target.value,
                            })
                        }
                        options={[
                            {
                                label:
                                    "All Risk Levels",
                                value:
                                    "All Risk Levels",
                            },
                            ...options
                                .riskLevels
                                .map(
                                    (item) => ({
                                        label:
                                            item,
                                        value:
                                            item,
                                    }),
                                ),
                        ]}
                    />

                    <Select
                        label="Project Status"
                        value={filters.status}
                        onChange={(event) =>
                            onChange({
                                ...filters,
                                status:
                                    event.target.value,
                            })
                        }
                        options={[
                            {
                                label:
                                    "All Statuses",
                                value:
                                    "All Statuses",
                            },
                            ...options.statuses.map(
                                (item) => ({
                                    label:
                                        item,
                                    value:
                                        item,
                                }),
                            ),
                        ]}
                    />
                </div>

                <div className="
                    sticky bottom-0
                    border-t
                    border-[#E7EDF2]
                    bg-white
                    px-5 py-4
                    sm:px-6
                ">
                    <div className="
                        flex gap-3
                    ">
                        <Button
                            variant="secondary"
                            fullWidth
                            onClick={onReset}
                        >
                            Reset
                        </Button>

                        <Button
                            fullWidth
                            onClick={onApply}
                        >
                            Apply Filters
                        </Button>
                    </div>
                </div>
            </div>
        </>
    );
}


/* =========================================================
   FINANCIALS
========================================================= */

function PortfolioFinancials({
    originalCost,
    revisedCost,
}: {
    originalCost: number;
    revisedCost: number;
}) {
    const escalation =
        revisedCost - originalCost;

    const escalationPercent =
        originalCost > 0
            ? (escalation / originalCost) *
            100
            : 0;

    const isIncrease =
        escalation >= 0;

    return (
        <div className="
            overflow-hidden
            rounded-[14px]
            border border-[#243447]
            bg-gradient-to-br
            from-[#172033]
            to-[#263548]
            shadow-[0_10px_30px_rgba(15,23,42,0.10)]
        ">
            <div className="
                flex flex-col gap-4
                px-5 py-5
                sm:flex-row
                sm:items-center
                sm:justify-between
                sm:px-6
            ">
                <div>
                    <div className="
                        text-[10px]
                        font-bold uppercase
                        tracking-[0.1em]
                        text-slate-400
                    ">
                        PORTFOLIO FINANCIALS
                    </div>

                    <div className="
                        mt-1 text-[11px]
                        leading-4
                        text-slate-400
                    ">
                        Financial position of the selected portfolio
                    </div>
                </div>

                <div className="
                    inline-flex w-fit
                    items-center
                    rounded-full
                    border
                    border-amber-400/20
                    bg-amber-400/10
                    px-2.5 py-1
                    text-[10px]
                    font-semibold
                    text-amber-300
                ">
                    {isIncrease ? "+" : ""}
                    {escalationPercent.toFixed(1)}%

                    <span className="
                        ml-1
                        font-medium
                        opacity-70
                    ">
                        escalation
                    </span>
                </div>
            </div>

            <div className="
                grid grid-cols-1
                border-t
                border-white/10
                sm:grid-cols-3
            ">
                <FinancialMetric
                    label="Original Cost"
                    value={originalCost}
                    icon={
                        <IndianRupee
                            size={17}
                            strokeWidth={1.8}
                        />
                    }
                />

                <FinancialMetric
                    label="Latest Revised Cost"
                    value={revisedCost}
                    icon={
                        <TrendingUp
                            size={17}
                            strokeWidth={1.8}
                        />
                    }
                />

                <FinancialMetric
                    label="Cost Escalation"
                    value={escalation}
                    highlight={isIncrease}
                    icon={
                        <TrendingUp
                            size={17}
                            strokeWidth={1.8}
                        />
                    }
                />
            </div>
        </div>
    );
}


function FinancialMetric({
    label,
    value,
    highlight = false,
    icon,
}: {
    label: string;
    value: number;
    highlight?: boolean;
    icon: ReactNode;
}) {
    return (
        <div className="
            flex min-w-0
            items-center gap-3
            border-b
            border-white/10
            px-5 py-4
            last:border-b-0
            sm:border-b-0
            sm:border-r
            sm:px-6 sm:py-5
            sm:last:border-r-0
        ">
            <div className="
                grid h-9 w-9
                shrink-0
                place-items-center
                rounded-[10px]
                bg-white/[0.08]
                text-slate-300
            ">
                {icon}
            </div>

            <div className="
                min-w-0
            ">
                <div className="
                    text-[9px]
                    font-semibold
                    uppercase
                    tracking-[0.08em]
                    text-slate-400
                ">
                    {label}
                </div>

                <div
                    className={[
                        "mt-1 truncate",
                        "text-[20px] font-bold",
                        "tracking-[-0.035em]",
                        highlight
                            ? "text-amber-300"
                            : "text-white",
                    ].join(" ")}
                >
                    ₹{formatCrore(value)} Cr
                </div>

                <div className="
                    mt-0.5 text-[9px]
                    font-medium
                    text-slate-500
                ">
                    portfolio value
                </div>
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
    const [
        hoveredIndex,
        setHoveredIndex,
    ] = useState<number | null>(null);

    const items = [
        {
            label: "Critical",
            value: Number(
                data.Critical ?? 0,
            ),
            color: "#EF4444",
        },
        {
            label: "High",
            value: Number(
                data.High ?? 0,
            ),
            color: "#F97316",
        },
        {
            label: "Elevated",
            value: Number(
                data.Elevated ?? 0,
            ),
            color: "#FBBF24",
        },
        {
            label: "Moderate",
            value: Number(
                data.Moderate ?? 0,
            ),
            color: "#3B82F6",
        },
        {
            label: "Low",
            value: Number(
                data.Low ?? 0,
            ),
            color: "#22C55E",
        },
    ];

    const total =
        items.reduce(
            (sum, item) =>
                sum + item.value,
            0,
        );

    const radius = 72;

    const circumference =
        2 * Math.PI * radius;

    let accumulated = 0;

    const segments =
        items.map(
            (item, index) => {
                const percentage =
                    total > 0
                        ? (item.value /
                            total) *
                        100
                        : 0;

                const segmentLength =
                    (percentage / 100) *
                    circumference;

                const offset =
                    accumulated;

                accumulated +=
                    segmentLength;

                return {
                    ...item,
                    index,
                    percentage,
                    segmentLength,
                    offset,
                };
            },
        );

    const hoveredItem =
        hoveredIndex === null
            ? null
            : segments[hoveredIndex];


    return (
        <div className="mt-7">
            <div className="
                flex flex-col
                items-center gap-8
                lg:flex-row
                lg:items-center
            ">
                <div className="
                    relative shrink-0
                    h-[210px] w-[210px]
                ">
                    <svg
                        viewBox="0 0 160 160"
                        className="
                            h-full w-full
                            overflow-visible
                        "
                    >
                        <circle
                            cx="80"
                            cy="80"
                            r={radius}
                            fill="none"
                            stroke="#EEF2F5"
                            strokeWidth="26"
                        />

                        {segments.map(
                            (segment) => (
                                <circle
                                    key={
                                        segment.label
                                    }
                                    cx="80"
                                    cy="80"
                                    r={radius}
                                    fill="none"
                                    stroke={
                                        segment.color
                                    }
                                    strokeWidth={
                                        hoveredIndex ===
                                            segment.index
                                            ? 30
                                            : 26
                                    }
                                    strokeDasharray={`
                                        ${segment.segmentLength}
                                        ${circumference -
                                        segment.segmentLength}
                                    `}
                                    strokeDashoffset={
                                        -segment.offset
                                    }
                                    transform="
                                        rotate(-90 80 80)
                                    "
                                    className="
                                        cursor-pointer
                                        transition-[stroke-width,opacity]
                                        duration-150
                                    "
                                    opacity={
                                        hoveredIndex ===
                                            null ||
                                            hoveredIndex ===
                                            segment.index
                                            ? 1
                                            : 0.4
                                    }
                                    onMouseEnter={() =>
                                        setHoveredIndex(
                                            segment.index,
                                        )
                                    }
                                    onMouseLeave={() =>
                                        setHoveredIndex(
                                            null,
                                        )
                                    }
                                />
                            ),
                        )}
                    </svg>

                    <div className="
                        pointer-events-none
                        absolute inset-[34px]
                        rounded-full
                        bg-white
                        shadow-[inset_0_0_0_1px_#EEF2F5]
                    " />

                    <div className="
                        pointer-events-none
                        absolute inset-0
                        flex flex-col
                        items-center
                        justify-center
                    ">
                        {hoveredItem ? (
                            <>
                                <div className="
                                    text-[22px]
                                    font-bold
                                    leading-none
                                    tracking-[-0.04em]
                                    text-[#172033]
                                ">
                                    {formatNumber(
                                        hoveredItem.value,
                                    )}
                                </div>

                                <div
                                    className="
                                        mt-1
                                        text-[9px]
                                        font-semibold
                                        uppercase
                                        tracking-[0.08em]
                                    "
                                    style={{
                                        color:
                                            hoveredItem.color,
                                    }}
                                >
                                    {
                                        hoveredItem.label
                                    }
                                </div>

                                <div className="
                                    mt-0.5
                                    text-[9px]
                                    font-medium
                                    text-[#94A3B8]
                                ">
                                    {hoveredItem.percentage.toFixed(
                                        1,
                                    )}
                                    %
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="
                                    text-[25px]
                                    font-bold
                                    leading-none
                                    tracking-[-0.04em]
                                    text-[#172033]
                                ">
                                    {formatNumber(
                                        total,
                                    )}
                                </div>

                                <div className="
                                    mt-1
                                    text-[9px]
                                    font-semibold
                                    uppercase
                                    tracking-[0.08em]
                                    text-[#94A3B8]
                                ">
                                    Projects
                                </div>
                            </>
                        )}
                    </div>
                </div>


                <div className="
                    grid w-full
                    grid-cols-1
                    gap-2
                    sm:grid-cols-2
                    lg:grid-cols-1
                    lg:max-w-[240px]
                ">
                    {segments.map(
                        (item) => (
                            <button
                                key={item.label}
                                type="button"
                                className="
                                    flex w-full
                                    items-center
                                    justify-between
                                    gap-4
                                    rounded-[8px]
                                    px-2 py-1.5
                                    text-left
                                    transition-colors
                                    hover:bg-[#F8FAFB]
                                "
                                onMouseEnter={() =>
                                    setHoveredIndex(
                                        item.index,
                                    )
                                }
                                onMouseLeave={() =>
                                    setHoveredIndex(
                                        null,
                                    )
                                }
                                aria-label={`${item.label}: ${item.value} projects, ${item.percentage.toFixed(1)} percent`}
                            >
                                <span className="
                                    flex min-w-0
                                    items-center gap-2.5
                                ">
                                    <span
                                        className="
                                            h-2.5 w-2.5
                                            shrink-0
                                            rounded-full
                                        "
                                        style={{
                                            backgroundColor:
                                                item.color,
                                        }}
                                    />

                                    <span className="
                                        truncate
                                        text-[11px]
                                        font-medium
                                        text-[#64748B]
                                    ">
                                        {item.label}
                                    </span>
                                </span>

                                <span className="
                                    flex shrink-0
                                    items-center gap-3
                                ">
                                    <span className="
                                        text-[10px]
                                        font-semibold
                                        text-[#172033]
                                    ">
                                        {formatNumber(
                                            item.value,
                                        )}
                                    </span>

                                    <span className="
                                        w-[42px]
                                        text-right
                                        text-[10px]
                                        font-medium
                                        text-[#94A3B8]
                                    ">
                                        {item.percentage.toFixed(
                                            1,
                                        )}
                                        %
                                    </span>
                                </span>
                            </button>
                        ),
                    )}
                </div>
            </div>
        </div>
    );
}


/* =========================================================
   SCHEDULE STATUS
========================================================= */

function ScheduleStatus({
    projects,
    viewMode,
}: {
    projects: DashboardProject[];
    viewMode:
    | "projects"
    | "percentage";
}) {
    const [
        hoveredIndex,
        setHoveredIndex,
    ] = useState<number | null>(null);

    const statusOrder = [
        "Delayed",
        "No Revised Date",
        "On Schedule",
        "Accelerated",
    ];

    const statusColors = [
        "#EF4444",
        "#94A3B8",
        "#22C55E",
        "#3B82F6",
    ];

    const counts =
        statusOrder.map(
            (status) =>
                projects.filter(
                    (project) =>
                        project.status ===
                        status,
                ).length,
        );

    const total =
        counts.reduce(
            (sum, value) =>
                sum + value,
            0,
        );

    const values =
        viewMode === "projects"
            ? counts
            : counts.map(
                (value) =>
                    total > 0
                        ? (value / total) *
                        100
                        : 0,
            );

    const maxValue =
        Math.max(
            ...values,
            1,
        );


    return (
        <div className="mt-7">
            <div className="
                rounded-[10px]
                border
                border-[#E7EDF2]
                bg-[#F8FAFB]
                px-4 pt-4
                sm:px-5
            ">
                <div className="
                    grid grid-cols-4
                    gap-3
                ">
                    {statusOrder.map(
                        (status, index) => {
                            const rawCount =
                                counts[index];

                            const value =
                                values[index];

                            const percentage =
                                total > 0
                                    ? (rawCount /
                                        total) *
                                    100
                                    : 0;

                            const height =
                                rawCount > 0
                                    ? Math.max(
                                        (value /
                                            maxValue) *
                                        100,
                                        8,
                                    )
                                    : 0;

                            return (
                                <div
                                    key={status}
                                    className="
                                        relative
                                        flex min-w-0
                                        flex-col
                                    "
                                    onMouseEnter={() =>
                                        setHoveredIndex(
                                            index,
                                        )
                                    }
                                    onMouseLeave={() =>
                                        setHoveredIndex(
                                            null,
                                        )
                                    }
                                >
                                    {hoveredIndex ===
                                        index && (
                                            <div className="
                                            pointer-events-none
                                            absolute
                                            left-1/2
                                            top-0 z-30
                                            -translate-x-1/2
                                            -translate-y-[calc(100%+8px)]
                                            whitespace-nowrap
                                            rounded-[8px]
                                            border
                                            border-[#D9E1E8]
                                            bg-white
                                            px-3 py-2
                                            shadow-[0_8px_24px_rgba(15,23,42,0.12)]
                                        ">
                                                <div className="
                                                text-[10px]
                                                font-semibold
                                                text-[#172033]
                                            ">
                                                    {status}
                                                </div>

                                                <div className="
                                                mt-1
                                                text-[9px]
                                                text-[#64748B]
                                            ">
                                                    {formatNumber(
                                                        rawCount,
                                                    )}{" "}
                                                    projects
                                                </div>

                                                <div className="
                                                mt-0.5
                                                text-[9px]
                                                text-[#94A3B8]
                                            ">
                                                    {percentage.toFixed(
                                                        1,
                                                    )}
                                                    % of portfolio
                                                </div>
                                            </div>
                                        )}

                                    <div className="
                                        mb-2
                                        text-center
                                        text-[10px]
                                        font-bold
                                        text-[#172033]
                                    ">
                                        {viewMode ===
                                            "projects"
                                            ? formatNumber(
                                                rawCount,
                                            )
                                            : `${percentage.toFixed(
                                                1,
                                            )}%`}
                                    </div>

                                    <div className="
                                        flex h-[150px]
                                        items-end
                                        rounded-t-[7px]
                                        bg-[#EEF2F5]
                                    ">
                                        <div
                                            className="
                                                w-full
                                                rounded-t-[7px]
                                                transition-[height,opacity,filter]
                                                duration-200
                                            "
                                            style={{
                                                height:
                                                    `${height}%`,
                                                backgroundColor:
                                                    statusColors[
                                                    index
                                                    ],
                                                opacity:
                                                    hoveredIndex ===
                                                        null ||
                                                        hoveredIndex ===
                                                        index
                                                        ? 1
                                                        : 0.45,
                                            }}
                                        />
                                    </div>

                                    <div className="
                                        mt-2 min-h-[28px]
                                        text-center
                                        text-[8px]
                                        font-medium
                                        leading-3
                                        text-[#64748B]
                                    ">
                                        {status}
                                    </div>
                                </div>
                            );
                        },
                    )}
                </div>
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
    const variantStyles = {
        danger: {
            dot: "bg-red-500",
            bg: "bg-red-50/50",
            border: "border-red-100",
            text: "text-red-700",
        },

        warning: {
            dot: "bg-amber-500",
            bg: "bg-amber-50/50",
            border: "border-amber-100",
            text: "text-amber-700",
        },

        info: {
            dot: "bg-blue-500",
            bg: "bg-blue-50/40",
            border: "border-blue-100",
            text: "text-blue-700",
        },

        success: {
            dot: "bg-emerald-500",
            bg: "bg-emerald-50/40",
            border: "border-emerald-100",
            text: "text-emerald-700",
        },
    };

    const styles =
        variantStyles[variant];

    return (
        <div className={[
            "flex items-center",
            "justify-between",
            "rounded-[10px]",
            "border px-3 py-3",
            styles.bg,
            styles.border,
        ].join(" ")}>
            <div className="
                flex min-w-0
                items-center gap-2.5
            ">
                <span className={[
                    "h-2 w-2 shrink-0 rounded-full",
                    styles.dot,
                ].join(" ")} />

                <span className={[
                    "truncate text-[11px]",
                    "font-semibold",
                    styles.text,
                ].join(" ")}>
                    {label}
                </span>
            </div>

            <span className="
                ml-3 shrink-0
                text-[14px]
                font-bold
                tracking-tight
                text-[#172033]
            ">
                {formatNumber(count)}
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
        project.riskLevel || "Low";

    const riskScore =
        project.riskScore;

    const progress =
        Math.min(
            Math.max(
                Number(
                    project.physicalProgress ??
                    0,
                ),
                0,
            ),
            100,
        );

    const delayMonths =
        Number(
            project.delayMonths ?? 0,
        );

    const costRisk =
        project.costRisk || "—";


    let costVariant:
        | "success"
        | "warning"
        | "danger"
        | "info" = "info";


    if (
        costRisk
            .toLowerCase()
            .includes("overrun") ||
        costRisk === "High"
    ) {
        costVariant = "warning";
    }

    if (
        costRisk
            .toLowerCase()
            .includes("critical")
    ) {
        costVariant = "danger";
    }

    if (
        costRisk === "Low"
    ) {
        costVariant = "success";
    }


    return (
        <tr
            onClick={onClick}
            className="
                group cursor-pointer
                border-b
                border-[#E7EDF2]
                last:border-0
                transition-colors
                hover:bg-[#F8FAFB]
            "
        >
            <td className="
                px-5 py-4 sm:px-6
            ">
                <div className="
                    max-w-[280px]
                    truncate
                    text-[11px]
                    font-semibold
                    text-[#172033]
                    transition-colors
                    group-hover:text-[#102A43]
                ">
                    {project.name ||
                        "Unnamed Project"}
                </div>

                <div className="
                    mt-1 text-[9px]
                    font-medium
                    text-[#94A3B8]
                ">
                    {project.id}
                </div>
            </td>

            <td className="
                px-5 py-4 sm:px-6
                text-[10px]
                font-medium
                text-[#64748B]
            ">
                {project.ministry ||
                    "—"}
            </td>

            <td className="
                px-5 py-4 sm:px-6
                text-[10px]
                font-medium
                text-[#64748B]
            ">
                {project.state ||
                    "—"}
            </td>

            <td className="
                px-5 py-4 sm:px-6
            ">
                <div className="
                    flex items-center gap-2
                ">
                    <span className="
                        text-[11px]
                        font-bold
                        text-[#172033]
                    ">
                        {riskScore === null ||
                            riskScore === undefined
                            ? "—"
                            : Number(
                                riskScore,
                            ).toFixed(1)}
                    </span>

                    <Badge
                        variant={
                            getRiskBadgeVariant(
                                riskLevel,
                            )
                        }
                        dot
                    >
                        {riskLevel}
                    </Badge>
                </div>
            </td>

            <td className="
                px-5 py-4 sm:px-6
            ">
                <Badge
                    variant={
                        costVariant
                    }
                >
                    {costRisk}
                </Badge>
            </td>

            <td className="
                px-5 py-4 sm:px-6
                text-[10px]
                font-semibold
                text-red-500
            ">
                {delayMonths > 0
                    ? `+${delayMonths.toFixed(
                        1,
                    )} mo`
                    : "—"}
            </td>

            <td className="
                px-5 py-4 sm:px-6
            ">
                <div className="
                    flex items-center gap-3
                ">
                    <div className="
                        h-1.5 w-20
                        overflow-hidden
                        rounded-full
                        bg-[#EEF2F5]
                    ">
                        <div
                            className="
                                h-full
                                rounded-full
                                bg-[#334155]
                                transition-[width]
                                duration-300
                            "
                            style={{
                                width:
                                    `${progress}%`,
                            }}
                        />
                    </div>

                    <span className="
                        min-w-[38px]
                        text-[10px]
                        font-semibold
                        text-[#64748B]
                    ">
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
   CHART MENU
========================================================= */

function ChartMenu({
    actions,
}: {
    actions: {
        label: string;
        onClick: () => void;
    }[];
}) {
    const [open, setOpen] =
        useState(false);

    return (
        <div className="relative">
            <button
                type="button"
                aria-label="Chart options"
                aria-expanded={open}
                onClick={() =>
                    setOpen(
                        (current) =>
                            !current,
                    )
                }
                className="
                    grid h-8 w-8
                    place-items-center
                    rounded-[8px]
                    bg-[#F3F6F8]
                    text-[#94A3B8]
                    transition-colors
                    hover:bg-[#E7EDF2]
                    hover:text-[#475569]
                "
            >
                <span className="
                    text-[15px]
                    leading-none
                    tracking-[0.08em]
                ">
                    ···
                </span>
            </button>

            {open && (
                <div className="
                    absolute right-0
                    top-10 z-50
                    min-w-[180px]
                    overflow-hidden
                    rounded-[9px]
                    border
                    border-[#D9E1E8]
                    bg-white
                    py-1
                    shadow-[0_10px_30px_rgba(15,23,42,0.12)]
                ">
                    {actions.map(
                        (action) => (
                            <button
                                key={
                                    action.label
                                }
                                type="button"
                                onClick={() => {
                                    setOpen(
                                        false,
                                    );
                                    action.onClick();
                                }}
                                className="
                                    block w-full
                                    px-3 py-2
                                    text-left
                                    text-[10px]
                                    font-medium
                                    text-[#475569]
                                    transition-colors
                                    hover:bg-[#F8FAFB]
                                    hover:text-[#172033]
                                "
                            >
                                {action.label}
                            </button>
                        ),
                    )}
                </div>
            )}
        </div>
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
        <th className="
            whitespace-nowrap
            border-b
            border-[#E7EDF2]
            px-5 py-3
            text-left
            text-[9px]
            font-bold
            uppercase
            tracking-[0.08em]
            text-[#94A3B8]
            sm:px-6
        ">
            {children}
        </th>
    );
}