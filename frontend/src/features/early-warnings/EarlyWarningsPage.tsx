import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
    AlertTriangle,
    Bell,
    CalendarDays,
    ChevronRight,
    Clock3,
    Search,
    ShieldAlert,
    TrendingDown,
} from "lucide-react";

import {
    getActiveWarnings,
    type ActiveWarning,
} from "../../services/warningsApi";

function formatReason(reason: string): string {
    switch (reason) {
        case "future_delay":
            return "Future Delay";
        case "progress_stall":
            return "Progress Stall";
        case "cost_pressure":
            return "Cost Pressure";
        default:
            return reason
                .replaceAll("_", " ")
                .replace(/\b\w/g, (char) => char.toUpperCase());
    }
}

function riskBadgeClass(level: ActiveWarning["risk_level"]): string {
    switch (level) {
        case "CRITICAL":
            return "border-red-200 bg-red-50 text-red-700";
        case "HIGH":
            return "border-orange-200 bg-orange-50 text-orange-700";
        case "MEDIUM":
            return "border-yellow-200 bg-yellow-50 text-yellow-700";
        default:
            return "border-emerald-200 bg-emerald-50 text-emerald-700";
    }
}

function priorityBadgeClass(
    priority: ActiveWarning["early_warning_priority"],
): string {
    switch (priority) {
        case "IMMEDIATE":
            return "border-red-200 bg-red-50 text-red-700";
        case "HIGH":
            return "border-orange-200 bg-orange-50 text-orange-700";
        default:
            return "border-slate-200 bg-slate-50 text-slate-600";
    }
}

function riskScoreClass(level: ActiveWarning["risk_level"]): string {
    switch (level) {
        case "CRITICAL":
            return "text-red-600";
        case "HIGH":
            return "text-orange-600";
        case "MEDIUM":
            return "text-yellow-600";
        default:
            return "text-emerald-600";
    }
}

