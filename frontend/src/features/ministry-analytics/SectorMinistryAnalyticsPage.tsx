import { useEffect, useMemo, useState } from "react";
import {
    BarChart3,
    Building2,
    Search,
    TrendingDown,
    TrendingUp,
    Activity,
    AlertTriangle,
} from "lucide-react";

import { apiRequest } from "../../services/api";

type SectorRow = {
    sector: string;
    projects: number;
    average_delay_days: number;
    average_cost_overrun_pct: number;
    average_progress_pct: number;
};

type MinistryRow = {
    ministry: string;
    projects: number;
    average_delay_days: number;
    average_cost_overrun_pct: number;
    average_progress_pct: number;
};

type Tab = "sector" | "ministry";

function MetricCard({
    title,
    value,
    subtitle,
    icon,
}: {
    title: string;
    value: string;
    subtitle: string;
    icon: React.ReactNode;
}) {
    return (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                        {title}
                    </p>

                    <p className="mt-2 text-2xl font-bold text-slate-800">
                        {value}
                    </p>

                    <p className="mt-1 text-[10px] text-slate-400">
                        {subtitle}
                    </p>
                </div>

                <div className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-600">
                    {icon}
                </div>
            </div>
        </div>
    );
}

function ProgressBar({
    value,
    max,
}: {
    value: number;
    max: number;
}) {
    const percentage =
        max > 0
            ? Math.min((value / max) * 100, 100)
            : 0;

    return (
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
                className="h-full rounded-full bg-slate-700 transition-all"
                style={{
                    width: `${percentage}%`,
                }}
            />
        </div>
    );
}

