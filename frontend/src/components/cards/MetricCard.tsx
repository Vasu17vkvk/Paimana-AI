import type { ReactNode } from "react";

interface MetricCardProps {
    label: string;
    value: string;
    description?: string;
    icon: ReactNode;
    trend?: string;
    trendPositive?: boolean;
    onClick?: () => void;
}

export default function MetricCard({
    label,
    value,
    description,
    icon,
    trend,
    trendPositive,
    onClick,
}: MetricCardProps) {
    const accent =
        label.toLowerCase().includes("cost")
            ? "bg-amber-400"
            : label.toLowerCase().includes("risk") || label.toLowerCase().includes("delay")
                ? "bg-red-500"
                : "bg-slate-300";

    const iconTone =
        label.toLowerCase().includes("cost")
            ? "bg-amber-50 text-amber-600"
            : label.toLowerCase().includes("risk") || label.toLowerCase().includes("delay")
                ? "bg-red-50 text-red-500"
                : "bg-slate-100 text-slate-600";

    return (
        <div
            onClick={onClick}
            role={onClick ? "button" : undefined}
            tabIndex={onClick ? 0 : undefined}
            className={[
                "relative min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_3px_12px_rgba(30,55,80,0.055)]",
                onClick
                    ? "cursor-pointer transition-all duration-150 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(30,55,80,0.10)]"
                    : "",
            ].join(" ")}
        >
            <div className={`absolute inset-x-0 top-0 h-[2px] ${accent}`} />

            <div className="flex items-start justify-between gap-3">
                <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${iconTone}`}>
                    {icon}
                </div>

                {trend && (
                    <span
                        className={[
                            "max-w-[110px] truncate rounded-full px-2 py-1 text-[9px] font-bold leading-none sm:text-[10px]",
                            trendPositive || trend.toLowerCase().includes("no change")
                                ? "bg-emerald-50 text-emerald-600"
                                : "bg-red-50 text-red-500",
                        ].join(" ")}
                    >
                        {trend}
                    </span>
                )}
            </div>

            <div className="mt-5 min-w-0">
                <div className="truncate text-[9px] font-bold uppercase tracking-[0.09em] text-[#7890ac] sm:text-[10px]">
                    {label}
                </div>

                <div className="mt-1 text-[30px] font-bold leading-none tracking-[-0.045em] text-[#14233a] sm:text-[34px]">
                    {value}
                </div>

                {description && (
                    <div className="mt-2 max-w-[78%] text-[10px] leading-4 text-[#71839a] sm:text-[11px]">
                        {description}
                    </div>
                )}
            </div>

            <svg
                aria-hidden="true"
                viewBox="0 0 96 30"
                className="pointer-events-none absolute bottom-4 right-4 h-8 w-24 text-slate-400/80"
                preserveAspectRatio="none"
            >
                <path
                    d="M1 25 C 14 25, 18 25, 28 24 S 43 24, 49 18 S 58 7, 69 7 S 83 8, 95 5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                />
            </svg>
        </div>
    );
}
