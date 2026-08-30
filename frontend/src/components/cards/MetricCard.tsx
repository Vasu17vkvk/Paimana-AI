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
        <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.03)] sm:rounded-2xl sm:p-5">
            {/* Top */}
            <div className="flex items-start justify-between gap-2">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600 sm:h-9 sm:w-9 sm:rounded-xl">
                    {icon}
                </div>

                {trend && (
                    <span
                        className={[
                            "max-w-[80px] truncate rounded-full px-1.5 py-1 text-[8px] font-semibold sm:max-w-none sm:px-2 sm:text-[10px]",
                            trendPositive
                                ? "bg-emerald-50 text-emerald-600"
                                : "bg-slate-100 text-slate-500",
                        ].join(" ")}
                    >
                        {trend}
                    </span>
                )}
            </div>

            {/* Content */}
            <div className="mt-4 sm:mt-5">
                <div className="truncate text-[8px] font-semibold uppercase tracking-[0.04em] text-slate-400 sm:text-[11px] sm:tracking-[0.05em]">
                    {label}
                </div>

                <div className="mt-1 text-xl font-bold tracking-[-0.04em] text-slate-900 sm:text-3xl">
                    {value}
                </div>

                {description && (
                    <div className="mt-1 line-clamp-2 text-[9px] leading-3 text-slate-400 sm:text-[11px] sm:leading-normal">
                        {description}
                    </div>
                )}
            </div>
        </div>
    );
}