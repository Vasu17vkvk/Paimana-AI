import { useCallback, useEffect, useMemo, useState } from "react";
import {
    AlertTriangle,
    CheckCircle2,
    ChevronDown,
    Filter,
    RotateCcw,
    Search,
    ShieldAlert,
    SlidersHorizontal,
    TrendingDown,
    TrendingUp,
} from "lucide-react";

import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import PageHeader from "../../components/layout/PageHeader";
import { apiRequest } from "../../services/api";
import { formatCrore } from "../../utils/formatNumber";

/* ============================================================
   TYPES
============================================================ */

type Filters = {
    sector: string[];
    ministry: string[];
    state: string[];
    risk: string[];
    status: string[];
};

type FilterOptions = {
    sectors: string[];
    ministries: string[];
    states: string[];
    risk_levels: string[];
    schedule_statuses: string[];
};

type Project = {
    project_code: string;
    project_name: string;
    risk_level: string | null;
    overall_risk_score: number | null;
    sector: string | null;
    ministry: string | null;
    state: string | null;
    schedule_status: string | null;
};

type Detail = {
    project: Record<string, any>;

    risk: {
        overall: number | null;
        level: string | null;
        cost: number | null;
        delay: number | null;
        stall: number | null;
        predicted_cost_overrun_pct: number | null;
        alert_priority: string | null;
        early_warning_active?: boolean | null;
    };

    reasons: {
        title: string;
        explanation: string;
        solution: string;
    }[];

    history: {
        schedule: {
            date: string | null;
            delay_days: number | null;
            schedule_change_days: number | null;
            expenditure_cr: number | null;
            revised_cost_cr: number | null;
        }[];

        progress: {
            date: string | null;
            physical_progress_pct: number | null;
        }[];
    };
};

type Simulation = {
    baseline: {
        overall_risk: number;
        risk_level?: string;
        delay_probability: number;
        stall_probability: number;
        predicted_cost_overrun: number;
        cost_risk: number;
    };

    scenario: {
        overall_risk: number;
        risk_level: string;
        delay_probability: number;
        stall_probability: number;
        predicted_cost_overrun: number;
        cost_risk: number;
    };
};

type Scenario = {
    progress_delta: number;
    delay_delta: number;
    expenditure_delta: number;
    revised_cost_delta: number;
};

const EMPTY_FILTERS: Filters = {
    sector: [],
    ministry: [],
    state: [],
    risk: [],
    status: [],
};

const EMPTY_OPTIONS: FilterOptions = {
    sectors: [],
    ministries: [],
    states: [],
    risk_levels: [],
    schedule_statuses: [],
};


/* ============================================================
   HELPERS
============================================================ */

function riskVariant(level: string | null) {
    const value = String(level ?? "").toLowerCase();

    if (value === "critical") {
        return "danger" as const;
    }

    if (value === "high" || value === "medium") {
        return "warning" as const;
    }

    return "success" as const;
}

function riskBarClass(value: number | null) {
    const number = Number(value ?? 0);

    if (number >= 85) {
        return "bg-red-500";
    }

    if (number >= 70) {
        return "bg-orange-500";
    }

    if (number >= 40) {
        return "bg-amber-500";
    }

    return "bg-emerald-500";
}

function formatValue(
    value: any,
    suffix = "",
) {
    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return "N/A";
    }

    return `${value}${suffix}`;
}


/* ============================================================
   MULTI SELECT
============================================================ */

function MultiSelect({
    label,
    options,
    value,
    onChange,
}: {
    label: string;
    options: string[];
    value: string[];
    onChange: (value: string[]) => void;
}) {
    const [open, setOpen] = useState(false);

    function toggleOption(option: string) {
        if (value.includes(option)) {
            onChange(
                value.filter(
                    (item) => item !== option,
                ),
            );
        } else {
            onChange([
                ...value,
                option,
            ]);
        }
    }

    return (
        <div className="relative">
            <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {label}
            </div>

            <button
                type="button"
                onClick={() => setOpen((current) => !current)}
                className="flex min-h-10 w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 text-left text-xs text-slate-700 shadow-sm transition hover:border-slate-300"
            >
                <span className="truncate">
                    {value.length
                        ? value.join(", ")
                        : "All"}
                </span>

                <ChevronDown
                    size={15}
                    className={
                        open
                            ? "rotate-180 transition"
                            : "transition"
                    }
                />
            </button>

            {open && (
                <>
                    <button
                        type="button"
                        className="fixed inset-0 z-20 cursor-default"
                        aria-label="Close filter"
                        onClick={() => setOpen(false)}
                    />

                    <div className="absolute top-12 z-30 max-h-72 w-full min-w-[220px] overflow-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                        {options.length === 0 ? (
                            <div className="px-2 py-4 text-center text-xs text-slate-400">
                                No options available
                            </div>
                        ) : (
                            options.map((option) => (
                                <label
                                    key={option}
                                    className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-2 text-xs hover:bg-slate-50"
                                >
                                    <input
                                        type="checkbox"
                                        checked={value.includes(option)}
                                        onChange={() =>
                                            toggleOption(option)
                                        }
                                        className="mt-0.5"
                                    />

                                    <span className="break-words">
                                        {option}
                                    </span>
                                </label>
                            ))
                        )}
                    </div>
                </>
            )}
        </div>
    );
}


/* ============================================================
   LINE CHART
============================================================ */

