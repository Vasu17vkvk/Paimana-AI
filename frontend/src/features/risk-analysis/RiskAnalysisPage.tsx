import {
    AlertTriangle,
    BrainCircuit,
    Clock3,
    DollarSign,
    ShieldCheck,
} from "lucide-react";

import {
    useQuery,
} from "@tanstack/react-query";

import Card from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";

import {
    getProjectRisk,
} from "../../services/riskApi";

import {
    getRiskBadgeVariant,
} from "../../utils/riskUtils";

import type { ProjectRiskResponse } from "../../services/riskApi";

import { useState } from "react";

import type { ReactNode } from "react";


export default function RiskAnalysisPage() {
    const [projectCode, setProjectCode] =
        useState("400005");

    const [activeProjectCode, setActiveProjectCode] =
        useState("400005");


    const riskQuery = useQuery({
        queryKey: [
            "project-risk",
            activeProjectCode,
        ],

        queryFn: () =>
            getProjectRisk(
                activeProjectCode,
            ),
    });


    const risk =
        riskQuery.data;


    const runAnalysis = () => {
        const code =
            projectCode.trim();

        if (!code) {
            return;
        }

        setActiveProjectCode(code);
    };


    return (
        <div className="mx-auto w-full max-w-[1400px]">

            {/* Header */}
            <div className="mb-6">

                <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                    <BrainCircuit size={13} />

                    AI RISK INTELLIGENCE
                </div>

                <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                    Risk Analysis
                </h1>

                <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-500 sm:text-sm">
                    Analyze a project's predicted cost, schedule,
                    progress-stall and overall risk signals.
                </p>

            </div>


            {/* Search */}
            <Card padding="md">

                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">

                    <label className="min-w-0 flex-1">

                        <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.05em] text-slate-400">
                            Project Code
                        </span>

                        <input
                            value={projectCode}
                            onChange={(event) =>
                                setProjectCode(
                                    event.target.value,
                                )
                            }
                            onKeyDown={(event) => {
                                if (
                                    event.key ===
                                    "Enter"
                                ) {
                                    runAnalysis();
                                }
                            }}
                            placeholder="Enter project code"
                            className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs text-slate-700 outline-none focus:border-slate-400 focus:bg-white"
                        />

                    </label>

                    <Button
                        onClick={runAnalysis}
                        disabled={
                            riskQuery.isFetching
                        }
                    >
                        {riskQuery.isFetching
                            ? "Analyzing..."
                            : "Analyze Project"}
                    </Button>

                </div>

            </Card>


            {/* Loading */}
            {riskQuery.isLoading && (
                <div className="mt-5">
                    <Card padding="lg">
                        <div className="flex items-center gap-3 text-xs text-slate-500">
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-slate-800" />
                            Running ML risk analysis...
                        </div>
                    </Card>
                </div>
            )}


            {/* Error */}
            {riskQuery.isError && (
                <div className="mt-5">
                    <Card className="border-red-200 bg-red-50">
                        <div className="flex items-start gap-3">

                            <AlertTriangle
                                size={18}
                                className="mt-0.5 shrink-0 text-red-600"
                            />

                            <div>
                                <div className="text-sm font-bold text-red-800">
                                    Risk analysis failed
                                </div>

                                <div className="mt-1 text-xs leading-5 text-red-700">
                                    {riskQuery.error instanceof Error
                                        ? riskQuery.error.message
                                        : "Unable to connect to the Flask API."}
                                </div>

                            </div>

                        </div>
                    </Card>
                </div>
            )}


            {/* Result */}
            {risk && (
                <RiskResult
                    risk={risk}
                />
            )}

        </div>
    );
}


