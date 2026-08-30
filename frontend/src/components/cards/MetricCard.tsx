import type { ReactNode } from "react";

interface MetricCardProps {
    label: string;
    value: string;
    description?: string;
    icon: ReactNode;
    trend?: string;
    trendPositive?: boolean;
}

export default function MetricCard({
    label,
    value,
    description,
    icon,
    trend,
    trendPositive,
}: MetricCardProps) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
            <div className="flex items-start justify-between">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-slate-600">
                    {icon}
                </div>

                {trend && (
                    <span
                        className={[
                            "rounded-full px-2 py-1 text-[10px] font-semibold",
                            trendPositive
                                ? "bg-emerald-50 text-emerald-600"
                                : "bg-slate-100 text-slate-500",
                        ].join(" ")}
                    >
                        {trend}
                    </span>
                )}
            </div>

            <div className="mt-5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-400">
                    {label}
                </div>

                <div className="mt-1 text-3xl font-bold tracking-[-0.04em] text-slate-900">
                    {value}
                </div>

                {description && (
                    <div className="mt-1 text-[11px] text-slate-400">
                        {description}
                    </div>
                )}
            </div>
        </div>
    );
}