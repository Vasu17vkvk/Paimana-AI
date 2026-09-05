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

import { useEffect, useMemo, useState } from "react";
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
    reportingPeriods,
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
    getRiskLevel,
} from "../../utils/riskUtils";

import { apiRequest } from "../../services/api";


type MLProjectRisk = {
    project_code: string;
    overall_risk_score: number;
    risk_level: string;
    predicted_cost_overrun_pct: number;
    future_delay_probability: number;
    future_progress_stall_probability: number;
    cost_risk_score: number;
    early_warning_active: boolean;
    early_warning_priority: string;
};


function mapMLRiskToUI(
    prediction?: MLProjectRisk,
) {
    if (!prediction) {
        return {
            riskScore: 0,
            costRisk: "Low" as const,
            delayRisk: "Low" as const,
        };
    }

    const riskScore = Number(
        prediction.overall_risk_score ?? 0,
    );

    const costScore = Number(
        prediction.cost_risk_score ?? 0,
    );

    const delayProbability =
        Number(
            prediction.future_delay_probability ?? 0,
        ) * 100;

    return {
        riskScore,

        costRisk:
            getRiskLevel(costScore),

        delayRisk:
            getRiskLevel(delayProbability),
    };
}


export default function DashboardPage() {
    const navigate = useNavigate();

    const [projects, setProjects] =
        useState<DashboardProject[]>([]);

    const [loading, setLoading] =
        useState(true);

    const [error, setError] =
        useState<string | null>(null);

    const [filters, setFilters] =
        useState<DashboardFilters>(
            defaultDashboardFilters,
        );

    const [filterDrawerOpen, setFilterDrawerOpen] =
        useState(false);

    const [search, setSearch] =
        useState("");

    const [appliedFilters, setAppliedFilters] =
        useState<DashboardFilters>(
            defaultDashboardFilters,
        );

    const [periodProjectCodes, setPeriodProjectCodes] =
        useState<Set<string> | null>(null);


    /*
     * Load PostgreSQL projects + ML predictions
     * in parallel.
     */
    useEffect(() => {
        async function loadDashboard() {
            try {
                setLoading(true);
                setError(null);

                const [
                    projectResponse,
                    mlResponse,
                ] = await Promise.all([
                    apiRequest<any>("/projects"),
                    apiRequest<any>("/ml/risk"),
                ]);


                const rawProjects =
                    Array.isArray(projectResponse)
                        ? projectResponse
                        : projectResponse.projects ??
                          projectResponse.data ??
                          [];


                const predictions: MLProjectRisk[] =
                    Array.isArray(
                        mlResponse,
                    )
                        ? mlResponse
                        : mlResponse.predictions ??
                          [];


                /*
                 * Fast lookup:
                 * project_code -> ML prediction
                 */
                const mlMap =
                    new Map<
                        string,
                        MLProjectRisk
                    >();

                predictions.forEach(
                    (prediction) => {
                        mlMap.set(
                            String(
                                prediction.project_code,
                            ),
                            prediction,
                        );
                    },
                );


                const mappedProjects =
                    rawProjects.map(
                        (project: any) => {
                            const projectCode =
                                String(
                                    project.project_code ??
                                    project.id ??
                                    "",
                                );


                            const prediction =
                                mlMap.get(
                                    projectCode,
                                );


                            const mlRisk =
                                mapMLRiskToUI(
                                    prediction,
                                );


                            /*
                             * Convert backend schedule
                             * status into dashboard status.
                             */
                            let status:
                                | "Ongoing"
                                | "Delayed"
                                | "Completed" =
                                "Ongoing";

                            if (
                                project.schedule_status ===
                                "Delayed"
                            ) {
                                status =
                                    "Delayed";
                            } else if (
                                project.schedule_status ===
                                "Completed"
                            ) {
                                status =
                                    "Completed";
                            }


                            return {
                                id: `PM-${projectCode}`,

                                name:
                                    project.project_name ??
                                    "Unnamed Project",

                                ministry:
                                    project.ministry ??
                                    "Unknown Ministry",

                                sector:
                                    project.sector ??
                                    "Unknown Sector",

                                state:
                                    project.flash_state ??
                                    project.state ??
                                    "Unknown State",

                                originalCost:
                                    Number(
                                        project.original_cost_cr ??
                                        project.original_cost ??
                                        0,
                                    ),

                                revisedCost:
                                    Number(
                                        project.revised_cost_cr ??
                                        project.revised_cost ??
                                        0,
                                    ),

                                riskScore:
                                    mlRisk.riskScore,

                                costRisk:
                                    mlRisk.costRisk,

                                delayRisk:
                                    mlRisk.delayRisk,

                                delayMonths:
                                    Math.max(
                                        0,
                                        Number(
                                            project.delay_days ??
                                            0,
                                        ) / 30,
                                    ),

                                physicalProgress:
                                    Number(
                                        project.flash_latest_physical_progress ??
                                        project.physical_progress_pct ??
                                        0,
                                    ),

                                status,

                            } satisfies DashboardProject;
                        },
                    );


                setProjects(
                    mappedProjects,
                );

            } catch (err) {
                console.error(
                    "Dashboard loading failed:",
                    err,
                );

                setError(
                    "Failed to load dashboard data.",
                );
            } finally {
                setLoading(false);
            }
        }

        loadDashboard();
    }, []);


    /*
     * Load project codes for the selected reporting period.
     */
    useEffect(() => {
        let cancelled = false;

        async function loadPeriodProjects() {
            const period = appliedFilters.period?.trim();

            if (!period) {
                setPeriodProjectCodes(null);
                return;
            }

            try {
                const response = await apiRequest<{
                    period: string;
                    project_codes?: string[];
                    count?: number;
                }>(
                    `/analytics/dashboard-period?period=${encodeURIComponent(period)}`,
                );

                if (cancelled) return;

                const codes = Array.isArray(response.project_codes)
                    ? response.project_codes.map((code) =>
                          String(code).trim(),
                      )
                    : [];

                setPeriodProjectCodes(new Set(codes));
            } catch (err) {
                console.error(
                    "Reporting period loading failed:",
                    err,
                );

                if (!cancelled) {
                    setPeriodProjectCodes(new Set());
                }
            }
        }

        loadPeriodProjects();

        return () => {
            cancelled = true;
        };
    }, [appliedFilters.period]);


    /*
     * Apply dashboard filters.
     */
    const filteredProjects =
        useMemo(() => {
            return projects.filter(
                (project) => {
                    const normalizedSearch =
                        search
                            .trim()
                            .toLowerCase();


                    const matchesSearch =
                        !normalizedSearch ||
                        project.name
                            .toLowerCase()
                            .includes(
                                normalizedSearch,
                            ) ||
                        project.id
                            .toLowerCase()
                            .includes(
                                normalizedSearch,
                            ) ||
                        project.ministry
                            .toLowerCase()
                            .includes(
                                normalizedSearch,
                            ) ||
                        project.sector
                            .toLowerCase()
                            .includes(
                                normalizedSearch,
                            );

                    const projectCode = project.id.replace(
                        /^PM-/i,
                        "",
                    );

                    const matchesPeriod =
                        periodProjectCodes === null ||
                        periodProjectCodes.has(projectCode);


                    const matchesMinistry =
                        appliedFilters.ministry ===
                            "All Ministries" ||
                        project.ministry ===
                            appliedFilters.ministry;


                    const matchesSector =
                        appliedFilters.sector ===
                            "All Sectors" ||
                        project.sector ===
                            appliedFilters.sector;


                    const matchesState =
                        appliedFilters.state ===
                            "All States" ||
                        project.state ===
                            appliedFilters.state;


                    const matchesRisk =
                        appliedFilters.risk ===
                            "All Risk Levels" ||
                        getRiskLevel(
                            project.riskScore,
                        ) ===
                            appliedFilters.risk;


                    const matchesStatus =
                        appliedFilters.status ===
                            "All Statuses" ||
                        project.status ===
                            appliedFilters.status;


                    return (
                        matchesPeriod &&
                        matchesSearch &&
                        matchesMinistry &&
                        matchesSector &&
                        matchesState &&
                        matchesRisk &&
                        matchesStatus
                    );
                },
            );
        }, [
            projects,
            search,
            appliedFilters,
            periodProjectCodes,
        ]);


    /*
     * Dashboard metrics.
     */
    const metrics = useMemo(() => {
        const totalProjects =
            filteredProjects.length;

        const highRiskProjects =
            filteredProjects.filter(
                (project) =>
                    project.riskScore >= 70,
            ).length;

        const costRiskProjects =
            filteredProjects.filter(
                (project) =>
                    project.costRisk !==
                    "Low",
            ).length;

        const delayedProjects =
            filteredProjects.filter(
                (project) =>
                    project.status ===
                    "Delayed",
            ).length;

        return {
            totalProjects,
            highRiskProjects,
            costRiskProjects,
            delayedProjects,
        };
    }, [filteredProjects]);


    /*
     * ML risk distribution.
     *
     * Existing UI has 5 levels,
     * so numerical ML score is used
     * through getRiskLevel().
     */
    const riskDistribution =
        useMemo(() => {
            return {
                Critical:
                    filteredProjects.filter(
                        (project) =>
                            getRiskLevel(
                                project.riskScore,
                            ) === "Critical",
                    ).length,

                High:
                    filteredProjects.filter(
                        (project) =>
                            getRiskLevel(
                                project.riskScore,
                            ) === "High",
                    ).length,

                Elevated:
                    filteredProjects.filter(
                        (project) =>
                            getRiskLevel(
                                project.riskScore,
                            ) === "Elevated",
                    ).length,

                Moderate:
                    filteredProjects.filter(
                        (project) =>
                            getRiskLevel(
                                project.riskScore,
                            ) === "Moderate",
                    ).length,

                Low:
                    filteredProjects.filter(
                        (project) =>
                            getRiskLevel(
                                project.riskScore,
                            ) === "Low",
                    ).length,
            };
        }, [filteredProjects]);


    /*
     * Highest risk projects.
     */
    const highestRiskProjects =
        useMemo(() => {
            return [...filteredProjects]
                .sort(
                    (a, b) =>
                        b.riskScore -
                        a.riskScore,
                )
                .slice(0, 8);
        }, [filteredProjects]);


    const applyFilters = () => {
        setAppliedFilters(
            filters,
        );

        setFilterDrawerOpen(
            false,
        );
    };


    const resetFilters = () => {
        setFilters(
            defaultDashboardFilters,
        );

        setAppliedFilters(
            defaultDashboardFilters,
        );

        setPeriodProjectCodes(null);

        setSearch("");
    };


    /*
     * Loading state.
     */
    if (loading) {
        return (
            <div className="mx-auto w-full max-w-[1500px]">
                <PageHeader
                    eyebrow="NATIONAL PROJECT MONITORING"
                    title="Dashboard"
                    description="Monitor infrastructure projects, emerging risks, cost pressure and schedule performance."
                />

                <Card padding="lg">
                    <div className="flex min-h-[250px] items-center justify-center">
                        <div className="text-sm font-medium text-slate-500">
                            Loading dashboard data...
                        </div>
                    </div>
                </Card>
            </div>
        );
    }


    /*
     * Error state.
     */
    if (error) {
        return (
            <div className="mx-auto w-full max-w-[1500px]">
                <PageHeader
                    eyebrow="NATIONAL PROJECT MONITORING"
                    title="Dashboard"
                    description="Monitor infrastructure projects, emerging risks, cost pressure and schedule performance."
                />

                <Card padding="lg">
                    <div className="flex min-h-[250px] flex-col items-center justify-center">
                        <div className="text-sm font-semibold text-red-600">
                            {error}
                        </div>

                        <div className="mt-2 text-xs text-slate-400">
                            Make sure the Flask backend is running on port 5000.
                        </div>
                    </div>
                </Card>
            </div>
        );
    }


    return (
        <div className="mx-auto w-full max-w-[1500px]">

            <PageHeader
                eyebrow="NATIONAL PROJECT MONITORING"
                title="Dashboard"
                description="Monitor infrastructure projects, emerging risks, cost pressure and schedule performance."
                action={
                    <div className="hidden items-center gap-2 sm:flex">

                        <Select
                            aria-label="Reporting period"
                            value={filters.period}
                            onChange={(event) => {
                                const period = event.target.value;

                                setFilters({
                                    ...filters,
                                    period,
                                });

                                setAppliedFilters({
                                    ...appliedFilters,
                                    period,
                                });
                            }}
                            options={reportingPeriods.map(
                                (period) => ({
                                    label: period,
                                    value: period,
                                }),
                            )}
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


            {/* Mobile Controls */}
            <div className="mb-5 flex gap-2 sm:hidden">

                <Select
                    aria-label="Reporting period"
                    value={filters.period}
                    onChange={(event) => {
                        const period = event.target.value;

                        setFilters({
                            ...filters,
                            period,
                        });

                        setAppliedFilters({
                            ...appliedFilters,
                            period,
                        });
                    }}
                    options={reportingPeriods.map(
                        (period) => ({
                            label: period,
                            value: period,
                        }),
                    )}
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


            {/* Search */}
            <div className="mb-4 max-w-md">
                <div className="relative">

                    <Search
                        size={15}
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
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


            {/* Active filters */}
            <div className="mb-5">
                <FilterChips
                    filters={appliedFilters}
                    onChange={setAppliedFilters}
                />
            </div>


            {/* KPI */}
            <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">

                <MetricCard
                    label="Total Projects"
                    value={formatNumber(
                        metrics.totalProjects,
                    )}
                    description="Projects in selected portfolio"
                    icon={
                        <ShieldAlert size={18} />
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
                        <AlertTriangle size={18} />
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
                        <IndianRupee size={18} />
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
                        <Clock3 size={18} />
                    }
                    onClick={() =>
                        navigate(
                            "/delay-prediction",
                        )
                    }
                />

            </section>


            {/* Portfolio */}
            <section className="mt-5">
                <PortfolioFinancials
                    originalCost={filteredProjects.reduce(
                        (total, project) =>
                            total +
                            project.originalCost,
                        0,
                    )}
                    revisedCost={filteredProjects.reduce(
                        (total, project) =>
                            total +
                            project.revisedCost,
                        0,
                    )}
                />
            </section>


            {/* Risk + Warning */}
            <section className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-[1.6fr_1fr]">

                <Card padding="lg">

                    <div className="flex items-start justify-between gap-4">

                        <div>
                            <h2 className="text-sm font-bold text-slate-900">
                                Risk Overview
                            </h2>

                            <p className="mt-1 text-[11px] text-slate-400">
                                Distribution of the currently filtered portfolio.
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


            {/* Projects */}
            <section className="mt-5">

                <Card padding="none">

                    <div className="flex flex-col gap-3 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-5">

                        <div>
                            <h2 className="text-sm font-bold text-slate-900">
                                Highest Risk Projects
                            </h2>

                            <p className="mt-1 text-[11px] text-slate-400">
                                {highestRiskProjects.length} projects shown
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
                                        (project) => (
                                            <ProjectRow
                                                key={project.id}
                                                project={
                                                    project
                                                }
                                                onClick={() =>
                                                    navigate(
                                                        `/project-analytics?project=${project.id}`,
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


            {/* Portfolio insight */}
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


            <FilterDrawer
                open={
                    filterDrawerOpen
                }
                filters={filters}
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
                onReset={resetFilters}
            />

        </div>
    );
}


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
            ? (escalation / originalCost) * 100
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
                        escalationPercent > 10
                            ? "warning"
                            : "info"
                    }
                >
                    {escalationPercent >= 0
                        ? "+"
                        : ""}
                    {escalationPercent.toFixed(1)}%
                </Badge>
            </div>

            <div className="grid grid-cols-1 divide-y divide-slate-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                <FinancialMetric
                    label="Original Cost"
                    value={originalCost}
                />

                <FinancialMetric
                    label="Latest Revised Cost"
                    value={revisedCost}
                />

                <FinancialMetric
                    label="Cost Escalation"
                    value={escalation}
                    highlight
                />
            </div>
        </Card>
    );
}


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
                ₹{formatCrore(value)}
            </div>

            <div className="mt-0.5 text-[9px] text-slate-400">
                crore
            </div>
        </div>
    );
}


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
            variant: "danger" as const,
        },
        {
            label: "High",
            value: data.High,
            color: "bg-orange-500",
            variant: "warning" as const,
        },
        {
            label: "Elevated",
            value: data.Elevated,
            color: "bg-yellow-400",
            variant: "warning" as const,
        },
        {
            label: "Moderate",
            value: data.Moderate,
            color: "bg-slate-400",
            variant: "info" as const,
        },
        {
            label: "Low",
            value: data.Low,
            color: "bg-emerald-500",
            variant: "success" as const,
        },
    ];

    return (
        <div className="mt-8">

            <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">

                {items.map(
                    (item) => (
                        <div
                            key={item.label}
                            className={item.color}
                            style={{
                                width:
                                    total > 0
                                        ? `${(item.value /
                                            total) *
                                        100}%`
                                        : "0%",
                            }}
                        />
                    ),
                )}

            </div>


            <div className="mt-7 grid grid-cols-2 gap-4 sm:grid-cols-5">

                {items.map(
                    (item) => (
                        <div
                            key={item.label}
                        >

                            <Badge
                                variant={
                                    item.variant
                                }
                                dot
                            >
                                {item.label}
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
                variant={variant}
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


function ProjectRow({
    project,
    onClick,
}: {
    project: DashboardProject;
    onClick: () => void;
}) {
    const riskLevel =
        getRiskLevel(
            project.riskScore,
        );

    return (
        <tr
            onClick={onClick}
            className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50/70"
        >

            <td className="px-5 py-4">
                <div className="max-w-[280px] truncate text-xs font-semibold text-slate-800">
                    {project.name}
                </div>

                <div className="mt-1 text-[10px] text-slate-400">
                    {project.id}
                </div>
            </td>

            <td className="px-5 py-4 text-xs text-slate-500">
                {project.ministry}
            </td>

            <td className="px-5 py-4 text-xs text-slate-500">
                {project.state}
            </td>

            <td className="px-5 py-4">

                <div className="flex items-center gap-2">

                    <span className="text-xs font-bold text-slate-900">
                        {project.riskScore.toFixed(1)}
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
                    {project.costRisk}
                </Badge>

            </td>

            <td className="px-5 py-4 text-xs font-semibold text-red-500">
                +{project.delayMonths.toFixed(1)} mo
            </td>

            <td className="px-5 py-4">

                <div className="flex items-center gap-3">

                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">

                        <div
                            className="h-full rounded-full bg-slate-700"
                            style={{
                                width: `${Math.min(
                                    100,
                                    Math.max(
                                        0,
                                        project.physicalProgress,
                                    ),
                                )}%`,
                            }}
                        />

                    </div>

                    <span className="text-xs font-semibold text-slate-600">
                        {project.physicalProgress.toFixed(1)}%
                    </span>

                </div>

            </td>

        </tr>
    );
}


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