export default function EarlyWarningsPage() {
    const [search, setSearch] = useState("");
    const [selectedWarning, setSelectedWarning] =
        useState<ActiveWarning | null>(null);

    const {
        data: warnings = [],
        isLoading,
        isError,
        error,
        refetch,
    } = useQuery({
        queryKey: ["active-warnings"],
        queryFn: getActiveWarnings,
        staleTime: 30_000,
        refetchInterval: 60_000,
    });

    const filteredWarnings = useMemo(() => {
        const query = search.trim().toLowerCase();

        if (!query) {
            return warnings;
        }

        return warnings.filter((warning) => {
            return (
                warning.project_code.toLowerCase().includes(query) ||
                warning.risk_level.toLowerCase().includes(query) ||
                warning.early_warning_priority.toLowerCase().includes(query) ||
                warning.early_warning_reasons.some((reason) =>
                    reason.toLowerCase().includes(query),
                )
            );
        });
    }, [warnings, search]);

    const criticalCount = warnings.filter(
        (warning) => warning.risk_level === "CRITICAL",
    ).length;

    const highCount = warnings.filter(
        (warning) => warning.risk_level === "HIGH",
    ).length;

    const immediateCount = warnings.filter(
        (warning) => warning.early_warning_priority === "IMMEDIATE",
    ).length;

    return (
        <div className="min-h-full bg-slate-50 p-4 sm:p-6">
            <div className="mx-auto max-w-7xl space-y-5">
                {/* Header */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                            <ShieldAlert size={13} />
                            Monitoring Intelligence
                        </div>

                        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
                            Early Warnings
                        </h1>

                        <p className="mt-1 text-sm text-slate-500">
                            Live ML-generated warnings requiring project-level attention.
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={() => refetch()}
                        className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
                    >
                        <Bell size={14} />
                        Refresh
                    </button>
                </div>

                {/* Summary cards */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-slate-500">
                                Active Warnings
                            </span>

                            <AlertTriangle size={16} className="text-slate-400" />
                        </div>

                        <div className="mt-2 text-2xl font-semibold text-slate-900">
                            {warnings.length}
                        </div>
                    </div>

                    <div className="rounded-xl border border-red-100 bg-white p-4 shadow-sm">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-slate-500">
                                Critical
                            </span>

                            <ShieldAlert size={16} className="text-red-500" />
                        </div>

                        <div className="mt-2 text-2xl font-semibold text-red-600">
                            {criticalCount}
                        </div>
                    </div>

                    <div className="rounded-xl border border-orange-100 bg-white p-4 shadow-sm">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-slate-500">
                                Immediate
                            </span>

                            <Clock3 size={16} className="text-orange-500" />
                        </div>

                        <div className="mt-2 text-2xl font-semibold text-orange-600">
                            {immediateCount}
                        </div>

                        <div className="mt-1 text-[11px] text-slate-400">
                            {highCount} high-risk projects
                        </div>
                    </div>
                </div>

                {/* Search */}
                <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                    <div className="relative">
                        <Search
                            size={15}
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                        />

                        <input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Search project, risk or warning reason..."
                            className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white"
                        />
                    </div>
                </div>

                {/* Loading */}
                {isLoading && (
                    <div className="rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm">
                        <div className="text-sm font-medium text-slate-700">
                            Loading active warnings...
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                            Fetching the latest ML predictions.
                        </div>
                    </div>
                )}

                {/* Error */}
                {isError && (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-5">
                        <div className="text-sm font-semibold text-red-700">
                            Unable to load active warnings
                        </div>

                        <div className="mt-1 text-xs text-red-600">
                            {error instanceof Error
                                ? error.message
                                : "The backend returned an unexpected error."}
                        </div>

                        <button
                            type="button"
                            onClick={() => refetch()}
                            className="mt-3 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50"
                        >
                            Try again
                        </button>
                    </div>
                )}

                {/* Empty */}
                {!isLoading && !isError && filteredWarnings.length === 0 && (
                    <div className="rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm">
                        <ShieldAlert
                            size={28}
                            className="mx-auto text-emerald-500"
                        />

                        <div className="mt-3 text-sm font-semibold text-slate-800">
                            No active warnings found
                        </div>

                        <div className="mt-1 text-xs text-slate-400">
                            {search
                                ? "Try a different search term."
                                : "The ML engine currently has no active warnings."}
                        </div>
                    </div>
                )}

                {/* Warning list */}
                {!isLoading && !isError && filteredWarnings.length > 0 && (
                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                        <div className="border-b border-slate-100 px-4 py-3">
                            <div className="text-sm font-semibold text-slate-800">
                                Active Project Warnings
                            </div>

                            <div className="mt-0.5 text-xs text-slate-400">
                                Showing {filteredWarnings.length} of {warnings.length} active
                                warnings
                            </div>
                        </div>

                        <div className="divide-y divide-slate-100">
                            {filteredWarnings.map((warning) => (
                                <button
                                    key={`${warning.project_code}-${warning.snapshot_year}-${warning.snapshot_month}`}
                                    type="button"
                                    onClick={() => setSelectedWarning(warning)}
                                    className="group grid w-full grid-cols-1 gap-3 px-4 py-4 text-left transition hover:bg-slate-50 md:grid-cols-[1.3fr_0.8fr_0.8fr_1.6fr_auto] md:items-center"
                                >
                                    {/* Project */}
                                    <div>
                                        <div className="text-sm font-semibold text-slate-900">
                                            Project {warning.project_code}
                                        </div>

                                        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-400">
                                            <CalendarDays size={12} />

                                            Snapshot{" "}
                                            {warning.snapshot_month}/{warning.snapshot_year}
                                        </div>
                                    </div>

                                    {/* Risk */}
                                    <div>
                                        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                            Risk
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <span
                                                className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold ${riskBadgeClass(
                                                    warning.risk_level,
                                                )}`}
                                            >
                                                {warning.risk_level}
                                            </span>

                                            <span
                                                className={`text-sm font-semibold ${riskScoreClass(
                                                    warning.risk_level,
                                                )}`}
                                            >
                                                {warning.overall_risk_score.toFixed(2)}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Priority */}
                                    <div>
                                        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                            Priority
                                        </div>

                                        <span
                                            className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold ${priorityBadgeClass(
                                                warning.early_warning_priority,
                                            )}`}
                                        >
                                            {warning.early_warning_priority}
                                        </span>
                                    </div>

                                    {/* Reasons */}
                                    <div>
                                        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                            Drivers
                                        </div>

                                        <div className="flex flex-wrap gap-1.5">
                                            {warning.early_warning_reasons.map((reason) => (
                                                <span
                                                    key={reason}
                                                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-medium text-slate-600"
                                                >
                                                    {reason === "cost_pressure" ? (
                                                        <TrendingDown size={11} />
                                                    ) : (
                                                        <AlertTriangle size={11} />
                                                    )}

                                                    {formatReason(reason)}
                                                </span>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Arrow */}
                                    <div className="hidden justify-end md:flex">
                                        <ChevronRight
                                            size={16}
                                            className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500"
                                        />
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Detail drawer */}
                {selectedWarning && (
                    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/30 p-0 sm:items-center sm:p-4">
                        <div className="max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:max-w-lg sm:rounded-2xl">
                            <div className="border-b border-slate-100 px-5 py-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                                            Early Warning
                                        </div>

                                        <h2 className="mt-1 text-lg font-semibold text-slate-900">
                                            Project {selectedWarning.project_code}
                                        </h2>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => setSelectedWarning(null)}
                                        className="rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                    >
                                        Close
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-5 p-5">
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                                        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                            Risk Score
                                        </div>

                                        <div
                                            className={`mt-1 text-xl font-semibold ${riskScoreClass(
                                                selectedWarning.risk_level,
                                            )}`}
                                        >
                                            {selectedWarning.overall_risk_score.toFixed(2)}
                                        </div>
                                    </div>

                                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                                        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                            Risk Level
                                        </div>

                                        <div className="mt-2">
                                            <span
                                                className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold ${riskBadgeClass(
                                                    selectedWarning.risk_level,
                                                )}`}
                                            >
                                                {selectedWarning.risk_level}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <div className="mb-2 text-xs font-semibold text-slate-800">
                                        Warning Priority
                                    </div>

                                    <span
                                        className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${priorityBadgeClass(
                                            selectedWarning.early_warning_priority,
                                        )}`}
                                    >
                                        {selectedWarning.early_warning_priority}
                                    </span>
                                </div>

                                <div>
                                    <div className="mb-2 text-xs font-semibold text-slate-800">
                                        Warning Drivers
                                    </div>

                                    <div className="space-y-2">
                                        {selectedWarning.early_warning_reasons.map((reason) => (
                                            <div
                                                key={reason}
                                                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-700"
                                            >
                                                {formatReason(reason)}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                        ML Snapshot
                                    </div>

                                    <div className="mt-1 text-sm font-medium text-slate-800">
                                        {selectedWarning.snapshot_month}/
                                        {selectedWarning.snapshot_year}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}