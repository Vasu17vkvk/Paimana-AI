import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
    AlertTriangle,
    CalendarDays,
    Clock3,
    Search,
    ShieldAlert,
    TrendingDown,
} from "lucide-react";

import {
    getProjectDelay,
    type ProjectDelayPrediction,
} from "../../services/delayApi";

function riskBadgeClass(
    level: ProjectDelayPrediction["risk_level"],
): string {
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

function riskScoreClass(
    level: ProjectDelayPrediction["risk_level"],
): string {
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

export default function DelayPredictionPage() {
    const [projectCode, setProjectCode] = useState("400005");
    const [analyzedProject, setAnalyzedProject] = useState("400005");

    const {
        data,
        isLoading,
        isError,
        error,
    } = useQuery({
        queryKey: ["project-delay", analyzedProject],
        queryFn: () => getProjectDelay(analyzedProject),
        enabled: Boolean(analyzedProject),
        staleTime: 30_000,
    });

    function handleAnalyze() {
        const value = projectCode.trim();

        if (!value) {
            return;
        }

        setAnalyzedProject(value);
    }

    const probabilityPct = data
        ? data.future_delay_probability * 100
        : 0;

    return (
        <div className="min-h-full bg-slate-50 p-4 sm:p-6">
            <div className="mx-auto max-w-6xl space-y-5">

                {/* Header */}
                <div>
                    <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                        <Clock3 size={13} />
                        Schedule Intelligence
                    </div>

                    <h1 className="text-xl font-semibold tracking-tight text-slate-900">
                        Delay Prediction
                    </h1>

                    <p className="mt-1 text-sm text-slate-500">
                        Predictive assessment of future project schedule delay.
                    </p>
                </div>

                {/* Project search */}
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        Project Code
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row">
                        <div className="relative flex-1">
                            <Search
                                size={15}
                                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                            />

                            <input
                                value={projectCode}
                                onChange={(event) =>
                                    setProjectCode(event.target.value)
                                }
                                onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                        handleAnalyze();
                                    }
                                }}
                                placeholder="Enter project code"
                                className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-700 outline-none focus:border-slate-400 focus:bg-white"
                            />
                        </div>

                        <button
                            type="button"
                            onClick={handleAnalyze}
                            disabled={isLoading}
                            className="h-10 rounded-lg bg-slate-900 px-4 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isLoading ? "Analyzing..." : "Analyze Project"}
                        </button>
                    </div>
                </div>

                {/* Loading */}
                {isLoading && (
                    <div className="rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm">
                        <div className="text-sm font-medium text-slate-700">
                            Running delay prediction...
                        </div>

                        <div className="mt-1 text-xs text-slate-400">
                            Fetching the latest ML assessment.
                        </div>
                    </div>
                )}

                {/* Error */}
                {isError && (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-5">
                        <div className="flex items-center gap-2 text-sm font-semibold text-red-700">
                            <AlertTriangle size={16} />
                            Unable to load delay prediction
                        </div>

                        <div className="mt-1 text-xs text-red-600">
                            {error instanceof Error
                                ? error.message
                                : "The backend returned an unexpected error."}
                        </div>
                    </div>
                )}

                {/* Result */}
                {!isLoading && !isError && data && (
                    <>
                        {/* Project overview */}
                        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                        Project
                                    </div>

                                    <div className="mt-1 text-lg font-semibold text-slate-900">
                                        {data.project_code}
                                    </div>

                                    <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
                                        <CalendarDays size={13} />
                                        Snapshot {data.snapshot_month}/{data.snapshot_year}
                                    </div>
                                </div>

                                <span
                                    className={`inline-flex w-fit rounded-full border px-2.5 py-1 text-[10px] font-semibold ${riskBadgeClass(
                                        data.risk_level,
                                    )}`}
                                >
                                    {data.risk_level} RISK
                                </span>
                            </div>
                        </div>

                        {/* KPI cards */}
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                                <div className="flex items-center gap-2">
                                    <div className="rounded-lg bg-slate-100 p-2">
                                        <Clock3 size={15} className="text-slate-500" />
                                    </div>

                                    <span className="text-xs font-medium text-slate-500">
                                        Future Delay Probability
                                    </span>
                                </div>

                                <div
                                    className={`mt-4 text-2xl font-semibold ${riskScoreClass(
                                        data.risk_level,
                                    )}`}
                                >
                                    {probabilityPct.toFixed(1)}%
                                </div>

                                <div className="mt-1 text-[11px] text-slate-400">
                                    ML predicted probability
                                </div>
                            </div>

                            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                                <div className="flex items-center gap-2">
                                    <div className="rounded-lg bg-slate-100 p-2">
                                        <ShieldAlert size={15} className="text-slate-500" />
                                    </div>

                                    <span className="text-xs font-medium text-slate-500">
                                        Risk Level
                                    </span>
                                </div>

                                <div className="mt-4">
                                    <span
                                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${riskBadgeClass(
                                            data.risk_level,
                                        )}`}
                                    >
                                        {data.risk_level}
                                    </span>
                                </div>

                                <div className="mt-2 text-[11px] text-slate-400">
                                    Current ML classification
                                </div>
                            </div>

                            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                                <div className="flex items-center gap-2">
                                    <div className="rounded-lg bg-slate-100 p-2">
                                        <TrendingDown size={15} className="text-slate-500" />
                                    </div>

                                    <span className="text-xs font-medium text-slate-500">
                                        Schedule Signal
                                    </span>
                                </div>

                                <div
                                    className={`mt-4 text-2xl font-semibold ${riskScoreClass(
                                        data.risk_level,
                                    )}`}
                                >
                                    {probabilityPct >= 70
                                        ? "Severe"
                                        : probabilityPct >= 40
                                            ? "Elevated"
                                            : "Stable"}
                                </div>

                                <div className="mt-1 text-[11px] text-slate-400">
                                    Based on predicted delay probability
                                </div>
                            </div>
                        </div>

                        {/* Interpretation */}
                        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                            <div className="flex items-center gap-2">
                                <AlertTriangle
                                    size={16}
                                    className="text-slate-500"
                                />

                                <h2 className="text-sm font-semibold text-slate-800">
                                    Schedule Assessment
                                </h2>
                            </div>

                            <p className="mt-3 text-sm leading-6 text-slate-600">
                                The current ML model estimates a{" "}
                                <span className="font-semibold text-slate-900">
                                    {probabilityPct.toFixed(1)}%
                                </span>{" "}
                                probability of future delay for project{" "}
                                <span className="font-semibold text-slate-900">
                                    {data.project_code}
                                </span>
                                .
                            </p>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}