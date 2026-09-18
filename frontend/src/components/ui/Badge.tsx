import type { ReactNode } from "react";

interface BadgeProps {
    children: ReactNode;
    variant?:
    | "default"
    | "success"
    | "warning"
    | "danger"
    | "info"
    | "neutral";
    dot?: boolean;
    className?: string;
}

export default function Badge({
    children,
    variant = "default",
    dot = false,
    className = "",
}: BadgeProps) {
    const styles = {
        default: {
            container:
                "border border-slate-200 bg-slate-100 text-slate-600",
            dot: "bg-slate-500",
        },
        success: {
            container:
                "border border-emerald-100 bg-emerald-50 text-emerald-700",
            dot: "bg-emerald-500",
        },
        warning: {
            container:
                "border border-amber-100 bg-amber-50 text-amber-700",
            dot: "bg-amber-500",
        },
        danger: {
            container:
                "border border-red-100 bg-red-50 text-red-700",
            dot: "bg-red-500",
        },
        info: {
            container:
                "border border-blue-100 bg-blue-50 text-blue-700",
            dot: "bg-blue-500",
        },
        neutral: {
            container:
                "border border-slate-200 bg-slate-50 text-slate-500",
            dot: "bg-slate-400",
        },
    };

    const selected = styles[variant];

    return (
        <span
            className={[
                "inline-flex items-center gap-1.5",
                "rounded-full px-2 py-1",
                "text-[9px] font-semibold leading-none",
                "whitespace-nowrap",
                selected.container,
                className,
            ]
                .filter(Boolean)
                .join(" ")}
        >
            {dot && (
                <span
                    className={[
                        "h-1.5 w-1.5 shrink-0 rounded-full",
                        selected.dot,
                    ].join(" ")}
                />
            )}

            {children}
        </span>
    );
}