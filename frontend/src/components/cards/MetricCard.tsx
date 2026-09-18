import type { ReactNode } from "react";

interface MetricCardProps {
    label: string;
    value: string;
    description?: string;
    icon: ReactNode;
    trend?: string;
    trendPositive?: boolean;
    sparkline?: number[];
    onClick?: () => void;
}

export default function MetricCard({
    label,
    value,
    description,
    icon,
    trend,
    trendPositive,
    sparkline = [],
    onClick,
}: MetricCardProps) {
    const normalizedLabel =
        label.toLowerCase();

    const iconStyle =
        normalizedLabel.includes("high risk")
            ? {
                box: "bg-red-50",
                icon: "text-red-500",
            }
            : normalizedLabel.includes("cost risk")
                ? {
                    box: "bg-amber-50",
                    icon: "text-amber-500",
                }
                : normalizedLabel.includes("delayed")
                    ? {
                        box: "bg-red-50",
                        icon: "text-red-500",
                    }
                    : {
                        box: "bg-[#EEF2F5]",
                        icon: "text-[#475569]",
                    };

    const chartValues = sparkline.filter(
        (value) =>
            Number.isFinite(value) &&
            value >= 0,
    );

    const minValue =
        chartValues.length > 0
            ? Math.min(...chartValues)
            : 0;

    const maxValue =
        chartValues.length > 0
            ? Math.max(...chartValues)
            : 1;

    const range =
        maxValue - minValue || 1;

    const points =
        chartValues.length > 1
            ? chartValues
                .map((point, index) => {
                    const x =
                        (index /
                            (chartValues.length - 1)) *
                        78;

                    const y =
                        28 -
                        ((point - minValue) /
                            range) *
                        24;

                    return `${x},${y}`;
                })
                .join(" ")
            : "";

    return (
        <div
            onClick={onClick}
            className={[
                "group relative min-w-0",
                "overflow-hidden",
                "rounded-[14px]",
                "border border-[#D9E1E8]",
                "bg-white",
                "p-4 sm:p-[18px]",
                "shadow-[0_2px_6px_rgba(15,23,42,0.04)]",
                "transition-[border-color,box-shadow,transform]",
                "duration-150",
                onClick
                    ? [
                        "cursor-pointer",
                        "hover:-translate-y-[1px]",
                        "hover:border-slate-300",
                        "hover:shadow-[0_8px_24px_rgba(15,23,42,0.08)]",
                    ].join(" ")
                    : "",
            ].join(" ")}
        >
            {/* top accent */}

            <div
                className={[
                    "absolute inset-x-0 top-0 h-[2px]",
                    normalizedLabel.includes("high risk") ||
                        normalizedLabel.includes("delayed")
                        ? "bg-red-400"
                        : normalizedLabel.includes("cost risk")
                            ? "bg-amber-400"
                            : "bg-slate-200",
                ].join(" ")}
            />

            <div className="
                flex items-start
                justify-between gap-3
            ">
                <div
                    className={[
                        "grid h-9 w-9 shrink-0",
                        "place-items-center",
                        "rounded-[10px]",
                        iconStyle.box,
                        iconStyle.icon,
                    ].join(" ")}
                >
                    {icon}
                </div>

                {trend && (
                    <span
                        className={[
                            "rounded-full px-2 py-1",
                            "text-[9px] font-semibold",
                            "leading-none",
                            trendPositive
                                ? "bg-emerald-50 text-emerald-600"
                                : "bg-red-50 text-red-500",
                        ].join(" ")}
                    >
                        {trendPositive ? "↑" : "↓"} {trend}
                    </span>
                )}
            </div>

            <div className="mt-4">
                <div className="
                    truncate
                    text-[9px] font-bold
                    uppercase
                    tracking-[0.07em]
                    text-[#94A3B8]
                ">
                    {label}
                </div>

                <div className="
                    mt-1
                    text-[28px]
                    font-bold
                    leading-none
                    tracking-[-0.045em]
                    text-[#172033]
                    sm:text-[30px]
                ">
                    {value}
                </div>

                {description && (
                    <div className="
                        mt-1.5
                        line-clamp-2
                        text-[10px]
                        leading-4
                        text-[#64748B]
                    ">
                        {description}
                    </div>
                )}
            </div>

            {points && (
                <div className="
                    pointer-events-none
                    absolute bottom-3 right-3
                    h-8 w-[84px]
                    opacity-80
                ">
                    <svg
                        viewBox="0 0 78 32"
                        className="
                            h-full w-full
                            overflow-visible
                        "
                        fill="none"
                    >
                        <polyline
                            points={points}
                            fill="none"
                            stroke={
                                normalizedLabel.includes(
                                    "cost risk",
                                )
                                    ? "#F59E0B"
                                    : normalizedLabel.includes(
                                        "high risk",
                                    ) ||
                                        normalizedLabel.includes(
                                            "delayed",
                                        )
                                        ? "#EF4444"
                                        : "#64748B"
                            }
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                </div>
            )}
        </div>
    );
}