function RiskResult({
    risk,
}: {
    risk: ProjectRiskResponse;
}) {
    const riskVariant =
        getRiskBadgeVariant(
            convertRiskLevel(
                risk.risk_level,
            ),
        );


    return (
        <div className="mt-5 space-y-5">

            {/* Main risk */}
            <Card padding="lg">

                <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">

                    <div>

                        <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
                            PROJECT
                        </div>

                        <div className="mt-1 text-lg font-bold text-slate-900">
                            {risk.project_code}
                        </div>

                        <div className="mt-1 text-[11px] text-slate-400">
                            Snapshot:{" "}
                            {risk.snapshot_year ??
                                "—"}
                            /
                            {risk.snapshot_month ??
                                "—"}
                        </div>

                    </div>


                    <div className="flex items-center gap-4">

                        <div className="text-right">

                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                OVERALL RISK
                            </div>

                            <div className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
                                {risk.overall_risk_score.toFixed(
                                    1,
                                )}
                            </div>

                        </div>


                        <Badge
                            variant={riskVariant}
                            dot
                        >
                            {risk.risk_level}
                        </Badge>

                    </div>

                </div>

            </Card>


            {/* Prediction cards */}
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">

                <PredictionCard
                    icon={
                        <DollarSign
                            size={18}
                        />
                    }
                    label="Predicted Cost Overrun"
                    value={`${risk.predicted_cost_overrun_pct.toFixed(1)}%`}
                />

                <PredictionCard
                    icon={
                        <Clock3
                            size={18}
                        />
                    }
                    label="Future Delay Probability"
                    value={`${(risk.future_delay_probability * 100).toFixed(1)}%`}
                />

                <PredictionCard
                    icon={
                        <AlertTriangle
                            size={18}
                        />
                    }
                    label="Progress Stall Probability"
                    value={`${(risk.future_progress_stall_probability * 100).toFixed(1)}%`}
                />

            </section>


            {/* Risk components */}
            <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">

                <Card padding="lg">

                    <h2 className="text-sm font-bold text-slate-900">
                        Risk Components
                    </h2>

                    <p className="mt-1 text-[11px] text-slate-400">
                        Individual model signals contributing to the current assessment.
                    </p>


                    <div className="mt-6 space-y-5">

                        <RiskBar
                            label="Cost Risk"
                            value={
                                risk.cost_risk_score
                            }
                        />

                        <RiskBar
                            label="Future Delay"
                            value={
                                risk.future_delay_probability *
                                100
                            }
                        />

                        <RiskBar
                            label="Progress Stall"
                            value={
                                risk.future_progress_stall_probability *
                                100
                            }
                        />

                    </div>

                </Card>


                <Card padding="lg">

                    <div className="flex items-start gap-3">

                        <div className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-slate-600">
                            <ShieldCheck size={17} />
                        </div>

                        <div>
                            <h2 className="text-sm font-bold text-slate-900">
                                Early Warning Status
                            </h2>

                            <p className="mt-1 text-[11px] text-slate-400">
                                Current warning state derived from the risk engine.
                            </p>
                        </div>

                    </div>


                    <div className="mt-6">

                        <Badge
                            variant={
                                risk.early_warning_active
                                    ? "danger"
                                    : "success"
                            }
                            dot
                        >
                            {risk.early_warning_active
                                ? `ACTIVE · ${risk.early_warning_priority}`
                                : "NO ACTIVE WARNING"}
                        </Badge>

                    </div>


                    {risk.early_warning_reasons
                        .length > 0 && (
                            <div className="mt-5">

                                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                    SIGNALS
                                </div>

                                <div className="mt-2 flex flex-wrap gap-2">

                                    {risk.early_warning_reasons.map(
                                        (reason) => (
                                            <Badge
                                                key={reason}
                                                variant="warning"
                                            >
                                                {reason.replace(
                                                    /_/g,
                                                    " ",
                                                )}
                                            </Badge>
                                        ),
                                    )}

                                </div>

                            </div>
                        )}

                </Card>

            </section>

        </div>
    );
}


function PredictionCard({
    icon,
    label,
    value,
}: {
    icon: ReactNode;
    label: string;
    value: string;
}) {
    return (
        <Card padding="md">

            <div className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-slate-600">
                {icon}
            </div>

            <div className="mt-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {label}
            </div>

            <div className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
                {value}
            </div>

        </Card>
    );
}


function RiskBar({
    label,
    value,
}: {
    label: string;
    value: number;
}) {
    const safeValue = Math.max(
        0,
        Math.min(100, value),
    );

    return (
        <div>

            <div className="mb-2 flex items-center justify-between">

                <span className="text-xs font-semibold text-slate-600">
                    {label}
                </span>

                <span className="text-xs font-bold text-slate-900">
                    {safeValue.toFixed(1)}%
                </span>

            </div>

            <div className="h-2 overflow-hidden rounded-full bg-slate-100">

                <div
                    className="h-full rounded-full bg-slate-900 transition-all duration-500"
                    style={{
                        width: `${safeValue}%`,
                    }}
                />

            </div>

        </div>
    );
}


function convertRiskLevel(
    level: ProjectRiskResponse["risk_level"],
) {
    switch (level) {
        case "CRITICAL":
            return "Critical" as const;

        case "HIGH":
            return "High" as const;

        case "MEDIUM":
            return "Moderate" as const;

        case "LOW":
        default:
            return "Low" as const;
    }
}