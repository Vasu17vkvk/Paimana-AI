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
    return (
        <div
            onClick={onClick}
            className={[
                "min-w-0 rounded-2xl border border-[#3b3d42] bg-[#292a2d]",
                "p-3.5 sm:p-5",
                "shadow-[0_2px_8px_rgba(0,0,0,0.18)]",
                onClick
                    ? "cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_22px_rgba(0,0,0,0.28)]"
                    : "",
            ].join(" ")}
        >
            <div className="flex items-start justify-between gap-2">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#3a3c40] text-[#c8ccd2] sm:h-9 sm:w-9 sm:rounded-xl">
                    {icon}
                </div>

                {trend && (
                    <span
                        className={[
                            "max-w-[90px] truncate rounded-full px-1.5 py-1 text-[8px] font-semibold sm:max-w-none sm:px-2 sm:text-[10px]",
                            trendPositive
                                ? "bg-[#e5f7ed] text-[#20a95d]"
                                : "bg-[#eceef1] text-[#69717d]",
                        ].join(" ")}
                    >
                        {trend}
                    </span>
                )}
            </div>

            <div className="mt-4 sm:mt-5">
                <div className="truncate text-[8px] font-bold uppercase tracking-[0.05em] text-[#aeb3ba] sm:text-[10px]">
                    {label}
                </div>

                <div className="mt-1 text-xl font-bold tracking-[-0.04em] text-white sm:text-3xl">
                    {value}
                </div>

                {description && (
                    <div className="mt-1 line-clamp-2 text-[9px] leading-3 text-[#9da4ae] sm:text-[11px] sm:leading-normal">
                        {description}
                    </div>
                )}
            </div>
        </div>
    );
}