function LineChart({
    title,
    points,
    valueKey,
    suffix = "",
    prefix = "",
}: {
    title: string;
    points: any[];
    valueKey: string;
    suffix?: string;
    prefix?: string;
}) {
    const validPoints = points.filter(
        (point) =>
            typeof point[valueKey] === "number" &&
            Number.isFinite(
                Number(point[valueKey]),
            ),
    );

    if (!validPoints.length) {
        return (
            <Card>
                <h3 className="text-sm font-bold text-slate-900">
                    {title}
                </h3>

                <p className="mt-8 text-center text-xs text-slate-400">
                    No history available.
                </p>
            </Card>
        );
    }

    const values = validPoints.map(
        (point) =>
            Number(point[valueKey]),
    );

    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;

    const width = 720;
    const height = 240;
    const padding = 32;

    const getX = (index: number) =>
        padding +
        (index *
            (width - padding * 2)) /
            Math.max(
                validPoints.length - 1,
                1,
            );

    const getY = (value: number) =>
        height -
        padding -
        ((value - min) / span) *
            (height - padding * 2);

    const coordinates = validPoints
        .map(
            (point, index) =>
                `${getX(index)},${getY(
                    Number(point[valueKey]),
                )}`,
        )
        .join(" ");

    const latest =
        values[values.length - 1];

    return (
        <Card>
            <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-slate-900">
                    {title}
                </h3>

                <span className="text-[10px] font-semibold text-slate-400">
                    Latest {prefix}
                    {latest.toFixed(1)}
                    {suffix}
                </span>
            </div>

            <svg
                viewBox={`0 0 ${width} ${height}`}
                className="mt-4 h-56 w-full"
                preserveAspectRatio="none"
            >
                <line
                    x1={padding}
                    x2={width - padding}
                    y1={height - padding}
                    y2={height - padding}
                    stroke="#e2e8f0"
                />

                <line
                    x1={padding}
                    x2={padding}
                    y1={padding}
                    y2={height - padding}
                    stroke="#e2e8f0"
                />

                <polyline
                    points={coordinates}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    className="text-slate-700"
                />

                {validPoints.map(
                    (point, index) => (
                        <circle
                            key={`${point.date}-${index}`}
                            cx={getX(index)}
                            cy={getY(
                                Number(
                                    point[
                                        valueKey
                                    ],
                                ),
                            )}
                            r="3.5"
                            className="fill-slate-700"
                        />
                    ),
                )}
            </svg>

            <div className="flex justify-between text-[10px] text-slate-400">
                <span>
                    {String(
                        validPoints[0]?.date ??
                            "",
                    ).slice(0, 10)}
                </span>

                <span>
                    {String(
                        validPoints[
                            validPoints.length - 1
                        ]?.date ?? "",
                    ).slice(0, 10)}
                </span>
            </div>
        </Card>
    );
}


/* ============================================================
   COST + EXPENDITURE CHART
============================================================ */

function CostTrajectoryChart({
    points,
}: {
    points: Detail["history"]["schedule"];
}) {
    const valid = points.filter(
        (point) =>
            typeof point.expenditure_cr ===
                "number" ||
            typeof point.revised_cost_cr ===
                "number",
    );

    if (!valid.length) {
        return (
            <Card>
                <h3 className="text-sm font-bold text-slate-900">
                    Cost & Expenditure Trajectory
                </h3>

                <p className="mt-8 text-center text-xs text-slate-400">
                    No history available.
                </p>
            </Card>
        );
    }

    const allValues = valid.flatMap(
        (point) =>
            [
                point.expenditure_cr,
                point.revised_cost_cr,
            ].filter(
                (value) =>
                    typeof value === "number",
            ) as number[],
    );

    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const span = max - min || 1;

    const width = 720;
    const height = 240;
    const padding = 32;

    const getX = (index: number) =>
        padding +
        (index *
            (width - padding * 2)) /
            Math.max(valid.length - 1, 1);

    const getY = (value: number) =>
        height -
        padding -
        ((value - min) / span) *
            (height - padding * 2);

    const expenditurePoints = valid
        .map((point, index) => {
            if (
                typeof point.expenditure_cr !==
                "number"
            ) {
                return null;
            }

            return `${getX(index)},${getY(
                point.expenditure_cr,
            )}`;
        })
        .filter(Boolean)
        .join(" ");

    const revisedCostPoints = valid
        .map((point, index) => {
            if (
                typeof point.revised_cost_cr !==
                "number"
            ) {
                return null;
            }

            return `${getX(index)},${getY(
                point.revised_cost_cr,
            )}`;
        })
        .filter(Boolean)
        .join(" ");

    return (
        <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-slate-900">
                    Cost & Expenditure Trajectory
                </h3>

                <div className="flex gap-4 text-[10px] text-slate-400">
                    <span>● Expenditure</span>
                    <span>● Revised Cost</span>
                </div>
            </div>

            <svg
                viewBox={`0 0 ${width} ${height}`}
                className="mt-4 h-56 w-full"
                preserveAspectRatio="none"
            >
                <line
                    x1={padding}
                    x2={width - padding}
                    y1={height - padding}
                    y2={height - padding}
                    stroke="#e2e8f0"
                />

                <line
                    x1={padding}
                    x2={padding}
                    y1={padding}
                    y2={height - padding}
                    stroke="#e2e8f0"
                />

                {expenditurePoints && (
                    <polyline
                        points={expenditurePoints}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        className="text-slate-700"
                    />
                )}

                {revisedCostPoints && (
                    <polyline
                        points={revisedCostPoints}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeDasharray="7 5"
                        className="text-slate-400"
                    />
                )}
            </svg>

            <div className="flex justify-between text-[10px] text-slate-400">
                <span>
                    {String(
                        valid[0]?.date ?? "",
                    ).slice(0, 10)}
                </span>

                <span>
                    {String(
                        valid[
                            valid.length - 1
                        ]?.date ?? "",
                    ).slice(0, 10)}
                </span>
            </div>
        </Card>
    );
}


/* ============================================================
   MAIN PAGE
============================================================ */

