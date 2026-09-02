import { useState } from "react";
import { apiRequest } from "../../services/api";

interface Prediction {
    project_code: string | number;
    snapshot_month?: string;
    risk_level: string;
    future_delay_probability: number;
}

export default function DelayPredictionPage() {
    const [projectCode, setProjectCode] = useState("");
    const [data, setData] = useState<Prediction | null>(null);
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

            const result = await apiRequest<Prediction>(
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

    const probability =
        Number(data?.future_delay_probability || 0) * 100;

    const scheduleSignal =
        probability >= 70
            ? "Severe"
            : probability >= 50
              ? "High"
              : probability >= 30
                ? "Moderate"
                : "Low";

    return (
        <div className="mx-auto max-w-[1500px]">
            <div className="mb-6">
                <div className="text-xs font-bold uppercase tracking-wider text-blue-600">
                    PAIMANA AI
                </div>

                <h1 className="mt-1 text-2xl font-bold text-slate-900">
                    Delay Prediction
                </h1>

                <p className="mt-1 text-sm text-slate-500">
                    Predictive assessment of future project schedule delay.
                </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <label className="mb-2 block text-[10px] font-bold uppercase text-slate-400">
                    Project Code
                </label>

                <div className="flex gap-2">
                    <input
                        value={projectCode}
                        onChange={(e) =>
                            setProjectCode(e.target.value)
                        }
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                analyzeProject();
                            }
                        }}
                        className="flex-1 rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none"
                    />

                    <button
                        onClick={analyzeProject}
                        disabled={loading}
                        className="rounded-lg bg-slate-900 px-5 text-sm font-semibold text-white"
                    >
                        {loading
                            ? "Analyzing..."
                            : "Analyze Project"}
                    </button>
                </div>
            </div>

            {error && (
                <p className="mt-3 text-sm font-medium text-red-600">
                    {error}
                </p>
            )}

            {data && (
                <>
                    <div className="mt-4 flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                        <div>
                            <p className="text-[10px] font-bold uppercase text-slate-400">
                                Project
                            </p>

                            <p className="mt-1 font-bold text-slate-800">
                                {data.project_code}
                            </p>

                            {data.snapshot_month && (
                                <p className="mt-1 text-xs text-slate-400">
                                    Snapshot{" "}
                                    {data.snapshot_month}
                                </p>
                            )}
                        </div>

                        <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600">
                            {data.risk_level}
                        </span>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-3">
                        <Metric
                            title="Future Delay Probability"
                            value={`${probability.toFixed(1)}%`}
                            red
                        />

                        <Metric
                            title="Risk Level"
                            value={data.risk_level}
                        />

                        <Metric
                            title="Schedule Signal"
                            value={scheduleSignal}
                            red
                        />
                    </div>

                    <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                        <h2 className="font-bold text-slate-800">
                            Schedule Assessment
                        </h2>

                        <p className="mt-3 text-sm text-slate-600">
                            The current ML model estimates a{" "}
                            <b>{probability.toFixed(1)}%</b>{" "}
                            probability of future delay for project{" "}
                            <b>{data.project_code}</b>.
                        </p>
                    </div>
                </>
            )}
        </div>
    );
}

function Metric({
    title,
    value,
    red = false,
}: {
    title: string;
    value: string;
    red?: boolean;
}) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-bold uppercase text-slate-400">
                {title}
            </p>

            <p
                className={`mt-2 text-2xl font-bold ${
                    red ? "text-red-600" : "text-slate-900"
                }`}
            >
                {value}
            </p>
        </div>
    );
}