export default function SectorMinistryAnalyticsPage() {
    const [sectorData, setSectorData] = useState<SectorRow[]>([]);
    const [ministryData, setMinistryData] = useState<MinistryRow[]>([]);

    const [activeTab, setActiveTab] =
        useState<Tab>("sector");

    const [search, setSearch] = useState("");

    const [loading, setLoading] =
        useState(true);

    const [error, setError] =
        useState("");

    useEffect(() => {
        let cancelled = false;

        async function loadAnalytics() {
            try {
                setLoading(true);
                setError("");

                const [sectors, ministries] =
                    await Promise.all([
                        apiRequest<SectorRow[]>(
                            "/analytics/sectors",
                        ),
                        apiRequest<MinistryRow[]>(
                            "/analytics/ministries",
                        ),
                    ]);

                if (cancelled) return;

                setSectorData(
                    Array.isArray(sectors)
                        ? sectors
                        : [],
                );

                setMinistryData(
                    Array.isArray(ministries)
                        ? ministries
                        : [],
                );
            } catch (err) {
                if (cancelled) return;

                setError(
                    err instanceof Error
                        ? err.message
                        : "Failed to load analytics.",
                );
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        loadAnalytics();

        return () => {
            cancelled = true;
        };
    }, []);

    const activeData =
        activeTab === "sector"
            ? sectorData
            : ministryData;

    const filteredData = useMemo(() => {
        const query =
            search.trim().toLowerCase();

        if (!query) {
            return activeData;
        }

        return activeData.filter((item) => {
            const name =
                activeTab === "sector"
                    ? (item as SectorRow).sector
                    : (item as MinistryRow).ministry;

            return name
                .toLowerCase()
                .includes(query);
        });
    }, [activeData, activeTab, search]);

    const stats = useMemo(() => {
        if (!activeData.length) {
            return {
                totalProjects: 0,
                averageDelay: 0,
                averageCost: 0,
                averageProgress: 0,
            };
        }

        const totalProjects =
            activeData.reduce(
                (sum, item) =>
                    sum + Number(item.projects || 0),
                0,
            );

        const weightedDelay =
            activeData.reduce(
                (sum, item) =>
                    sum +
                    Number(
                        item.average_delay_days || 0,
                    ) *
                        Number(
                            item.projects || 0,
                        ),
                0,
            );

        const weightedCost =
            activeData.reduce(
                (sum, item) =>
                    sum +
                    Number(
                        item.average_cost_overrun_pct ||
                            0,
                    ) *
                        Number(
                            item.projects || 0,
                        ),
                0,
            );

        const weightedProgress =
            activeData.reduce(
                (sum, item) =>
                    sum +
                    Number(
                        item.average_progress_pct || 0,
                    ) *
                        Number(
                            item.projects || 0,
                        ),
                0,
            );

        return {
            totalProjects,
            averageDelay:
                totalProjects > 0
                    ? weightedDelay / totalProjects
                    : 0,
            averageCost:
                totalProjects > 0
                    ? weightedCost / totalProjects
                    : 0,
            averageProgress:
                totalProjects > 0
                    ? weightedProgress / totalProjects
                    : 0,
        };
    }, [activeData]);

    const topProjectCount =
        activeData.length > 0
            ? Math.max(
                  ...activeData.map((item) =>
                      Number(item.projects || 0),
                  ),
              )
            : 0;

    const highestDelay = useMemo(() => {
        if (!activeData.length) return null;

        return [...activeData].sort(
            (a, b) =>
                Number(
                    b.average_delay_days || 0,
                ) -
                Number(
                    a.average_delay_days || 0,
                ),
        )[0];
    }, [activeData]);

    const highestCost = useMemo(() => {
        if (!activeData.length) return null;

        return [...activeData].sort(
            (a, b) =>
                Number(
                    b.average_cost_overrun_pct ||
                        0,
                ) -
                Number(
                    a.average_cost_overrun_pct ||
                        0,
                ),
        )[0];
    }, [activeData]);

    const lowestProgress = useMemo(() => {
        if (!activeData.length) return null;

        return [...activeData].sort(
            (a, b) =>
                Number(
                    a.average_progress_pct || 0,
                ) -
                Number(
                    b.average_progress_pct || 0,
                ),
        )[0];
    }, [activeData]);

    const getName = (
        item: SectorRow | MinistryRow,
    ) => {
        return activeTab === "sector"
            ? (item as SectorRow).sector
            : (item as MinistryRow).ministry;
    };

    return (
        <div className="min-h-full bg-slate-50 p-3 sm:p-5 lg:p-7">
            {/* Header */}
            <div className="mb-5">
                <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                            PAIMANA AI
                        </p>

                        <h1 className="mt-1 text-2xl font-bold text-slate-800">
                            Sector & Ministry Analytics
                        </h1>

                        <p className="mt-1 max-w-2xl text-xs text-slate-500">
                            Compare infrastructure project
                            performance, delays, cost pressure
                            and physical progress across
                            sectors and ministries.
                        </p>
                    </div>

                    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-medium text-slate-500 shadow-sm">
                        <Activity size={14} />
                        Live PostgreSQL analytics
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="mb-5 flex w-full max-w-md rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
                <button
                    type="button"
                    onClick={() => {
                        setActiveTab("sector");
                        setSearch("");
                    }}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-xs font-bold transition ${
                        activeTab === "sector"
                            ? "bg-slate-800 text-white"
                            : "text-slate-500 hover:bg-slate-50"
                    }`}
                >
                    <BarChart3 size={15} />
                    Sector Analytics
                </button>

                <button
                    type="button"
                    onClick={() => {
                        setActiveTab("ministry");
                        setSearch("");
                    }}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-xs font-bold transition ${
                        activeTab === "ministry"
                            ? "bg-slate-800 text-white"
                            : "text-slate-500 hover:bg-slate-50"
                    }`}
                >
                    <Building2 size={15} />
                    Ministry Analytics
                </button>
            </div>

            {/* Loading */}
            {loading && (
                <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
                    <div className="mx-auto h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-slate-700" />

                    <p className="mt-3 text-xs text-slate-500">
                        Loading analytics...
                    </p>
                </div>
            )}

            {/* Error */}
            {!loading && error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-red-700">
                        <AlertTriangle size={17} />
                        Unable to load analytics
                    </div>

                    <p className="mt-1 text-xs text-red-600">
                        {error}
                    </p>
                </div>
            )}

            {!loading && !error && (
                <>
                    {/* KPI Cards */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <MetricCard
                            title="Total Projects"
                            value={stats.totalProjects.toLocaleString()}
                            subtitle={`Across ${activeData.length} ${
                                activeTab === "sector"
                                    ? "sectors"
                                    : "ministries"
                            }`}
                            icon={
                                <BarChart3
                                    size={17}
                                />
                            }
                        />

                        <MetricCard
                            title="Average Delay"
                            value={`${stats.averageDelay.toFixed(
                                1,
                            )} days`}
                            subtitle="Weighted portfolio average"
                            icon={
                                <TrendingUp
                                    size={17}
                                />
                            }
                        />

                        <MetricCard
                            title="Average Cost Overrun"
                            value={`${stats.averageCost.toFixed(
                                1,
                            )}%`}
                            subtitle="Weighted portfolio average"
                            icon={
                                <TrendingUp
                                    size={17}
                                />
                            }
                        />

                        <MetricCard
                            title="Average Progress"
                            value={`${stats.averageProgress.toFixed(
                                1,
                            )}%`}
                            subtitle="Latest physical progress"
                            icon={
                                <TrendingDown
                                    size={17}
                                />
                            }
                        />
                    </div>

                    {/* AI Insights */}
                    <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="flex items-center gap-2">
                            <div className="grid h-8 w-8 place-items-center rounded-lg bg-slate-800 text-white">
                                <Activity
                                    size={15}
                                />
                            </div>

                            <div>
                                <h2 className="text-sm font-bold text-slate-800">
                                    AI Portfolio Insights
                                </h2>

                                <p className="text-[10px] text-slate-400">
                                    Automatically generated from
                                    current analytics
                                </p>
                            </div>
                        </div>

                        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                            <div className="rounded-lg bg-slate-50 p-3">
                                <p className="text-[9px] font-bold uppercase text-slate-400">
                                    Highest delay
                                </p>

                                <p className="mt-1 text-xs font-bold text-slate-700">
                                    {highestDelay
                                        ? getName(
                                              highestDelay,
                                          )
                                        : "N/A"}
                                </p>

                                <p className="mt-1 text-[10px] text-slate-500">
                                    {highestDelay
                                        ? `${Number(
                                              highestDelay.average_delay_days,
                                          ).toFixed(
                                              1,
                                          )} days average delay`
                                        : "No data available"}
                                </p>
                            </div>

                            <div className="rounded-lg bg-slate-50 p-3">
                                <p className="text-[9px] font-bold uppercase text-slate-400">
                                    Highest cost pressure
                                </p>

                                <p className="mt-1 text-xs font-bold text-slate-700">
                                    {highestCost
                                        ? getName(
                                              highestCost,
                                          )
                                        : "N/A"}
                                </p>

                                <p className="mt-1 text-[10px] text-slate-500">
                                    {highestCost
                                        ? `${Number(
                                              highestCost.average_cost_overrun_pct,
                                          ).toFixed(
                                              1,
                                          )}% average cost overrun`
                                        : "No data available"}
                                </p>
                            </div>

                            <div className="rounded-lg bg-slate-50 p-3">
                                <p className="text-[9px] font-bold uppercase text-slate-400">
                                    Lowest progress
                                </p>

                                <p className="mt-1 text-xs font-bold text-slate-700">
                                    {lowestProgress
                                        ? getName(
                                              lowestProgress,
                                          )
                                        : "N/A"}
                                </p>

                                <p className="mt-1 text-[10px] text-slate-500">
                                    {lowestProgress
                                        ? `${Number(
                                              lowestProgress.average_progress_pct,
                                          ).toFixed(
                                              1,
                                          )}% average progress`
                                        : "No data available"}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Search */}
                    <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <h2 className="text-sm font-bold text-slate-800">
                                {activeTab === "sector"
                                    ? "Sector Performance"
                                    : "Ministry Performance"}
                            </h2>

                            <p className="mt-0.5 text-[10px] text-slate-400">
                                {filteredData.length} results
                            </p>
                        </div>

                        <div className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 sm:max-w-xs">
                            <Search
                                size={15}
                                className="shrink-0 text-slate-400"
                            />

                            <input
                                type="search"
                                value={search}
                                onChange={(event) =>
                                    setSearch(
                                        event.target.value,
                                    )
                                }
                                placeholder={
                                    activeTab === "sector"
                                        ? "Search sector..."
                                        : "Search ministry..."
                                }
                                className="w-full bg-transparent py-2.5 text-xs text-slate-700 outline-none placeholder:text-slate-400"
                            />
                        </div>
                    </div>

                    {/* Chart */}
                    <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="mb-4">
                            <h3 className="text-xs font-bold text-slate-700">
                                Project Distribution
                            </h3>

                            <p className="text-[10px] text-slate-400">
                                Number of projects by{" "}
                                {activeTab === "sector"
                                    ? "sector"
                                    : "ministry"}
                            </p>
                        </div>

                        <div className="space-y-3">
                            {filteredData.map(
                                (item) => {
                                    const projects =
                                        Number(
                                            item.projects ||
                                                0,
                                        );

                                    return (
                                        <div
                                            key={getName(
                                                item,
                                            )}
                                        >
                                            <div className="mb-1 flex items-center justify-between gap-3">
                                                <span className="min-w-0 truncate text-[10px] font-semibold text-slate-600">
                                                    {getName(
                                                        item,
                                                    )}
                                                </span>

                                                <span className="shrink-0 text-[10px] font-bold text-slate-800">
                                                    {projects.toLocaleString()}
                                                </span>
                                            </div>

                                            <ProgressBar
                                                value={
                                                    projects
                                                }
                                                max={
                                                    topProjectCount
                                                }
                                            />
                                        </div>
                                    );
                                },
                            )}
                        </div>
                    </div>

                    {/* Detailed Table */}
                    <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[760px] border-collapse">
                                <thead>
                                    <tr className="border-b border-slate-200 bg-slate-50">
                                        <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-wide text-slate-400">
                                            #
                                        </th>

                                        <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-wide text-slate-400">
                                            {activeTab ===
                                            "sector"
                                                ? "Sector"
                                                : "Ministry"}
                                        </th>

                                        <th className="px-4 py-3 text-right text-[9px] font-bold uppercase tracking-wide text-slate-400">
                                            Projects
                                        </th>

                                        <th className="px-4 py-3 text-right text-[9px] font-bold uppercase tracking-wide text-slate-400">
                                            Avg Delay
                                        </th>

                                        <th className="px-4 py-3 text-right text-[9px] font-bold uppercase tracking-wide text-slate-400">
                                            Avg Cost Overrun
                                        </th>

                                        <th className="px-4 py-3 text-right text-[9px] font-bold uppercase tracking-wide text-slate-400">
                                            Avg Progress
                                        </th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {filteredData.map(
                                        (
                                            item,
                                            index,
                                        ) => {
                                            const delay =
                                                Number(
                                                    item.average_delay_days ||
                                                        0,
                                                );

                                            const cost =
                                                Number(
                                                    item.average_cost_overrun_pct ||
                                                        0,
                                                );

                                            const progress =
                                                Number(
                                                    item.average_progress_pct ||
                                                        0,
                                                );

                                            return (
                                                <tr
                                                    key={`${getName(
                                                        item,
                                                    )}-${index}`}
                                                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                                                >
                                                    <td className="px-4 py-3 text-[10px] font-semibold text-slate-400">
                                                        {index +
                                                            1}
                                                    </td>

                                                    <td className="max-w-[300px] px-4 py-3 text-[11px] font-semibold text-slate-700">
                                                        <div className="truncate">
                                                            {getName(
                                                                item,
                                                            )}
                                                        </div>
                                                    </td>

                                                    <td className="px-4 py-3 text-right text-[11px] font-bold text-slate-700">
                                                        {Number(
                                                            item.projects ||
                                                                0,
                                                        ).toLocaleString()}
                                                    </td>

                                                    <td
                                                        className={`px-4 py-3 text-right text-[11px] font-semibold ${
                                                            delay >
                                                            365
                                                                ? "text-red-600"
                                                                : "text-slate-600"
                                                        }`}
                                                    >
                                                        {delay.toFixed(
                                                            1,
                                                        )}{" "}
                                                        days
                                                    </td>

                                                    <td
                                                        className={`px-4 py-3 text-right text-[11px] font-semibold ${
                                                            cost >
                                                            20
                                                                ? "text-red-600"
                                                                : "text-slate-600"
                                                        }`}
                                                    >
                                                        {cost.toFixed(
                                                            1,
                                                        )}
                                                        %
                                                    </td>

                                                    <td
                                                        className={`px-4 py-3 text-right text-[11px] font-semibold ${
                                                            progress <
                                                            60
                                                                ? "text-amber-600"
                                                                : "text-emerald-600"
                                                        }`}
                                                    >
                                                        {progress.toFixed(
                                                            1,
                                                        )}
                                                        %
                                                    </td>
                                                </tr>
                                            );
                                        },
                                    )}

                                    {!filteredData.length && (
                                        <tr>
                                            <td
                                                colSpan={
                                                    6
                                                }
                                                className="px-4 py-10 text-center text-xs text-slate-400"
                                            >
                                                No matching{" "}
                                                {activeTab ===
                                                "sector"
                                                    ? "sectors"
                                                    : "ministries"}{" "}
                                                found.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}