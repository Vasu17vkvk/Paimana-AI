import type { ReactNode } from "react";

interface MetricCardProps {
    label: string;
    value: string;
    description?: string;
    icon: ReactNode;
    onClick?: () => void;
    sparkline?: number[];
}

export default function MetricCard({
    label,
    value,
    description,
    icon,
    onClick,
    sparkline = [],
}: MetricCardProps) {
    const sparklinePath = (() => {
        if (sparkline.length < 2) return "";
        const min = Math.min(...sparkline);
        const max = Math.max(...sparkline);
        const range = max - min || 1;
        return sparkline.map((point, index) => {
            const x = 1 + (index / (sparkline.length - 1)) * 94;
            const y = 25 - ((point - min) / range) * 20;
            return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
        }).join(" ");
    })();
    const previous = sparkline.length >= 2 ? sparkline[sparkline.length - 2] : null;
    const current = sparkline.length >= 1 ? sparkline[sparkline.length - 1] : null;
    const trendType =
        previous === null || current === null
            ? "No change"
            : current > previous
                ? "Increase"
                : current < previous
                    ? "Decrease"
                    : "No change";
    const trendPercent =
        previous !== null && current !== null && previous !== 0
            ? Math.abs(((current - previous) / previous) * 100)
            : 0;
    const trendLabel =
        trendType === "No change"
            ? "No change"
            : `${trendType} ${trendPercent.toFixed(1)}%`;

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

                {sparkline.length >= 2 && (
                    <span
                        className={[
                            "max-w-[120px] truncate rounded-full px-2 py-1 text-[9px] font-bold leading-none sm:text-[10px]",
                            trendType === "Increase"
                                ? "bg-emerald-50 text-emerald-600"
                                : trendType === "Decrease"
                                    ? "bg-red-50 text-red-500"
                                    : "bg-slate-100 text-slate-500",
                        ].join(" ")}
                    >
                        {trendLabel}
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
                    d={sparklinePath || "M1 25 L95 25"}
                    fill="none"
                    stroke={
                        label.toLowerCase().includes("cost")
                            ? "#f59e0b"
                            : label.toLowerCase().includes("risk") || label.toLowerCase().includes("delay")
                                ? "#fb7185"
                                : "#94a3b8"
                    }
                    strokeWidth="2"
                    strokeLinecap="round"
                />
            </svg>
        </div>
    );
}
