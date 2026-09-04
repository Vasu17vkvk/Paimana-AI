import { useEffect, useMemo, useState } from "react";
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

type Filters = {
    sector: string[];
    ministry: string[];
    state: string[];
    risk: string[];
    status: string[];
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
    };
    reasons: {
        title: string;
        explanation: string;
        solution: string;
    }[];
    history: {
        schedule: any[];
        progress: any[];
    };
};

type Simulation = {
    baseline: Record<string, any>;
    scenario: Record<string, any>;
};

const emptyFilters: Filters = {
    sector: [],
    ministry: [],
    state: [],
    risk: [],
    status: [],
};

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

    return (
        <div className="relative">
            <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {label}
            </div>

            <button
                type="button"
                onClick={() => setOpen(!open)}
                className="flex min-h-10 w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 text-left text-xs text-slate-700 shadow-sm"
            >
                <span className="truncate">
                    {value.length ? value.join(", ") : "All"}
                </span>

                <ChevronDown size={15} />
            </button>

            {open && (
                <>
                    <button
                        className="fixed inset-0 z-20"
                        aria-label="Close"
                        onClick={() => setOpen(false)}
                    />

                    <div className="absolute top-16 z-30 max-h-64 w-full min-w-[220px] overflow-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                        {options.map((option) => (
                            <label
                                key={option}
                                className="flex cursor-pointer gap-2 rounded-lg px-2 py-2 text-xs hover:bg-slate-50"
                            >
                                <input
                                    type="checkbox"
                                    checked={value.includes(option)}
                                    onChange={() =>
                                        onChange(
                                            value.includes(option)
                                                ? value.filter(
                                                      (item) =>
                                                          item !== option,
                                                  )
                                                : [...value, option],
                                        )
                                    }
                                />

                                <span className="truncate">{option}</span>
                            </label>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

function LineChart({
    title,
    points,
    keyName,
    suffix = "",
}: {
    title: string;
    points: any[];
    keyName: string;
    suffix?: string;
}) {
    const validPoints = points.filter(
        (item) => typeof item?.[keyName] === "number",
    );

    if (!validPoints.length) {
        return (
            <Card>
                <h3 className="text-sm font-bold">{title}</h3>

                <p className="mt-8 text-center text-xs text-slate-400">
                    No history available.
                </p>
            </Card>
        );
    }

    const values = validPoints.map((item) => Number(item[keyName]));

    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;

    const width = 720;
    const height = 230;
    const padding = 30;

    const coords = validPoints
        .map(
            (item, index) =>
                `${padding + (index * (width - padding * 2)) / Math.max(validPoints.length - 1, 1)},${
                    height -
                    padding -
                    ((Number(item[keyName]) - min) / span) *
                        (height - padding * 2)
                }`,
        )
        .join(" ");

    return (
        <Card>
            <div className="flex justify-between">
                <h3 className="text-sm font-bold text-slate-900">
                    {title}
                </h3>

                <span className="text-[10px] text-slate-400">
                    Latest {values.at(-1)?.toFixed(1)}
                    {suffix}
                </span>
            </div>

            <svg
                viewBox={`0 0 ${width} ${height}`}
                className="mt-3 h-56 w-full"
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
                    points={coords}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    className="text-slate-700"
                />

                {validPoints.map((item, index) => {
                    const cx =
                        padding +
                        (index * (width - padding * 2)) /
                            Math.max(validPoints.length - 1, 1);

                    const cy =
                        height -
                        padding -
                        ((Number(item[keyName]) - min) / span) *
                            (height - padding * 2);

                    return (
                        <circle
                            key={index}
                            cx={cx}
                            cy={cy}
                            r="3"
                            className="fill-slate-700"
                        />
                    );
                })}
            </svg>

            <div className="flex justify-between text-[10px] text-slate-400">
                <span>
                    {String(validPoints[0]?.date ?? "").slice(0, 10)}
                </span>

                <span>
                    {String(
                        validPoints.at(-1)?.date ?? "",
                    ).slice(0, 10)}
                </span>
            </div>
        </Card>
    );
}

export default function ProjectAnalyticsPage() {
    const [options, setOptions] = useState<any>({
        sectors: [],
        ministries: [],
        states: [],
        risk_levels: [],
        schedule_statuses: [],
    });

    const [filters, setFilters] =
        useState<Filters>(emptyFilters);

    const [projects, setProjects] = useState<Project[]>([]);
    const [selected, setSelected] = useState("");
    const [detail, setDetail] = useState<Detail | null>(null);

    const [search, setSearch] = useState("");

    const [loading, setLoading] = useState(false);
    const [detailLoading, setDetailLoading] =
        useState(false);

    const [error, setError] = useState("");

    const [simulation, setSimulation] =
        useState<Simulation | null>(null);

    const [simLoading, setSimLoading] =
        useState(false);

    const [scenario, setScenario] = useState({
        progress_delta: 0,
        delay_delta: 0,
        expenditure_delta: 0,
        revised_cost_delta: 0,
    });

    /*
     * Load filter options once.
     */
    useEffect(() => {
        let mounted = true;

        async function loadFilters() {
            try {
                const data = await apiRequest<any>(
                    "/analytics/project-filters",
                );

                if (mounted) {
                    setOptions({
                        sectors: Array.isArray(data?.sectors)
                            ? data.sectors
                            : [],

                        ministries: Array.isArray(
                            data?.ministries,
                        )
                            ? data.ministries
                            : [],

                        states: Array.isArray(data?.states)
                            ? data.states
                            : [],

                        risk_levels: Array.isArray(
                            data?.risk_levels,
                        )
                            ? data.risk_levels
                            : [],

                        schedule_statuses: Array.isArray(
                            data?.schedule_statuses,
                        )
                            ? data.schedule_statuses
                            : [],
                    });
                }
            } catch (e) {
                if (mounted) {
                    setError(
                        e instanceof Error
                            ? e.message
                            : "Unable to load filter options",
                    );
                }
            }
        }

        loadFilters();

        return () => {
            mounted = false;
        };
    }, []);

    /*
     * Load project list.
     *
     * IMPORTANT:
     * Backend may return either:
     *
     * [
     *   {...},
     *   {...}
     * ]
     *
     * OR:
     *
     * {
     *   projects: [...]
     * }
     *
     * Both are handled here.
     */
    useEffect(() => {
        let cancelled = false;

        async function loadProjects() {
            try {
                setLoading(true);
                setError("");

                const query = new URLSearchParams();

                Object.entries(filters).forEach(
                    ([key, values]) => {
                        values.forEach((value) => {
                            query.append(key, value);
                        });
                    },
                );

                const endpoint = query.toString()
                    ? `/analytics/projects?${query.toString()}`
                    : "/analytics/projects";

                const response = await apiRequest<any>(
                    endpoint,
                );

                if (cancelled) {
                    return;
                }

                /*
                 * FIX:
                 * Support both response formats.
                 */
                const rows: Project[] = Array.isArray(response)
                    ? response
                    : Array.isArray(response?.projects)
                      ? response.projects
                      : [];

                setProjects(rows);

                /*
                 * Automatically select first project
                 * when current project is not present.
                 */
                const currentExists =
                    selected &&
                    rows.some(
                        (project) =>
                            String(project.project_code) ===
                            String(selected),
                    );

                const nextSelected = currentExists
                    ? String(selected)
                    : rows[0]?.project_code
                      ? String(rows[0].project_code)
                      : "";

                setSelected(nextSelected);

                setSimulation(null);

                if (!nextSelected) {
                    setDetail(null);
                    return;
                }

                /*
                 * Load first/current project's details.
                 */
                setDetailLoading(true);

                try {
                    const projectDetail =
                        await apiRequest<Detail>(
                            `/analytics/project/${encodeURIComponent(
                                nextSelected,
                            )}`,
                        );

                    if (!cancelled) {
                        setDetail(projectDetail);
                    }
                } catch (e) {
                    if (!cancelled) {
                        setDetail(null);
                        setError(
                            e instanceof Error
                                ? e.message
                                : "Unable to load project",
                        );
                    }
                } finally {
                    if (!cancelled) {
                        setDetailLoading(false);
                    }
                }
            } catch (e) {
                if (!cancelled) {
                    setProjects([]);
                    setSelected("");
                    setDetail(null);

                    setError(
                        e instanceof Error
                            ? e.message
                            : "Unable to load projects",
                    );
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        loadProjects();

        return () => {
            cancelled = true;
        };
    }, [filters]);

    /*
     * Analyze manually selected project.
     */
    async function analyze(code: string) {
        setSelected(String(code));
        setSimulation(null);
        setDetailLoading(true);

        try {
            setError("");

            const data = await apiRequest<Detail>(
                `/analytics/project/${encodeURIComponent(
                    code,
                )}`,
            );

            setDetail(data);
        } catch (e) {
            setDetail(null);

            setError(
                e instanceof Error
                    ? e.message
                    : "Unable to load project",
            );
        } finally {
            setDetailLoading(false);
        }
    }

    /*
     * Search within currently loaded projects.
     */
    const visible = useMemo(() => {
        const query = search.toLowerCase().trim();

        if (!query) {
            return projects;
        }

        return projects.filter((project) =>
            `${project.project_code} ${project.project_name}`
                .toLowerCase()
                .includes(query),
        );
    }, [projects, search]);

    /*
     * Run What-If simulation.
     */
    async function simulateNow() {
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
                        body: JSON.stringify(scenario),
                    },
                );

            setSimulation(result);
        } catch (e) {
            setError(
                e instanceof Error
                    ? e.message
                    : "Simulation failed",
            );
        } finally {
            setSimLoading(false);
        }
    }

    const activeFilters = Object.values(filters).reduce(
        (total, values) => total + values.length,
        0,
    );

    return (
        <div>
            <PageHeader
                eyebrow="ANALYTICS"
                title="Project Analytics"
                description="Filter the portfolio, inspect a project, understand evidence-based delay indicators and test intervention scenarios using the supplied ML models."
            />

            {error && (
                <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                    {error}
                </div>
            )}

            {/* FILTERS */}
            <Card className="mb-6">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <div className="flex items-center gap-2 text-sm font-bold">
                            <Filter size={16} />
                            Portfolio Filters
                        </div>

                        <p className="mt-1 text-xs text-slate-400">
                            Filters work without selecting a
                            project.
                        </p>
                    </div>

                    <button
                        onClick={() => {
                            setFilters(emptyFilters);
                            setSearch("");
                        }}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold"
                    >
                        <RotateCcw size={14} />
                        Reset Filters
                    </button>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                    <MultiSelect
                        label="Sector"
                        options={options.sectors}
                        value={filters.sector}
                        onChange={(value) =>
                            setFilters((current) => ({
                                ...current,
                                sector: value,
                            }))
                        }
                    />

                    <MultiSelect
                        label="Ministry"
                        options={options.ministries}
                        value={filters.ministry}
                        onChange={(value) =>
                            setFilters((current) => ({
                                ...current,
                                ministry: value,
                            }))
                        }
                    />

                    <MultiSelect
                        label="State"
                        options={options.states}
                        value={filters.state}
                        onChange={(value) =>
                            setFilters((current) => ({
                                ...current,
                                state: value,
                            }))
                        }
                    />

                    <MultiSelect
                        label="Risk Level"
                        options={options.risk_levels}
                        value={filters.risk}
                        onChange={(value) =>
                            setFilters((current) => ({
                                ...current,
                                risk: value,
                            }))
                        }
                    />

                    <MultiSelect
                        label="Schedule Status"
                        options={
                            options.schedule_statuses
                        }
                        value={filters.status}
                        onChange={(value) =>
                            setFilters((current) => ({
                                ...current,
                                status: value,
                            }))
                        }
                    />
                </div>

                <div className="mt-4 text-[11px] text-slate-400">
                    <b className="text-slate-600">
                        {activeFilters} active filters
                    </b>

                    {" · "}

                    {loading
                        ? "Loading…"
                        : `${projects.length.toLocaleString()} matching projects`}
                </div>
            </Card>

            {/* PROJECT TABLE */}
            <Card
                padding="none"
                className="mb-6 overflow-hidden"
            >
                <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:justify-between">
                    <div>
                        <h2 className="text-sm font-bold">
                            Matching Projects
                        </h2>

                        <p className="mt-1 text-xs text-slate-400">
                            Search by code or name and open
                            detailed analysis.
                        </p>
                    </div>

                    <div className="relative w-full sm:w-80">
                        <Search
                            size={14}
                            className="absolute left-3 top-3 text-slate-400"
                        />

                        <input
                            value={search}
                            onChange={(event) =>
                                setSearch(
                                    event.target.value,
                                )
                            }
                            placeholder="Search code or project name…"
                            className="h-9 w-full rounded-lg border bg-slate-50 pl-9 pr-3 text-xs outline-none"
                        />
                    </div>
                </div>

                <div className="max-h-[430px] overflow-auto">
                    <table className="min-w-[1000px] w-full text-left text-xs">
                        <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase text-slate-400">
                            <tr>
                                {[
                                    "Project Code",
                                    "Project Name",
                                    "Risk",
                                    "Score",
                                    "Sector",
                                    "Ministry",
                                    "State",
                                    "Status",
                                    "",
                                ].map((heading) => (
                                    <th
                                        key={heading}
                                        className="px-4 py-3"
                                    >
                                        {heading}
                                    </th>
                                ))}
                            </tr>
                        </thead>

                        <tbody className="divide-y">
                            {visible.map((project) => (
                                <tr
                                    key={
                                        project.project_code
                                    }
                                    className="hover:bg-slate-50"
                                >
                                    <td className="px-4 py-3 font-semibold">
                                        {
                                            project.project_code
                                        }
                                    </td>

                                    <td className="px-4 py-3 font-medium">
                                        {
                                            project.project_name
                                        }
                                    </td>

                                    <td className="px-4 py-3">
                                        <Badge
                                            variant={riskVariant(
                                                project.risk_level,
                                            )}
                                        >
                                            {project.risk_level ??
                                                "N/A"}
                                        </Badge>
                                    </td>

                                    <td className="px-4 py-3 font-semibold">
                                        {project.overall_risk_score ==
                                        null
                                            ? "N/A"
                                            : Number(
                                                  project.overall_risk_score,
                                              ).toFixed(1)}
                                    </td>

                                    <td className="px-4 py-3 text-slate-500">
                                        {project.sector ??
                                            "N/A"}
                                    </td>

                                    <td className="px-4 py-3 text-slate-500">
                                        {project.ministry ??
                                            "N/A"}
                                    </td>

                                    <td className="px-4 py-3 text-slate-500">
                                        {project.state ??
                                            "N/A"}
                                    </td>

                                    <td className="px-4 py-3 text-slate-500">
                                        {project.schedule_status ??
                                            "N/A"}
                                    </td>

                                    <td className="px-4 py-3">
                                        <button
                                            onClick={() =>
                                                analyze(
                                                    project.project_code,
                                                )
                                            }
                                            className="rounded-lg bg-slate-900 px-3 py-1.5 text-[10px] font-bold text-white"
                                        >
                                            Analyze
                                        </button>
                                    </td>
                                </tr>
                            ))}

                            {!visible.length && (
                                <tr>
                                    <td
                                        colSpan={9}
                                        className="px-4 py-12 text-center text-xs text-slate-400"
                                    >
                                        {loading
                                            ? "Loading projects…"
                                            : "No projects match the current filters."}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            {/* SELECTED PROJECT */}
            {detailLoading && !detail && (
                <Card className="mb-6">
                    <div className="py-10 text-center text-xs text-slate-400">
                        Loading project analysis…
                    </div>
                </Card>
            )}

            {detail && (
                <div className="space-y-6">
                    {/* HEADER */}
                    <div className="flex items-end justify-between">
                        <div>
                            <div className="text-[10px] font-bold uppercase text-slate-400">
                                Selected Project
                            </div>

                            <h2 className="mt-1 text-2xl font-bold">
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
                            {detail.risk.level ?? "N/A"} Risk
                        </Badge>
                    </div>

                    {/* KPI CARDS */}
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
                        {[
                            [
                                "Risk Score",
                                detail.risk.overall ==
                                null
                                    ? "N/A"
                                    : `${Number(
                                          detail.risk
                                              .overall,
                                      ).toFixed(
                                          1,
                                      )}/100`,
                            ],
                            [
                                "Risk Level",
                                detail.risk.level,
                            ],
                            [
                                "Delay",
                                detail.project
                                    .delay_days ==
                                null
                                    ? "N/A"
                                    : `${Number(
                                          detail.project
                                              .delay_days,
                                      ).toFixed(
                                          0,
                                      )} days`,
                            ],
                            [
                                "Physical Progress",
                                detail.project
                                    .flash_latest_physical_progress ==
                                null
                                    ? "N/A"
                                    : `${Number(
                                          detail.project
                                              .flash_latest_physical_progress,
                                      ).toFixed(
                                          1,
                                      )}%`,
                            ],
                            [
                                "Original Cost",
                                detail.project
                                    .original_cost_cr ==
                                null
                                    ? "N/A"
                                    : formatCrore(
                                          Number(
                                              detail
                                                  .project
                                                  .original_cost_cr,
                                          ),
                                      ),
                            ],
                            [
                                "Expenditure",
                                detail.project
                                    .expenditure_cr ==
                                null
                                    ? "N/A"
                                    : formatCrore(
                                          Number(
                                              detail
                                                  .project
                                                  .expenditure_cr,
                                          ),
                                      ),
                            ],
                            [
                                "Alert Priority",
                                detail.risk
                                    .alert_priority,
                            ],
                        ].map(([key, value]) => (
                            <Card
                                key={String(key)}
                                padding="sm"
                            >
                                <div className="text-[9px] font-bold uppercase text-slate-400">
                                    {key}
                                </div>

                                <div className="mt-2 text-lg font-bold">
                                    {value ?? "N/A"}
                                </div>
                            </Card>
                        ))}
                    </div>

                    {/* RISK + PROJECT INFORMATION */}
                    <div className="grid gap-6 lg:grid-cols-2">
                        <Card>
                            <div className="mb-4 flex gap-2">
                                <ShieldAlert size={16} />

                                <h3 className="text-sm font-bold">
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
                            ].map(([key, value]) => (
                                <div
                                    key={String(key)}
                                    className="mb-4"
                                >
                                    <div className="mb-1 flex justify-between text-xs">
                                        <span>{key}</span>

                                        <b>
                                            {value == null
                                                ? "N/A"
                                                : `${Number(
                                                      value,
                                                  ).toFixed(
                                                      1,
                                                  )}%`}
                                        </b>
                                    </div>

                                    <div className="h-2 rounded-full bg-slate-100">
                                        <div
                                            className="h-2 rounded-full bg-slate-700"
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
                            ))}
                        </Card>

                        <Card>
                            <h3 className="mb-4 text-sm font-bold">
                                Project Information
                            </h3>

                            <div className="grid gap-3 sm:grid-cols-2">
                                {[
                                    [
                                        "Ministry",
                                        detail.project
                                            .ministry,
                                    ],
                                    [
                                        "Sector",
                                        detail.project
                                            .sector,
                                    ],
                                    [
                                        "State",
                                        detail.project
                                            .flash_state,
                                    ],
                                    [
                                        "Implementing Agency",
                                        detail.project
                                            .flash_implementing_agency,
                                    ],
                                    [
                                        "Schedule Status",
                                        detail.project
                                            .schedule_status,
                                    ],
                                    [
                                        "Cost Status",
                                        detail.project
                                            .cost_status,
                                    ],
                                    [
                                        "Original Completion",
                                        detail.project
                                            .original_end_date,
                                    ],
                                    [
                                        "Revised Completion",
                                        detail.project
                                            .revised_end_date,
                                    ],
                                    [
                                        "Data Quality",
                                        detail.project
                                            .data_quality_flag,
                                    ],
                                ].map(([key, value]) => (
                                    <div key={String(key)}>
                                        <div className="text-[9px] font-bold uppercase text-slate-400">
                                            {key}
                                        </div>

                                        <div className="mt-1 text-xs font-semibold">
                                            {value ?? "N/A"}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    </div>

                    {/* HISTORY */}
                    <div className="grid gap-6 lg:grid-cols-2">
                        <LineChart
                            title="Schedule Trajectory — Delay"
                            points={
                                detail.history.schedule
                            }
                            keyName="delay_days"
                            suffix=" days"
                        />

                        <LineChart
                            title="Expenditure Trajectory"
                            points={
                                detail.history.schedule
                            }
                            keyName="expenditure_cr"
                            suffix=" Cr"
                        />
                    </div>

                    <LineChart
                        title="Physical Progress Trajectory"
                        points={
                            detail.history.progress
                        }
                        keyName="physical_progress_pct"
                        suffix="%"
                    />

                    {/* REASONS */}
                    <Card>
                        <div className="mb-4 flex items-center gap-2">
                            <AlertTriangle size={17} />

                            <h3 className="text-sm font-bold">
                                Reasons for Delay &
                                Recommended Solutions
                            </h3>
                        </div>

                        {detail.reasons.map((reason) => (
                            <div
                                key={reason.title}
                                className="mb-3 rounded-xl border p-4"
                            >
                                <div className="flex gap-3">
                                    <AlertTriangle
                                        size={15}
                                        className="mt-0.5 text-red-600"
                                    />

                                    <div>
                                        <b className="text-xs">
                                            {
                                                reason.title
                                            }
                                        </b>

                                        <p className="mt-1 text-xs leading-5 text-slate-500">
                                            {
                                                reason.explanation
                                            }
                                        </p>

                                        <p className="mt-2 flex gap-2 text-xs leading-5 text-slate-600">
                                            <CheckCircle2
                                                size={14}
                                                className="mt-0.5 text-emerald-600"
                                            />

                                            <span>
                                                <b>
                                                    Recommended
                                                    solution:
                                                </b>{" "}
                                                {
                                                    reason.solution
                                                }
                                            </span>
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </Card>

                    {/* WHAT-IF SIMULATOR */}
                    <Card>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <div className="flex items-center gap-2">
                                    <SlidersHorizontal
                                        size={17}
                                    />

                                    <h3 className="text-sm font-bold">
                                        What-If Risk Simulator
                                    </h3>
                                </div>

                                <p className="mt-1 text-xs text-slate-400">
                                    Re-runs the supplied
                                    trained models on the
                                    latest project snapshot
                                    with your scenario changes.
                                </p>
                            </div>

                            <Button
                                onClick={simulateNow}
                                disabled={simLoading}
                            >
                                {simLoading
                                    ? "Running…"
                                    : "Run Simulation"}
                            </Button>
                        </div>

                        {/* SLIDERS */}
                        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                            {(
                                [
                                    [
                                        "progress_delta",
                                        "Physical progress change",
                                        -30,
                                        30,
                                        1,
                                    ],
                                    [
                                        "delay_delta",
                                        "Additional delay (days)",
                                        -365,
                                        365,
                                        5,
                                    ],
                                    [
                                        "expenditure_delta",
                                        "Monthly expenditure change (₹ Cr)",
                                        -200,
                                        200,
                                        5,
                                    ],
                                    [
                                        "revised_cost_delta",
                                        "Revised-cost change (₹ Cr)",
                                        -500,
                                        500,
                                        10,
                                    ],
                                ] as const
                            ).map(
                                ([
                                    key,
                                    label,
                                    min,
                                    max,
                                    step,
                                ]) => (
                                    <label
                                        key={key}
                                        className="rounded-xl border bg-slate-50 p-4"
                                    >
                                        <span className="text-[10px] font-bold uppercase text-slate-400">
                                            {label}
                                        </span>

                                        <div className="mt-2 text-lg font-bold">
                                            {scenario[key]}
                                        </div>

                                        <input
                                            className="mt-3 w-full"
                                            type="range"
                                            min={min}
                                            max={max}
                                            step={step}
                                            value={
                                                scenario[key]
                                            }
                                            onChange={(event) =>
                                                setScenario(
                                                    (
                                                        current,
                                                    ) => ({
                                                        ...current,
                                                        [key]: Number(
                                                            event
                                                                .target
                                                                .value,
                                                        ),
                                                    }),
                                                )
                                            }
                                        />
                                    </label>
                                ),
                            )}
                        </div>

                        {/* SIMULATION RESULT */}
                        {simulation && (
                            <div className="mt-6">
                                <div className="grid gap-4 md:grid-cols-3">
                                    {[
                                        [
                                            "Overall Risk Score",
                                            "overall_risk",
                                            false,
                                        ],
                                        [
                                            "Future Delay",
                                            "delay_probability",
                                            true,
                                        ],
                                        [
                                            "Progress Stall",
                                            "stall_probability",
                                            true,
                                        ],
                                    ].map(
                                        ([
                                            label,
                                            key,
                                            isProbability,
                                        ]) => {
                                            const baseline =
                                                Number(
                                                    simulation
                                                        .baseline[
                                                        key
                                                    ],
                                                );

                                            const scenarioValue =
                                                Number(
                                                    simulation
                                                        .scenario[
                                                        key
                                                    ],
                                                );

                                            const multiplier =
                                                isProbability
                                                    ? 100
                                                    : 1;

                                            return (
                                                <Card
                                                    key={String(
                                                        label,
                                                    )}
                                                    padding="sm"
                                                >
                                                    <div className="text-[9px] font-bold uppercase text-slate-400">
                                                        {label}
                                                    </div>

                                                    <div className="mt-2 flex justify-between">
                                                        <div>
                                                            <div className="text-xl font-bold">
                                                                {(
                                                                    scenarioValue *
                                                                    multiplier
                                                                ).toFixed(
                                                                    1,
                                                                )}
                                                                {isProbability
                                                                    ? "%"
                                                                    : "/100"}
                                                            </div>

                                                            <div className="text-[10px] text-slate-400">
                                                                Baseline{" "}
                                                                {(
                                                                    baseline *
                                                                    multiplier
                                                                ).toFixed(
                                                                    1,
                                                                )}
                                                                {isProbability
                                                                    ? "%"
                                                                    : "/100"}
                                                            </div>
                                                        </div>

                                                        {scenarioValue >
                                                        baseline ? (
                                                            <TrendingUp
                                                                className="text-red-500"
                                                                size={
                                                                    18
                                                                }
                                                            />
                                                        ) : scenarioValue <
                                                          baseline ? (
                                                            <TrendingDown
                                                                className="text-emerald-500"
                                                                size={
                                                                    18
                                                                }
                                                            />
                                                        ) : null}
                                                    </div>
                                                </Card>
                                            );
                                        },
                                    )}
                                </div>

                                <div className="mt-4 rounded-xl bg-slate-50 p-4 text-xs text-slate-600">
                                    Scenario risk level:{" "}
                                    <b>
                                        {
                                            simulation
                                                .scenario
                                                .risk_level
                                        }
                                    </b>
                                    .{" "}
                                    {Number(
                                        simulation.scenario
                                            .overall_risk,
                                    ) >
                                    Number(
                                        simulation.baseline
                                            .overall_risk,
                                    )
                                        ? "Risk increases under this scenario."
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
                                          ? "Risk decreases under this scenario."
                                          : "Risk remains unchanged."}
                                </div>
                            </div>
                        )}
                    </Card>
                </div>
            )}
        </div>
    );
}