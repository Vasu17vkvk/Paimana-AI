import {
    AlertTriangle,
    Clock3,
    IndianRupee,
    ShieldAlert,
} from "lucide-react";

import MetricCard from "../../components/cards/MetricCard";
import PageHeader from "../../components/layout/PageHeader";

const riskLevels = [
    {
        label: "Critical",
        value: 12,
        percentage: 8,
        className: "bg-red-500",
    },
    {
        label: "High",
        value: 37,
        percentage: 19,
        className: "bg-orange-500",
    },
    {
        label: "Medium",
        value: 84,
        percentage: 38,
        className: "bg-yellow-400",
    },
    {
        label: "Low",
        value: 102,
        percentage: 35,
        className: "bg-emerald-500",
    },
];

export default function DashboardPage() {
    return (
        <div className="mx-auto max-w-[1500px]">
            <PageHeader
                eyebrow="NATIONAL PROJECT MONITORING"
                title="Dashboard"
                description="Overview of infrastructure project performance, risk and emerging warnings."
                action={
                    <button className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 shadow-sm hover:bg-slate-50">
                        April 2026
                    </button>
                }
            />

            {/* Metrics */}
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                    label="Total Projects"
                    value="2,155"
                    description="Projects in monitoring portfolio"
                    icon={<ShieldAlert size={18} />}
                />

                <MetricCard
                    label="High Risk Projects"
                    value="184"
                    description="Projects requiring attention"
                    icon={<AlertTriangle size={18} />}
                    trend="+12 this month"
                    trendPositive={false}
                />

                <MetricCard
                    label="Cost Overrun Risk"
                    value="312"
                    description="Projects showing cost pressure"
                    icon={<IndianRupee size={18} />}
                />

                <MetricCard
                    label="Delayed Projects"
                    value="427"
                    description="Projects with schedule pressure"
                    icon={<Clock3 size={18} />}
                />
            </section>

            {/* Main analytics */}
            <section className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[1.65fr_1fr]">
                {/* Risk overview */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                    <div className="flex items-start justify-between">
                        <div>
                            <h2 className="text-sm font-bold text-slate-900">
                                Risk Overview
                            </h2>

                            <p className="mt-1 text-[11px] text-slate-400">
                                Current project distribution by risk level.
                            </p>
                        </div>

                        <button className="text-[11px] font-semibold text-slate-500 hover:text-slate-900">
                            View analysis →
                        </button>
                    </div>

                    <div className="mt-8">
                        <div className="flex h-4 overflow-hidden rounded-full bg-slate-100">
                            {riskLevels.map((item) => (
                                <div
                                    key={item.label}
                                    className={item.className}
                                    style={{
                                        width: `${item.percentage}%`,
                                    }}
                                />
                            ))}
                        </div>

                        <div className="mt-7 grid grid-cols-2 gap-4 sm:grid-cols-4">
                            {riskLevels.map((item) => (
                                <div key={item.label}>
                                    <div className="flex items-center gap-2">
                                        <span
                                            className={[
                                                "h-2 w-2 rounded-full",
                                                item.className,
                                            ].join(" ")}
                                        />

                                        <span className="text-[11px] text-slate-500">
                                            {item.label}
                                        </span>
                                    </div>

                                    <div className="mt-2 text-xl font-bold tracking-tight text-slate-900">
                                        {item.value}
                                    </div>

                                    <div className="mt-1 text-[10px] text-slate-400">
                                        projects
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Warnings */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                    <div>
                        <h2 className="text-sm font-bold text-slate-900">
                            Early Warnings
                        </h2>

                        <p className="mt-1 text-[11px] text-slate-400">
                            Projects requiring immediate attention.
                        </p>
                    </div>

                    <div className="mt-6 space-y-3">
                        <WarningItem
                            label="Critical"
                            count="12"
                            color="bg-red-500"
                        />

                        <WarningItem
                            label="High"
                            count="37"
                            color="bg-orange-500"
                        />

                        <WarningItem
                            label="Medium"
                            count="84"
                            color="bg-yellow-400"
                        />

                        <WarningItem
                            label="Low"
                            count="102"
                            color="bg-emerald-500"
                        />
                    </div>

                    <button className="mt-5 w-full rounded-lg bg-slate-900 py-2.5 text-xs font-semibold text-white hover:bg-slate-800">
                        Open Early Warning Center
                    </button>
                </div>
            </section>

            {/* Projects */}
            <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="flex items-start justify-between px-5 py-5">
                    <div>
                        <h2 className="text-sm font-bold text-slate-900">
                            Highest Risk Projects
                        </h2>

                        <p className="mt-1 text-[11px] text-slate-400">
                            Projects with the strongest current warning signals.
                        </p>
                    </div>

                    <button className="text-[11px] font-semibold text-slate-500 hover:text-slate-900">
                        View all →
                    </button>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] border-collapse">
                        <thead>
                            <tr className="border-y border-slate-100 bg-slate-50/70">
                                <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                    Project
                                </th>

                                <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                    Ministry
                                </th>

                                <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                    Risk
                                </th>

                                <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                    Cost
                                </th>

                                <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                    Delay
                                </th>
                            </tr>
                        </thead>

                        <tbody>
                            <ProjectRow
                                project="National Highway Development"
                                ministry="Road Transport"
                                risk="89"
                                cost="High"
                                delay="+14 mo"
                            />

                            <ProjectRow
                                project="Regional Water Supply System"
                                ministry="Water Resources"
                                risk="82"
                                cost="Medium"
                                delay="+11 mo"
                            />

                            <ProjectRow
                                project="Power Transmission Expansion"
                                ministry="Power"
                                risk="78"
                                cost="High"
                                delay="+8 mo"
                            />

                            <ProjectRow
                                project="Integrated Railway Corridor"
                                ministry="Railways"
                                risk="74"
                                cost="Medium"
                                delay="+6 mo"
                            />
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}

function WarningItem({
    label,
    count,
    color,
}: {
    label: string;
    count: string;
    color: string;
}) {
    return (
        <div className="flex items-center justify-between rounded-xl border border-slate-100 p-3">
            <div className="flex items-center gap-3">
                <span
                    className={`h-2.5 w-2.5 rounded-full ${color}`}
                />

                <span className="text-xs font-semibold text-slate-700">
                    {label}
                </span>
            </div>

            <span className="text-sm font-bold text-slate-900">
                {count}
            </span>
        </div>
    );
}

function ProjectRow({
    project,
    ministry,
    risk,
    cost,
    delay,
}: {
    project: string;
    ministry: string;
    risk: string;
    cost: string;
    delay: string;
}) {
    const numericRisk = Number(risk);

    const riskClass =
        numericRisk >= 85
            ? "bg-red-50 text-red-600"
            : numericRisk >= 75
                ? "bg-orange-50 text-orange-600"
                : "bg-yellow-50 text-yellow-600";

    return (
        <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
            <td className="px-5 py-4">
                <div className="text-xs font-semibold text-slate-800">
                    {project}
                </div>

                <div className="mt-1 text-[10px] text-slate-400">
                    Project ID — PM-{risk}42
                </div>
            </td>

            <td className="px-5 py-4 text-xs text-slate-500">
                {ministry}
            </td>

            <td className="px-5 py-4">
                <span
                    className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${riskClass}`}
                >
                    {risk}
                </span>
            </td>

            <td className="px-5 py-4 text-xs font-semibold text-slate-600">
                {cost}
            </td>

            <td className="px-5 py-4 text-xs font-semibold text-red-500">
                {delay}
            </td>
        </tr>
    );
}