export default function ProjectAnalyticsPage() {
    const [options, setOptions] =
        useState<FilterOptions>(
            EMPTY_OPTIONS,
        );

    const [filters, setFilters] =
        useState<Filters>(
            EMPTY_FILTERS,
        );

    const [projects, setProjects] =
        useState<Project[]>([]);

    const [selected, setSelected] =
        useState("");

    const [detail, setDetail] =
        useState<Detail | null>(null);

    const [search, setSearch] =
        useState("");

    const [loading, setLoading] =
        useState(false);

    const [detailLoading, setDetailLoading] =
        useState(false);

    const [error, setError] =
        useState("");

    const [simulation, setSimulation] =
        useState<Simulation | null>(
            null,
        );

    const [simLoading, setSimLoading] =
        useState(false);

    const [scenario, setScenario] =
        useState<Scenario>({
            progress_delta: 0,
            delay_delta: 0,
            expenditure_delta: 0,
            revised_cost_delta: 0,
        });


    /* ========================================================
       LOAD FILTER OPTIONS
    ======================================================== */

    useEffect(() => {
        let mounted = true;

        async function loadOptions() {
            try {
                const data =
                    await apiRequest<FilterOptions>(
                        "/analytics/project-filters",
                    );

                if (mounted) {
                    setOptions(
                        data ?? EMPTY_OPTIONS,
                    );
                }
            } catch (err) {
                if (mounted) {
                    setError(
                        err instanceof Error
                            ? err.message
                            : "Unable to load filter options.",
                    );
                }
            }
        }

        loadOptions();

        return () => {
            mounted = false;
        };
    }, []);


    /* ========================================================
       BUILD QUERY
    ======================================================== */

    const buildQuery = useCallback(
        (currentFilters: Filters) => {
            const query =
                new URLSearchParams();

            currentFilters.sector.forEach(
                (value) =>
                    query.append(
                        "sector",
                        value,
                    ),
            );

            currentFilters.ministry.forEach(
                (value) =>
                    query.append(
                        "ministry",
                        value,
                    ),
            );

            currentFilters.state.forEach(
                (value) =>
                    query.append(
                        "state",
                        value,
                    ),
            );

            currentFilters.risk.forEach(
                (value) =>
                    query.append(
                        "risk",
                        value,
                    ),
            );

            currentFilters.status.forEach(
                (value) =>
                    query.append(
                        "status",
                        value,
                    ),
            );

            return query.toString();
        },
        [],
    );


    /* ========================================================
       LOAD PROJECT LIST
    ======================================================== */

    const loadProjects = useCallback(
        async (
            currentFilters: Filters,
        ) => {
            try {
                setLoading(true);
                setError("");

                const query =
                    buildQuery(
                        currentFilters,
                    );

                const endpoint =
                    query
                        ? `/analytics/projects?${query}`
                        : "/analytics/projects";

                const data =
                    await apiRequest<{
                        count: number;
                        projects: Project[];
                    }>(endpoint);

                setProjects(
                    data.projects ?? [],
                );

                setSelected(
                    (currentSelected) => {
                        if (
                            currentSelected &&
                            data.projects?.some(
                                (project) =>
                                    project.project_code ===
                                    currentSelected,
                            )
                        ) {
                            return currentSelected;
                        }

                        return "";
                    },
                );
            } catch (err) {
                setError(
                    err instanceof Error
                        ? err.message
                        : "Unable to load projects.",
                );
            } finally {
                setLoading(false);
            }
        },
        [buildQuery],
    );


    /* ========================================================
       LOAD INITIAL PROJECTS
    ======================================================== */

    useEffect(() => {
        loadProjects(
            EMPTY_FILTERS,
        );
    }, [loadProjects]);


    /* ========================================================
       RELOAD WHEN FILTERS CHANGE
    ======================================================== */

    useEffect(() => {
        loadProjects(filters);
    }, [filters, loadProjects]);


    /* ========================================================
       ANALYZE PROJECT
    ======================================================== */

    async function analyzeProject(
        projectCode: string,
    ) {
        try {
            setSelected(projectCode);
            setSimulation(null);
            setError("");
            setDetailLoading(true);

            const data =
                await apiRequest<Detail>(
                    `/analytics/project/${encodeURIComponent(
                        projectCode,
                    )}`,
                );

            setDetail(data);
        } catch (err) {
            setDetail(null);

            setError(
                err instanceof Error
                    ? err.message
                    : "Unable to load project analysis.",
            );
        } finally {
            setDetailLoading(false);
        }
    }


    /* ========================================================
       SEARCH
    ======================================================== */

    const visibleProjects =
        useMemo(() => {
            const query =
                search
                    .toLowerCase()
                    .trim();

            if (!query) {
                return projects;
            }

            return projects.filter(
                (project) =>
                    `${project.project_code} ${project.project_name}`
                        .toLowerCase()
                        .includes(query),
            );
        }, [projects, search]);


    /* ========================================================
       ACTIVE FILTER COUNT
    ======================================================== */

    const activeFilterCount =
        Object.values(filters).reduce(
            (total, values) =>
                total + values.length,
            0,
        );


    /* ========================================================
       RESET FILTERS
    ======================================================== */

    function resetFilters() {
        setFilters(
            EMPTY_FILTERS,
        );

        setSearch("");
    }


    /* ========================================================
       SIMULATION
    ======================================================== */

    async function runSimulation() {
        if (!selected) {
            return;
        }

        try {
            setSimLoading(true);
            setError("");

            const result =
                await apiRequest<Simulation>(
                    `/analytics/project/${encodeURIComponent(
                        selected,
                    )}/simulate`,
                    {
                        method: "POST",
                        body: JSON.stringify(
                            scenario,
                        ),
                    },
                );

            setSimulation(result);
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Simulation failed.",
            );
        } finally {
            setSimLoading(false);
        }
    }


    /* ========================================================
       PAGE
    ======================================================== */

    return (
        <div>
            <PageHeader
                eyebrow="ANALYTICS"
                title="Project Analytics"
                description="Filter the portfolio, inspect individual projects, understand evidence-based risk indicators and test intervention scenarios."
            />

            {/* ERROR */}
            {error && (
                <div className="mb-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                    <AlertTriangle
                        size={15}
                        className="mt-0.5 shrink-0"
                    />

                    <span>
                        {error}
                    </span>
                </div>
            )}


            {/* ==================================================
                FILTERS
            ================================================== */}

            <Card className="mb-6">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                            <Filter
                                size={16}
                            />

                            Portfolio Filters
                        </div>

                        <p className="mt-1 text-xs text-slate-400">
                            Use one or multiple filters to narrow the project portfolio.
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={
                            resetFilters
                        }
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                        <RotateCcw
                            size={14}
                        />

                        Reset Filters
                    </button>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                    <MultiSelect
                        label="Sector"
                        options={
                            options.sectors
                        }
                        value={
                            filters.sector
                        }
                        onChange={(
                            value,
                        ) =>
                            setFilters(
                                (current) => ({
                                    ...current,
                                    sector: value,
                                }),
                            )
                        }
                    />

                    <MultiSelect
                        label="Ministry"
                        options={
                            options.ministries
                        }
                        value={
                            filters.ministry
                        }
                        onChange={(
                            value,
                        ) =>
                            setFilters(
                                (current) => ({
                                    ...current,
                                    ministry: value,
                                }),
                            )
                        }
                    />

                    <MultiSelect
                        label="State"
                        options={
                            options.states
                        }
                        value={
                            filters.state
                        }
                        onChange={(
                            value,
                        ) =>
                            setFilters(
                                (current) => ({
                                    ...current,
                                    state: value,
                                }),
                            )
                        }
                    />

                    <MultiSelect
                        label="Risk Level"
                        options={
                            options.risk_levels
                        }
                        value={
                            filters.risk
                        }
                        onChange={(
                            value,
                        ) =>
                            setFilters(
                                (current) => ({
                                    ...current,
                                    risk: value,
                                }),
                            )
                        }
                    />

                    <MultiSelect
                        label="Schedule Status"
                        options={
                            options.schedule_statuses
                        }
                        value={
                            filters.status
                        }
                        onChange={(
                            value,
                        ) =>
                            setFilters(
                                (current) => ({
                                    ...current,
                                    status: value,
                                }),
                            )
                        }
                    />
                </div>

                <div className="mt-4 text-[11px] text-slate-400">
                    <span className="font-bold text-slate-600">
                        {activeFilterCount} active filters
                    </span>

                    <span className="mx-2">
                        ·
                    </span>

                    {loading
                        ? "Loading..."
                        : `${projects.length.toLocaleString()} matching projects`}
                </div>
            </Card>


            {/* ==================================================
                PROJECT TABLE
            ================================================== */}

            <Card
                padding="none"
                className="mb-6 overflow-hidden"
            >
                <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 className="text-sm font-bold text-slate-900">
                            Matching Projects
                        </h2>

                        <p className="mt-1 text-xs text-slate-400">
                            Search by project code or project name and open detailed analysis.
                        </p>
                    </div>

                    <div className="relative w-full sm:w-80">
                        <Search
                            size={14}
                            className="absolute left-3 top-3 text-slate-400"
                        />

                        <input
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
                            placeholder="Search code or project name..."
                            className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs outline-none transition focus:border-slate-400 focus:bg-white"
                        />
                    </div>
                </div>

                <div className="max-h-[480px] overflow-auto">
                    <table className="min-w-[1050px] w-full text-left text-xs">
                        <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400">
                            <tr>
                                <th className="px-4 py-3">
                                    Project Code
                                </th>

                                <th className="px-4 py-3">
                                    Project Name
                                </th>

                                <th className="px-4 py-3">
                                    Risk
                                </th>

                                <th className="px-4 py-3">
                                    Score
                                </th>

                                <th className="px-4 py-3">
                                    Sector
                                </th>

                                <th className="px-4 py-3">
                                    Ministry
                                </th>

                                <th className="px-4 py-3">
                                    State
                                </th>

                                <th className="px-4 py-3">
                                    Status
                                </th>

                                <th className="px-4 py-3">
                                    Action
                                </th>
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-slate-100">
                            {visibleProjects.map(
                                (project) => (
                                    <tr
                                        key={
                                            project.project_code
                                        }
                                        className={
                                            selected ===
                                            project.project_code
                                                ? "bg-slate-50"
                                                : "hover:bg-slate-50"
                                        }
                                    >
                                        <td className="px-4 py-3 font-semibold text-slate-800">
                                            {
                                                project.project_code
                                            }
                                        </td>

                                        <td className="max-w-[280px] px-4 py-3 font-medium text-slate-800">
                                            <div className="truncate">
                                                {
                                                    project.project_name
                                                }
                                            </div>
                                        </td>

                                        <td className="px-4 py-3">
                                            <Badge
                                                variant={riskVariant(
                                                    project.risk_level,
                                                )}
                                            >
                                                {
                                                    project.risk_level ??
                                                    "N/A"
                                                }
                                            </Badge>
                                        </td>

                                        <td className="px-4 py-3 font-semibold">
                                            {project.overall_risk_score ==
                                            null
                                                ? "N/A"
                                                : Number(
                                                      project.overall_risk_score,
                                                  ).toFixed(
                                                      1,
                                                  )}
                                        </td>

                                        <td className="px-4 py-3 text-slate-500">
                                            {
                                                project.sector ??
                                                "N/A"
                                            }
                                        </td>

                                        <td className="px-4 py-3 text-slate-500">
                                            {
                                                project.ministry ??
                                                "N/A"
                                            }
                                        </td>

                                        <td className="px-4 py-3 text-slate-500">
                                            {
                                                project.state ??
                                                "N/A"
                                            }
                                        </td>

                                        <td className="px-4 py-3 text-slate-500">
                                            {
                                                project.schedule_status ??
                                                "N/A"
                                            }
                                        </td>

                                        <td className="px-4 py-3">
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    analyzeProject(
                                                        project.project_code,
                                                    )
                                                }
                                                className="rounded-lg bg-slate-900 px-3 py-1.5 text-[10px] font-bold text-white transition hover:bg-slate-700"
                                            >
                                                Analyze
                                            </button>
                                        </td>
                                    </tr>
                                ),
                            )}

                            {!visibleProjects.length && (
                                <tr>
                                    <td
                                        colSpan={
                                            9
                                        }
                                        className="px-4 py-14 text-center text-xs text-slate-400"
                                    >
                                        No projects match the current filters.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>


            {/* ==================================================
                DETAIL LOADING
            ================================================== */}

            {detailLoading && (
                <Card className="mb-6">
                    <div className="py-10 text-center text-sm text-slate-400">
                        Loading project analysis...
                    </div>
                </Card>
            )}


            {/* ==================================================
                PROJECT DETAIL
            ================================================== */}

            {detail && !detailLoading && (
                <div className="space-y-6">

                    {/* PROJECT HEADER */}
                    <div className="flex flex-wrap items-end justify-between gap-4">
                        <div>
                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                Selected Project
                            </div>

                            <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
                                {
                                    detail.project
                                        .project_name
                                }
                            </h2>

                            <p className="mt-1 text-xs text-slate-500">
                                Code:{" "}
                                {
                                    detail.project
                                        .project_code
                                }
                            </p>
                        </div>

                        <Badge
                            variant={riskVariant(
                                detail.risk.level,
                            )}
                            dot
                        >
                            {
                                detail.risk.level ??
                                "N/A"
                            }{" "}
                            Risk
                        </Badge>
                    </div>


                    {/* KPI CARDS */}
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
                        <Card padding="sm">
                            <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                                Risk Score
                            </div>

                            <div className="mt-2 text-lg font-bold text-slate-900">
                                {formatValue(
                                    detail.risk.overall ==
                                        null
                                        ? null
                                        : Number(
                                              detail.risk.overall,
                                          ).toFixed(
                                              1,
                                          ),
                                    detail.risk.overall ==
                                        null
                                        ? ""
                                        : "/100",
                                )}
                            </div>
                        </Card>

                        <Card padding="sm">
                            <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                                Risk Level
                            </div>

                            <div className="mt-2 text-lg font-bold text-slate-900">
                                {
                                    detail.risk
                                        .level ??
                                    "N/A"
                                }
                            </div>
                        </Card>

                        <Card padding="sm">
                            <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                                Delay
                            </div>

                            <div className="mt-2 text-lg font-bold text-slate-900">
                                {formatValue(
                                    detail.project
                                        .delay_days ==
                                        null
                                        ? null
                                        : Number(
                                              detail
                                                  .project
                                                  .delay_days,
                                          ).toFixed(
                                              0,
                                          ),
                                    " days",
                                )}
                            </div>
                        </Card>

                        <Card padding="sm">
                            <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                                Physical Progress
                            </div>

                            <div className="mt-2 text-lg font-bold text-slate-900">
                                {formatValue(
                                    detail.project
                                        .flash_latest_physical_progress ==
                                        null
                                        ? null
                                        : Number(
                                              detail
                                                  .project
                                                  .flash_latest_physical_progress,
                                          ).toFixed(
                                              1,
                                          ),
                                    "%",
                                )}
                            </div>
                        </Card>

                        <Card padding="sm">
                            <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                                Original Cost
                            </div>

                            <div className="mt-2 text-lg font-bold text-slate-900">
                                {detail.project
                                    .original_cost_cr ==
                                null
                                    ? "N/A"
                                    : formatCrore(
                                          Number(
                                              detail
                                                  .project
                                                  .original_cost_cr,
                                          ),
                                      )}
                            </div>
                        </Card>

                        <Card padding="sm">
                            <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                                Expenditure
                            </div>

                            <div className="mt-2 text-lg font-bold text-slate-900">
                                {detail.project
                                    .expenditure_cr ==
                                null
                                    ? "N/A"
                                    : formatCrore(
                                          Number(
                                              detail
                                                  .project
                                                  .expenditure_cr,
                                          ),
                                      )}
                            </div>
                        </Card>

                        <Card padding="sm">
                            <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                                Alert Priority
                            </div>

                            <div className="mt-2 text-lg font-bold text-slate-900">
                                {
                                    detail.risk
                                        .alert_priority ??
                                    "NONE"
                                }
                            </div>
                        </Card>
                    </div>


                    {/* ==================================================
                        RISK + PROJECT INFO
                    ================================================== */}

                    <div className="grid gap-6 lg:grid-cols-2">

                        {/* RISK BREAKDOWN */}
                        <Card>
                            <div className="mb-5 flex items-center gap-2">
                                <ShieldAlert
                                    size={17}
                                    className="text-slate-700"
                                />

                                <h3 className="text-sm font-bold text-slate-900">
                                    Risk Breakdown
                                </h3>
                            </div>

                            {[
                                [
                                    "Cost Risk",
                                    detail.risk.cost,
                                ],
                                [
                                    "Future Delay",
                                    detail.risk.delay,
                                ],
                                [
                                    "Progress Stall",
                                    detail.risk.stall,
                                ],
                            ].map(
                                ([
                                    label,
                                    value,
                                ]) => (
                                    <div
                                        key={
                                            label
                                        }
                                        className="mb-5 last:mb-0"
                                    >
                                        <div className="mb-1.5 flex justify-between gap-3 text-xs">
                                            <span className="font-medium text-slate-600">
                                                {
                                                    label
                                                }
                                            </span>

                                            <b className="text-slate-900">
                                                {value ==
                                                null
                                                    ? "N/A"
                                                    : `${Number(
                                                          value,
                                                      ).toFixed(
                                                          1,
                                                      )}%`}
                                            </b>
                                        </div>

                                        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                                            <div
                                                className={`h-full rounded-full transition-all ${riskBarClass(
                                                    typeof value === "number" ? value : null,
                                                )}`}
                                                style={{
                                                    width: `${Math.min(
                                                        100,
                                                        Math.max(
                                                            0,
                                                            Number(
                                                                value ??
                                                                    0,
                                                            ),
                                                        ),
                                                    )}%`,
                                                }}
                                            />
                                        </div>
                                    </div>
                                ),
                            )}

                            <div className="mt-6 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
                                <b className="text-slate-700">
                                    Predicted cost overrun:
                                </b>{" "}
                                {detail.risk
                                    .predicted_cost_overrun_pct ==
                                null
                                    ? "N/A"
                                    : `${Number(
                                          detail
                                              .risk
                                              .predicted_cost_overrun_pct,
                                      ).toFixed(
                                          2,
                                      )}%`}
                            </div>
                        </Card>


                        {/* PROJECT INFORMATION */}
                        <Card>
                            <h3 className="mb-5 text-sm font-bold text-slate-900">
                                Project Information
                            </h3>

                            <div className="grid gap-4 sm:grid-cols-2">
                                {[
                                    [
                                        "Ministry",
                                        detail
                                            .project
                                            .ministry,
                                    ],
                                    [
                                        "Sector",
                                        detail
                                            .project
                                            .sector,
                                    ],
                                    [
                                        "State",
                                        detail
                                            .project
                                            .flash_state,
                                    ],
                                    [
                                        "Implementing Agency",
                                        detail
                                            .project
                                            .flash_implementing_agency,
                                    ],
                                    [
                                        "Schedule Status",
                                        detail
                                            .project
                                            .schedule_status,
                                    ],
                                    [
                                        "Cost Status",
                                        detail
                                            .project
                                            .cost_status,
                                    ],
                                    [
                                        "Original Completion",
                                        detail
                                            .project
                                            .original_end_date,
                                    ],
                                    [
                                        "Revised Completion",
                                        detail
                                            .project
                                            .revised_end_date,
                                    ],
                                    [
                                        "Data Quality",
                                        detail
                                            .project
                                            .data_quality_flag,
                                    ],
                                    [
                                        "Schedule Change",
                                        detail
                                            .project
                                            .schedule_change_days ==
                                        null
                                            ? null
                                            : `${Number(
                                                  detail
                                                      .project
                                                      .schedule_change_days,
                                              ).toFixed(
                                                  0,
                                              )} days`,
                                    ],
                                ].map(
                                    ([
                                        label,
                                        value,
                                    ]) => (
                                        <div
                                            key={
                                                label
                                            }
                                        >
                                            <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                                                {
                                                    label
                                                }
                                            </div>

                                            <div className="mt-1 text-xs font-semibold text-slate-800">
                                                {value ??
                                                    "N/A"}
                                            </div>
                                        </div>
                                    ),
                                )}
                            </div>
                        </Card>
                    </div>


                    {/* ==================================================
                        TRAJECTORY CHARTS
                    ================================================== */}

                    <div className="grid gap-6 lg:grid-cols-2">
                        <LineChart
                            title="Schedule Trajectory — Delay"
                            points={
                                detail.history
                                    .schedule
                            }
                            valueKey="delay_days"
                            suffix=" days"
                        />

                        <CostTrajectoryChart
                            points={
                                detail.history
                                    .schedule
                            }
                        />
                    </div>

                    <LineChart
                        title="Physical Progress Trajectory"
                        points={
                            detail.history
                                .progress
                        }
                        valueKey="physical_progress_pct"
                        suffix="%"
                    />


                    {/* ==================================================
                        REASONS + SOLUTIONS
                    ================================================== */}

                    <Card>
                        <div className="mb-5 flex items-center gap-2">
                            <AlertTriangle
                                size={17}
                                className="text-slate-700"
                            />

                            <h3 className="text-sm font-bold text-slate-900">
                                Reasons for Delay & Recommended Solutions
                            </h3>
                        </div>

                        <div className="space-y-3">
                            {detail.reasons.map(
                                (reason) => (
                                    <div
                                        key={
                                            reason.title
                                        }
                                        className="rounded-xl border border-slate-200 p-4"
                                    >
                                        <div className="flex gap-3">
                                            <AlertTriangle
                                                size={
                                                    15
                                                }
                                                className="mt-0.5 shrink-0 text-red-500"
                                            />

                                            <div className="min-w-0">
                                                <b className="text-xs text-slate-900">
                                                    {
                                                        reason.title
                                                    }
                                                </b>

                                                <p className="mt-1 text-xs leading-5 text-slate-500">
                                                    {
                                                        reason.explanation
                                                    }
                                                </p>

                                                <div className="mt-3 flex gap-2 text-xs leading-5 text-slate-600">
                                                    <CheckCircle2
                                                        size={
                                                            14
                                                        }
                                                        className="mt-0.5 shrink-0 text-emerald-600"
                                                    />

                                                    <span>
                                                        <b>
                                                            Recommended solution:
                                                        </b>{" "}
                                                        {
                                                            reason.solution
                                                        }
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ),
                            )}
                        </div>
                    </Card>


                    {/* ==================================================
                        WHAT IF SIMULATOR
                    ================================================== */}

                    <Card>
                        <div className="flex flex-wrap items-center justify-between gap-4">
                            <div>
                                <div className="flex items-center gap-2">
                                    <SlidersHorizontal
                                        size={17}
                                        className="text-slate-700"
                                    />

                                    <h3 className="text-sm font-bold text-slate-900">
                                        What-If Risk Simulator
                                    </h3>
                                </div>

                                <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-400">
                                    Test how changes in project conditions affect the trained ML risk assessment.
                                </p>
                            </div>

                            <Button
                                onClick={
                                    runSimulation
                                }
                                disabled={
                                    simLoading
                                }
                            >
                                {simLoading
                                    ? "Running..."
                                    : "Run Simulation"}
                            </Button>
                        </div>


                        {/* SLIDERS */}
                        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">

                            {/* PROGRESS */}
                            <label className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                    Physical Progress Change
                                </span>

                                <div className="mt-2 text-lg font-bold text-slate-900">
                                    {scenario.progress_delta >
                                    0
                                        ? "+"
                                        : ""}
                                    {
                                        scenario.progress_delta
                                    }
                                    %
                                </div>

                                <input
                                    className="mt-4 w-full accent-slate-700"
                                    type="range"
                                    min="-30"
                                    max="30"
                                    step="1"
                                    value={
                                        scenario.progress_delta
                                    }
                                    onChange={(
                                        event,
                                    ) =>
                                        setScenario(
                                            (
                                                current,
                                            ) => ({
                                                ...current,
                                                progress_delta:
                                                    Number(
                                                        event
                                                            .target
                                                            .value,
                                                    ),
                                            }),
                                        )
                                    }
                                />
                            </label>


                            {/* DELAY */}
                            <label className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                    Additional Schedule Delay
                                </span>

                                <div className="mt-2 text-lg font-bold text-slate-900">
                                    {scenario.delay_delta >
                                    0
                                        ? "+"
                                        : ""}
                                    {
                                        scenario.delay_delta
                                    }{" "}
                                    days
                                </div>

                                <input
                                    className="mt-4 w-full accent-slate-700"
                                    type="range"
                                    min="-365"
                                    max="365"
                                    step="5"
                                    value={
                                        scenario.delay_delta
                                    }
                                    onChange={(
                                        event,
                                    ) =>
                                        setScenario(
                                            (
                                                current,
                                            ) => ({
                                                ...current,
                                                delay_delta:
                                                    Number(
                                                        event
                                                            .target
                                                            .value,
                                                    ),
                                            }),
                                        )
                                    }
                                />
                            </label>


                            {/* EXPENDITURE */}
                            <label className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                    Monthly Expenditure Change
                                </span>

                                <div className="mt-2 text-lg font-bold text-slate-900">
                                    {scenario.expenditure_delta >
                                    0
                                        ? "+"
                                        : ""}
                                    ₹
                                    {
                                        scenario.expenditure_delta
                                    }{" "}
                                    Cr
                                </div>

                                <input
                                    className="mt-4 w-full accent-slate-700"
                                    type="range"
                                    min="-200"
                                    max="200"
                                    step="5"
                                    value={
                                        scenario.expenditure_delta
                                    }
                                    onChange={(
                                        event,
                                    ) =>
                                        setScenario(
                                            (
                                                current,
                                            ) => ({
                                                ...current,
                                                expenditure_delta:
                                                    Number(
                                                        event
                                                            .target
                                                            .value,
                                                    ),
                                            }),
                                        )
                                    }
                                />
                            </label>


                            {/* REVISED COST */}
                            <label className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                    Revised-Cost Change
                                </span>

                                <div className="mt-2 text-lg font-bold text-slate-900">
                                    {scenario.revised_cost_delta >
                                    0
                                        ? "+"
                                        : ""}
                                    ₹
                                    {
                                        scenario.revised_cost_delta
                                    }{" "}
                                    Cr
                                </div>

                                <input
                                    className="mt-4 w-full accent-slate-700"
                                    type="range"
                                    min="-500"
                                    max="500"
                                    step="10"
                                    value={
                                        scenario.revised_cost_delta
                                    }
                                    onChange={(
                                        event,
                                    ) =>
                                        setScenario(
                                            (
                                                current,
                                            ) => ({
                                                ...current,
                                                revised_cost_delta:
                                                    Number(
                                                        event
                                                            .target
                                                            .value,
                                                    ),
                                            }),
                                        )
                                    }
                                />
                            </label>
                        </div>


                        {/* ==================================================
                            SIMULATION RESULTS
                        ================================================== */}

                        {simulation && (
                            <div className="mt-6 border-t border-slate-200 pt-6">

                                <div className="mb-4">
                                    <h4 className="text-sm font-bold text-slate-900">
                                        Baseline vs Simulated Result
                                    </h4>

                                    <p className="mt-1 text-xs text-slate-400">
                                        The scenario is calculated from the selected project's latest ML snapshot.
                                    </p>
                                </div>

                                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">

                                    {/* OVERALL */}
                                    <Card padding="sm">
                                        <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                                            Overall Risk Score
                                        </div>

                                        <div className="mt-2 flex items-center justify-between gap-3">
                                            <div>
                                                <div className="text-xl font-bold text-slate-900">
                                                    {Number(
                                                        simulation
                                                            .scenario
                                                            .overall_risk,
                                                    ).toFixed(
                                                        1,
                                                    )}
                                                    /100
                                                </div>

                                                <div className="mt-1 text-[10px] text-slate-400">
                                                    Baseline{" "}
                                                    {Number(
                                                        simulation
                                                            .baseline
                                                            .overall_risk,
                                                    ).toFixed(
                                                        1,
                                                    )}
                                                    /100
                                                </div>
                                            </div>

                                            {Number(
                                                simulation
                                                    .scenario
                                                    .overall_risk,
                                            ) >
                                            Number(
                                                simulation
                                                    .baseline
                                                    .overall_risk,
                                            ) ? (
                                                <TrendingUp
                                                    size={
                                                        18
                                                    }
                                                    className="text-red-500"
                                                />
                                            ) : (
                                                <TrendingDown
                                                    size={
                                                        18
                                                    }
                                                    className="text-emerald-500"
                                                />
                                            )}
                                        </div>
                                    </Card>


                                    {/* DELAY */}
                                    <Card padding="sm">
                                        <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                                            Future Delay
                                        </div>

                                        <div className="mt-2 flex items-center justify-between gap-3">
                                            <div>
                                                <div className="text-xl font-bold text-slate-900">
                                                    {(
                                                        Number(
                                                            simulation
                                                                .scenario
                                                                .delay_probability,
                                                        ) *
                                                        100
                                                    ).toFixed(
                                                        1,
                                                    )}
                                                    %
                                                </div>

                                                <div className="mt-1 text-[10px] text-slate-400">
                                                    Baseline{" "}
                                                    {(
                                                        Number(
                                                            simulation
                                                                .baseline
                                                                .delay_probability,
                                                        ) *
                                                        100
                                                    ).toFixed(
                                                        1,
                                                    )}
                                                    %
                                                </div>
                                            </div>

                                            {Number(
                                                simulation
                                                    .scenario
                                                    .delay_probability,
                                            ) >
                                            Number(
                                                simulation
                                                    .baseline
                                                    .delay_probability,
                                            ) ? (
                                                <TrendingUp
                                                    size={
                                                        18
                                                    }
                                                    className="text-red-500"
                                                />
                                            ) : (
                                                <TrendingDown
                                                    size={
                                                        18
                                                    }
                                                    className="text-emerald-500"
                                                />
                                            )}
                                        </div>
                                    </Card>


                                    {/* STALL */}
                                    <Card padding="sm">
                                        <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                                            Progress Stall
                                        </div>

                                        <div className="mt-2 flex items-center justify-between gap-3">
                                            <div>
                                                <div className="text-xl font-bold text-slate-900">
                                                    {(
                                                        Number(
                                                            simulation
                                                                .scenario
                                                                .stall_probability,
                                                        ) *
                                                        100
                                                    ).toFixed(
                                                        1,
                                                    )}
                                                    %
                                                </div>

                                                <div className="mt-1 text-[10px] text-slate-400">
                                                    Baseline{" "}
                                                    {(
                                                        Number(
                                                            simulation
                                                                .baseline
                                                                .stall_probability,
                                                        ) *
                                                        100
                                                    ).toFixed(
                                                        1,
                                                    )}
                                                    %
                                                </div>
                                            </div>

                                            {Number(
                                                simulation
                                                    .scenario
                                                    .stall_probability,
                                            ) >
                                            Number(
                                                simulation
                                                    .baseline
                                                    .stall_probability,
                                            ) ? (
                                                <TrendingUp
                                                    size={
                                                        18
                                                    }
                                                    className="text-red-500"
                                                />
                                            ) : (
                                                <TrendingDown
                                                    size={
                                                        18
                                                    }
                                                    className="text-emerald-500"
                                                />
                                            )}
                                        </div>
                                    </Card>
                                </div>


                                {/* SCENARIO SUMMARY */}
                                <div className="mt-4 grid gap-4 md:grid-cols-2">

                                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                        <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                                            Scenario Risk Level
                                        </div>

                                        <div className="mt-2 flex items-center gap-3">
                                            <Badge
                                                variant={riskVariant(
                                                    simulation
                                                        .scenario
                                                        .risk_level,
                                                )}
                                                dot
                                            >
                                                {
                                                    simulation
                                                        .scenario
                                                        .risk_level
                                                }
                                            </Badge>
                                        </div>
                                    </div>

                                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                        <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                                            Scenario Message
                                        </div>

                                        <p className="mt-2 text-xs leading-5 text-slate-600">
                                            {Number(
                                                simulation
                                                    .scenario
                                                    .overall_risk,
                                            ) >
                                            Number(
                                                simulation
                                                    .baseline
                                                    .overall_risk,
                                            )
                                                ? "Risk increases under this scenario. The intervention should be reviewed before implementation."
                                                : Number(
                                                      simulation
                                                          .scenario
                                                          .overall_risk,
                                                  ) <
                                                  Number(
                                                      simulation
                                                          .baseline
                                                          .overall_risk,
                                                  )
                                                ? "Risk decreases under this scenario, indicating a potentially improved project condition."
                                                : "Risk remains unchanged under this scenario."}
                                        </p>
                                    </div>
                                </div>


                                {/* COST RESULTS */}
                                <div className="mt-4 grid gap-4 md:grid-cols-2">

                                    <div className="rounded-xl border border-slate-200 p-4">
                                        <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                                            Predicted Cost Overrun
                                        </div>

                                        <div className="mt-2 flex items-end justify-between gap-3">
                                            <div>
                                                <div className="text-lg font-bold text-slate-900">
                                                    {Number(
                                                        simulation
                                                            .scenario
                                                            .predicted_cost_overrun,
                                                    ).toFixed(
                                                        2,
                                                    )}
                                                    %
                                                </div>

                                                <div className="mt-1 text-[10px] text-slate-400">
                                                    Baseline{" "}
                                                    {Number(
                                                        simulation
                                                            .baseline
                                                            .predicted_cost_overrun,
                                                    ).toFixed(
                                                        2,
                                                    )}
                                                    %
                                                </div>
                                            </div>

                                            <div className="text-right">
                                                <div className="text-[9px] uppercase text-slate-400">
                                                    Cost Risk
                                                </div>

                                                <div className="text-sm font-bold text-slate-800">
                                                    {Number(
                                                        simulation
                                                            .scenario
                                                            .cost_risk,
                                                    ).toFixed(
                                                        1,
                                                    )}
                                                    /100
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="rounded-xl border border-slate-200 p-4">
                                        <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                                            Scenario Inputs
                                        </div>

                                        <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                                            <div>
                                                <span className="text-slate-400">
                                                    Progress
                                                </span>

                                                <div className="font-semibold">
                                                    {scenario.progress_delta >
                                                    0
                                                        ? "+"
                                                        : ""}
                                                    {
                                                        scenario.progress_delta
                                                    }
                                                    %
                                                </div>
                                            </div>

                                            <div>
                                                <span className="text-slate-400">
                                                    Delay
                                                </span>

                                                <div className="font-semibold">
                                                    {scenario.delay_delta >
                                                    0
                                                        ? "+"
                                                        : ""}
                                                    {
                                                        scenario.delay_delta
                                                    }{" "}
                                                    days
                                                </div>
                                            </div>

                                            <div>
                                                <span className="text-slate-400">
                                                    Expenditure
                                                </span>

                                                <div className="font-semibold">
                                                    {scenario.expenditure_delta >
                                                    0
                                                        ? "+"
                                                        : ""}
                                                    ₹
                                                    {
                                                        scenario.expenditure_delta
                                                    }{" "}
                                                    Cr
                                                </div>
                                            </div>

                                            <div>
                                                <span className="text-slate-400">
                                                    Revised Cost
                                                </span>

                                                <div className="font-semibold">
                                                    {scenario.revised_cost_delta >
                                                    0
                                                        ? "+"
                                                        : ""}
                                                    ₹
                                                    {
                                                        scenario.revised_cost_delta
                                                    }{" "}
                                                    Cr
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </Card>
                </div>
            )}
        </div>
    );
}