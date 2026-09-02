import { useState } from "react";
import { apiRequest } from "../../services/api";

interface RiskPrediction {
    project_code: string | number;
    snapshot_month?: string;
    risk_level: string;
    overall_risk_score: number;
    cost_risk_score: number;
    future_delay_probability: number;
    future_progress_stall_probability: number;
    predicted_cost_overrun_pct: number;
    early_warning_active: boolean;
    early_warning_priority: string;
}

function riskClass(level: string) {
    switch (level) {
        case "CRITICAL":
            return "bg-red-50 text-red-600 border-red-200";
        case "HIGH":
            return "bg-orange-50 text-orange-600 border-orange-200";
        case "MEDIUM":
            return "bg-yellow-50 text-yellow-700 border-yellow-200";
        default:
            return "bg-green-50 text-green-600 border-green-200";
    }
}

export default function RiskAnalysisPage() {
    const [projectCode, setProjectCode] = useState("");
    const [data, setData] = useState<RiskPrediction | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    async function analyzeProject() {
        const code = projectCode.trim();

        if (!code) {
            setError("Please enter a project code.");
            return;
        }

        try {
            setLoading(true);
            setError("");

            const result = await apiRequest<RiskPrediction>(
                `/ml/risk/${encodeURIComponent(code)}`,
            );

            setData(result);
        } catch (err: any) {
            setData(null);
            setError(
                err?.message === "API request failed: 404"
                    ? `Project ${code} not found in ML dataset.`
                    : err?.message || "Unable to analyze project.",
            );
        } finally {
            setLoading(false);
        }
    }

    function handleKeyDown(
        e: React.KeyboardEvent<HTMLInputElement>,
    ) {
        if (e.key === "Enter") {
            analyzeProject();
        }
    }

    return (
        <div className="mx-auto max-w-[1500px]">
            <Header />

            {/* Search */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <label className="mb-2 block text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    Project Code
                </label>

                <div className="flex gap-2">
                    <input
                        value={projectCode}
                        onChange={(e) =>
                            setProjectCode(e.target.value)
                        }
                        onKeyDown={handleKeyDown}
                        placeholder="Enter project code"
                        className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-slate-400"
                    />

                    <button
                        onClick={analyzeProject}
                        disabled={loading}
                        className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                    >
                        {loading ? "Analyzing..." : "Analyze Project"}
                    </button>
                </div>

                {error && (
                    <p className="mt-3 text-sm font-medium text-red-600">
                        {error}
                    </p>
                )}
            </div>

            {data && (
                <>
                    {/* Project header */}
                    <div className="mt-4 flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                                Project
                            </p>

                            <p className="mt-1 text-sm font-bold text-slate-800">
                                {data.project_code}
                            </p>

                            {data.snapshot_month && (
                                <p className="mt-1 text-xs text-slate-400">
                                    Snapshot:{" "}
                                    {data.snapshot_month}
                                </p>
                            )}
                        </div>

                        <div className="text-right">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                                Overall Risk
                            </p>

                            <div className="mt-1 flex items-center gap-2">
                                <span className="text-2xl font-bold text-slate-900">
                                    {Number(
                                        data.overall_risk_score,
                                    ).toFixed(1)}
                                </span>

                                <span
                                    className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${riskClass(
                                        data.risk_level,
                                    )}`}
                                >
                                    {data.risk_level}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Main metrics */}
                    <div className="mt-4 grid gap-4 md:grid-cols-3">
                        <Metric
                            title="Predicted Cost Overrun"
                            value={`${Number(
                                data.predicted_cost_overrun_pct,
                            ).toFixed(1)}%`}
                        />

                        <Metric
                            title="Future Delay Probability"
                            value={`${(
                                data.future_delay_probability * 100
                            ).toFixed(1)}%`}
                        />

                        <Metric
                            title="Progress Stall Probability"
                            value={`${(
                                data.future_progress_stall_probability *
                                100
                            ).toFixed(1)}%`}
                        />
                    </div>

                    {/* Components + warning */}
                    <div className="mt-4 grid gap-4 lg:grid-cols-2">
                        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                            <h2 className="font-bold text-slate-800">
                                Risk Components
                            </h2>

                            <p className="mt-1 text-xs text-slate-400">
                                Individual model signals contributing
                                to the current assessment.
                            </p>

                            <RiskBar
                                label="Cost Risk"
                                value={data.cost_risk_score}
                            />

                            <RiskBar
                                label="Future Delay"
                                value={
                                    data.future_delay_probability *
                                    100
                                }
                            />

                            <RiskBar
                                label="Progress Stall"
                                value={
                                    data.future_progress_stall_probability *
                                    100
                                }
                            />
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                            <h2 className="font-bold text-slate-800">
                                Early Warning Status
                            </h2>

                            <p className="mt-1 text-xs text-slate-400">
                                Current warning state derived from
                                the risk engine.
                            </p>

                            <div className="mt-5">
                                {data.early_warning_active ? (
                                    <>
                                        <span className="rounded-full bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600">
                                            ACTIVE ·{" "}
                                            {data.early_warning_priority}
                                        </span>

                                        <div className="mt-5 flex flex-wrap gap-2">
                                            {data.future_delay_probability >=
                                                0.6 && (
                                                <Signal>
                                                    Future delay
                                                </Signal>
                                            )}

                                            {data.future_progress_stall_probability >=
                                                0.6 && (
                                                <Signal>
                                                    Progress stall
                                                </Signal>
                                            )}

                                            {data.cost_risk_score >=
                                                60 && (
                                                <Signal>
                                                    Cost pressure
                                                </Signal>
                                            )}
                                        </div>
                                    </>
                                ) : (
                                    <span className="rounded-full bg-green-50 px-3 py-1.5 text-xs font-bold text-green-600">
                                        NO ACTIVE WARNING
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

function Header() {
    return (
        <div className="mb-6">
            <div className="text-xs font-bold uppercase tracking-wider text-blue-600">
                PAIMANA AI
            </div>

            <h1 className="mt-1 text-2xl font-bold text-slate-900">
                Risk Analysis
            </h1>

            <p className="mt-1 text-sm text-slate-500">
                Analyze a project's predicted cost, schedule,
                progress-stall and overall risk signals.
            </p>
        </div>
    );
}

function Metric({
    title,
    value,
}: {
    title: string;
    value: string;
}) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                {title}
            </p>

            <p className="mt-2 text-2xl font-bold text-slate-900">
                {value}
            </p>
        </div>
    );
}

function RiskBar({
    label,
    value,
}: {
    label: string;
    value: number;
}) {
    const safeValue = Math.max(0, Math.min(100, value));

    return (
        <div className="mt-5">
            <div className="mb-2 flex justify-between text-xs font-semibold text-slate-600">
                <span>{label}</span>
                <span>{safeValue.toFixed(1)}%</span>
            </div>

            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                    className="h-full rounded-full bg-slate-900"
                    style={{ width: `${safeValue}%` }}
                />
            </div>
        </div>
    );
}

function Signal({ children }: { children: React.ReactNode }) {
    return (
        <span className="rounded-lg bg-amber-50 px-3 py-1.5 text-[10px] font-semibold text-amber-700">
            {children}
        </span>
    );
}